(ns metabase.api.search
  (:require
   [cheshire.core :as json]
   [compojure.core :refer [GET]]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.search.filter :as search.filter]
   [metabase.search.scoring :as scoring]
   [metabase.search.util :as search.util]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private HoneySQLColumn
  [:or
   :keyword
   [:tuple :any :keyword]])

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Columns for each Entity                                             |
;;; +----------------------------------------------------------------------------------------------------------------+



;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Shared Query Logic                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private ->column-alias :- keyword?
  "Returns the column name. If the column is aliased, i.e. [`:original_name` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased :- HoneySQLColumn]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(mu/defn ^:private canonical-columns :- [:sequential HoneySQLColumn]
  "Returns a seq of canonicalized list of columns for the search query with the given `model` Will return column names
  prefixed with the `model` name so that it can be used in criteria. Projects a `nil` for columns the `model` doesn't
  have and doesn't modify aliases."
  [model :- SearchableModel, col-alias->honeysql-clause :- [:map-of :keyword HoneySQLColumn]]
  (for [[search-col col-type] search.config/all-search-columns
        :let                  [maybe-aliased-col (get col-alias->honeysql-clause search-col)]]
    (cond
      (= search-col :model)
      [(h2x/literal model) :model]

      ;; This is an aliased column, no need to include the table alias
      (sequential? maybe-aliased-col)
      maybe-aliased-col

      ;; This is a column reference, need to add the table alias to the column
      maybe-aliased-col
      (search.config/column-with-model-alias model maybe-aliased-col)

      ;; This entity is missing the column, project a null for that column value. For Postgres and H2, cast it to the
      ;; correct type, e.g.
      ;;
      ;;    SELECT cast(NULL AS integer)
      ;;
      ;; For MySQL, this is not needed.
      :else
      [(when-not (= (mdb/db-type) :mysql)
         [:cast nil col-type])
       search-col])))

(mu/defn ^:private select-clause-for-model :- [:sequential HoneySQLColumn]
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `search.config/all-search-columns`."
  [model :- SearchableModel]
  (let [entity-columns                (search.config/columns-for-model model)
        column-alias->honeysql-clause (m/index-by ->column-alias entity-columns)
        cols-or-nils                  (canonical-columns model column-alias->honeysql-clause)]
    cols-or-nils))

(mu/defn ^:private from-clause-for-model :- [:tuple [:tuple :keyword :keyword]]
  [model :- SearchableModel]
  (let [{:keys [db-model alias]} (get search.config/model-to-db-model model)]
    [[(t2/table-name db-model) alias]]))

(mu/defn ^:private base-query-for-model :- [:map {:closed true}
                                            [:select :any]
                                            [:from :any]
                                            [:where :any]
                                            [:join {:optional true} :any]
                                            [:left-join {:optional true} :any]]
  "Create a HoneySQL query map with `:select`, `:from`, and `:where` clauses for `model`, suitable for the `UNION ALL`
  used in search."
  [model :- SearchableModel context :- SearchContext]
  (-> {:select (select-clause-for-model model)
       :from   (from-clause-for-model model)}
      (search.filter/build-filters model context)))

(mu/defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection
  so we can return its `:name`."
  [honeysql-query               :- ms/Map
   collection-id-column         :- keyword?
   {:keys [current-user-perms]} :- SearchContext]
  (let [visible-collections      (collection/permissions-set->visible-collection-ids current-user-perms)
        collection-filter-clause (collection/visible-collection-ids->honeysql-filter-clause
                                  collection-id-column
                                  visible-collections)
        honeysql-query           (-> honeysql-query
                                     (sql.helpers/where collection-filter-clause)
                                     (sql.helpers/where [:= :collection.namespace nil]))]
    ;; add a JOIN against Collection *unless* the source table is already Collection
    (cond-> honeysql-query
      (not= collection-id-column :collection.id)
      (sql.helpers/left-join [:collection :collection]
                             [:= collection-id-column :collection.id]))))

