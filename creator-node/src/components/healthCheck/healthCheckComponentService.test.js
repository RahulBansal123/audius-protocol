const { healthCheck, healthCheckVerbose } = require('./healthCheckComponentService')
const assert = require('assert')
const version = require('../../../.version.json')
const config = require('../../../src/config')
const { MONITORS } = require('../../monitors/monitors')

const TEST_ENDPOINT = 'test_endpoint'

const libsMock = {
  discoveryProvider: {
    discoveryProviderEndpoint: TEST_ENDPOINT
  }
}

const sequelizeMock = {
  'query': async () => Promise.resolve()
}

const getMonitorsMock = async (monitors) => {
  return monitors.map(monitor => {
    switch (monitor.name) {
      case MONITORS.DATABASE_LIVENESS.name:
        return true
      case MONITORS.DATABASE_CONNECTIONS.name:
        return 5
      case MONITORS.DATABASE_SIZE.name:
        return 1102901
      case MONITORS.TOTAL_MEMORY.name:
        return 6237151232
      case MONITORS.USED_MEMORY.name:
        return 5969739776
      case MONITORS.STORAGE_PATH_SIZE.name:
        return 62725623808
      case MONITORS.STORAGE_PATH_USED.name:
        return 54063878144
      case MONITORS.MAX_FILE_DESCRIPTORS.name:
        return 524288
      case MONITORS.ALLOCATED_FILE_DESCRIPTORS.name:
        return 3392
      case MONITORS.RECEIVED_BYTES_PER_SEC.name:
        return 776.7638177541248
      case MONITORS.TRANSFERRED_BYTES_PER_SEC.name:
        return 269500
      default:
        return null
    }
  })
}

const mockLogger = {
  warn: () => {}
}

describe('Test Health Check', function () {
  it('Should pass', async function () {
    config.set('creatorNodeEndpoint', 'http://test.endpoint')
    config.set('spID', 10)
    let expectedEndpoint = config.get('creatorNodeEndpoint')
    let expectedSpID = config.get('spID')
    let expectedSpOwnerWallet = config.get('spOwnerWallet')
    const res = await healthCheck({ libs: libsMock }, mockLogger, sequelizeMock)
    assert.deepStrictEqual(res, {
      ...version,
      service: 'content-node',
      healthy: true,
      git: undefined,
      selectedDiscoveryProvider: TEST_ENDPOINT,
      spID: expectedSpID,
      spOwnerWallet: expectedSpOwnerWallet,
      creatorNodeEndpoint: expectedEndpoint
    })
  })

  it('Should handle no libs', async function () {
    const res = await healthCheck({}, mockLogger, getMonitorsMock)
    assert.deepStrictEqual(res, {
      ...version,
      service: 'content-node',
      healthy: true,
      git: undefined,
      selectedDiscoveryProvider: 'none',
      spID: config.get('spID'),
      spOwnerWallet: config.get('spOwnerWallet'),
      creatorNodeEndpoint: config.get('creatorNodeEndpoint')
    })
  })
})

describe('Test Health Check Verbose', function () {
  it('Should have valid values', async function () {
    config.set('serviceCountry', 'US')
    config.set('serviceLatitude', '37.7749')
    config.set('serviceLongitude', '-122.4194')

    const res = await healthCheckVerbose({}, mockLogger, getMonitorsMock)
    assert.deepStrictEqual(res, {
      ...version,
      service: 'content-node',
      healthy: true,
      git: undefined,
      selectedDiscoveryProvider: 'none',
      spID: config.get('spID'),
      spOwnerWallet: config.get('spOwnerWallet'),
      creatorNodeEndpoint: config.get('creatorNodeEndpoint'),
      country: 'US',
      latitude: '37.7749',
      longitude: '-122.4194',
      databaseConnections: 5,
      databaseSize: 1102901,
      totalMemory: 6237151232,
      usedMemory: 5969739776,
      storagePathSize: 62725623808,
      storagePathUsed: 54063878144,
      maxFileDescriptors: 524288,
      allocatedFileDescriptors: 3392,
      receivedBytesPerSec: 776.7638177541248,
      transferredBytesPerSec: 269500
    })
  })
})
