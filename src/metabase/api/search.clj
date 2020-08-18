(ns metabase.api.search
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [GET]]
            [flatland.ordered.map :as ordered-map]
            [honeysql
             [core :as hsql]
             [helpers :as h]]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :as coll :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [interface :as mi]
             [metric :refer [Metric]]
             [permissions :as perms]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private ^:const search-max-results
  "Absolute maximum number of search results to return. This number is in place to prevent massive application DB load
  by returning tons of results; this number should probably be adjusted downward once we have UI in place to indicate
  that results are truncated."
  1000)

(def ^:private SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query"
  {:search-string      (s/maybe su/NonBlankString)
   :archived?          s/Bool
   :current-user-perms #{perms/UserPath}})

(def ^:private searchable-models
  "Models that can be searched. Results also come back in this order (i.e., all matching Cards, followed by all matching
  Dashboards, etc.)"
  [Card Dashboard Pulse Collection Segment Metric Table])

(def ^:private model->sort-position
  (into {} (map-indexed (fn [i model]
                          [(str/lower-case (name model)) i])
                        searchable-models)))

(def ^:private SearchableModel
  (apply s/enum searchable-models))

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
   ;; returned for all models
   :model               :text
   :id                  :integer
   :name                :text
   :display_name        :text
   :description         :text
   :archived            :boolean
   ;; returned for Card, Dashboard, Pulse, and Collection
   :collection_id       :integer
   :collection_name     :text
   ;; returned for Card and Dashboard
   :collection_position :integer
   :favorite            :boolean
   ;; returned for Metric and Segment
   :table_id            :integer
   :database_id         :integer
   :table_schema        :text
   :table_name          :text
   :table_description   :text))

;; below are the actual columns returned for any given entity

(def ^:private default-columns
  "Columns returned for all models."
  [:id :name :description :archived])

(def ^:private favorite-col
  "Case statement to return boolean values of `:favorite` for Card and Dashboard."
  [(hsql/call :case [:not= :fave.id nil] true :else false) :favorite])

(def ^:private table-columns
  "Columns containing information about the Table this model references. Returned for Metrics and Segments."
  [:table_id
   [:table.db_id       :database_id]
   [:table.schema      :table_schema]
   [:table.name        :table_name]
   [:table.description :table_description]])

(defmulti ^:private columns-for-model
  "The columns that will be returned by the query for `model`, excluding `:model`, which is added automatically."
  {:arglists '([model])}
  class)

(defmethod columns-for-model (class Card)
  [_]
  (conj default-columns :collection_id :collection_position [:collection.name :collection_name] favorite-col))

(defmethod columns-for-model (class Dashboard)
  [_]
  (conj default-columns :collection_id :collection_position [:collection.name :collection_name] favorite-col))

(defmethod columns-for-model (class Pulse)
  [_]
  [:id :name :collection_id [:collection.name :collection_name]])

(defmethod columns-for-model (class Collection)
  [_]
  (conj default-columns [:id :collection_id] [:name :collection_name]))

(defmethod columns-for-model (class Segment)
  [_]
  (into default-columns table-columns))

(defmethod columns-for-model (class Metric)
  [_]
  (into default-columns table-columns))

(defmethod columns-for-model (class Table)
  [_]
  [:id
   :name
   :display_name
   :description
   [:id :table_id]
   [:db_id :database_id]
   [:schema :table_schema]
   [:name :table_name]
   [:description :table_description]])


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Shared Query Logic                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private model->alias :- s/Keyword
  [model :- SearchableModel]
  (keyword (str/lower-case (name model))))

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
      [(hx/literal (name (model->alias model))) :model]

      ;; This is an aliased column, no need to include the table alias
      (sequential? maybe-aliased-col)
      maybe-aliased-col

      ;; This is a column reference, need to add the table alias to the column
      maybe-aliased-col
      (hsql/qualify (model->alias model) (name maybe-aliased-col))

      ;; This entity is missing the column, project a null for that column value. For Postgres and H2, cast it to the
      ;; correct type, e.g.
      ;;
      ;;    SELECT cast(NULL AS integer)
      ;;
      ;; For MySQL, this is not needed.
      :else
      [(if (= (mdb/db-type) :mysql)
         nil
         (hx/cast col-type nil))
       search-col])))

(s/defn ^:private select-clause-for-model :- [HoneySQLColumn]
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `all-search-columns`."
  [model :- SearchableModel]
  (let [entity-columns                (columns-for-model model)
        column-alias->honeysql-clause (u/key-by ->column-alias entity-columns)
        cols-or-nils                  (canonical-columns model column-alias->honeysql-clause)]
    cols-or-nils))

(s/defn ^:private from-clause-for-model :- [(s/one [(s/one SearchableModel "model") (s/one s/Keyword "alias")]
                                                   "from clause")]
  [model :- SearchableModel]
  [[model (model->alias model)]])

