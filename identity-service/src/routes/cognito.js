const {
  handleResponse,
  successResponse,
  errorResponseServerError
} = require('../apiHelpers')
const { logger } = require('../logging')
const models = require('../models')
const authMiddleware = require('../authMiddleware')
const cognitoFlowMiddleware = require('../cognitoFlowMiddleware')
const { sign, createCognitoHeaders } = require('../utils/cognitoHelpers')
const axios = require('axios')
const axiosHttpAdapter = require('axios/lib/adapters/http')
const config = require('../config')

module.exports = function (app) {
  app.get('/cognito_signature', authMiddleware, handleResponse(async (req) => {
    const { walletAddress, handle } = req.user
    logger.info(`cognito_signature | Creating signature for: wallet '${walletAddress}', handle '${handle}'`)
    try {
      const signature = sign(handle)
      return successResponse({ signature })
    } catch (e) {
      logger.error(e)
      return errorResponseServerError({
        message: e.message
      })
    }
  }))

  /**
   * doc for webhook receiver implementation: https://docs.cognitohq.com/guides
   * cognito's webhook post request body will have the following format
   *
   * {
   *     "id": "some-id",
   *     "timestamp": "some-timestamp",
   *     "event": "flow_session.status.updated", // could be another event but we mostly care about flow_session.status.updated
   *     "data": {
   *         "object": "flow_session",
   *         "id": "some-other-id",
   *         "status": "failed", // or 'success'
   *         "step": null, // or some step if event is flow_session.step.updated
   *         "customer_reference": "some-customer-unique-persistent-id-eg-handle",
   *         "_meta": "This API format is not v1.0 and is subject to change."
   *     },
   *     "environment": "live" // or 'sandbox'
   * }
   */
  app.post('/cognito_webhook/flow', cognitoFlowMiddleware, handleResponse(async (req) => {
    const { id, event, data } = req.body

    // if event is not of type status, meaning the event denotes of a step in the flow, but not the completion
    // then return 200 without further processing
    if (event !== 'flow_session.status.updated') return successResponse({})

    const { id: sessionId, customer_reference: handle, status } = data

    try {
      // save cognito flow for user
      logger.info(`Saving cognito flow result for user with handle '${handle}' (status: '${status}')`)
      await models.CognitoFlows.create({
        id,
        sessionId,
        handle,
        status,
        // score of 1 if 'success', otherwise 0
        score: Number(status === 'success')
      })

      // cognito flow requires the receiver to respond with 200, otherwise it'll retry with exponential backoff
      return successResponse({})
    } catch (err) {
      console.error(err)
      return errorResponseServerError(err.message)
    }
  }))

  /**
   * Gets the shareable_url for a Flow, for use with a webview on mobile
   * https://cognitohq.com/docs/flow/mobile-integration
   */
  app.post('/cognito_flow', authMiddleware, handleResponse(async (req) => {
    const baseUrl = config.get('cognitoBaseUrl')
    const templateId = config.get('cognitoTemplateId')
    const { user: { handle } } = req
    const path = '/flow_sessions?idempotent=true'
    const method = 'POST'
    const body = JSON.stringify({
      shareable: true,
      template_id: templateId,
      user: {
        customer_reference: handle
      }
    })
    const headers = createCognitoHeaders({ path, method, body })
    const url = `${baseUrl}${path}`
    try {
      const response = await axios({
        adapter: axiosHttpAdapter,
        url,
        method,
        headers,
        data: body
      })
      return successResponse({ shareable_url: response.data.shareable_url })
    } catch (err) {
      logger.error(`Request failed to Cognito. Request=${JSON.stringify({ url, method, headers, body })} Error=${err.message}`)
      if (err && err.response && err.response.data && err.response.data.errors) {
        logger.error(`Cognito returned errors: ${JSON.stringify(err.response.data.errors)}`)
      }
      return errorResponseServerError(err.message)
    }
  }))
}
