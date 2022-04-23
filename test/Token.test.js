const { ethers, upgrades } = require('hardhat')
const { expect } = require('chai')
const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')

let totalSupply, balance

const expectRevert = async (promise, revertString) => {
  let error
  try {
    await promise
  }
  catch (e) {
    error = e
  }
  finally {
    expect(error?.message).to.equal(`VM Exception while processing transaction: reverted with reason string '${revertString}'`)
  }
}

describe('Token', function () {
  it('deploys', async function () {
    const [owner, user1, user2, user3, user4, user5, user6] = await ethers.getSigners()

    const Token = await ethers.getContractFactory('Token')
    const Distributor = await ethers.getContractFactory('Distributor')

    // deploy initial proxy
    const proxy = await upgrades.deployProxy(Token, { kind: 'uups' })
    await proxy.deployed()
    console.log('proxy address:', proxy.address)
    console.log('owner address:', owner.address)

    // first implementation total supply
    expect((await proxy.totalSupply()).toString()).to.equal('0')
    expect(await proxy.name()).to.equal('ExosPlebs')
    expect(await proxy.symbol()).to.equal('XPLEB')
    expect(await proxy.baseURI()).to.equal('')

    // try to set base uri from different user
    await expectRevert(
      proxy.connect(user1).setBaseURI('ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/'),
      'AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6'
    )

    // set base uri
    await proxy.setBaseURI('ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/')
    expect(await proxy.baseURI()).to.equal('ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/')

    // deploy and set distributor
    const distributor = await Distributor.deploy()
    const maxSupply = 100
    const maxBuyable = 40
    await distributor.setTokenOptions(proxy.address, maxSupply)
    const price = 1000
    const artistPercent = 5
    const burnWallet = '0x000000000000000000000000000000000000000b'
    const artistWallet = '0x000000000000000000000000000000000000000a'
    await distributor.setBuyOptions(price, maxBuyable, burnWallet, artistWallet, artistPercent)

    // make sure no mint functions are public
    for (const functionName in distributor.functions) {
      expect(functionName.match(/mint/i)).to.equal(null)
    }

    // set minter on distributor
    const MINTER_ROLE = await proxy.MINTER_ROLE()
    await proxy.grantRole(MINTER_ROLE, distributor.address)

    // prepare to set airdrop merkle root
    const recipients = {[owner.address]: '10', [user1.address]: '20', [user2.address]: '30'}
    const elements = []
    for (recipientAddress in recipients) {
      const recipientAmount = recipients[recipientAddress]
      elements.push(ethers.utils.solidityPack(['address', 'uint256'], [recipientAddress, recipientAmount]))
    }
    const merkleTree = new MerkleTree(elements, keccak256, { hashLeaves: true, sortPairs: true })
    const root = merkleTree.getHexRoot()
    console.log({recipients, elements, root})
    expect(await distributor.airdropMerkleRoot()).to.equal('0x0000000000000000000000000000000000000000000000000000000000000000')

    // try to claim airdrop before merkle root is set
    let leaf, proof
    leaf = keccak256(elements[1])
    proof = merkleTree.getHexProof(leaf)
    await expectRevert(
      distributor.connect(user1).claimAirdrop('20', proof),
      'claimAirdrop: merkle proof invalid'
    )
    await expectRevert(
      distributor.connect(user1).claimAirdrop('20', []),
      'claimAirdrop: merkle proof invalid'
    )

    // set airdrop merkle root
    await distributor.setAirdropMerkleRoot(root)
    expect(await distributor.airdropMerkleRoot()).to.equal(root)

    // try to claim airdrop with wrong amount
    leaf = keccak256(elements[1])
    proof = merkleTree.getHexProof(leaf)
    await expectRevert(
      distributor.connect(user1).claimAirdrop('19', proof),
      'claimAirdrop: merkle proof invalid'
    )

    // try to claim airdrop with incorrect proof
    leaf = keccak256(elements[0])
    proof = merkleTree.getHexProof(leaf)
    await expectRevert(
      distributor.connect(user1).claimAirdrop('20', proof),
      'claimAirdrop: merkle proof invalid'
    )

    // try to claim airdrop with correct proof
    leaf = keccak256(elements[1])
    proof = merkleTree.getHexProof(leaf)
    console.log({leaf: leaf.toString('hex'), proof})
    // check if airdrop is claimed
    expect(await distributor.airdropIsClaimed(user1.address, '20', proof)).to.equal(false)
    await distributor.connect(user1).claimAirdrop('20', proof)
    balance = (await proxy.balanceOf(user1.address)).toString()
    expect(balance).to.equal('20')
    // check if airdrop is claimed
    expect(await distributor.airdropIsClaimed(user1.address, '20', proof)).to.equal(true)

    // check what was minted
    totalSupply = (await proxy.totalSupply()).toString()
    expect(totalSupply).to.equal('20')
    // index 20 doesn't exist yet
    await expectRevert(
      proxy.ownerOf(totalSupply),
      'ERC721: owner query for nonexistent token'
    )
    while (totalSupply--) {
      expect(await proxy.ownerOf(totalSupply)).to.equal(user1.address)
    }

    // try to claim airdrop twice
    await expectRevert(
      distributor.connect(user1).claimAirdrop('20', proof),
      'claimAirdrop: airdrop already claimed'
    )

    // try to claim airdrop with correct proof with other user
    leaf = keccak256(elements[2])
    proof = merkleTree.getHexProof(leaf)
    console.log({leaf: leaf.toString('hex'), proof})
    await distributor.connect(user2).claimAirdrop('30', proof)
    balance = (await proxy.balanceOf(user2.address)).toString()
    expect(balance).to.equal('30')

    // check what was minted
    totalSupply = (await proxy.totalSupply()).toString()
    expect(totalSupply).to.equal('50')
    // index 50 doesn't exist yet
    await expectRevert(
      proxy.ownerOf(totalSupply),
      'ERC721: owner query for nonexistent token'
    )
    while (totalSupply-- > 20) {
      expect(await proxy.ownerOf(totalSupply)).to.equal(user2.address)
    }

    // check token 1 uri
    expect(await proxy.tokenURI(1)).to.equal('ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1')

    // try to buy more than max buyable
    await expectRevert(
      distributor.connect(user4).buy(maxBuyable + 1, {value: price * (maxBuyable + 1)}),
      'buy: max bought reached'
    )

    // try to pay too little
    await expectRevert(
      distributor.connect(user4).buy(1, {value: price - 1}),
      'buy: paid too little'
    )

    // check burn and artist balance before buys
    balance = (await ethers.provider.getBalance(burnWallet)).toString()
    expect(balance).to.equal('0')
    balance = (await ethers.provider.getBalance(artistWallet)).toString()
    expect(balance).to.equal('0')

    // buy all
    await distributor.connect(user4).buy(15, {value: price * 15})
    await distributor.connect(user4).buy(10, {value: price * 10})
    await distributor.connect(user4).buy(5, {value: price * 5})
    await distributor.connect(user5).buy(2, {value: price * 2})
    while (true) {
      try {
        await distributor.connect(user6).buy(1, {value: price})
      }
      catch (e) {
        expect(e.message).to.equal(`VM Exception while processing transaction: reverted with reason string 'buy: max bought reached'`)
        break
      }
    }

    // check burn and artist balance after
    balance = (await ethers.provider.getBalance(burnWallet)).toString()
    expect(balance).to.equal('38000')
    balance = (await ethers.provider.getBalance(artistWallet)).toString()
    expect(balance).to.equal('2000')

    // check what was minted
    totalSupply = (await proxy.totalSupply()).toString()
    expect(totalSupply).to.equal('90')
    balance = (await proxy.balanceOf(user4.address)).toString()
    expect(balance).to.equal('30')
    balance = (await proxy.balanceOf(user5.address)).toString()
    expect(balance).to.equal('2')
    balance = (await proxy.balanceOf(user6.address)).toString()
    expect(balance).to.equal('8')

    // try to mint last airdrop
    leaf = keccak256(elements[0])
    proof = merkleTree.getHexProof(leaf)
    await distributor.connect(owner).claimAirdrop('10', proof)
    balance = (await proxy.balanceOf(owner.address)).toString()
    expect(balance).to.equal('10')
    totalSupply = (await proxy.totalSupply()).toString()
    expect(totalSupply).to.equal('100')
  })
})
