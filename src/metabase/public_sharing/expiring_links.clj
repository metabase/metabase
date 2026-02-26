(ns metabase.public-sharing.expiring-links
  "OSS stub for expiring public links. Enterprise implementation lives in
  `metabase-enterprise.public-sharing.expiring-links`."
  (:require
   [metabase.premium-features.defenterprise :as ee]))

(ee/defenterprise compute-expiry-timestamp
  "Given an optional `expires-in-minutes` value, return a timestamp for when the link should expire,
  or nil if expiry is not supported (OSS) or not requested."
  metabase-enterprise.public-sharing.expiring-links
  [_expires-in-minutes]
  nil)

(ee/defenterprise check-link-not-expired
  "Check that a public link has not expired. Throws 404 if expired. No-op in OSS."
  metabase-enterprise.public-sharing.expiring-links
  [_entity]
  nil)
