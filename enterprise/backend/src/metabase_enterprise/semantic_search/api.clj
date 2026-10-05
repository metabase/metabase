(ns metabase-enterprise.semantic-search.api
  "/api/ee/semantic-search endpoints"
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.duplicates :as semantic.duplicates]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.sqlite-config :as sqlite-config]
   [metabase-enterprise.semantic-search.task.duplicates-backfill :as duplicates-backfill]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.search.ingestion :as search.ingestion]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs]
   [ring.util.response :as response]))

(def ^:private related-question
  [:map {:closed true}
   [:id pos-int?]
   [:name string?]
   [:display_type {:optional true} [:maybe string?]]])

(def ^:private related-questions-response
  [:map {:closed true}
   [:data [:sequential
           [:map {:closed true}
            [:question related-question]
            [:related_questions [:sequential related-question]]]]]
   [:total nat-int?]
   [:offset nat-int?]
   [:limit pos-int?]
   [:pair_count nat-int?]
   [:snapshot_revision [:maybe string?]]])

(def ^:private related-questions-status-response
  [:map {:closed true}
   [:available boolean?]
   [:state string?]
   [:processed_questions nat-int?]
   [:total_questions nat-int?]
   [:last_successful_completion [:maybe string?]]
   [:last_error [:maybe string?]]
   [:snapshot_revision [:maybe string?]]
   [:pair_count {:optional true} nat-int?]])

(def ^:private indexible-items-count
  (memoize/ttl search.ingestion/search-items-count
               :ttl/threshold (* 5 60 1000))) ; 5 minutes

(defn- active-index-document-count
  [pgvector index-metadata]
  (when-let [table-name (-> index-metadata :index :table-name)]
    (semantic.index/index-size pgvector table-name)))

(defn- semantic-search-available-for-related-questions?
  "Whether the related-questions checker has a licensed, configured semantic-search backend and embedder.

  `semantic.u/semantic-search-available?` intentionally describes pgvector availability and returns false for
  SQLite-backed semantic search, so the related-questions status endpoint must account for the SQLite store
  explicitly."
  []
  (and (premium-features/has-feature? :semantic-search)
       (or (sqlite-config/enabled?)
           (semantic.u/semantic-search-available?))
       (semantic.embedding/embedding-supported?
        (semantic.embedding/get-configured-model))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/status"
  "Fetch the indexing status of the currently active semantic search index table.

  Returns a map with keys:
   :indexed_count <number of indexed items>
   :total_est     <estimated total number of items to index>

  If no index is active, or no pgvector database is configured, returns an empty map."
  []
  (perms/check-has-application-permission :setting)
  (if-not (semantic.db.datasource/pgvector-configured?)
    {}
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.env/get-index-metadata)
          active-index   (when (and pgvector index-metadata)
                           (semantic.index-metadata/get-active-index-state pgvector index-metadata))]
      (try
        (if active-index
          {:indexed_count (active-index-document-count pgvector active-index)
           :total_est     (indexible-items-count)}
          {})
        (catch Exception e
          (throw (ex-info "Error fetching semantic search index status" {} e)))))))

(api.macros/defendpoint :get "/related-questions" :- related-questions-response
  "Return a bounded page of visible semantically related question pairs, expanded bidirectionally in memory.

  Pagination is over stored pairs, not expanded question rows. A question can therefore occur on more than one page."
  [_route-params _query-params]
  (api/check-data-analyst)
  (let [limit  (or (request/limit) 50)
        offset (or (request/offset) 0)]
    (when-not (and (pos-int? limit) (<= limit 200))
      (api/throw-invalid-param-exception "limit" "must be between 1 and 200"))
    (when-not (nat-int? offset)
      (api/throw-invalid-param-exception "offset" "must be non-negative"))
    (semantic.duplicates/list-page
     {:limit limit :offset offset}
     {:user-id api/*current-user-id* :is-superuser? api/*is-superuser?*})))

(api.macros/defendpoint :get "/related-questions/status" :- related-questions-status-response
  "Return related-questions backfill status without running a backfill."
  [_route-params]
  (api/check-data-analyst)
  (let [status (semantic.duplicates/backfill-status)]
    (cond-> (merge {:available (semantic-search-available-for-related-questions?)}
                   status)
      ;; Raw provider errors can contain deployment details. Only administrators need the diagnostic text.
      (not api/*is-superuser?*) (assoc :last_error nil))))

(api.macros/defendpoint :post "/related-questions/backfill"
  :- [:map
      [:status [:= 202]]
      [:body [:map {:closed true} [:state [:= "queued"]]]]]
  "Queue an asynchronous related-questions rebuild. Administrators only."
  [_route-params _query-params]
  (api/check-superuser)
  (duplicates-backfill/trigger-backfill!)
  (-> (response/response {:state "queued"})
      (assoc :status 202)))

(def ^:private projection-response
  [:map {:closed true}
   [:points [:sequential
             [:map {:closed true}
              [:model string?]
              [:model_id string?]
              [:name string?]
              [:embedding [:sequential number?]]]]]])

(defn- parse-embedding
  "Parse a pgvector embedding value (a PGobject or string like \"[0.1,-0.2,...]\") into a vector of doubles."
  [embedding]
  (let [s (str/replace (str embedding) #"[\[\]]" "")]
    (if (str/blank? s)
      []
      (mapv parse-double (str/split s #",")))))

(api.macros/defendpoint :get "/projection" :- projection-response
  "Return every non-archived saved question in the active semantic search index with its raw embedding vector, capped
  at 5000 rows. Administrators only.

  Returns {:points []} when no pgvector database is configured or no index is active."
  []
  (api/check-superuser)
  (if-not (semantic.db.datasource/pgvector-configured?)
    {:points []}
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.env/get-index-metadata)
          active-index   (when (and pgvector index-metadata)
                           (semantic.index-metadata/get-active-index-state pgvector index-metadata))
          table-name     (-> active-index :index :table-name)]
      (if-not table-name
        {:points []}
        (let [rows (jdbc/execute! pgvector
                                  (semantic.index/sql-format-quoted
                                   {:select [:model :model_id :name :embedding]
                                    :from   [(keyword table-name)]
                                    :where  [:and
                                             [:= :archived false]
                                             [:= :model "card"]]
                                    :limit  5000})
                                  {:builder-fn jdbc.rs/as-unqualified-lower-maps})]
          {:points (mapv (fn [row]
                           {:model     (:model row)
                            :model_id  (:model_id row)
                            :name      (:name row)
                            :embedding (parse-embedding (:embedding row))})
                         rows)})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-search` routes."
  (api.macros/ns-handler *ns* +auth))
