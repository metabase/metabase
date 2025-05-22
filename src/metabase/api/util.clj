(ns metabase.api.util
  "Random utilty endpoints for things that don't belong anywhere else in particular, e.g. endpoints for certain admin
  page tasks."
  (:require
   [crypto.random :as crypto-random]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/random_token"
  "Return a cryptographically secure random 32-byte token, encoded as a hexadecimal string.
   Intended for use when creating a value for `embedding-secret-key`."
  []
  {:token (crypto-random/hex 32)})
