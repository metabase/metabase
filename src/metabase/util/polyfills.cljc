(ns metabase.util.polyfills
  #?@(:cljs-test ((:require ["crypto" :as crypto]))))

;; globalThis.crypto is available natively in Node 19+, but CLJS tests run in a context
;; where it's not automatically exposed. We use Node's built-in webcrypto module.
#?(:cljs-test (set! js/crypto (.-webcrypto crypto)))
