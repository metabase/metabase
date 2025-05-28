# Common auth functions

The authentication functions in this directory are shared between the Embedding SDK, and the `embed.js` library which is used in the new iframe embedding.

The reason we need to authenticate in both places is because the authentication cannot take place in the iframe, and it must be done in the parent window via the `embed.js` library.
