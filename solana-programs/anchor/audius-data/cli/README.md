# AudiusData <-> Anchor CLI

Below are useful commands that will allow you to interact with the AudiusData program deployed with anchor commands:

## 1. Initializing admin keypair and storage accounts:

```
yarn run ts-node cli/main.ts -f initAdmin -k ~/.config/solana/id.json
```

Output:

```
Initializing admin
AdminKeypair:
5wVFf9KXRhkxZXr7cGeeNT5yrz5mX4YXvYMXe9quaYu5
[197,98,127,...]
echo "[197,98,127,...]" > adminKeypair.json
AdminStgKeypair:
3oQQ3XNjSyiBR5m8gbSTMiZJYKyQrowqz2FqKEa3yUyB
[196,4,5,...]
echo "196,4,5,..." > adminStgKeypair.json
initAdmin Tx = 46wLJrPPwDjXJeeZU37eDM2h7kUSGDMzEiz23BvZvtYjpU2uQW2SFEtrqki4YkBjgVZ7dsdvf8nFKY2qF7pdGqSX
Admin: 5wVFf9KXRhkxZXr7cGeeNT5yrz5mX4YXvYMXe9quaYu5
AdminStg 3oQQ3XNjSyiBR5m8gbSTMiZJYKyQrowqz2FqKEa3yUyB
AdminAccount (from Chain) 5wVFf9KXRhkxZXr7cGeeNT5yrz5mX4YXvYMXe9quaYu5
```

Now, you can use the `echo [...] > adminKeypair.json` and `echo [...] > adminStgKeypair.json` to write these accounts to local filesystem (or your pair of choice)

What are these 2 accounts?

    - adminKeypair - the Account required to sign administrative operations within the protocol

    - adminStgKeypair - the Account where administrative info is stored on chain, includes various metadata such as global track ID nonce (to be expanded). This account has a reference to the adminKeypair

## 2. Initializing a user account from administrator

For a user with handle=`handlebcdef` and ethereum public key = `0x0a93d8cb0Be85B3Ea8f33FA63500D118deBc83F7`

```
yarn run ts-node cli/main.ts -f initUser \
-k ~/.config/solana/id.json \
--admin-keypair $PWD/adminKeypair.json \
--admin-storage-keypair $PWD/adminStgKeypair.json \
-h handlebcdef \
-e 0x0a93d8cb0Be85B3Ea8f33FA63500D118deBc83F7
```

Output:

```
Initialized user=handlebcdef, tx=3M88gDkFm8bXuwdmCRV28NPNakLENutdFx7N4tzWjQydaQt2mQccG2STTqtdm29hR8FSD6aGsavGqXYNo1FbbK6h, userAcct=BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx
```

At this point, the account associated with the handle has been initialized by the administrator account, at `BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx`

## 3. Claiming a user account with the ethereum private key

In this step, we associate the account made in step 2 with a new solana public key for the user, by submitting signed verification using the ethereum private key

First, generate the new solana public key for this user:

```
solana-keygen new -o userKeypair.json
```

Execute the command using the returned user account from earlier (`BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx`) and the eth private key:

```
yarn run ts-node cli/main.ts -f initUserSolPubkey \
-k ~/.config/solana/id.json \
--user-solana-keypair $PWD/userKeypair.json \
--admin-storage-keypair $PWD/adminStgKeypair.json \
--user-storage-pubkey BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx \
--eth-private-key d540....
```

## 4. Creating a track

Finally, using the parameters known from above, we can call createTrack - it is important to note that there is no 'metadata' flag as of now and the string is randomly generated. This object will be the pointer to a CID which contains track related information.

```
yarn run ts-node cli/main.ts -f createTrack \
-k ~/.config/solana/id.json \
--user-solana-keypair $PWD/userKeypair.json \
--user-storage-pubkey BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx
```

## 4. Creating a playlist

Similar to playlist information. The metadata (currently randomly generated) points to a CID which contains playlist related information.

```
yarn run ts-node cli/main.ts -f createPlaylist \
-k ~/.config/solana/id.json \
--user-solana-keypair $PWD/userKeypair.json \
--user-storage-pubkey BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx
```

## 4. Updating a playlist

Update a given playlist denoted by its public key.

```
yarn run ts-node cli/main.ts -f updatePlaylist \
-k ~/.config/solana/id.json \
--user-solana-keypair $PWD/userKeypair.json \
--user-storage-pubkey BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx
--playlist-pubkey AZZbBaE4aa85kp6ihzZJxuXtdP7xq59aLg7cmwJYpuTe
```

## 4. Delete a playlist

Delete a given playlist denoted by its public key. This one does not take a metadata argument.

```
yarn run ts-node cli/main.ts -f deletePlaylist \
-k ~/.config/solana/id.json \
--user-solana-keypair $PWD/userKeypair.json \
--user-storage-pubkey BmBwwWjcSduP7ZWUoavxBh1kV8dvHmakmfrqjsVyA2Sx
--playlist-pubkey AZZbBaE4aa85kp6ihzZJxuXtdP7xq59aLg7cmwJYpuTe
```
