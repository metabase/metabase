(ns metabase.search.api
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.open-api :as open-api]
   [metabase.config.core :as config]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as ingestion]
   [metabase.search.settings :as search.settings]
   [metabase.search.task.search-index :as task.search-index]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private engine-cookie-name "metabase.SEARCH_ENGINE")

(defn- cookie-expiry []
  ;; 20 years should be long enough to trial an experimental search engine
  (t/format :rfc-1123-date-time (t/plus (t/zoned-date-time) (t/years 20))))

(defn- set-engine-cookie! [respond engine]
  (fn [response]
    (respond
     (response/set-cookie response
                          engine-cookie-name
                          engine
                          {:http-only true
                           :path      "/"
                           :expires   (cookie-expiry)}))))

(defn- process-non-temporal-dim-ids
  "Parse and process non-temporal dimension IDs JSON string.
  Filters out null values and sorts ascending, returning as JSON string."
  [non-temporal-dim-ids]
  (when non-temporal-dim-ids
    (try
      (->> (json/decode non-temporal-dim-ids)
           (remove nil?)
           sort
           vec
           json/encode)
      (catch Exception e
        (log/warn "Failed to parse non-temporal dimension IDs:" (ex-message e))
        nil))))

(defn- +engine-cookie [handler]
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     (if-let [new-engine (get-in request [:params :search_engine])]
       (handler request (set-engine-cookie! respond new-engine) raise)
       (handler (->> (get-in request [:cookies engine-cookie-name :value])
                     (assoc-in request [:params :search_engine]))
                respond
                raise)))
   (fn [prefix]
     (open-api/open-api-spec handler prefix))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/re-init"
  "This will blow away any search indexes, re-create, and re-populate them."
  []
  (api/check-superuser)
  (if (search/supports-index?)
    {:message (search/init-index! {:force-reset? true})}
    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/force-reindex"
  "This will trigger an immediate reindexing, if we are using search index."
  []
  (api/check-superuser)
  (if (search/supports-index?)
    ;; The job appears to wait on the main thread when run from tests, so, unfortunately, testing this branch is hard.
    (if (and (task/job-exists? task.search-index/reindex-job-key) (or (not ingestion/*force-sync*) config/is-test?))
      (do (task/trigger-now! task.search-index/reindex-job-key) {:message "task triggered"})
      (do (search/reindex!) {:message "reindex triggered"}))
    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(mu/defn- set-weights!
  [context   :- :keyword
   overrides :- [:map-of keyword? double?]]
  (api/check-superuser)
  (when (= context :all)
    (throw (ex-info "Cannot set weights for all context"
                    {:status-code 400})))
  (let [rankers         (into #{}
                              (map (fn [k]
                                     (if (namespace k)
                                       (keyword (namespace k))
                                       k)))
                              (keys overrides))
        unknown-rankers (not-empty (remove search.config/known-rankers rankers))]
    (when unknown-rankers
      (throw (ex-info (str "Unknown rankers: " (str/join ", " (map name (sort unknown-rankers))))
                      {:status-code 400})))
    (search.settings/experimental-search-weight-overrides!
     (merge-with merge (search.settings/experimental-search-weight-overrides) {context (update-keys overrides u/qualified-name)}))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/weights"
  "Return the current weights being used to rank the search results"
  [_route-params
   {:keys [context]} :- [:map [:context {:default :default} :keyword]]]
  ;; normalize so the reported weights match what search actually applies for this context
  (search.config/weights {:context (search.config/normalized-context context)}))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/weights"
  "Update the current weights being used to rank the search results"
  [_route-params
   {:keys [context], :as overrides} :- [:map
                                        [:context {:default :default} :keyword]
                                        [:search_engine {:optional true} :any]]]
  ;; remove cookie
  ;; normalize so overrides are stored under the same key search reads them from
  (let [context   (search.config/normalized-context context)
        overrides (-> overrides (dissoc :search_engine :context) (update-vals parse-double))]
    (when (seq overrides)
      (set-weights! context overrides))
    (search.config/weights {:context context})))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
(def ^:private search-request-schema
  "Query-parameter schema shared by `GET /api/search` and `GET /api/search/debug`."
  [:map
   [:q                                   {:optional true} [:maybe :string]]
   ;; no `:optional true`: default-value-transformer skips defaults for absent optional keys, so it's
   ;; what makes `:default :api` actually apply when the param is omitted
   [:context                             {:default :api} search.config/Context]
   [:archived                            {:default false} [:maybe :boolean]]
   [:collection                          {:optional true} [:maybe ms/PositiveInt]]
   [:table_db_id                         {:optional true} [:maybe ms/PositiveInt]]
   [:models                              {:optional true} [:maybe (ms/QueryVectorOf search/SearchableModel)]]
   [:filter_items_in_personal_collection {:optional true} [:maybe [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]]
   [:created_at                          {:optional true} [:maybe ms/NonBlankString]]
   [:created_by                          {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
   [:display_type                        {:optional true} [:maybe (ms/QueryVectorOf ms/NonBlankString)]]
   [:last_edited_at                      {:optional true} [:maybe ms/NonBlankString]]
   [:last_edited_by                      {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
   [:model_ancestors                     {:default false} [:maybe :boolean]]
   [:search_engine                       {:optional true} [:maybe string?]]
   [:vector_search_strategy              {:optional true} [:maybe (into [:enum] (map name) search.config/vector-search-strategies)]]
   ;; bounded to pgvector's GUC ranges so out-of-range values get a 400 instead of erroring the
   ;; SET LOCAL mid-transaction (a 500)
   [:vector_search_ef_search             {:optional true} [:maybe [:int {:min 1 :max 1000}]]]
   [:vector_search_max_scan_tuples       {:optional true} [:maybe [:int {:min 1 :max 2147483647}]]]
   [:vector_search_explain               {:optional true} [:maybe :boolean]]
   [:search_native_query                 {:optional true} [:maybe :boolean]]
   [:verified                            {:optional true} [:maybe true?]]
   [:ids                                 {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
   [:calculate_available_models          {:optional true} [:maybe true?]]
   [:include_dashboard_questions         {:default false} [:maybe :boolean]]
   [:include_metadata                    {:default false} [:maybe :boolean]]
   [:non_temporal_dim_ids                {:optional true} [:maybe ms/NonBlankString]]
   [:has_temporal_dim                    {:optional true} [:maybe :boolean]]])

(def ^:private search-debug-request-schema
  (conj search-request-schema
        [:expected_result_type                   search/SearchableModel]
        [:expected_result_id                     ms/PositiveInt]
        [:for_user_id          {:optional true} [:maybe ms/PositiveInt]]))

(defn- params->search-context
  "Build a search context from the raw `GET /api/search` query params. Shared by the search and debug endpoints."
  [{:keys                               [q context archived models verified ids]
    calculate-available-models          :calculate_available_models
    collection                          :collection
    created-at                          :created_at
    created-by                          :created_by
    filter-items-in-personal-collection :filter_items_in_personal_collection
    display-type                        :display_type
    include-dashboard-questions         :include_dashboard_questions
    last-edited-at                      :last_edited_at
    last-edited-by                      :last_edited_by
    model-ancestors                     :model_ancestors
    search-engine                       :search_engine
    vector-search-strategy              :vector_search_strategy
    vector-search-ef-search             :vector_search_ef_search
    vector-search-max-scan-tuples       :vector_search_max_scan_tuples
    vector-search-explain               :vector_search_explain
    search-native-query                 :search_native_query
    table-db-id                         :table_db_id
    include-metadata                    :include_metadata
    non-temporal-dim-ids                :non_temporal_dim_ids
    has-temporal-dim                    :has_temporal_dim}]
  (search/search-context
   {:archived                            archived
    :collection                          collection
    :context                             context
    :created-at                          created-at
    :created-by                          (set created-by)
    :current-user-id                     api/*current-user-id*
    :is-impersonated-user?               (perms/impersonated-user?)
    :is-sandboxed-user?                  (perms/sandboxed-user?)
    :is-superuser?                       api/*is-superuser?*
    :current-user-perms                  @api/*current-user-permissions-set*
    :filter-items-in-personal-collection filter-items-in-personal-collection
    :last-edited-at                      last-edited-at
    :last-edited-by                      (set last-edited-by)
    :limit                               (request/limit)
    :model-ancestors?                    model-ancestors
    :models                              (not-empty (set models))
    :offset                              (request/offset)
    :search-engine                       search-engine
    :vector-search-strategy              vector-search-strategy
    :vector-search-ef-search             vector-search-ef-search
    :vector-search-max-scan-tuples       vector-search-max-scan-tuples
    :vector-search-explain?              vector-search-explain
    :search-native-query                 search-native-query
    :search-string                       (some-> q str/trim not-empty)
    :table-db-id                         table-db-id
    :verified                            verified
    :ids                                 (set ids)
    :calculate-available-models?         calculate-available-models
    :include-dashboard-questions?        include-dashboard-questions
    :include-metadata?                   include-metadata
    :non-temporal-dim-ids                (process-non-temporal-dim-ids non-temporal-dim-ids)
    :has-temporal-dim                    has-temporal-dim
    :display-type                        (set display-type)}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Search for items in Metabase.
  For the list of supported models, check [[metabase.search.config/all-models]].

  `context` identifies the surface issuing the search; it selects the ranking weights and filter defaults.
  It defaults to `api`, the value for programmatic callers.

  Filters:
  - `archived`: set to true to search archived items only, default is false
  - `table_db_id`: search for tables, cards, and models of a certain DB
  - `models`: only search for items of specific models. If not provided, search for all models
  - `filter_items_in_personal_collection`: only search for items in personal collections
  - `created_at`: search for items created at a specific timestamp
  - `created_by`: search for items created by a specific user
  - `last_edited_at`: search for items last edited at a specific timestamp
  - `last_edited_by`: search for items last edited by a specific user
  - `search_native_query`: set to true to search the content of native queries
  - `vector_search_strategy`: for the semantic engine: `hnsw` (approximate index search, default),
    `brute-force` (exact filter-first search), or `hnsw-iterative-relaxed` / `hnsw-iterative-strict`
    (index-backed iterative scans with inline filters); ignored by other engines
  - `vector_search_ef_search`: override pgvector's `hnsw.ef_search` (1-1000) for the iterative strategies; (admin only)
  - `vector_search_max_scan_tuples`: override pgvector's `hnsw.max_scan_tuples` for the iterative strategies; (admin only)
  - `vector_search_explain`: set to true to record vector-scan instrumentation for this search (expensive); (admin only)
  - `verified`: set to true to search for verified items only (requires Content Management or Official Collections premium feature)
  - `ids`: search for items with those ids, works iff single value passed to `models`
  - `display_type`: search for cards/models with specific display types
  - `non_temporal_dim_ids`: search for cards/metrics/datasets with this exact set of non temporal dimension field IDs (requires appdb engine)
  - `has_temporal_dim`: set to true for cards/metrics/datasets with 1 or more temporal dimensions (requires appdb engine)

  Note that not all item types support all filters, and the results will include only models that support the provided
  filters. For example:

  - The `created-by` filter supports dashboards, models, actions, and cards.
  - The `verified` filter supports models and cards.

  A search query that has both filters applied will only return models and cards."
  [_route-params
   query-params :- search-request-schema]
  (api/check-valid-page-params (request/limit) (request/offset))
  ;; tuning/diagnostic knobs are admin-only: explain re-executes the vector scan and counts the whole index
  ;; table per request, and the scan-budget knobs let a request inflate its own cost
  (when (or (:vector_search_ef_search query-params)
            (:vector_search_max_scan_tuples query-params)
            (some? (:vector_search_explain query-params)))
    (api/check-superuser))
  (try
    (u/prog1 (search/search (params->search-context query-params))
      (analytics/inc! :metabase-search/response-ok)
      (analytics/observe! :metabase-search/response-results (:total <>)))
    (catch Exception e
      (let [status-code (:status-code (ex-data e))]
        (when (or (not status-code) (= 5 (quot status-code 100)))
          (analytics/inc! :metabase-search/response-error)))
      (throw e))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/debug"
  "Superuser-only. Explain why `expected_result_id` / `expected_result_type` does not appear in the results of
  the given search query. Accepts every `GET /api/search` parameter plus the two expected-result parameters, and
  returns `{:type ..., :details ...}` for the first stage that drops the item: `not-searchable`,
  `missing-from-index`, `not-permitted`, `filtered`, `not-matching`, or the terminal `matched` / `ranked-out`.

  - `for_user_id`: diagnose from another user's perspective (defaults to you). Permission and visibility checks run
    as that user, so a `not-permitted` result means *they* can't see the item.

  Not supported for `indexed-entity` (its id is compound)."
  [_route-params
   {expected-result-type :expected_result_type
    expected-result-id   :expected_result_id
    for-user-id          :for_user_id
    :as                  query-params} :- search-debug-request-schema]
  (api/check-superuser)
  (api/check-valid-page-params (request/limit) (request/offset))
  (when (= "indexed-entity" expected-result-type)
    (throw (ex-info (tru "Search debug is not supported for the indexed-entity model.") {:status-code 400})))
  (letfn [(diagnose [] (search/diagnose (params->search-context query-params)
                                        expected-result-type expected-result-id))]
    (if (and for-user-id (not= for-user-id api/*current-user-id*))
      ;; Build the context and run every permission/visibility check from the target user's perspective.
      (do (api/check-404 (t2/exists? :model/User :id for-user-id))
          (request/with-current-user for-user-id (diagnose)))
      (diagnose))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/search` routes."
  (api.macros/ns-handler *ns* +engine-cookie))
