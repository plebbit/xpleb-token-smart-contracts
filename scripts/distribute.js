const { ethers } = require('hardhat')
const seed = require('./seed')
const fetch = require('cross-fetch')

let recipients = require('./recipients.json')
let total = 0
for (const address in recipients) {
  total += recipients[address]
}
console.log({total})

const settings = {
  "chainId": 137,
  "providerUrl": "https://polygon-rpc.com",
  "distributorAddress": "0xEA81DaB2e0EcBc6B5c4172DE4c22B6Ef6E55Bd8f"
}

const provider = new ethers.providers.JsonRpcProvider({url: settings.providerUrl}, settings.chainId)

const getWallets = async () => {
  const metamaskWallets = []
  let amount = 10
  while (amount--) {
    metamaskWallets[amount] = ethers.Wallet.fromMnemonic(seed, `m/44'/60'/0'/0/${amount}`).connect(provider)
  }
  return metamaskWallets
}

const getDistributor = async () => {
  const Distributor = await ethers.getContractFactory('Distributor')
  const distributor = await Distributor.attach(settings.distributorAddress)
  return distributor
}

const getFeeData = async () => {
  return {maxPriorityFeePerGas: 150 * 1000000000, maxFeePerGas: 300 * 1000000000}
  const res = await fetch('https://gasstation-mainnet.matic.network/v2').then(res => res.json())
  const maxPriorityFeePerGas = Math.ceil(res.fast.maxPriorityFee * 1) * 1000000000
  const maxFeePerGas = Math.ceil(res.fast.maxFee * 1) * 1000000000
  return {maxPriorityFeePerGas, maxFeePerGas}
}

const getNonce = (address) => provider.getTransactionCount(address)

;(async () => {
  const distributor = await getDistributor()
  const wallets = await getWallets()
  console.log('seed address:', wallets[0].address)

  let nonce = 0
  nonce--
  let index = 0

  for (const address in recipients) {
    index++
    // if (index < 395) {
    //   continue
    // }

    const max = 100
    const amount = recipients[address]
    let amountLeft = amount

    while (amountLeft > max) {
      try {
        const feeData = await getFeeData()
        nonce++
        console.log({address, amount, amountLeft, index, feeData, nonce})
        console.log(`distributor.ownerBuy(${address}, ${max})`)

        const tx = await distributor.connect(wallets[0]).ownerBuy(address, max, {...feeData, nonce})
        console.log('done', tx.hash, '\n')
        amountLeft -= max
      }
      catch (e) {
        if (e.message.match('replacement fee too low')) {
          console.log('replacement fee too low')
        }
        else {
          throw(e)
        }
      }
    }
    if (amountLeft) {
      try {
        const feeData = await getFeeData()
        nonce++
        console.log({address, amount, amountLeft, index, feeData, nonce})
        console.log(`distributor.ownerBuy(${address}, ${amountLeft})`)

        const tx = await distributor.connect(wallets[0]).ownerBuy(address, amountLeft, {...feeData, nonce})
        
        console.log('done', tx.hash, '\n')
      }
      catch (e) {
        if (e.message.match('replacement fee too low')) {
          console.log('replacement fee too low')
        }
        else {
          throw(e)
        }
      }
    }
  }
})()
