import { getNonce } from "get-nonce";

// The nonce is stored by `metabase/utils/csp-setup`, which every app entry imports.
export const getStyleNonce = () => getNonce() ?? "metabase";
