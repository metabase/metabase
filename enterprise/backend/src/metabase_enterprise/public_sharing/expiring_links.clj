(ns metabase-enterprise.public-sharing.expiring-links
  "Enterprise implementation for expiring public links."
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.time Instant Duration)))

(defenterprise compute-expiry-timestamp
  "Given an optional `expires-in-minutes` value, return a java.time.Instant for when the link should expire,
  or nil if not requested."
  :feature :none
  [expires-in-minutes]
  (when expires-in-minutes
    (.plus (Instant/now) (Duration/ofMinutes (long expires-in-minutes)))))

(defenterprise check-link-not-expired
  "Check that a public link has not expired. Throws 404 if the link is marked as expired
  or if the expiry timestamp is in the past."
  :feature :none
  [entity]
  (when (or (:public_link_expired entity)
            (and (:public_link_expires_at entity)
                 (.isBefore (Instant/parse (str (:public_link_expires_at entity)))
                            (Instant/now))))
    (api/check false [404 (tru "This public link has expired.")])))
