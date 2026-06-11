---
[![npm version](https://badge.fury.io/js/malta-upload.svg)](http://badge.fury.io/js/malta-upload)

[![npm downloads](https://img.shields.io/npm/dt/malta-upload.svg)](https://npmjs.org/package/malta-upload)

[![npm downloads](https://img.shields.io/npm/dm/malta-upload.svg)](https://npmjs.org/package/malta-upload)
---

This plugin is highly experimental, can be used on all files:

Parameters :
    - **port** : the port where the upload server will listen (default: none, required)
    - **folder** : a folder (relative to malta execution one) where uploaded files will be saved (default: none, required)
    - **handler** : an optional path to a file that exports a function to be called after each upload

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
Where `upload-handler.js` could contain something like:
``` js
module.exports = function(self, {path, name, content}) {
    console.log({path, name, content});
    console.log(self); // this is the malta instance
};
```
