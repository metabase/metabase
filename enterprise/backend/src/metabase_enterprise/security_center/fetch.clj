(ns metabase-enterprise.security-center.fetch
  "Fetch security advisories from the MetaStore and upsert into the appdb."
  (:require
   [clj-http.client :as http]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- advisories-url [token base-url]
  (format "%s/api/%s/v2/security-advisories" base-url token))

(defn- fetch-advisories-from-store
  "GET advisories from the MetaStore. Returns a seq of advisory maps or nil on failure."
  []
  (let [token     (premium-features/premium-embedding-token)
        site-uuid (premium-features/site-uuid-for-premium-features-token-checks)
        url       (advisories-url token premium-features/token-check-url)
        resp      (http/get url
                            {:query-params       {:site-uuid  site-uuid
                                                  :mb-version (:tag config/mb-version-info)}
                             :throw-exceptions   false
                             :socket-timeout     5000
                             :connection-timeout 2000})]
    (when (http/success? resp)
      (:advisories (json/decode+kw (:body resp))))))

(defn- upsert-advisory!
  "Insert or update a single advisory by :advisory_id.
   On insert, sets :match_status to :not_affected. On update, merges new data but
   preserves :match_status, :last_evaluated_at, and acknowledgement fields."
  [advisory]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             (select-keys advisory [:title :severity :description :advisory_url
                                                    :remediation :affected_versions :matching_query
                                                    :published_at])
                             (assoc advisory :match_status :not_affected)))))

(defn sync-advisories!
  "Fetch advisories from the MetaStore and upsert into the appdb."
  []
  (if-let [advisories (seq (fetch-advisories-from-store))]
    (do
      (doseq [advisory advisories]
        (try
          (upsert-advisory! advisory)
          (catch Exception e
            (log/warnf e "Error upserting advisory %s" (:advisory_id advisory)))))
      (log/infof "Synced %d advisories from MetaStore" (count advisories)))
    (log/info "No new advisories from MetaStore")))
