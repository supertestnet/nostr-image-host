# Nostr image host

Upload and view images on the web without an api key

# How to try it

Just click here: https://supertestnet.github.io/nostr-image-host/

# What is this?

It's an image host, like imgbb.com or imgur, except you don't need an api key to use it. And you need some javascript.

# How does it work?

It works by dividing up the image into small chunks, uploading each chunk to a nostr relay as a note, and then reassembling them piece by piece.

# Why did you make this?

A lot of times I am working on a project where users upload some info to the internet. Occasionally this info includes a picture. Users expect an upload form, but since I write a lot of apps that don't involve me running a server, I've never been able to show an image upload form before. I just tell users to go upload their image to an image hosting site and then share the link with my app. But now I can do it! I made an app that uploads the image to a *nostr relay* so that I don't have to store it.

# Isn't that spam?

If I was running a nostr relay, I would consider it spam and I would block it, unless I uploaded it to my own relay, or charged some money for it. If you run a nostr relay and you want to do something like that, put a filter on kind number 57009, which is the kind I am using for this. That's the beauty of nostr: it's not up to me. Every nostr relay gets to pick and choose what they think is spam and/or what they want to charge for. Nostr puts the relay operator in control of their own relay. And this app abides by that by *specifying the relay to use* directly in the image id. That way whoever is using it can connect to a relay that you know has that data (or at least had it at one point).

# How come the image identifier doesn't have a file extension?

Because it isn't a file. It's a nostr event id + a hex encoded nostr relay uri, all re-encoded as a bech32 string with the "nimg" prefix for "nostr image." You can't put the nimg string directly in the "src" tag of an html image, you have to first "assemble" the image by piecing it together from the various events it's been chunked into. It will come to you in base64 format, then you just pass that base64 string into your src tag. There is some sample code for this in nostr_image_host.js -- see the function `load_file`. An example of how to use it in an html page is provided in index.html.

# Does this have any dependencies?

Yes, it won't work without the following dependencies:

```
<script src="https://cdn.jsdelivr.net/gh/6502/sha256@main/sha256.js"></script>
<script src="https://bundle.run/noble-secp256k1@1.2.14"></script>
<script src="https://bundle.run/bech32@2.0.0"></script>
```

You can find nodejs versions here:

```
https://www.npmjs.com/package/sha.js
//const shajs = require('sha.js')
//const sha256 = str_or_bytes => shajs('sha256').update(str_or_bytes).digest('hex')
https://www.npmjs.com/package/noble-secp256k1
//const nobleSecp256k1 = require('noble-secp256k1')
https://www.npmjs.com/package/bech32
//const bech32 = require('bech32')
```

# What are the next steps?

I don't think there are any. I think this project is done. :) Hope you like it! Let me know if you have any feature requests by making an issue on this repository.
