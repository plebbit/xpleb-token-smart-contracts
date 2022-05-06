// how to run:
// npx hardhat node
// npx hardhat run --network localhost scripts/localNetwork.js
// set metamask network to http://localhost:8545 and chain id 31337

const { ethers } = require('hardhat')
const assert = require('assert')
const seed = require('./seed')

const zeros = '000000000000000000'

const deployToken = async () => {
  [owner] = await ethers.getSigners()
  const Token = await ethers.getContractFactory('Token')
  const token = await upgrades.deployProxy(Token, { kind: 'uups' })
  await token.deployed()
  const MINTER_ROLE = await token.MINTER_ROLE()
  await token.grantRole(MINTER_ROLE, owner.address)
  return token
}

const getMetamaskWallets = async () => {
  const [owner] = await ethers.getSigners()
  const provider = new ethers.providers.JsonRpcProvider()
  const metamaskWallets = []
  let amount = 10
  while (amount--) {
    metamaskWallets[amount] = ethers.Wallet.fromMnemonic(seed, `m/44'/60'/0'/0/${amount}`).connect(provider)
  }
  for (const wallet of metamaskWallets) {
    await owner.sendTransaction({to: wallet.address, value: ethers.utils.parseEther('1')})
  }
  return metamaskWallets
}

const deployDistributor = async () => {
  const Distributor = await ethers.getContractFactory('Distributor')
  const distributor = await Distributor.deploy()
  return distributor
}

const deployMulticall = async () => {
  const Multicall = await ethers.getContractFactory('Multicall')
  const multicall = await Multicall.deploy()
  return multicall
}

setInterval(() => {
  ethers.provider.send('evm_mine')
}, 5000)

;(async () => {
  const [owner] = await ethers.getSigners()
  const token = await deployToken()
  const distributor = await deployDistributor()
  const metamaskWallets = await getMetamaskWallets()
  const multicall = await deployMulticall()

  // set minter on distributor
  const MINTER_ROLE = await token.MINTER_ROLE()
  await token.grantRole(MINTER_ROLE, distributor.address)

  // set distributor options
  const maxSupply = 10000
  const maxBuyable = 5000
  await distributor.setTokenOptions(token.address, maxSupply)
  const price = 10000000000
  const artistPercent = 5
  const burnWallet = '0x000000000000000000000000000000000000000b'
  const artistWallet = '0x000000000000000000000000000000000000000a'
  await distributor.setBuyOptions(price, maxBuyable, burnWallet, artistWallet, artistPercent)

  // transfer distributor to script address
  await distributor.transferOwnership(metamaskWallets[0].address)

  console.log(`
{
  "chainId": 31337,
  "providerUrl": "http://localhost:8545",
  "xplebTokenAddress": "${token.address}",
  "distributorAddress": "${distributor.address}",
  "multicallAddress": "${multicall.address}",
  "price": "${price}"
}
`)
  console.log('setup finished')
})()
