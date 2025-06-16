(ns metabase.search.api
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
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

(api.macros/defendpoint :post "/re-init"
  "This will blow away any search indexes, re-create, and re-populate them."
  []
  (api/check-superuser)
  (if (search/supports-index?)
    {:message (search/init-index! {:force-reset? true})}
    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(api.macros/defendpoint :post "/force-reindex"
  "This will trigger an immediate reindexing, if we are using search index."
  []
  (api/check-superuser)
  (if (search/supports-index?)
    ;; The job appears to wait on the main thread when run from tests, so, unfortunately, testing this branch is hard.
    (if (and (task/job-exists? task.search-index/reindex-job-key) (or (not ingestion/*force-sync*) config/is-test?))
      (do (task/trigger-now! task.search-index/reindex-job-key) {:message "task triggered"})
      (do (search/reindex!) {:message "done"}))

    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(mu/defn- set-weights!
  [context   :- :keyword
   overrides :- [:map-of keyword? double?]]
  (api/check-superuser)
  (when (= context :all)
    (throw (ex-info "Cannot set weights for all context"
                    {:status-code 400})))
  (let [known-ranker?   (set (keys (:default @#'search.config/static-weights)))
        rankers         (into #{}
                              (map (fn [k]
                                     (if (namespace k)
                                       (keyword (namespace k))
                                       k)))
                              (keys overrides))
        unknown-rankers (not-empty (remove known-ranker? rankers))]
    (when unknown-rankers
      (throw (ex-info (str "Unknown rankers: " (str/join ", " (map name (sort unknown-rankers))))
                      {:status-code 400})))
    (search.settings/experimental-search-weight-overrides!
     (merge-with merge (search.settings/experimental-search-weight-overrides) {context (update-keys overrides u/qualified-name)}))))

(api.macros/defendpoint :get "/weights"
  "Return the current weights being used to rank the search results"
  [_route-params
   {:keys [context]} :- [:map
                         [:context {:default :default} :keyword]
                         [:search_engine {:optional true} :any]]]
  (search.config/weights context))

(api.macros/defendpoint :put "/weights"
  "Update the current weights being used to rank the search results"
  [_route-params
   {:keys [context], :as overrides} :- [:map
                                        [:context {:default :default} :keyword]
                                        [:search_engine {:optional true} :any]]]
  ;; remove cookie
  (let [overrides (-> overrides (dissoc :search_engine :context) (update-vals parse-double))]
    (when (seq overrides)
      (set-weights! context overrides))
    (search.config/weights context)))

;; Helper functions for visualization compatibility checking

(defn- field-temporal?
  "Check if a field represents a temporal/date dimension."
  [field]
  (let [check-type (fn [type-str]
                     (when type-str
                       (let [type-str (str type-str)]
                         (or (re-find #"Date|Time|Temporal" type-str)
                             (re-find #"type/Date|type/Time|type/Temporal" type-str)))))]
    (boolean
     (or (check-type (:base_type field))
         (check-type (:effective_type field))
         (check-type (:semantic_type field))))))

(defn- field-dimension?
  "Check if a field is a dimension (not a metric/measure)."
  [field]
  (not= (:semantic_type field) "type/Number"))

(defn- extract-dimension-ids
  "Extract temporal and non-temporal dimension IDs from fields."
  [fields]
  (let [dimension-fields (filter field-dimension? fields)
        temporal-dims (filter field-temporal? dimension-fields)
        other-dims (remove field-temporal? dimension-fields)]
    {:temporal (map :id temporal-dims)
     :non-temporal (map :id other-dims)}))

(defn- check-dimension-compatibility
  "Check if target item's dimensions are compatible with current visualization."
  [current-dims target-dims]
  (let [{current-temporal :temporal current-non-temporal :non_temporal} current-dims
        {target-temporal :temporal target-non-temporal :non_temporal} target-dims]
    (and
     ;; Current must have at least one dimension
     (or (seq current-temporal) (seq current-non-temporal))

     ;; Bidirectional temporal compatibility
     (or (empty? current-temporal)
         (seq target-temporal))

     (or (empty? target-temporal)
         (seq current-temporal))

     ;; Non-temporal dimensions must match by ID
     (or (empty? current-non-temporal)
         (every? (set target-non-temporal) current-non-temporal))

     (or (empty? target-non-temporal)
         (every? (set current-non-temporal) target-non-temporal)))))

(defn- item-compatible?
  "Check if a search result item is compatible with the visualization context."
  [item visualization-context]
  (let [{:keys [display dimensions]} visualization-context]
    ;; Early exit for pie charts
    (if (= display "pie")
      false
      ;; Check dimension compatibility for items with metadata
      (if-let [metadata (:result_metadata item)]
        (let [target-dims (extract-dimension-ids metadata)]
          (check-dimension-compatibility dimensions target-dims))
        ;; If no metadata, we can't determine compatibility
        true))))

(api.macros/defendpoint :post "/visualization-compatible"
  "Search for items compatible with current visualization context.
  Test endpoint for visualization-specific search filtering."
  [_route-params
   _query-params
   {:keys                       [q limit models display exclude_display include_dashboard_questions visualization_context include_metadata has_temporal_dimensions required_non_temporal_dimension_ids]}
   :- [:map
       [:q                            {:optional true} [:maybe ms/NonBlankString]]
       [:limit                        {:default 10} ms/PositiveInt]
       [:models                       {:default ["card" "dataset" "metric"]}
        [:vector [:enum "card" "dataset" "metric"]]]
       [:display                      {:optional true} [:maybe [:vector ms/NonBlankString]]]
       [:exclude_display              {:optional true} [:maybe ms/NonBlankString]]
       [:include_dashboard_questions  {:default true} :boolean]
       [:include_metadata             {:default true} :boolean]
       [:has_temporal_dimensions      {:optional true} [:maybe :boolean]]
       [:required_non_temporal_dimension_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]
       [:visualization_context        {:optional true}
        [:map
         [:display string?]
         [:dimensions [:map
                       [:temporal [:sequential ms/PositiveInt]]
                       [:non_temporal [:sequential ms/PositiveInt]]]]]]]]
  ;; Build search context
  (let [search-ctx (search/search-context
                    {:current-user-id              api/*current-user-id*
                     :is-impersonated-user?        (perms/impersonated-user?)
                     :is-sandboxed-user?           (perms/sandboxed-user?)
                     :is-superuser?                api/*is-superuser?*
                     :current-user-perms           @api/*current-user-permissions-set*
                     :limit                        limit
                     :models                       (set models)
                     :offset                       0
                     :search-string                q
                     :display                      (set display)
                     :exclude-display              exclude_display
                     :has-temporal-dimensions?     has_temporal_dimensions
                     :required-non-temporal-dimension-ids required_non_temporal_dimension_ids
                     :include-dashboard-questions? include_dashboard_questions
                     :include-metadata?            include_metadata})]
    (log/info " ~$~$~$~ BUILT SEARCH CONTEXT")

    ;; Run search
    (let [search-results (search/search search-ctx)
          {:keys [data]} search-results]

      (log/info " ~$~$~$~ Search returned" (count data) "results")
      (log/info " ~$~$~$~ :exclude-display " exclude_display)
      (log/info " ~$~$~$~ :required-non-temporal-dimension-ids " required_non_temporal_dimension_ids)

      ;; Apply visualization compatibility filtering if context provided
      (if visualization_context
        (do
          (log/info "Filtering with visualization context:" visualization_context)
          (let [filtered-data (filter #(item-compatible? % visualization_context) data)
                filtered-count (count filtered-data)]
            (log/info "Filtered to" filtered-count "compatible items")
            (assoc search-results :data filtered-data)))
        search-results))))

(api.macros/defendpoint :get "/"
  "Search for items in Metabase.
  For the list of supported models, check [[metabase.search.config/all-models]].

  Filters:
  - `archived`: set to true to search archived items only, default is false
  - `table_db_id`: search for tables, cards, and models of a certain DB
  - `models`: only search for items of specific models. If not provided, search for all models
  - `filters_items_in_personal_collection`: only search for items in personal collections
  - `created_at`: search for items created at a specific timestamp
  - `created_by`: search for items created by a specific user
  - `display`: search for cards/models with specific display types
  - `exclude_display`: exclude cards/models with a specific display type
  - `has_temporal_dimensions`: set to true to search for cards with temporal dimensions only
  - `last_edited_at`: search for items last edited at a specific timestamp
  - `last_edited_by`: search for items last edited by a specific user
  - `search_native_query`: set to true to search the content of native queries
  - `verified`: set to true to search for verified items only (requires Content Management or Official Collections premium feature)
  - `ids`: search for items with those ids, works iff single value passed to `models`

  Note that not all item types support all filters, and the results will include only models that support the provided filters. For example:
  - The `created-by` filter supports dashboards, models, actions, and cards.
  - The `verified` filter supports models and cards.

  A search query that has both filters applied will only return models and cards."
  [_route-params
   {:keys                               [q context archived models verified ids display]
    calculate-available-models          :calculate_available_models
    created-at                          :created_at
    created-by                          :created_by
    exclude-display                     :exclude_display
    filter-items-in-personal-collection :filter_items_in_personal_collection
    has-temporal-dimensions             :has_temporal_dimensions
    include-dashboard-questions         :include_dashboard_questions
    last-edited-at                      :last_edited_at
    last-edited-by                      :last_edited_by
    model-ancestors                     :model_ancestors
    search-engine                       :search_engine
    search-native-query                 :search_native_query
    table-db-id                         :table_db_id
    include-metadata                    :include_metadata}
   :- [:map
       [:q                                   {:optional true} [:maybe ms/NonBlankString]]
       [:context                             {:optional true} [:maybe :keyword]]
       [:archived                            {:default false} [:maybe :boolean]]
       [:table_db_id                         {:optional true} [:maybe ms/PositiveInt]]
       [:models                              {:optional true} [:maybe (ms/QueryVectorOf search/SearchableModel)]]
       [:filter_items_in_personal_collection {:optional true} [:maybe [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]]
       [:created_at                          {:optional true} [:maybe ms/NonBlankString]]
       [:created_by                          {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
       [:display                             {:optional true} [:maybe (ms/QueryVectorOf ms/NonBlankString)]]
       [:exclude_display                     {:optional true} [:maybe ms/NonBlankString]]
       [:has_temporal_dimensions             {:optional true} [:maybe :boolean]]
       [:last_edited_at                      {:optional true} [:maybe ms/NonBlankString]]
       [:last_edited_by                      {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
       [:model_ancestors                     {:default false} [:maybe :boolean]]
       [:search_engine                       {:optional true} [:maybe string?]]
       [:search_native_query                 {:optional true} [:maybe true?]]
       [:verified                            {:optional true} [:maybe true?]]
       [:ids                                 {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
       [:calculate_available_models          {:optional true} [:maybe true?]]
       [:include_dashboard_questions         {:default false} [:maybe :boolean]]
       [:include_metadata                    {:default false} [:maybe :boolean]]]]
  (api/check-valid-page-params (request/limit) (request/offset))
  (try
    (u/prog1 (search/search
              (search/search-context
               {:archived                            archived
                :context                             context
                :created-at                          created-at
                :created-by                          (set created-by)
                :current-user-id                     api/*current-user-id*
                :display                             (set display)
                :exclude-display                     exclude-display
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
                :search-native-query                 search-native-query
                :search-string                       q
                :table-db-id                         table-db-id
                :verified                            verified
                :ids                                 (set ids)
                :calculate-available-models?         calculate-available-models
                :include-dashboard-questions?        include-dashboard-questions
                :include-metadata?                   include-metadata}))
      (analytics/inc! :metabase-search/response-ok))
    (catch Exception e
      (let [status-code (:status-code (ex-data e))]
        (when (or (not status-code) (= 5 (quot status-code 100)))
          (analytics/inc! :metabase-search/response-error)))
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/search` routes."
  (api.macros/ns-handler *ns* +engine-cookie))
