(ns metabase.api.search
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.search :as search]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;; TODO maybe deprecate this and make it as a parameter in `GET /api/search/models`
;; so we don't have to keep the arguments between 2 API in sync
(api/defendpoint GET "/models"
  "Get the set of models that a search query will return"
  [q archived table-db-id created_at created_by last_edited_at last_edited_by
   filter_items_in_personal_collection search_native_query verified]
  {archived            [:maybe ms/BooleanValue]
   table-db-id         [:maybe ms/PositiveInt]
   created_at          [:maybe ms/NonBlankString]
   created_by          [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   last_edited_at      [:maybe ms/PositiveInt]
   last_edited_by      [:maybe (ms/QueryVectorOf ms/PositiveInt)]
   search_native_query [:maybe true?]
   verified            [:maybe true?]}
  (search/query-model-set
   (search/search-context {:archived                            archived
                           :created-at                          created_at
                           :created-by                          (set (u/one-or-many created_by))
                           :current-user-id                     api/*current-user-id*
                           :current-user-perms                  @api/*current-user-permissions-set*
                           :filter-items-in-personal-collection filter_items_in_personal_collection
                           :last-edited-at                      last_edited_at
                           :last-edited-by                      (set (u/one-or-many last_edited_by))
                           :models                              search/all-models
                           :search-native-query                 search_native_query
                           :search-string                       q
                           :table-db-id                         table-db-id
                           :verified                            verified})))

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
   filter_items_in_personal_collection model_ancestors search_native_query verified ids]
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
   search_native_query                 [:maybe true?]
   verified                            [:maybe true?]
   ids                                 [:maybe (ms/QueryVectorOf ms/PositiveInt)]}
  (api/check-valid-page-params mw.offset-paging/*limit* mw.offset-paging/*offset*)
  (let  [models-set           (if (seq models)
                                (set models)
                                search/all-models)]
    (search/search
      (search/search-context
        {:archived                            archived
         :created-at                          created_at
         :created-by                          (set created_by)
         :current-user-id                     api/*current-user-id*
         :current-user-perms                  @api/*current-user-permissions-set*
         :filter-items-in-personal-collection filter_items_in_personal_collection
         :last-edited-at                      last_edited_at
         :last-edited-by                      (set last_edited_by)
         :limit                               mw.offset-paging/*limit*
         :model-ancestors?                    model_ancestors
         :models                              models-set
         :offset                              mw.offset-paging/*offset*
         :search-native-query                 search_native_query
         :search-string                       q
         :table-db-id                         table_db_id
         :verified                            verified
         :ids                                 (set ids)}))))


(api/define-routes)
