(ns metabase.api.search
  (:require
   [cheshire.core :as json]
   [compojure.core :refer [GET]]
   [flatland.ordered.map :as ordered-map]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search-config]
   [metabase.search.scoring :as scoring]
   [metabase.search.util :as search-util]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(def ^:private SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query"
  {:search-string                (s/maybe su/NonBlankString)
   :archived?                    s/Bool
   :current-user-perms           #{perms/PathSchema}
   (s/optional-key :models)      (s/maybe #{su/NonBlankString})
   (s/optional-key :table-db-id) (s/maybe s/Int)
   (s/optional-key :limit-int)   (s/maybe s/Int)
   (s/optional-key :offset-int)  (s/maybe s/Int)})

(def ^:private SearchableModel
  (apply s/enum search-config/all-models))

(def ^:private HoneySQLColumn
  (s/cond-pre
   s/Keyword
   [(s/one s/Any "column or value")
    (s/one s/Keyword "alias")]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Columns for each Entity                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private all-search-columns
  "All columns that will appear in the search results, and the types of those columns. The generated search query is a
  `UNION ALL` of the queries for each different entity; it looks something like:

    SELECT 'card' AS model, id, cast(NULL AS integer) AS table_id, ...
    FROM report_card
    UNION ALL
    SELECT 'metric' as model, id, table_id, ...
    FROM metric

  Columns that aren't used in any individual query are replaced with `SELECT cast(NULL AS <type>)` statements. (These
  are cast to the appropriate type because Postgres will assume `SELECT NULL` is `TEXT` by default and will refuse to
  `UNION` two columns of two different types.)"
  (ordered-map/ordered-map
   ;; returned for all models. Important to be first for changing model for dataset
   :model               :text
   :id                  :integer
   :name                :text
   :display_name        :text
   :description         :text
   :archived            :boolean
   ;; returned for Card, Dashboard, and Collection
   :collection_id       :integer
   :collection_name     :text
   :collection_authority_level :text
   ;; returned for Card and Dashboard
   :collection_position :integer
   :bookmark            :boolean
   ;; returned for everything except Collection
   :updated_at          :timestamp
   ;; returned for Card only
   :dashboardcard_count :integer
   :moderated_status    :text
   ;; returned for Metric and Segment
   :table_id            :integer
   :table_schema        :text
   :table_name          :text
   :table_description   :text
   ;; returned for Metric, Segment, and Action
   :database_id         :integer
   ;; returned for Database and Table
   :initial_sync_status :text
   ;; returned for Action
   :model_id            :integer
   :model_name          :text
   ;; returned for Card and Action
   :dataset_query       :text
   ;; returned for indexed-entity
   :pk_ref              :text))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Shared Query Logic                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private true-clause [:inline [:= 1 1]])
(def ^:private false-clause [:inline [:= 0 1]])

(s/defn ^:private model->alias :- s/Keyword
  [model :- SearchableModel]
  (-> model search-config/model-to-db-model :alias))

(s/defn ^:private ->column-alias :- s/Keyword
  "Returns the column name. If the column is aliased, i.e. [`:original_name` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased :- HoneySQLColumn]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(s/defn ^:private canonical-columns :- [HoneySQLColumn]
  "Returns a seq of canonicalized list of columns for the search query with the given `model` Will return column names
  prefixed with the `model` name so that it can be used in criteria. Projects a `nil` for columns the `model` doesn't
  have and doesn't modify aliases."
  [model :- SearchableModel, col-alias->honeysql-clause :- {s/Keyword HoneySQLColumn}]
  (for [[search-col col-type] all-search-columns
        :let                  [maybe-aliased-col (get col-alias->honeysql-clause search-col)]]
    (cond
      (= search-col :model)
      [(h2x/literal model) :model]

      ;; This is an aliased column, no need to include the table alias
      (sequential? maybe-aliased-col)
      maybe-aliased-col

      ;; This is a column reference, need to add the table alias to the column
      maybe-aliased-col
      (keyword (name (model->alias model)) (name maybe-aliased-col))

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

(s/defn ^:private select-clause-for-model :- [HoneySQLColumn]
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `all-search-columns`."
  [model :- SearchableModel]
  (let [entity-columns                (search-config/columns-for-model model)
        column-alias->honeysql-clause (m/index-by ->column-alias entity-columns)
        cols-or-nils                  (canonical-columns model column-alias->honeysql-clause)]
    cols-or-nils))

(s/defn ^:private from-clause-for-model :- [(s/one [(s/one s/Keyword "table name") (s/one s/Keyword "alias")]
                                                   "from clause")]
  [model :- SearchableModel]
  (let [{:keys [db-model alias]} (get search-config/model-to-db-model model)]
    [[(t2/table-name db-model) alias]]))

(defmulti ^:private archived-where-clause
  {:arglists '([model archived?])}
  (fn [model _] model))

(defmethod archived-where-clause :default
  [model archived?]
  [:= (keyword (name (model->alias model)) "archived") archived?])

;; Databases can't be archived
(defmethod archived-where-clause "database"
  [_model archived?]
  (if-not archived?
    true-clause
    false-clause))

(defmethod archived-where-clause "indexed-entity"
  [_model archived?]
  (if-not archived?
    true-clause
    false-clause))

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-where-clause "table"
  [model archived?]
  (if archived?
    false-clause                        ; No tables should appear in archive searches
    [:and
     [:= (keyword (name (model->alias model)) "active") true]
     [:= (keyword (name (model->alias model)) "visibility_type") nil]]))

(defn- wildcard-match
  [s]
  (str "%" s "%"))

(defn- search-string-clause
  [query searchable-columns]
  (when query
    (into [:or]
          (for [column searchable-columns
                token (search-util/tokenize (search-util/normalize query))]
            (if (and (= model "indexed-entity") (premium-features/segmented-user?))
              [:= 0 1]

              [:like
               [:lower column]
               (wildcard-match token)])))))

(s/defn ^:private base-where-clause-for-model :- [(s/one (s/enum :and := :inline) "type") s/Any]
  [model :- SearchableModel, {:keys [search-string archived?]} :- SearchContext]
  (let [archived-clause (archived-where-clause model archived?)
        search-clause   (search-string-clause search-string
                                              (map (let [model-alias (name (model->alias model))]
                                                     (fn [column]
                                                       (keyword (str (name model-alias) "." (name column)))))
                                                   (search-config/searchable-columns-for-model model)))]
    (if search-clause
      [:and archived-clause search-clause]
      archived-clause)))

(s/defn ^:private base-query-for-model :- {:select s/Any, :from s/Any, :where s/Any}
  "Create a HoneySQL query map with `:select`, `:from`, and `:where` clauses for `model`, suitable for the `UNION ALL`
  used in search."
  [model :- SearchableModel, context :- SearchContext]
  {:select (select-clause-for-model model)
   :from   (from-clause-for-model model)
   :where  (base-where-clause-for-model model context)})

(s/defn ^:private add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection
  so we can return its `:name`."
  [honeysql-query               :- su/Map
   collection-id-column         :- s/Keyword
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

(s/defn ^:private add-table-db-id-clause
  "Add a WHERE clause to only return tables with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- su/Map, id :- (s/maybe s/Int)]
  (if (some? id)
    (sql.helpers/where query [:= id :db_id])
    query))

(s/defn ^:private add-card-db-id-clause
  "Add a WHERE clause to only return cards with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- su/Map, id :- (s/maybe s/Int)]
  (if (some? id)
    (sql.helpers/where query [:= id :database_id])
    query))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Search Queries for each Toucan Model                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private search-query-for-model
  {:arglists '([model search-context])}
  (fn [model _] model))

(s/defn ^:private shared-card-impl [dataset? :- s/Bool search-ctx :- SearchContext]
  (-> (base-query-for-model "card" search-ctx)
      (update :where (fn [where] [:and [:= :card.dataset dataset?] where]))
      (sql.helpers/left-join [:card_bookmark :bookmark]
                             [:and
                              [:= :bookmark.card_id :card.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :card.collection_id search-ctx)
      (add-card-db-id-clause (:table-db-id search-ctx))))

(s/defmethod search-query-for-model "action"
  [model search-ctx :- SearchContext]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:report_card :model]
                             [:= :model.id :action.model_id])
      (sql.helpers/left-join :query_action
                             [:= :query_action.action_id :action.id])
      (add-collection-join-and-where-clauses :model.collection_id search-ctx)))

(s/defmethod search-query-for-model "card"
  [_model search-ctx :- SearchContext]
  (shared-card-impl false search-ctx))

(s/defmethod search-query-for-model "dataset"
  [_model search-ctx :- SearchContext]
  (-> (shared-card-impl true search-ctx)
      (update :select (fn [columns]
                        (cons [(h2x/literal "dataset") :model] (rest columns))))))

(s/defmethod search-query-for-model "collection"
  [_model search-ctx :- SearchContext]
  (-> (base-query-for-model "collection" search-ctx)
      (sql.helpers/left-join [:collection_bookmark :bookmark]
                             [:and
                              [:= :bookmark.collection_id :collection.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :collection.id search-ctx)))

(s/defmethod search-query-for-model "database"
  [model search-ctx :- SearchContext]
  (base-query-for-model model search-ctx))

(s/defmethod search-query-for-model "dashboard"
  [model search-ctx :- SearchContext]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:dashboard_bookmark :bookmark]
                             [:and
                              [:= :bookmark.dashboard_id :dashboard.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :dashboard.collection_id search-ctx)))

(s/defmethod search-query-for-model "metric"
  [model search-ctx :- SearchContext]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:metabase_table :table] [:= :metric.table_id :table.id])))

(s/defmethod search-query-for-model "indexed-entity"
  [model search-ctx :- SearchContext]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:model_index :model-index]
                             [:= :model-index.id :model-index-value.model_index_id])
      (sql.helpers/left-join [:report_card :model] [:= :model-index.model_id :model.id])
      (sql.helpers/left-join [:collection :collection] [:= :model.collection_id :collection.id])))

