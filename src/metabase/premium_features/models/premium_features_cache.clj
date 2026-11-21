(ns metabase.premium-features.models.premium-features-cache
  "Model for the `premium_features_token_cache` table, which stores hashes of premium features token check
  results for cross-instance cache coordination. The actual token status is only held in memory."
  (:require
   [java-time.api :as t]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as app-db]
   [metabase.premium-features.db :as premium-features.db]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PremiumFeaturesCache [_model] :premium_features_token_cache)

(doto :model/PremiumFeaturesCache
  (derive :metabase/model))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn save-token-status-cache!
  "Store `token-status-hash` as the cached status hash of `token-hash`, updating first so that a duplicate key does not
  poison a PostgreSQL transaction, and updating again when a concurrent instance inserted first."
  [token-hash        :- :string
   token-status-hash :- :string]
  (t2/with-connection [_conn (app-db/app-db)]
    (let [now     (t/offset-date-time)
          updated (premium-features.db/update-token-status-cache! token-hash token-status-hash now)]
      (when (zero? updated)
        (try
          (premium-features.db/insert-token-status-cache! token-hash token-status-hash now)
          (catch Exception _e
            (premium-features.db/update-token-status-cache! token-hash token-status-hash now)))))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/PremiumFeaturesCache [_model]
  {:skip? true})