(mu/defn ^:private add-table-db-id-clause
  "Add a WHERE clause to only return tables with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- ms/Map id :- [:maybe ms/PositiveInt]]
  (if (some? id)
    (sql.helpers/where query [:= id :db_id])
    query))

(mu/defn ^:private add-card-db-id-clause
  "Add a WHERE clause to only return cards with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- ms/Map id :- [:maybe ms/PositiveInt]]
  (if (some? id)
    (sql.helpers/where query [:= id :database_id])
    query))

(mu/defn ^:private replace-select :- :map
  "Replace a select from query that has alias is `target-alias` with the `with` column, throw an error if
  can't find the target select.

  This works with the assumption that `query` contains a list of select from [[select-clause-for-model]],
  and some of them are dummy column casted to the correct type.

  This function then will replace the dummy column with alias is `target-alias` with the `with` column."
  [query        :- :map
   target-alias :- :keyword
   with         :- [:or :keyword [:sequential :any]]]
  (let [selects (:select query)
        idx     (first (keep-indexed (fn [index item]
                                       (when (and (coll? item)
                                                  (= (last item) target-alias))
                                         index))
                                     selects))]
    (if (some? idx)
      (assoc query :select (m/replace-nth idx with selects))
      (throw (ex-info "Failed to replace selector" {:status-code  400
                                                    :target-alias target-alias
                                                    :with         with})))))

(mu/defn ^:private with-last-editing-info :- :map
  [query :- :map
   model :- [:enum "card" "dataset" "dashboard" "metric"]]
  (-> query
       (replace-select :last_editor_id [:r.user_id :last_editor_id])
       (replace-select :last_edited_at [:r.timestamp :last_edited_at])
       (sql.helpers/left-join [:revision :r]
                              [:and [:= :r.model_id (search.config/column-with-model-alias model :id)]
                               [:= :r.most_recent true]
                               [:= :r.model (search.config/search-model->revision-model model)]])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Search Queries for each Toucan Model                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private search-query-for-model
  {:arglists '([model search-context])}
  (fn [model _] model))

(mu/defn ^:private shared-card-impl
  [model      :- [:enum "card" "dataset"]
   search-ctx :- SearchContext]
  (-> (base-query-for-model "card" search-ctx)
      (update :where (fn [where] [:and [:= :card.dataset (= "dataset" model)] where]))
      (sql.helpers/left-join [:card_bookmark :bookmark]
                             [:and
                              [:= :bookmark.card_id :card.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :card.collection_id search-ctx)
      (add-card-db-id-clause (:table-db-id search-ctx))
      (with-last-editing-info model)))

(defmethod search-query-for-model "action"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:report_card :model]
                             [:= :model.id :action.model_id])
      (sql.helpers/left-join :query_action
                             [:= :query_action.action_id :action.id])
      (add-collection-join-and-where-clauses :model.collection_id search-ctx)))


(defmethod search-query-for-model "card"
  [_model search-ctx]
  (shared-card-impl "card" search-ctx))

(defmethod search-query-for-model "dataset"
  [_model search-ctx]
  (-> (shared-card-impl "dataset" search-ctx)
      (update :select (fn [columns]
                        (cons [(h2x/literal "dataset") :model] (rest columns))))))

(defmethod search-query-for-model "collection"
  [_model search-ctx]
  (-> (base-query-for-model "collection" search-ctx)
      (sql.helpers/left-join [:collection_bookmark :bookmark]
                             [:and
                              [:= :bookmark.collection_id :collection.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :collection.id search-ctx)))

(defmethod search-query-for-model "database"
  [model search-ctx]
  (base-query-for-model model search-ctx))

(defmethod search-query-for-model "dashboard"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:dashboard_bookmark :bookmark]
                             [:and
                              [:= :bookmark.dashboard_id :dashboard.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :dashboard.collection_id search-ctx)
      (with-last-editing-info model)))

(defmethod search-query-for-model "metric"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:metabase_table :table] [:= :metric.table_id :table.id])
      (with-last-editing-info model)))

