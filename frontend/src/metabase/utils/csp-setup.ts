import { setNonce } from "get-nonce";

// Store the CSP nonce so that libraries using get-nonce can read it when injecting dynamic styles.
// Every get-nonce reader depends on this having run, so entries import this file for its effect.
setNonce(window.MetabaseNonce ?? "");
