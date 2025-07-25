(ns metabase.auth-provider.core
  (:require
   [metabase.auth-provider.impl]
   [potemkin :as p]))

(comment metabase.auth-provider.impl/keep-me)

(p/import-vars
 [metabase.auth-provider.impl
  azure-auth-token-renew-slack-seconds
  fetch-auth])
