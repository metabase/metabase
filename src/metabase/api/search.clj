(ns metabase.api.search
  (:require [clojure.string :as str]
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
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util
             [honeysql-extensions :as hx]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private SearchContext
  "Map with the various allowed search parameters, used to construct the SQL query"
  {:search-string       (s/maybe su/NonBlankString)
   :archived?           s/Bool
   :visible-collections coll/VisibleCollections})

(def ^:private searchable-models
  [Card Dashboard Pulse Collection Segment Metric])

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
   :description         :text
   :archived            :boolean
   ;; returned for Card, Dashboard, Pulse, and Collection
   :collection_id       :integer
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
  "Columns containing information about the table this model references. Returned for Metrics and Segments."
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
  (conj default-columns :collection_id :collection_position favorite-col))

(defmethod columns-for-model (class Dashboard)
  [_]
  (conj default-columns :collection_id :collection_position favorite-col))

(defmethod columns-for-model (class Pulse)
  [_]
  [:id :name :collection_id])

(defmethod columns-for-model (class Collection)
  [_]
  (conj default-columns [:id :collection_id]))

(defmethod columns-for-model (class Segment)
  [_]
  (into default-columns table-columns))

(defmethod columns-for-model (class Metric)
  [_]
  (into default-columns table-columns))


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

(s/defn ^:private base-where-clause-for-model :- [(s/one (s/enum :and :=) "type") s/Any]
  [model :- SearchableModel, {:keys [search-string archived?]} :- SearchContext]
  (let [archived-clause      [:= (hsql/qualify (model->alias model) :archived) archived?]
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

(s/defn ^:private add-where-clause-for-collection-id
  "Update the query to only include collections the user has access to"
  [honeysql-query :- su/Map, collection-id-column :- s/Keyword, {:keys [visible-collections]} :- SearchContext]
  (h/merge-where
   honeysql-query
   (coll/visible-collection-ids->honeysql-filter-clause collection-id-column visible-collections)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Search Queries for each Toucan Model                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private search-query-for-model
  {:arglists '([model search-context])}
  (fn [model _] (class model)))

(s/defmethod ^:private search-query-for-model (class Card)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Card search-ctx)
      (h/left-join [CardFavorite :fave]
                   [:and
                    [:= :card.id :fave.card_id]
                    [:= :fave.owner_id api/*current-user-id*]])
      (add-where-clause-for-collection-id :card.collection_id search-ctx)))

(s/defmethod ^:private search-query-for-model (class Collection)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Collection search-ctx)
      (add-where-clause-for-collection-id :collection.id search-ctx)))

(s/defmethod ^:private search-query-for-model (class Dashboard)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Dashboard search-ctx)
      (h/left-join [DashboardFavorite :fave]
                   [:and
                    [:= :dashboard.id :fave.dashboard_id]
                    [:= :fave.user_id api/*current-user-id*]])
      (add-where-clause-for-collection-id :dashboard.collection_id search-ctx)))

(s/defmethod ^:private search-query-for-model (class Pulse)
  [_ search-ctx :- SearchContext]
  ;; Pulses don't currently support being archived, omit if archived is true
  (-> (base-query-for-model Pulse search-ctx)
      (add-where-clause-for-collection-id :pulse.collection_id search-ctx)
      ;; We don't want alerts included in pulse results
      (h/merge-where [:= :alert_condition nil])))

(s/defmethod ^:private search-query-for-model (class Metric)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Metric search-ctx)
      (h/left-join [Table :table] [:= :metric.table_id :table.id])))

(s/defmethod ^:private search-query-for-model (class Segment)
  [_ search-ctx :- SearchContext]
  (-> (base-query-for-model Segment search-ctx)
      (h/left-join [Table :table] [:= :segment.table_id :table.id])))

(s/defn ^:private search
  "Builds a search query that includes all of the searchable entities and runs it"
  [search-ctx :- SearchContext]
  (for [row (db/query {:union-all (for [model searchable-models]
                                    (search-query-for-model model search-ctx))})]
    ;; MySQL returns `:favorite` as `1` or `0` so convert those to boolean as needed
    (update row :favorite (fn [favorite]
                            (if (integer? favorite)
                              (not (zero? favorite))
                              favorite)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Endpoint                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private make-search-context :- SearchContext
  [search-string :- (s/maybe su/NonBlankString), archived-string :- (s/maybe su/BooleanString)]
  {:search-string       search-string
   :archived?           (Boolean/parseBoolean archived-string)
   :visible-collections (coll/permissions-set->visible-collection-ids @api/*current-user-permissions-set*)})

(api/defendpoint GET "/"
  "Search Cards, Dashboards, Collections and Pulses for the substring `q`."
  [q archived]
  {q        (s/maybe su/NonBlankString)
   archived (s/maybe su/BooleanString)}
  (let [{:keys [visible-collections] :as search-ctx} (make-search-context q archived)]
    ;; Throw if the user doesn't have access to any collections
    (api/check-403 (or (= :all visible-collections)
                       (seq visible-collections)))
    (search search-ctx)))

(api/define-routes)
