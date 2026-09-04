import { getNonce } from "get-nonce";

// The nonce is stored by metabase/utils/csp-setup, which every entry imports.
export function getCspNonce() {
  return getNonce();
}
