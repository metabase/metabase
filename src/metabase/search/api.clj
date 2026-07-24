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
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as ingestion]
   [metabase.search.settings :as search.settings]
   [metabase.search.task.search-index :as task.search-index]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

;; Renamed from metabase.SEARCH_ENGINE so long-lived cookies written before engine validation existed stay inert.
(def ^:private engine-cookie-name "metabase.SEARCH_ENGINE_OVERRIDE")

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

(defn- clear-engine-cookie! [respond]
  (fn [response]
    (respond
     (response/set-cookie response
                          engine-cookie-name
                          ""
                          {:http-only true
                           :path      "/"
                           :max-age   0}))))

(defn- param->engine
  "Parse a search_engine param or cookie value into an engine keyword, nil when blank.
  Malformed non-blank values parse to an unknown engine rather than nil, so explicit requests 400."
  [value]
  (when-not (str/blank? value)
    (search.engine/canonical-engine value)))

(defn- check-engine-serves!
  "400 when an explicitly requested engine cannot serve searches, naming the cause."
  [engine]
  (case (search.engine/engine-status engine)
    :unknown
    (throw (ex-info (tru "Unknown search engine: {0}" (name engine)) {:status-code 400}))
    :unsupported
    (throw (ex-info (tru "Search engine {0} is not supported on this instance" (name engine)) {:status-code 400}))
    :inactive
    (throw (ex-info (tru "Search engine {0} is not enabled; add it to additional-search-engines to use it"
                         (name engine))
                    {:status-code 400}))
    :ok nil))

(defn- cookie-engine
  "The engine cookie's engine name when it can still serve, else nil.
  Cookies outlive configuration, so a stale value degrades to the default instead of erroring."
  [request]
  (when-let [engine (param->engine (get-in request [:cookies engine-cookie-name :value]))]
    (when (= :ok (search.engine/engine-status engine))
      (name engine))))

(defn- +engine-cookie [handler]
  (open-api/handler-with-open-api-spec
   (fn [request respond raise]
     ;; Endpoints read :query-params (string keys), so that is where the engine must be injected.
     (let [raw (get-in request [:query-params "search_engine"])]
       (cond
         ;; A repeated query param parses as a vector: pass it through for schema validation to reject.
         (and raw (not (string? raw)))
         (handler request respond raise)

         ;; An explicit blank unpins: delete the engine cookie and resolve the default.
         (and raw (str/blank? raw))
         (handler (assoc-in request [:query-params "search_engine"] nil)
                  (clear-engine-cookie! respond)
                  raise)

         :else
         (if-let [engine (param->engine raw)]
           (try
             (check-engine-serves! engine)
             (handler (assoc-in request [:query-params "search_engine"] (name engine))
                      (set-engine-cookie! respond (name engine))
                      raise)
             (catch Exception e
               (raise e)))
           (let [cookie (cookie-engine request)]
             (handler (cond-> request
                        cookie (assoc-in [:query-params "search_engine"] cookie))
                      respond
                      raise))))))
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
  (search.config/weights {:context context}))

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
  (let [overrides (-> overrides (dissoc :search_engine :context) (update-vals parse-double))]
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
  - `display_type`: search for cards/models with specific display types

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
    search-native-query                 :search_native_query
    table-db-id                         :table_db_id
    include-metadata                    :include_metadata}
   :- [:map
       [:q                                   {:optional true} [:maybe :string]]
       [:context                             {:optional true} [:maybe :keyword]]
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
       [:search_native_query                 {:optional true} [:maybe :boolean]]
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
                :search-native-query                 search-native-query
                :search-string                       (some-> q str/trim not-empty)
                :table-db-id                         table-db-id
                :verified                            verified
                :ids                                 (set ids)
                :calculate-available-models?         calculate-available-models
                :include-dashboard-questions?        include-dashboard-questions
                :include-metadata?                   include-metadata
                :display-type                        (set display-type)}))
      (analytics/inc! :metabase-search/response-ok))
    (catch Exception e
      (let [status-code (:status-code (ex-data e))]
        (when (or (not status-code) (= 5 (quot status-code 100)))
          (analytics/inc! :metabase-search/response-error)))
      (throw e))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/search` routes."
  (api.macros/ns-handler *ns* +engine-cookie))
