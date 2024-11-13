(ns metabase.api.search
  ;; Allowing search.config to be accessed for developer API to set weights
  #_{:clj-kondo/ignore [:metabase/ns-module-checker]}
  (:require
   [clojure.string :as str]
   [compojure.core :refer [GET]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.public-settings :as public-settings]
   [metabase.search :as search]
   [metabase.search.config :as search.config]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
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

(api/defendpoint POST "/force-reindex"
  "If fulltext search is enabled, this will trigger a synchronous reindexing operation."
  []
  (api/check-superuser)
  (cond
    (not (public-settings/experimental-fulltext-search-enabled))
    (throw (ex-info "Search index is not enabled." {:status-code 501}))

    (search/supports-index?)
    (if (task/job-exists? task.search-index/job-key)
      (do (task/trigger-now! task.search-index/job-key) {:message "task triggered"})
      (do (search/reindex!) {:message "done"}))

    :else
    (throw (ex-info "Search index is not supported for this installation." {:status-code 501}))))

(defn- set-weights! [overrides]
  (api/check-superuser)
  (let [allowed-key? (set (keys @#'search.config/default-weights))
        unknown-weights (seq (remove allowed-key? (keys overrides)))]
    (when unknown-weights
      (throw (ex-info (str "Unknown weights: " (str/join ", " (map name (sort unknown-weights))))
                      {:status-code 400})))
    (public-settings/experimental-search-weight-overrides!
     (merge (public-settings/experimental-search-weight-overrides) overrides))
    (search.config/weights)))

(api/defendpoint GET "/weights"
  "Return the current weights being used to rank the search results"
  [:as {overrides :params}]
  ;; remove cookie
  (let [overrides (-> overrides (dissoc :search_engine) (update-vals parse-double))]
    (if (seq overrides)
      (set-weights! overrides)
      (search.config/weights))))

(api/defendpoint PUT "/weights"
  "Return the current weights being used to rank the search results"
  [:as {overrides :body}]
  (set-weights! overrides))

(api/defendpoint GET "/"
  "Search for items in Metabase.
  For the list of supported models, check [[metabase.search/all-models]].

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
  [q archived created_at created_by table_db_id models last_edited_at last_edited_by
   filter_items_in_personal_collection model_ancestors search_engine search_native_query
   verified ids calculate_available_models]
  {q                                   [:maybe ms/NonBlankString]
   archived                            [:maybe :boolean]
   table_db_id                         [:maybe ms/PositiveInt]
   models                              [:maybe (ms/QueryVectorOf search/SearchableModel)]
   filter_items_in_personal_collection [:maybe [:enum "only" "exclude"]]
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
  (api/check-valid-page-params mw.offset-paging/*limit* mw.offset-paging/*offset*)
  (let  [models-set (if (seq models)
                      (set models)
                      search/all-models)]
    (search/search
     (search/search-context
      {:archived                            archived
       :created-at                          created_at
       :created-by                          (set created_by)
       :current-user-id                     api/*current-user-id*
       :is-superuser?                       api/*is-superuser?*
       :current-user-perms                  @api/*current-user-permissions-set*
       :filter-items-in-personal-collection filter_items_in_personal_collection
       :last-edited-at                      last_edited_at
       :last-edited-by                      (set last_edited_by)
       :limit                               mw.offset-paging/*limit*
       :model-ancestors?                    model_ancestors
       :models                              models-set
       :offset                              mw.offset-paging/*offset*
       :search-engine                       search_engine
       :search-native-query                 search_native_query
       :search-string                       q
       :table-db-id                         table_db_id
       :verified                            verified
       :ids                                 (set ids)
       :calculate-available-models?         calculate_available_models}))))

(api/define-routes +engine-cookie)
