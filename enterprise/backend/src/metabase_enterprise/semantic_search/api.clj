(ns metabase-enterprise.semantic-search.api
  "/api/ee/semantic-search endpoints"
  (:require
   [clojure.core.memoize :as memoize]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase-enterprise.semantic-search.duplicates :as semantic.duplicates]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.task.duplicates-backfill :as duplicates-backfill]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.search.ingestion :as search.ingestion]
   [ring.util.response :as response]))

(def ^:private duplicate-question
  [:map {:closed true}
   [:id pos-int?]
   [:name string?]
   [:display_type {:optional true} [:maybe string?]]])

(def ^:private duplicates-response
  [:map {:closed true}
   [:data [:sequential
           [:map {:closed true}
            [:question duplicate-question]
            [:duplicates [:sequential duplicate-question]]]]]
   [:total nat-int?]
   [:offset nat-int?]
   [:limit pos-int?]
   [:pair_count nat-int?]
   [:snapshot_revision [:maybe string?]]])

(def ^:private duplicates-status-response
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

(api.macros/defendpoint :get "/duplicates" :- duplicates-response
  "Return a bounded page of visible semantic duplicate pairs, expanded bidirectionally in memory.

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

(api.macros/defendpoint :get "/duplicates/status" :- duplicates-status-response
  "Return semantic duplicate backfill status without running a backfill."
  [_route-params]
  (api/check-data-analyst)
  (let [status (semantic.duplicates/backfill-status)]
    (cond-> (merge {:available (and (semantic.u/semantic-search-available?)
                                    (semantic.embedding/embedding-supported?
                                     (semantic.embedding/get-configured-model)))}
                   status)
      ;; Raw provider errors can contain deployment details. Only administrators need the diagnostic text.
      (not api/*is-superuser?*) (assoc :last_error nil))))

(api.macros/defendpoint :post "/duplicates/backfill"
  :- [:map
      [:status [:= 202]]
      [:body [:map {:closed true} [:state [:= "queued"]]]]]
  "Queue an asynchronous semantic duplicate rebuild. Administrators only."
  [_route-params _query-params]
  (api/check-superuser)
  (duplicates-backfill/trigger-backfill!)
  (-> (response/response {:state "queued"})
      (assoc :status 202)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/semantic-search` routes."
  (api.macros/ns-handler *ns* +auth))
