(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [crypto.random :as crypto-random]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

;; TODO (Cam 10/28/25) -- fix this endpoint route to use kebab-case for consistency with the rest of our REST API
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-route-uses-kebab-case]}
(api.macros/defendpoint :get "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})
