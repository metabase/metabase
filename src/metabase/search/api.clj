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
   {:keys                               [q context archived models verified ids]
    calculate-available-models          :calculate_available_models
    created-at                          :created_at
    created-by                          :created_by
    filter-items-in-personal-collection :filter_items_in_personal_collection
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
