(ns metabase-enterprise.security-center.fetch
  "Fetch security advisories from the MetaStore and upsert into the appdb."
  (:require
   [clj-http.client :as http]
   [clojure.edn :as edn]
   [clojure.set :as set]
   [java-time.api :as t]
   [metabase-enterprise.security-center.schema :as security-center.schema]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Store API response schemas ----------------------------------------

(mr/def ::severity
  [:enum "critical" "high" "medium" "low"])

(mr/def ::affected-version
  [:map {:closed true}
   [:min ::security-center.schema/semver]
   [:fixed ::security-center.schema/semver]])

(mr/def ::driver
  [:enum :default :postgres :mysql :h2])

(mr/def ::matching-query
  "A map of driver -> honeysql query stored as EDN string."
  [:map-of ::driver :string])

(mr/def ::advisory
  [:map
   [:id ::security-center.schema/advisory-id]
   [:title [:string {:min 1}]]
   [:severity ::severity]
   [:description [:string {:min 1}]]
   [:published_at ms/TemporalString]
   [:updated_at ms/TemporalString]
   [:advisory_url [:maybe :string]]
   [:affected_versions [:vector {:min 1} ::affected-version]]
   [:matching_query [:maybe ::matching-query]]
   [:remediation [:string {:min 1}]]])

;;; ---------------------------------------- Fetch helpers ----------------------------------------

(def ^:private ^String hm-url
  "Base URL for the Harbormaster / MetaStore API."
  premium-features/token-check-url)

(defn- advisories-url [token base-url]
  (format "%s/api/%s/v2/security-advisories" base-url token))

(defn- latest-updated-at
  "Return the maximum `updated_at` across all advisories as an ISO-8601 string, or nil if none exist."
  []
  (some-> (mdb/query {:select [[[:max :updated_at]]]
                      :from   [:security_advisory]})
          first
          vals
          first
          t/instant
          t/format))

(defn- validate-select-query
  "Validate that a parsed HoneySQL map is a SELECT-only query (has :select but no mutation keys)."
  [query driver-key]
  (when-not (map? query)
    (throw (ex-info "Matching query must be a map" {:driver driver-key :query query})))
  (when-not (contains? query :select)
    (throw (ex-info "Matching query must contain :select" {:driver driver-key :query query})))
  (let [mutation-keys #{:insert-into :update :delete :delete-from :truncate :drop-table :alter-table :create-table}
        found         (set/intersection mutation-keys (set (keys query)))]
    (when (seq found)
      (throw (ex-info "Matching query must be SELECT-only, found mutation keys" {:driver driver-key :keys found}))))
  query)

(defn- parse-matching-query
  "Parse each EDN string value in a matching_query map into Clojure data, validating each is a SELECT query."
  [matching-query]
  (when matching-query
    (reduce-kv (fn [m driver-key edn-str]
                 (assoc m driver-key (validate-select-query (edn/read-string edn-str) driver-key)))
               {}
               matching-query)))

(defn- parse-advisory
  "Parse matching_query EDN strings, convert temporal strings, and rename :id to :advisory_id."
  [advisory]
  {:advisory_id       (:id advisory)
   :title             (:title advisory)
   :severity          (:severity advisory)
   :description       (:description advisory)
   :advisory_url      (:advisory_url advisory)
   :remediation       (:remediation advisory)
   :affected_versions (:affected_versions advisory)
   :matching_query    (parse-matching-query (:matching_query advisory))
   :published_at      (t/offset-date-time (:published_at advisory))
   :updated_at        (t/offset-date-time (:updated_at advisory))})

(mu/defn ^:private fetch-advisories-from-store :- [:maybe [:sequential [:map]]]
  "GET advisories from the MetaStore. Returns a seq of advisory maps or nil on failure.
   Sends the latest `updated_at` as a `since` cursor so only changed advisories are returned."
  []
  (when-let [token (premium-features/premium-embedding-token)]
    (let [site-uuid    (premium-features/site-uuid-for-premium-features-token-checks)
          url          (advisories-url token hm-url)
          since        (latest-updated-at)
          query-params (cond-> {:site-uuid  site-uuid
                                :mb-version (:tag config/mb-version-info)}
                         since (assoc :since (str since)))
          resp         (http/get url
                                 {:query-params       query-params
                                  :throw-exceptions   false
                                  :socket-timeout     5000
                                  :connection-timeout 2000})]
      (if (http/success? resp)
        (let [advisories (:advisories (json/decode+kw (:body resp)))]
          (mu/validate-throw [:sequential ::advisory] advisories)
          (mapv parse-advisory advisories))
        (log/warnf "Advisory fetch failed with status %s" (:status resp))))))

(defn- upsert-advisory!
  "Insert or update a single advisory by :advisory_id.
   On insert, match_status starts as :unknown until the matching engine evaluates it.
   On update, merges new data but preserves :match_status, :last_evaluated_at, and acknowledgement fields."
  [advisory]
  (mdb/update-or-insert! :model/SecurityAdvisory
                         {:advisory_id (:advisory_id advisory)}
                         (fn [existing]
                           (if existing
                             advisory
                             (assoc advisory :match_status :unknown)))))

(defn sync-advisories!
  "Fetch advisories from the MetaStore and upsert into the appdb."
  []
  (let [advisories (try
                     (fetch-advisories-from-store)
                     (catch Exception e
                       (log/warn e "Error fetching advisories from MetaStore")))]
    (if (seq advisories)
      (let [total    (count advisories)
            failures (reduce (fn [n advisory]
                               (try
                                 (upsert-advisory! advisory)
                                 n
                                 (catch Exception e
                                   (log/warnf e "Error upserting advisory %s" (:advisory_id advisory))
                                   (inc n))))
                             0
                             advisories)
            synced   (- total failures)]
        (log/infof "Synced %d/%d advisories from MetaStore" synced total))
      (log/info "No new advisories from MetaStore"))))
