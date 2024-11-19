/**
 * setNonce is required for react-remove-scroll which adds style and can handle
 * nonce but the method we use to set nonce is not compatible with
 * react-remove-scroll it expects __webpack_nonce__ to be defined, when we
 * generate it at BE and put directly into html file. `get-nonce` is used inside
 * react-remove-scroll to get nonce, so we put it manually here.
 * react-remove-scroll is a dependency of mantine v6
 *
 * TODO: remove it when  we upgrade mantine to v7
 */
import { setNonce } from "get-nonce";

setNonce(window.MetabaseNonce);
