(ns metabase.util.polyfills
  #?@(:cljs-test ((:require ["@peculiar/webcrypto" :as webcrypto]))))

;; The browser-compatible Crypto object and the `global.crypto` instance are unavailable in NodeJS before v23.0.0.
;; Since both developers and Github CI may be using older Node versions, we install a Polyfill and include it here.
;; TODO: Remove this once we can reasonably say "you need Node v23+ to run the CLJS tests".
;; It might be a minute! v23 was released in Oct. 2024. The next LTS is v24, expected spring 2025.
;; v20 is the previous LTS, expiring spring 2026.
;; v22 is the current LTS, expiring 2027.
#?(:cljs-test (set! js/crypto (webcrypto/Crypto.)))
