---
[![npm version](https://badge.fury.io/js/malta-upload.svg)](http://badge.fury.io/js/malta-upload)

[![npm downloads](https://img.shields.io/npm/dt/malta-upload.svg)](https://npmjs.org/package/malta-upload)

[![npm downloads](https://img.shields.io/npm/dm/malta-upload.svg)](https://npmjs.org/package/malta-upload)
---

This plugin is highly experimental, can be used on all files:

Parameters :
    - **port** : the port where the upload server will listen (default: none, required)
    - **folder** : a folder (relative to malta execution one) where uploaded files will be saved (default: none, required)
    - **host** : the host address to bind the server (default: `127.0.0.1`)
    - **handler** : an optional path to a file that exports a function to be called after each upload
    - **ssl** : set to `true` to start an HTTPS server (default: `false`)
    - **key** : path to the SSL private key file (optional; if `ssl` is `true` and both `key` and `cert` are omitted, a self-signed certificate is generated on the fly)
    - **cert** : path to the SSL certificate file (optional; same behaviour as `key`)

Sample usage:
```
malta app/source/index.html public -plugins=malta-upload[port:3000,folder:"uploads"]
```
or in the .json file :
```
"app/source/index.html" : "public -plugins=malta-upload[port:3000,folder:'uploads']"
```
or in a script :
``` js
var Malta = require('malta');
Malta.get().check([
    'app/source/index.html',
    'public',
    '-plugins=malta-upload[port:"3000",folder:"uploads",handler:"./upload-handler.js"]',
    '-options=showPath:false,watchInterval:500,verbose:0'
]).start();
```
SSL sample usage (with your own certificates):
```
malta app/source/index.html public -plugins=malta-upload[port:8443,folder:"uploads",ssl:true,key:"./ssl/key.pem",cert:"./ssl/cert.pem"]
```
SSL sample usage (self-signed certificate generated on the fly):
```
malta app/source/index.html public -plugins=malta-upload[port:8443,folder:"uploads",ssl:true]
```
Where `upload-handler.js` could contain something like:
``` js
module.exports = function(self, {path, name, content}) {
    console.log({path, name, content});
    console.log(self); // this is the malta instance
};
```
