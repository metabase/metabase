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
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]))

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

(defn- process-partition-config
  "Parse the `partition_config` JSON query param into the partition map consumed by the semantic engine
  (see [[metabase.search.config/PartitionConfig]]). Returns nil when absent/blank or unparseable.
  Keywordizes the per-partition `:strategy` and the top-level `:fusion` selector and normalizes
  `max_cosine_distance` -> `:max-cosine-distance`, dropping any other keys so the closed schema accepts it.

  Shape: `{\"partitions\": [{\"name\": .., \"models\": [..], \"strategy\": \"hnsw\"|\"brute-force\",
  \"k\": .., \"max_cosine_distance\": ..}], \"fusion\": \"v1\"}`."
  [partition-config]
  (when-not (str/blank? partition-config)
    (try
      (let [{:keys [partitions fusion]} (json/decode+kw partition-config)]
        (cond-> {:partitions
                 (mapv (fn [p]
                         (let [mcd (or (:max-cosine-distance p) (:max_cosine_distance p))]
                           (cond-> {:models (:models p)}
                             (:name p)     (assoc :name (:name p))
                             (:strategy p) (assoc :strategy (keyword (:strategy p)))
                             (:k p)        (assoc :k (:k p))
                             (some? mcd)   (assoc :max-cosine-distance mcd))))
                       partitions)}
          fusion (assoc :fusion (keyword fusion))))
      (catch Exception e
        (log/warn "Failed to parse partition_config:" (ex-message e))
        nil))))

(defn- process-multi-view-config
  "Parse the `multi_view_config` JSON query param into the view map consumed by the semantic engine
  (see [[metabase.search.config/MultiViewConfig]]). Returns nil when absent/blank or unparseable.
  Keywordizes the top-level `:pool` selector and normalizes `max_cosine_distance` -> `:max-cosine-distance`
  (both top-level and per-view), dropping any other keys so the closed schema accepts it.

  Shape: `{\"views\": [{\"name\": .., \"column\": \"embedding\"|\"embedding_<view>\", \"k\": ..,
  \"max_cosine_distance\": ..}], \"max_cosine_distance\": .., \"pool\": \"least\"}`."
  [multi-view-config]
  (when-not (str/blank? multi-view-config)
    (try
      (let [{:keys [views pool] :as cfg} (json/decode+kw multi-view-config)
            top-mcd (or (:max-cosine-distance cfg) (:max_cosine_distance cfg))]
        (cond-> {:views
                 (mapv (fn [v]
                         (let [mcd (or (:max-cosine-distance v) (:max_cosine_distance v))]
                           (cond-> {:column (:column v)}
                             (:name v)   (assoc :name (:name v))
                             (:k v)      (assoc :k (:k v))
                             (some? mcd) (assoc :max-cosine-distance mcd))))
                       views)}
          (some? top-mcd) (assoc :max-cosine-distance top-mcd)
          pool            (assoc :pool (keyword pool))))
      (catch Exception e
        (log/warn "Failed to parse multi_view_config:" (ex-message e))
        nil))))

(defn- process-federated-multi-view-config
  "Parse the `federated_multi_view_config` JSON query param into the composed config consumed by the semantic
  engine (see [[metabase.search.config/FederatedMultiViewConfig]]). Returns nil when absent/blank or
  unparseable. Keywordizes the per-partition `:strategy` and the top-level `:pool`/`:fusion` selectors and
  normalizes `max_cosine_distance` -> `:max-cosine-distance` at the top, per-partition, and per-view levels,
  dropping any other keys so the closed schema accepts it.

  Shape: `{\"partitions\": [{\"name\": .., \"models\": [..], \"strategy\": \"hnsw\"|\"brute-force\", \"k\": ..,
  \"max_cosine_distance\": .., \"views\": [{\"name\": .., \"column\": \"embedding\"|\"embedding_<view>\",
  \"k\": .., \"max_cosine_distance\": ..}]}], \"max_cosine_distance\": .., \"pool\": \"least\",
  \"fusion\": \"v1\"}`."
  [federated-multi-view-config]
  (when-not (str/blank? federated-multi-view-config)
    (try
      (let [{:keys [partitions pool fusion] :as cfg} (json/decode+kw federated-multi-view-config)
            top-mcd (or (:max-cosine-distance cfg) (:max_cosine_distance cfg))]
        (cond-> {:partitions
                 (mapv (fn [p]
                         (let [p-mcd (or (:max-cosine-distance p) (:max_cosine_distance p))]
                           (cond-> {:models (:models p)
                                    :views  (mapv (fn [v]
                                                    (let [v-mcd (or (:max-cosine-distance v) (:max_cosine_distance v))]
                                                      (cond-> {:column (:column v)}
                                                        (:name v)    (assoc :name (:name v))
                                                        (:k v)       (assoc :k (:k v))
                                                        (some? v-mcd) (assoc :max-cosine-distance v-mcd))))
                                                  (:views p))}
                             (:name p)     (assoc :name (:name p))
                             (:strategy p) (assoc :strategy (keyword (:strategy p)))
                             (:k p)        (assoc :k (:k p))
                             (some? p-mcd) (assoc :max-cosine-distance p-mcd))))
                       partitions)}
          (some? top-mcd) (assoc :max-cosine-distance top-mcd)
          pool            (assoc :pool (keyword pool))
          fusion          (assoc :fusion (keyword fusion))))
      (catch Exception e
        (log/warn "Failed to parse federated_multi_view_config:" (ex-message e))
        nil))))

