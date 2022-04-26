const { ethers } = require('hardhat')
const seed = require('./seed')

const recipients = {
  '0x000000000000000000000000000000000000000a': 500,
  '0x000000000000000000000000000000000000000b': 341
}

const settings = {
  "chainId": 31337,
  "providerUrl": "http://localhost:8545",
  "xplebTokenAddress": "0x809d550fca64d94Bd9F66E60752A544199cfAC3D",
  "distributorAddress": "0x1291Be112d480055DaFd8a610b7d1e203891C274"
}

const provider = new ethers.providers.JsonRpcProvider({url: settings.providerUrl}, settings.chainId)

const getToken = async () => {
  const Token = await ethers.getContractFactory('Token')
  const token = await Token.attach(settings.xplebTokenAddress)
  return token
}

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

;(async () => {
  const token = await getToken()
  const distributor = await getDistributor()
  const wallets = await getWallets()

  let index = 0
  for (const address in recipients) {
    const amount = recipients[address]

    let amountLeft = amount
    while (amountLeft > 200) {
      console.log({address, amount, amountLeft, index})
      console.log(`distributor.ownerBuy(${address}, ${200})`)
      await distributor.connect(wallets[0]).ownerBuy(address, 200)
      amountLeft -= 200
    }
    if (amountLeft) {
      console.log({address, amount, amountLeft, index})
      console.log(`distributor.ownerBuy(${address}, ${amountLeft})`)
      await distributor.connect(wallets[0]).ownerBuy(address, amountLeft)
    }

    index++
  }
})()
