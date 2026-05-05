# Common auth functions

The authentication functions in this directory are shared between the Embedding SDK, and the `embed.js` library which is used in the new iframe embedding.

We need to authenticate in both places because the authentication cannot take place in the iframe (due to security reasons), and it must be done in the parent window via the `embed.js` library.

These functions must be agnostic of the embedding type.
