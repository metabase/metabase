(ns metabase.auth-provider
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(def azure-auth-token-renew-slack-seconds
  "How many seconds before expiry we should prefer renewal.
  This is a fairly arbitrary value, it's used just to avoid situations when we decide to use an
  auth token which expires before we can put it to use."
  60)

(defenterprise fetch-auth "In OSS, this returns an empty map."
  metabase-enterprise.auth-provider [_driver _database-id _db-details] {})
