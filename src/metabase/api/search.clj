(ns metabase.api.search
  (:require
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.request.core :as request]
   ;; Allowing search.config to be accessed for developer API to set weights
   ^{:clj-kondo/ignore [:metabase/ns-module-checker]}
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.task :as task]
   [metabase.task.search-index :as task.search-index]
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
  (with-meta
   (fn [request respond raise]
     (if-let [new-engine (get-in request [:params :search_engine])]
       (handler request (set-engine-cookie! respond new-engine) raise)
       (handler (->> (get-in request [:cookies engine-cookie-name :value])
                     (assoc-in request [:params :search_engine]))
                respond
                raise)))
   (meta handler)))

(api/defendpoint POST "/re-init"
  "This will blow away any search indexes, re-create, and re-populate them."
  []
  (api/check-superuser)
  (if (search/supports-index?)
    {:message (search/init-index! {:force-reset? true})}
    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(api/defendpoint POST "/force-reindex"
  "This will trigger an immediate reindexing, if we are using search index."
  []
  (api/check-superuser)
  (if  (search/supports-index?)
    ;; The job appears to wait on the main thread when run from tests, so, unfortunately, testing this branch is hard.
    (if (and (task/job-exists? task.search-index/reindex-job-key) (not config/is-test?))
      (do (task/trigger-now! task.search-index/reindex-job-key) {:message "task triggered"})
      (do (task.search-index/reindex!) {:message "done"}))

    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(defn- set-weights! [context overrides]
  (api/check-superuser)
  (when (= context :all)
    (throw (ex-info "Cannot set weights for all context"
                    {:status-code 400})))
  (let [known-ranker?   (set (keys (:default @#'search.config/static-weights)))
        rankers         (into #{} (map (fn [k] (keyword (first (str/split (name k) #"/"))))) (keys overrides))
        unknown-rankers (seq (remove known-ranker? rankers))]
    (when unknown-rankers
      (throw (ex-info (str "Unknown rankers: " (str/join ", " (map name (sort unknown-rankers))))
                      {:status-code 400})))
    (public-settings/experimental-search-weight-overrides!
     (merge-with merge (public-settings/experimental-search-weight-overrides) {context overrides}))))

(api/defendpoint GET "/weights"
  "Return the current weights being used to rank the search results"
  [:as {overrides :params}]
  ;; remove cookie
  (let [context   (keyword (:context overrides :default))
        overrides (-> overrides (dissoc :search_engine :context) (update-vals parse-double))]
    (when (seq overrides)
      (set-weights! context overrides))
    (search.config/weights context)))

(api/defendpoint GET "/"
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
  [q context archived created_at created_by table_db_id models last_edited_at last_edited_by
   filter_items_in_personal_collection model_ancestors search_engine search_native_query
   verified ids calculate_available_models]
  {q                                   [:maybe ms/NonBlankString]
   context                             [:maybe :keyword]
   archived                            [:maybe :boolean]
   table_db_id                         [:maybe ms/PositiveInt]
   models                              [:maybe (ms/QueryVectorOf search/SearchableModel)]
   filter_items_in_personal_collection [:maybe [:enum "all" "only" "only-mine" "exclude" "exclude-others"]]
   created_at                          [:maybe ms/NonBlankString]
   created_by                          [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   last_edited_at                      [:maybe ms/NonBlankString]
   last_edited_by                      [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   model_ancestors                     [:maybe :boolean]
   search_engine                       [:maybe string?]
   search_native_query                 [:maybe true?]
   verified                            [:maybe true?]
   ids                                 [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   calculate_available_models          [:maybe true?]}
  (api/check-valid-page-params (request/limit) (request/offset))
  (search/search
   (search/search-context
    {:archived                            archived
     :context                             context
     :created-at                          created_at
     :created-by                          (set created_by)
     :current-user-id                     api/*current-user-id*
     :is-impersonated-user?               (premium-features/impersonated-user?)
     :is-sandboxed-user?                  (premium-features/sandboxed-user?)
     :is-superuser?                       api/*is-superuser?*
     :current-user-perms                  @api/*current-user-permissions-set*
     :filter-items-in-personal-collection filter_items_in_personal_collection
     :last-edited-at                      last_edited_at
     :last-edited-by                      (set last_edited_by)
     :limit                               (request/limit)
     :model-ancestors?                    model_ancestors
     :models                              (not-empty (set models))
     :offset                              (request/offset)
     :search-engine                       search_engine
     :search-native-query                 search_native_query
     :search-string                       q
     :table-db-id                         table_db_id
     :verified                            verified
     :ids                                 (set ids)
     :calculate-available-models?         calculate_available_models})))

(api/define-routes +engine-cookie)