(defmulti ^:private archived-where-clause
  {:arglists '([model archived?])}
  (fn [model _] (class model)))

(defmethod archived-where-clause :default
  [model archived?]
  [:= (hsql/qualify (model->alias model) :archived) archived?])

;; Table has an `:active` flag, but no `:archived` flag; never return inactive Tables
(defmethod archived-where-clause (class Table)
  [model archived?]
  (if archived?
    [:= 1 0]  ; No tables should appear in archive searches
    [:= (hsql/qualify (model->alias model) :active) true]))

(s/defn ^:private base-where-clause-for-model :- [(s/one (s/enum :and :=) "type") s/Any]
  [model :- SearchableModel, {:keys [search-string archived?]} :- SearchContext]
  (let [archived-clause      (archived-where-clause model archived?)
        search-string-clause (when (seq search-string)
                               [:like
                                (hsql/call :lower (hsql/qualify (model->alias model) :name))
                                (str "%" (str/lower-case search-string) "%")])]
    (if search-string-clause
      [:and archived-clause search-string-clause]
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
  [honeysql-query :- su/Map, collection-id-column :- s/Keyword, {:keys [current-user-perms]} :- SearchContext]
  (let [visible-collections      (coll/permissions-set->visible-collection-ids current-user-perms)
        collection-filter-clause (coll/visible-collection-ids->honeysql-filter-clause
                                  collection-id-column
                                  visible-collections)
        honeysql-query           (-> honeysql-query
                                     (h/merge-where collection-filter-clause)
                                     (h/merge-where [:= :collection.namespace nil]))]
    ;; add a JOIN against Collection *unless* the source table is already Collection
    (cond-> honeysql-query
      (not= collection-id-column :collection.id)
      (h/merge-left-join [Collection :collection]
                         [:= collection-id-column :collection.id]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Search Queries for each Toucan Model                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private search-query-for-model
  {:arglists '([model search-context])}
  (fn [model _] (class model)))

(s/defmethod search-query-for-model (class Card)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Card search-ctx)
      (h/left-join [CardFavorite :fave]
                   [:and
                    [:= :card.id :fave.card_id]
                    [:= :fave.owner_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :card.collection_id search-ctx)))

(s/defmethod search-query-for-model (class Collection)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Collection search-ctx)
      (add-collection-join-and-where-clauses :collection.id search-ctx)))

(s/defmethod search-query-for-model (class Dashboard)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Dashboard search-ctx)
      (h/left-join [DashboardFavorite :fave]
                   [:and
                    [:= :dashboard.id :fave.dashboard_id]
                    [:= :fave.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :dashboard.collection_id search-ctx)))

(s/defmethod search-query-for-model (class Pulse)
  [_ search-ctx :- SearchContext]
  ;; Pulses don't currently support being archived, omit if archived is true
  (-> (base-query-for-model Pulse search-ctx)
      (add-collection-join-and-where-clauses :pulse.collection_id search-ctx)
      ;; We don't want alerts included in pulse results
      (h/merge-where [:= :alert_condition nil])))

(s/defmethod search-query-for-model (class Metric)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Metric search-ctx)
      (h/left-join [Table :table] [:= :metric.table_id :table.id])))

(s/defmethod search-query-for-model (class Segment)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Segment search-ctx)
      (h/left-join [Table :table] [:= :segment.table_id :table.id])))

(s/defmethod search-query-for-model (class Table)
  [_ {:keys [current-user-perms], :as search-ctx} :- SearchContext]
  (when (seq current-user-perms)
    (let [base-query (base-query-for-model Table search-ctx)]
      (if (contains? current-user-perms "/")
        base-query
        {:select (:select base-query)
         :from   [[(merge
                    base-query
                    {:select [:id :schema :db_id :name :description :display_name
                              [(hx/concat (hx/literal "/db/") :db_id (hx/literal "/")
                                          (hsql/call :case [:not= :schema nil] :schema :else (hx/literal "")) (hx/literal "/")
                                          :id (hx/literal "/"))
                               :path]]})
                   :table]]
         :where  (cons
                  :or
                  (for [path current-user-perms]
                    [:like :path (str path "%")]))}))))

(defmulti ^:private check-permissions-for-model
  {:arglists '([search-result])}
  (comp keyword :model))

(defmethod check-permissions-for-model :default
  [_]
  ;; We filter what we can (ie. everything that is in a collection) out already when querying
  true)

(defmethod check-permissions-for-model :metric
  [{:keys [id]}]
  (-> id Metric mi/can-read?))

(defmethod check-permissions-for-model :segment
  [{:keys [id]}]
  (-> id Segment mi/can-read?))

(s/defn ^:private search
  "Builds a search query that includes all of the searchable entities and runs it"
  [search-ctx :- SearchContext]
  (letfn [(bit->boolean [v]
            (if (number? v)
              (not (zero? v))
              v))]
    (let [search-query {:union-all (for [model searchable-models
                                         :let  [query (search-query-for-model model search-ctx)]
                                         :when (seq query)]
                                     query)}
          _            (log/tracef "Searching with query:\n%s" (u/pprint-to-str search-query))
          ;; sort results by [model name]
          results      (sort-by (juxt (comp model->sort-position :model)
                                      :name)
                                (db/query search-query :max-rows search-max-results))]
      (for [row results
            :when (check-permissions-for-model row)]
        ;; MySQL returns `:favorite` and `:archived` as `1` or `0` so convert those to boolean as needed
        (-> row
            (update :favorite bit->boolean)
            (update :archived bit->boolean))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Endpoint                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private make-search-context :- SearchContext
  [search-string :- (s/maybe su/NonBlankString), archived-string :- (s/maybe su/BooleanString)]
  {:search-string      search-string
   :archived?          (Boolean/parseBoolean archived-string)
   :current-user-perms @api/*current-user-permissions-set*})

(api/defendpoint GET "/"
  "Search Cards, Dashboards, Collections and Pulses for the substring `q`."
  [q archived]
  {q        (s/maybe su/NonBlankString)
   archived (s/maybe su/BooleanString)}
  (search (make-search-context q archived)))

(api/define-routes)