(s/defmethod search-query-for-model "segment"
  [model search-ctx :- SearchContext]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:metabase_table :table] [:= :segment.table_id :table.id])))

(s/defmethod search-query-for-model "table"
  [model {:keys [current-user-perms table-db-id], :as search-ctx} :- SearchContext]
  (when (seq current-user-perms)
    (let [base-query (base-query-for-model model search-ctx)]
      (add-table-db-id-clause
       (if (contains? current-user-perms "/")
         base-query
         (let [data-perms (filter #(re-find #"^/db/*" %) current-user-perms)]
           {:select (:select base-query)
            :from   [[(merge
                       base-query
                       {:select [:id :schema :db_id :name :description :display_name :updated_at :initial_sync_status
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
  (let [match             (wildcard-match (search-util/normalize query))
        columns-to-search (->> all-search-columns
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

(defn- query-model-set
  "Queries all models with respect to query for one result to see if we get a result or not"
  [search-ctx]
  (map #(get (first %) :model)
       (filter not-empty
               (for [model search-config/all-models]
                 (let [search-query     (search-query-for-model model search-ctx)
                       query-with-limit (sql.helpers/limit search-query 1)]
                   (mdb.query/query query-with-limit))))))

(defn- full-search-query
  "Postgres 9 is not happy with the type munging it needs to do to make the union-all degenerate down to trivial case of
  one model without errors. Therefore we degenerate it down for it"
  [search-ctx]
  (let [models       (or (:models search-ctx)
                         search-config/all-models)
        sql-alias    :alias_is_required_by_sql_but_not_needed_here
        order-clause [((fnil order-clause "") (:search-string search-ctx))]]
    (if (= (count models) 1)
      (search-query-for-model (first models) search-ctx)
      {:select   [:*]
       :from     [[{:union-all (vec (for [model models
                                          :let  [query (search-query-for-model model search-ctx)]
                                          :when (seq query)]
                                      query))} sql-alias]]
       :order-by order-clause})))

(s/defn ^:private search
  "Builds a search query that includes all the searchable entities and runs it"
  [search-ctx :- SearchContext]
  (let [search-query       (full-search-query search-ctx)
        _                  (log/tracef "Searching with query:\n%s\n%s"
                                       (u/pprint-to-str search-query)
                                       (mdb.query/format-sql (first (mdb.query/compile search-query))))
        to-toucan-instance (fn [row]
                             (let [model (-> row :model search-config/model-to-db-model :db-model)]
                               (t2.instance/instance model row)))
        reducible-results  (mdb.query/reducible-query search-query :max-rows search-config/*db-max-results*)
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
        total-results      (scoring/top-results reducible-results search-config/max-filtered-results xf)]
    ;; We get to do this slicing and dicing with the result data because
    ;; the pagination of search is for UI improvement, not for performance.
    ;; We intend for the cardinality of the search results to be below the default max before this slicing occurs
    {:total            (count total-results)
     :data             (cond->> total-results
                         (some?     (:offset-int search-ctx)) (drop (:offset-int search-ctx))
                         (some?     (:limit-int search-ctx)) (take (:limit-int search-ctx)))
     :available_models (query-model-set search-ctx)
     :limit            (:limit-int search-ctx)
     :offset           (:offset-int search-ctx)
     :table_db_id      (:table-db-id search-ctx)
     :models           (:models search-ctx)}))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Endpoint                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

; This is basically a union type. defendpoint splits the string if it only gets one
(def ^:private models-schema (s/conditional vector? [su/NonBlankString] :else su/NonBlankString))

(s/defn ^:private search-context :- SearchContext
  [search-string   :- (s/maybe su/NonBlankString),
   archived-string :- (s/maybe su/BooleanString)
   table-db-id     :- (s/maybe su/IntGreaterThanZero)
   models          :- (s/maybe models-schema)
   limit           :- (s/maybe su/IntGreaterThanZero)
   offset          :- (s/maybe su/IntGreaterThanOrEqualToZero)]
  (cond-> {:search-string      search-string
           :archived?          (Boolean/parseBoolean archived-string)
           :current-user-perms @api/*current-user-permissions-set*}
    (some? table-db-id) (assoc :table-db-id table-db-id)
    (some? models)      (assoc :models
                               (apply hash-set (if (vector? models) models [models])))
    (some? limit)       (assoc :limit-int limit)
    (some? offset)      (assoc :offset-int offset)))

(api/defendpoint GET "/models"
  "Get the set of models that a search query will return"
  [q archived-string table-db-id]
  {table-db-id [:maybe ms/PositiveInt]}
  (query-model-set (search-context q archived-string table-db-id nil nil nil)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Search within a bunch of models for the substring `q`.
  For the list of models, check [[metabase.search.config/all-models]].

  To search in archived portions of models, pass in `archived=true`.
  To search for tables, cards, and models of a certain DB, pass in a DB id value
  to `table_db_id`.
  To specify a list of models, pass in an array to `models`.
  "
  [q archived table_db_id models]
  {q            (s/maybe su/NonBlankString)
   archived     (s/maybe su/BooleanString)
   table_db_id  (s/maybe su/IntGreaterThanZero)
   models       (s/maybe models-schema)}
  (api/check-valid-page-params mw.offset-paging/*limit* mw.offset-paging/*offset*)
  (search (search-context
           q
           archived
           table_db_id
           models
           mw.offset-paging/*limit*
           mw.offset-paging/*offset*)))

(api/define-routes)
