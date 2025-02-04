const express = require('express')
const crypto = require('crypto')

const { handleResponse, successResponse, errorResponseServerError } = require('../apiHelpers')
const { getFeePayer } = require('../solana-client')

const {
  PublicKey,
  Secp256k1Program,
  sendAndConfirmRawTransaction,
  Transaction,
  TransactionInstruction
} = require('@solana/web3.js')

const solanaRouter = express.Router()

// Check that an instruction has all the necessary data
const isValidInstruction = (instr) => {
  if (!instr || !Array.isArray(instr.keys) || !instr.programId || !instr.data) return false
  if (!instr.keys.every(key => !!key.pubkey)) return false
  return true
}

solanaRouter.post('/relay', handleResponse(async (req, res, next) => {
  const redis = req.app.get('redis')
  const libs = req.app.get('audiusLibs')

  let { instructions = [], skipPreflight } = req.body

  const reqBodySHA = crypto.createHash('sha256').update(JSON.stringify({ instructions })).digest('hex')

  instructions = instructions.filter(isValidInstruction).map((instr) => {
    const keys = instr.keys.map(key => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable
    }))
    return new TransactionInstruction({
      keys,
      programId: new PublicKey(instr.programId),
      data: Buffer.from(instr.data)
    })
  })

  const transactionHandler = libs.solanaWeb3Manager.transactionHandler
  const { res: transactionSignature, error, errorCode } = await transactionHandler.handleTransaction({ instructions, skipPreflight })

  if (error) {
    // if the tx fails, store it in redis with a 24 hour expiration
    await redis.setex(`solanaFailedTx:${reqBodySHA}`, 60 /* seconds */ * 60 /* minutes */ * 24 /* hours */, JSON.stringify(req.body))
    req.logger.error('Error in solana transaction:', error, reqBodySHA)
    const errorString = `Something caused the solana transaction to fail for payload ${reqBodySHA}`
    return errorResponseServerError(errorString, { errorCode, error })
  }

  return successResponse({ transactionSignature })
}))

/**
 * The raw relay uses the `sendAndConfirmRawTransaction` as opposed to the `sendAndConfirmTransaction` method
 * This is required becuase of a bug in the solana web3 transction that overwrites the singers to prevent the
 * transaction from being formatted correcly.
 * Additionally, signatures are transfered over the wire and added to the transaction manually to prevent the
 * library from incorrecly dropping/re-ordering the signatures.
 * Finally, the transaction must be partially signed so as to not overwrite the other signatures - need as a
 * work-around becuase of another bug in the solana web3 api
 */
solanaRouter.post('/relay/raw', handleResponse(async (req, res, next) => {
  const redis = req.app.get('redis')
  const libs = req.app.get('audiusLibs')

  const { recentBlockhash, secpInstruction, instructions = [], signatures = [] } = req.body

  const reqBodySHA = crypto.createHash('sha256').update(JSON.stringify({ secpInstruction, instructions, signatures })).digest('hex')

  try {
    const tx = new Transaction({ recentBlockhash })

    if (secpInstruction) {
      const secpTransactionInstruction = Secp256k1Program.createInstructionWithPublicKey({
        publicKey: Buffer.from(secpInstruction.publicKey),
        message: (new PublicKey(secpInstruction.message)).toBytes(),
        signature: Buffer.from(secpInstruction.signature),
        recoveryId: secpInstruction.recoveryId
      })
      tx.add(secpTransactionInstruction)
    }

    instructions.filter(isValidInstruction).forEach((instr) => {
      const keys = instr.keys.map(key => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable
      }))
      const txInstruction = new TransactionInstruction({
        keys,
        programId: new PublicKey(instr.programId),
        data: Buffer.from(instr.data)
      })
      tx.add(txInstruction)
    })

    // Manually attach each signature to the transaction
    signatures.forEach(sig => {
      tx.signatures.push({
        publicKey: new PublicKey(sig.publicKey),
        signature: sig.signature ? Buffer.from(sig.signature) : sig.signature
      })
    })

    const feePayerAccount = getFeePayer()
    tx.partialSign(feePayerAccount)

    const connection = libs.solanaWeb3Manager.connection
    const transactionSignature = await sendAndConfirmRawTransaction(
      connection,
      tx.serialize(), {
        skipPreflight: true,
        commitment: 'processed',
        preflightCommitment: 'processed'
      })

    return successResponse({ transactionSignature })
  } catch (error) {
    // if the tx fails, store it in redis with a 24 hour expiration
    await redis.setex(`solanaFailedTx:${reqBodySHA}`, 60 /* seconds */ * 60 /* minutes */ * 24 /* hours */, JSON.stringify(req.body))
    req.logger.error('Error in solana transaction:', error, reqBodySHA)
    const errorString = `Something caused the solana transaction to fail for payload ${reqBodySHA}`
    return errorResponseServerError(errorString, { error })
  }
}))

module.exports = function (app) {
  app.use('/solana', solanaRouter)
}
