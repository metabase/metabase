/**
 * Store the CSP nonce so that libraries using `get-nonce` (e.g. CodeMirror)
 * can read it when injecting dynamic styles. The nonce is generated server-side
 * and placed on the window by the HTML template.
 */
import { setNonce } from "get-nonce";

setNonce(window.MetabaseNonce ?? "");