(defn- process-weights
  "Parse the `weights` JSON query param into the per-request scorer-weight overrides consumed by the
  scoring layer (the `:weights` key on the search context; see [[metabase.search.config/weights]]).
  Returns nil when absent/blank or unparseable. Keys are keywordized scorer names and values coerced to
  doubles; this map is the highest-precedence weight layer, overriding both static defaults and the
  `experimental-search-weight-overrides` setting for this request only -- nothing global is mutated.
  Unknown scorer keys are inert (they match no registered scorer column), so no key validation happens
  here; callers that want a typo to fail validate the key set themselves (e.g. the eval runner's --weights).

  Shape: `{\"rrf\": 1, \"exact\": 0, \"semantic-distance\": 10, ...}`."
  [weights]
  (when-not (str/blank? weights)
    (try
      (update-vals (json/decode+kw weights) double)
      (catch Exception e
        (log/warn "Failed to parse weights:" (ex-message e))
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
  - `vector_search_strategy`: for the semantic engine, `hnsw` (approximate index search, default) or `brute-force` (exact filter-first search); ignored by other engines
  - `max_cosine_distance`: for the semantic engine, the cosine-distance cut-off above which vector candidates are discarded (default 0.7); ignored by other engines
  - `partition_config`: for the semantic engine, a JSON object enabling federated/partitioned retrieval (per-partition model set, candidate quota `k`, cosine cutoff, and vector strategy); omit for a single global KNN. Ignored by other engines
  - `multi_view_config`: for the semantic engine, a JSON object enabling multi-view-embedding retrieval (per-view embedding column + candidate quota `k`, pooled by min cosine distance, with a single cosine cutoff); omit for a single global KNN. Ignored by other engines
  - `federated_multi_view_config`: for the semantic engine, a JSON object composing federated/partitioned retrieval with multi-view embeddings (per-partition model set + quota + cosine cutoff + strategy, each partition pooling its own per-view embedding columns by min cosine distance); omit for a single global KNN. Ignored by other engines
  - `weights`: a JSON object of per-request scorer-weight overrides (e.g. `{\"rrf\": 1, \"exact\": 0}`); the highest-precedence weight layer, overriding static defaults and the `experimental-search-weight-overrides` setting for this request only. Unknown scorer keys are inert
  - `disable_fallback`: for the semantic engine, set to true to disable the appdb fallback entirely -- the engine returns its own results unsupplemented even when below the min-results threshold, and re-throws (rather than silently falling back) if the vector query errors. Ignored by other engines
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
   {:keys                               [q context archived models verified ids]
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
    max-cosine-distance                 :max_cosine_distance
    partition-config                    :partition_config
    multi-view-config                   :multi_view_config
    federated-multi-view-config         :federated_multi_view_config
    weights                             :weights
    disable-fallback                    :disable_fallback
    search-native-query                 :search_native_query
    table-db-id                         :table_db_id
    include-metadata                    :include_metadata
    non-temporal-dim-ids                :non_temporal_dim_ids
    has-temporal-dim                    :has_temporal_dim}
   :- [:map
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
       [:max_cosine_distance                 {:optional true} [:maybe [:double {:min 0.0 :max 2.0}]]]
       [:partition_config                    {:optional true} [:maybe :string]]
       [:multi_view_config                   {:optional true} [:maybe :string]]
       [:federated_multi_view_config         {:optional true} [:maybe :string]]
       [:weights                             {:optional true} [:maybe :string]]
       [:disable_fallback                    {:optional true} [:maybe :boolean]]
       [:search_native_query                 {:optional true} [:maybe :boolean]]
       [:verified                            {:optional true} [:maybe true?]]
       [:ids                                 {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
       [:calculate_available_models          {:optional true} [:maybe true?]]
       [:include_dashboard_questions         {:default false} [:maybe :boolean]]
       [:include_metadata                    {:default false} [:maybe :boolean]]
       [:non_temporal_dim_ids                {:optional true} [:maybe ms/NonBlankString]]
       [:has_temporal_dim                    {:optional true} [:maybe :boolean]]]]
  (api/check-valid-page-params (request/limit) (request/offset))
  (try
    (u/prog1 (search/search
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
                :max-cosine-distance                 max-cosine-distance
                :partition-config                    (process-partition-config partition-config)
                :multi-view-config                   (process-multi-view-config multi-view-config)
                :federated-multi-view-config         (process-federated-multi-view-config federated-multi-view-config)
                :weights                             (process-weights weights)
                :disable-fallback?                   disable-fallback
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
      (analytics/inc! :metabase-search/response-ok)
      (analytics/observe! :metabase-search/response-results (:total <>)))
    (catch Exception e
      (let [status-code (:status-code (ex-data e))]
        (when (or (not status-code) (= 5 (quot status-code 100)))
          (analytics/inc! :metabase-search/response-error)))
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/search` routes."
  (api.macros/ns-handler *ns* +engine-cookie))