(defmethod search-query-for-model "indexed-entity"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:model_index :model-index]
                             [:= :model-index.id :model-index-value.model_index_id])
      (sql.helpers/left-join [:report_card :model] [:= :model-index.model_id :model.id])
      (sql.helpers/left-join [:collection :collection] [:= :model.collection_id :collection.id])))

(defmethod search-query-for-model "segment"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:metabase_table :table] [:= :segment.table_id :table.id])))

(defmethod search-query-for-model "table"
  [model {:keys [current-user-perms table-db-id], :as search-ctx}]
  (when (seq current-user-perms)
    (let [base-query (base-query-for-model model search-ctx)]
      (add-table-db-id-clause
       (if (contains? current-user-perms "/")
         base-query
         (let [data-perms (filter #(re-find #"^/db/*" %) current-user-perms)]
           {:select (:select base-query)
            :from   [[(merge
                       base-query
                       {:select [:id :schema :db_id :name :description :display_name :created_at :updated_at :initial_sync_status
                                 [(h2x/concat (h2x/literal "/db/")
                                              :db_id
                                              (h2x/literal "/schema/")
                                              [:case
                                               [:not= :schema nil] :schema
                                               :else               (h2x/literal "")]
                                              (h2x/literal "/table/") :id
                                              (h2x/literal "/read/"))
                                  :path]]})
                      :table]]
            :where  (if (seq data-perms)
                      (into [:or] (for [path data-perms]
                                    [:like :path (str path "%")]))
                      [:inline [:= 0 1]])}))
       table-db-id))))

(defn order-clause
  "CASE expression that lets the results be ordered by whether they're an exact (non-fuzzy) match or not"
  [query]
  (let [match             (search.util/wildcard-match (search.util/normalize query))
        columns-to-search (->> search.config/all-search-columns
                               (filter (fn [[_k v]] (= v :text)))
                               (map first)
                               (remove #{:collection_authority_level :moderated_status
                                         :initial_sync_status :pk_ref}))
        case-clauses      (as-> columns-to-search <>
                            (map (fn [col] [:like [:lower col] match]) <>)
                            (interleave <> (repeat [:inline 0]))
                            (concat <> [:else [:inline 1]]))]
    [(into [:case] case-clauses)]))

(defmulti ^:private check-permissions-for-model
  {:arglists '([search-result])}
  (comp keyword :model))

(defmethod check-permissions-for-model :default
  [_]
  ;; We filter what we can (ie. everything that is in a collection) out already when querying
  true)

(defmethod check-permissions-for-model :metric
  [instance]
  (mi/can-read? instance))

(defmethod check-permissions-for-model :segment
  [instance]
  (mi/can-read? instance))

(defmethod check-permissions-for-model :database
  [instance]
  (mi/can-read? instance))

(mu/defn query-model-set :- [:set SearchableModel]
  "Queries all models with respect to query for one result to see if we get a result or not"
  [search-ctx :- SearchContext]
  (let [model-queries (for [model (search.filter/search-context->applicable-models
                                   (assoc search-ctx :models search.config/all-models))]
                        {:nest (sql.helpers/limit (search-query-for-model model search-ctx) 1)})
        query         (when (pos-int? (count model-queries))
                        {:select [:*]
                         :from   [[{:union-all model-queries} :dummy_alias]]})]
    (set (some->> query
                  mdb.query/query
                  (map :model)
                  set))))

(mu/defn ^:private full-search-query
  "Postgres 9 is not happy with the type munging it needs to do to make the union-all degenerate down to trivial case of
  one model without errors. Therefore we degenerate it down for it"
  [search-ctx :- SearchContext]
  (let [models       (:models search-ctx)
        order-clause [((fnil order-clause "") (:search-string search-ctx))]]
    (cond
     (= (count models) 0)
     {:select [nil]}

     (= (count models) 1)
     (search-query-for-model (first models) search-ctx)

     :else
     {:select   [:*]
      :from     [[{:union-all (vec (for [model models
                                         :let  [query (search-query-for-model model search-ctx)]
                                         :when (seq query)]
                                     query))} :alias_is_required_by_sql_but_not_needed_here]]
      :order-by order-clause})))

(defn- hydrate-user-metadata
  "Hydrate common-name for last_edited_by and created_by from result."
  [results]
  (let [user-ids             (set (flatten (for [result results]
                                             (remove nil? ((juxt :last_editor_id :creator_id) result)))))
        user-id->common-name (if (pos? (count user-ids))
                               (t2/select-pk->fn :common_name [:model/User :id :first_name :last_name :email] :id [:in user-ids])
                               {})]
    (mapv (fn [{:keys [creator_id last_editor_id] :as result}]
            (assoc result
                   :creator_common_name (get user-id->common-name creator_id)
                   :last_editor_common_name (get user-id->common-name last_editor_id)))
          results)))

(mu/defn ^:private search
  "Builds a search query that includes all the searchable entities and runs it"
  [search-ctx :- SearchContext]
  (let [search-query       (full-search-query search-ctx)
        _                  (log/tracef "Searching with query:\n%s\n%s"
                                       (u/pprint-to-str search-query)
                                       (mdb.query/format-sql (first (mdb.query/compile search-query))))
        to-toucan-instance (fn [row]
                             (let [model (-> row :model search.config/model-to-db-model :db-model)]
                               (t2.instance/instance model row)))
        reducible-results  (mdb.query/reducible-query search-query :max-rows search.config/*db-max-results*)
        xf                 (comp
                            (map t2.realize/realize)
                            (map to-toucan-instance)
                            (filter check-permissions-for-model)
                            ;; MySQL returns `:bookmark` and `:archived` as `1` or `0` so convert those to boolean as
                            ;; needed
                            (map #(update % :bookmark api/bit->boolean))
                            (map #(update % :archived api/bit->boolean))
                            (map #(update % :pk_ref json/parse-string))
                            (map (partial scoring/score-and-result (:search-string search-ctx)))
                            (filter #(pos? (:score %))))
        total-results      (hydrate-user-metadata (scoring/top-results reducible-results search.config/max-filtered-results xf))]
    ;; We get to do this slicing and dicing with the result data because
    ;; the pagination of search is for UI improvement, not for performance.
    ;; We intend for the cardinality of the search results to be below the default max before this slicing occurs
    {:total            (count total-results)
     :data             (cond->> total-results
                         (some? (:offset-int search-ctx)) (drop (:offset-int search-ctx))
                         (some? (:limit-int search-ctx)) (take (:limit-int search-ctx)))
     :available_models (query-model-set search-ctx)
     :limit            (:limit-int search-ctx)
     :offset           (:offset-int search-ctx)
     :table_db_id      (:table-db-id search-ctx)
     :models           (:models search-ctx)}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Endpoint                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private search-context
  [{:keys [archived
           created-at
           created-by
           last-edited-at
           last-edited-by
           limit
           models
           offset
           search-string
           table-db-id
           verified]}      :- [:map {:closed true}
                               [:search-string                    [:maybe ms/NonBlankString]]
                               [:models                           [:maybe [:set SearchableModel]]]
                               [:archived        {:optional true} [:maybe :boolean]]
                               [:created-at      {:optional true} [:maybe ms/NonBlankString]]
                               [:created-by      {:optional true} [:maybe [:set ms/PositiveInt]]]
                               [:last-edited-at  {:optional true} [:maybe ms/NonBlankString]]
                               [:last-edited-by  {:optional true} [:maybe [:set ms/PositiveInt]]]
                               [:limit           {:optional true} [:maybe ms/Int]]
                               [:offset          {:optional true} [:maybe ms/Int]]
                               [:table-db-id     {:optional true} [:maybe ms/PositiveInt]]
                               [:verified        {:optional true} [:maybe true?]]]]
  (when (some? verified)
    (premium-features/assert-has-any-features
     [:content-verification :official-collections]
     (deferred-tru "Content Management or Official Collections")))
  (let [models (if (string? models) [models] models)
        ctx    (cond-> {:search-string      search-string
                        :current-user-perms @api/*current-user-permissions-set*
                        :archived?          (boolean archived)
                        :models             models}
                 (some? created-at)     (assoc :created-at created-at)
                 (seq created-by)       (assoc :created-by created-by)
                 (some? last-edited-at) (assoc :last-edited-at last-edited-at)
                 (seq last-edited-by)   (assoc :last-edited-by last-edited-by)
                 (some? table-db-id)    (assoc :table-db-id table-db-id)
                 (some? limit)          (assoc :limit-int limit)
                 (some? offset)         (assoc :offset-int offset)
                 (some? verified)       (assoc :verified verified))]
    (assoc ctx :models (search.filter/search-context->applicable-models ctx))))

(api/defendpoint GET "/models"
  "Get the set of models that a search query will return"
  [q archived table-db-id created_at created_by last_edited_at last_edited_by verified]
  {archived       [:maybe ms/BooleanValue]
   table-db-id    [:maybe ms/PositiveInt]
   created_at     [:maybe ms/NonBlankString]
   created_by     [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   last_edited_at [:maybe ms/PositiveInt]
   last_edited_by [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   verified       [:maybe true?]}
  (query-model-set (search-context {:search-string  q
                                    :archived       archived
                                    :table-db-id    table-db-id
                                    :created-at     created_at
                                    :created-by     (set (u/one-or-many created_by))
                                    :last-edited-at last_edited_at
                                    :last-edited-by (set (u/one-or-many last_edited_by))
                                    :verified       verified
                                    :models         search.config/all-models})))

(api/defendpoint GET "/"
  "Search within a bunch of models for the substring `q`.
  For the list of models, check [[metabase.search.config/all-models]].

  To search in archived portions of models, pass in `archived=true`.
  To search for tables, cards, and models of a certain DB, pass in a DB id value
  to `table_db_id`.
  To specify a list of models, pass in an array to `models`.
  "
  [q archived created_at created_by table_db_id models last_edited_at last_edited_by verified]
  {q              [:maybe ms/NonBlankString]
   archived       [:maybe :boolean]
   table_db_id    [:maybe ms/PositiveInt]
   models         [:maybe [:or SearchableModel [:sequential SearchableModel]]]
   created_at     [:maybe ms/NonBlankString]
   created_by     [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   last_edited_at [:maybe ms/NonBlankString]
   last_edited_by [:maybe [:or ms/PositiveInt [:sequential ms/PositiveInt]]]
   verified       [:maybe true?]}
  (api/check-valid-page-params mw.offset-paging/*limit* mw.offset-paging/*offset*)
  (let [start-time (System/currentTimeMillis)
        models-set (cond
                    (nil? models)    search.config/all-models
                    (string? models) #{models}
                    :else            (set models))
        results    (search (search-context
                            {:search-string  q
                             :archived       archived
                             :created-at     created_at
                             :created-by     (set (u/one-or-many created_by))
                             :last-edited-at last_edited_at
                             :last-edited-by (set (u/one-or-many last_edited_by))
                             :table-db-id    table_db_id
                             :models         models-set
                             :limit          mw.offset-paging/*limit*
                             :offset         mw.offset-paging/*offset*
                             :verified       verified}))
        duration   (- (System/currentTimeMillis) start-time)]
    ;; Only track global searches
    (when (and (nil? models)
               (nil? table_db_id)
               (not archived))
      (snowplow/track-event! ::snowplow/new-search-query api/*current-user-id* {:runtime-milliseconds duration}))
    results))

(api/define-routes)
