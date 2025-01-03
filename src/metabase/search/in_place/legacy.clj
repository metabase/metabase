(ns metabase.search.in-place.legacy
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.collection :as collection]
   [metabase.search.config
    :as search.config
    :refer [SearchContext SearchableModel]]
   [metabase.search.engine :as search.engine]
   [metabase.search.filter :as search.filter]
   [metabase.search.in-place.filter :as search.in-place.filter]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.search.in-place.util :as search.util]
   [metabase.search.permissions :as search.permissions]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private HoneySQLColumn
  [:or
   :keyword
   [:tuple :any :keyword]])

(defmethod search.engine/supported-engine? :search.engine/in-place [_]
  true)

(defn search-model->revision-model
  "Return the appropriate revision model given a search model."
  [model]
  (case model
    "dataset" (recur "card")
    "metric" (recur "card")
    (str/capitalize model)))

(mu/defn- ->column-alias :- keyword?
  "Returns the column name. If the column is aliased, i.e. [`:original_name` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased :- HoneySQLColumn]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(def all-search-columns
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
   :collection_type     :text
   :collection_location :text
   :collection_authority_level :text
   :archived_directly   :boolean
   ;; returned for Card and Dashboard
   :collection_position :integer
   :creator_id          :integer
   :created_at          :timestamp
   :bookmark            :boolean
   ;; returned for everything except Collection
   :updated_at          :timestamp
   ;; returned only for Collection
   :location            :text
   ;; returned for Card only, used for scoring and displays
   :dashboardcard_count :integer
   :last_edited_at      :timestamp
   :last_editor_id      :integer
   :moderated_status    :text
   :display             :text
   :dashboard_id        :integer
   ;; returned for Metric and Segment
   :table_id            :integer
   :table_schema        :text
   :table_name          :text
   :table_description   :text
   ;; returned for Metric, Segment, and Action
   :database_id         :integer
   ;; returned for Database and Table
   :initial_sync_status :text
   :database_name       :text
   ;; returned for Action
   :model_id            :integer
   :model_name          :text
   ;; returned for indexed-entity
   :pk_ref              :text
   :model_index_id      :integer
   ;; returned for Card and Action
   :dataset_query       :text))

(mu/defn- canonical-columns :- [:sequential HoneySQLColumn]
  "Returns a seq of lists of canonical columns for the search query with the given `model` Will return column names
  prefixed with the `model` name so that it can be used in criteria. Projects a `nil` for columns the `model` doesn't
  have and doesn't modify aliases."
  [model :- SearchableModel, col-alias->honeysql-clause :- [:map-of :keyword HoneySQLColumn]]
  (for [[search-col col-type] all-search-columns
        :let [maybe-aliased-col (get col-alias->honeysql-clause search-col)]]
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
      ;; correct type, e.g.,
      ;;
      ;;    SELECT cast(NULL AS integer)
      ;;
      ;; For MySQL, this is not needed.
      :else
      [(when-not (= (mdb/db-type) :mysql)
         [:cast nil col-type])
       search-col])))

(mu/defn- add-table-db-id-clause
  "Add a WHERE clause to only return tables with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- ms/Map id :- [:maybe ms/PositiveInt]]
  (if (some? id)
    (sql.helpers/where query [:= id :db_id])
    query))

(mu/defn- add-card-db-id-clause
  "Add a WHERE clause to only return cards with the given DB id.
  Used in data picker for joins because we can't join across DB's."
  [query :- ms/Map id :- [:maybe ms/PositiveInt]]
  (if (some? id)
    (sql.helpers/where query [:= id :database_id])
    query))

(mu/defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [honeysql-query :- :map
   model          :- [:maybe :string]
   search-ctx     :- SearchContext]
  (let [collection-id-col      (case model
                                 "collection"    :collection.id
                                 "search-index" :search_index.collection_id
                                 :collection_id)
        permitted-clause       (search.permissions/permitted-collections-clause search-ctx collection-id-col)
        personal-clause        (search.filter/personal-collections-where-clause search-ctx collection-id-col)]
    (cond-> honeysql-query
      ;; add a JOIN against Collection *unless* the source table is already Collection
      (not= model "collection") (sql.helpers/left-join [:collection :collection] [:= collection-id-col :collection.id])
      true                      (sql.helpers/where permitted-clause)
      personal-clause           (sql.helpers/where personal-clause))))

(mu/defn- replace-select :- :map
  "Replace a select from query that has alias is `target-alias` with [`with` `target-alias`] column, throw an error if
  can't find the target select.

  This works with the assumption that `query` contains a list of select from [[select-clause-for-model]],
  and some of them are dummy column casted to the correct type.

  This function then will replace the dummy column with alias is `target-alias` with the `with` column."
  [query :- :map
   target-alias :- :keyword
   with :- :keyword]
  (let [selects     (:select query)
        idx         (first (keep-indexed (fn [index item]
                                           (when (and (coll? item)
                                                      (= (last item) target-alias))
                                             index))
                                         selects))
        with-select [with target-alias]]
    (if (some? idx)
      (assoc query :select (m/replace-nth idx with-select selects))
      (throw (ex-info "Failed to replace selector" {:status-code  400
                                                    :target-alias target-alias
                                                    :with         with})))))

(mu/defn- with-last-editing-info :- :map
  [query :- :map
   model :- [:enum "card" "dashboard"]]
  (-> query
      (replace-select :last_editor_id :r.user_id)
      (replace-select :last_edited_at :r.timestamp)
      (sql.helpers/left-join [:revision :r]
                             [:and [:= :r.model_id (search.config/column-with-model-alias model :id)]
                              [:= :r.most_recent true]
                              [:= :r.model (search-model->revision-model model)]])))

(mu/defn- with-moderated-status :- :map
  [query :- :map
   model :- [:enum "card" "dataset" "dashboard"]]
  (-> query
      (replace-select :moderated_status :mr.status)
      (sql.helpers/left-join [:moderation_review :mr]
                             [:and
                              [:= :mr.moderated_item_type (if (= model "dashboard") model "card")]
                              [:= :mr.moderated_item_id (search.config/column-with-model-alias model :id)]
                              [:= :mr.most_recent true]])))

(defn order-clause
  "CASE expression that lets the results be ordered by whether they're an exact (non-fuzzy) match or not"
  [query]
  (let [match             (search.util/wildcard-match (search.util/normalize query))
        columns-to-search (->> all-search-columns
                               (filter (fn [[_k v]] (= v :text)))
                               (map first)
                               (remove #{:collection_authority_level :moderated_status
                                         :initial_sync_status :pk_ref :location
                                         :collection_location}))
        case-clauses      (as-> columns-to-search <>
                            (map (fn [col] [:like [:lower col] match]) <>)
                            (interleave <> (repeat [:inline 0]))
                            (concat <> [:else [:inline 1]]))]
    [(into [:case] case-clauses)]))

(defmulti search-query-for-model
  "Build a HoneySQL query with all the data relevant to a given model, padded
  with NULL fields to support UNION queries."
  {:arglists '([model search-context])}
  (fn [model _] model))

(defmulti searchable-columns
  "The columns that can be searched for each model."
  {:arglists '([model search-native-query])}
  (fn [model _] model))

(defmethod searchable-columns :default
  [_ _]
  [:name])

(defmethod searchable-columns "action"
  [_ search-native-query]
  (cond-> [:name
           :description]
    search-native-query
    (conj :dataset_query)))

(defmethod searchable-columns "card"
  [_ search-native-query]
  (cond-> [:name
           :description]
    search-native-query
    (conj :dataset_query)))

(defmethod searchable-columns "dataset"
  [_ search-native-query]
  (searchable-columns "card" search-native-query))

(defmethod searchable-columns "metric"
  [_ search-native-query]
  (searchable-columns "card" search-native-query))

(defmethod searchable-columns "dashboard"
  [_ _]
  [:name
   :description])

(defmethod searchable-columns "page"
  [_ search-native-query]
  (searchable-columns "dashboard" search-native-query))

(defmethod searchable-columns "database"
  [_ _]
  [:name
   :description])

(defmethod searchable-columns "table"
  [_ _]
  [:name
   :display_name
   :description])

(defmethod searchable-columns "indexed-entity"
  [_ _]
  [:name])

(def ^:private default-columns
  "Columns returned for all models."
  [:id :name :description :archived :created_at :updated_at])

(def ^:private bookmark-col
  "Case statement to return boolean values of `:bookmark` for Card, Collection and Dashboard."
  [[:case [:not= :bookmark.id nil] true :else false] :bookmark])

(def ^:private dashboardcard-count-col
  "Subselect to get the count of associated DashboardCards"
  [{:select [:%count.*]
    :from   [:report_dashboardcard]
    :where  [:= :report_dashboardcard.card_id :card.id]}
   :dashboardcard_count])

(def ^:private table-columns
  "Columns containing information about the Table this model references. Returned for Metrics and Segments."
  [:table_id
   :created_at
   [:table.db_id       :database_id]
   [:table.schema      :table_schema]
   [:table.name        :table_name]
   [:table.description :table_description]])

(defmulti columns-for-model
  "The columns that will be returned by the query for `model`, excluding `:model`, which is added automatically.
  This is not guaranteed to be the final list of columns, new columns can be added by calling [[api.search/replace-select]]"
  {:arglists '([model])}
  (fn [model] model))

(defmethod columns-for-model "action"
  [_]
  (conj default-columns :model_id
        :creator_id
        [:model.collection_id        :collection_id]
        [:model.id                   :model_id]
        [:model.name                 :model_name]
        [:query_action.database_id   :database_id]
        [:query_action.dataset_query :dataset_query]))

(defmethod columns-for-model "card"
  [_]
  (conj default-columns :collection_id :archived_directly :collection_position :dataset_query :display :creator_id
        [:collection.name :collection_name]
        [:collection.type :collection_type]
        [:collection.location :collection_location]
        [:collection.authority_level :collection_authority_level]
        [:dashboard.name :dashboard_name]
        :dashboard_id
        bookmark-col dashboardcard-count-col))

(defmethod columns-for-model "indexed-entity" [_]
  [[:model-index-value.name     :name]
   [:model-index-value.model_pk :id]
   [:model-index.pk_ref         :pk_ref]
   [:model-index.id             :model_index_id]
   [:collection.name            :collection_name]
   [:collection.type            :collection_type]
   [:model.collection_id        :collection_id]
   [:model.id                   :model_id]
   [:model.name                 :model_name]
   [:model.database_id          :database_id]])

(defmethod columns-for-model "dashboard"
  [_]
  (conj default-columns :archived_directly :collection_id :collection_position :creator_id bookmark-col
        [:collection.name :collection_name]
        [:collection.type :collection_type]
        [:collection.authority_level :collection_authority_level]))

(defmethod columns-for-model "database"
  [_]
  [:id :name :description :created_at :updated_at :initial_sync_status])

(defmethod columns-for-model "collection"
  [_]
  (conj (remove #{:updated_at} default-columns)
        [:collection.id :collection_id]
        [:name :collection_name]
        [:type :collection_type]
        [:authority_level :collection_authority_level]
        :archived_directly
        :location
        bookmark-col))

(defmethod columns-for-model "segment"
  [_]
  (concat default-columns table-columns [:creator_id]))

(defmethod columns-for-model "metric"
  [_]
  (concat default-columns table-columns [:creator_id]))

(defmethod columns-for-model "table"
  [_]
  [[:table.id :id]
   [:table.name :name]
   [:table.created_at :created_at]
   [:table.display_name :display_name]
   [:table.description :description]
   [:table.updated_at :updated_at]
   [:table.initial_sync_status :initial_sync_status]
   [:table.id :table_id]
   [:table.db_id :database_id]
   [:table.schema :table_schema]
   [:table.name :table_name]
   [:table.description :table_description]
   [:metabase_database.name :database_name]])

(mu/defn- select-clause-for-model :- [:sequential HoneySQLColumn]
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `all-search-columns`."
  [model :- SearchableModel]
  (let [entity-columns                (columns-for-model model)
        column-alias->honeysql-clause (m/index-by ->column-alias entity-columns)
        cols-or-nils                  (canonical-columns model column-alias->honeysql-clause)]
    cols-or-nils))

(mu/defn- from-clause-for-model :- [:tuple [:tuple :keyword :keyword]]
  [model :- SearchableModel]
  (let [{:keys [db-model alias]} (get search.config/model-to-db-model model)]
    [[(t2/table-name db-model) alias]]))

(mu/defn- base-query-for-model :- [:map {:closed true}
                                   [:select :any]
                                   [:from :any]
                                   [:where {:optional true} :any]
                                   [:join {:optional true} :any]
                                   [:left-join {:optional true} :any]]
  "Create a HoneySQL query map with `:select`, `:from`, and `:where` clauses for `model`, suitable for the `UNION ALL`
  used in search."
  [model :- SearchableModel context :- SearchContext]
  (-> {:select (select-clause-for-model model)
       :from   (from-clause-for-model model)}
      (search.in-place.filter/build-filters model context)))

(mu/defn- shared-card-impl
  [model :- :metabase.models.card/type
   search-ctx :- SearchContext]
  (-> (base-query-for-model "card" search-ctx)
      (sql.helpers/where [:= :card.type (name model)])
      (sql.helpers/left-join [:card_bookmark :bookmark]
                             [:and
                              [:= :bookmark.card_id :card.id]
                              [:= :bookmark.user_id (:current-user-id search-ctx)]])
      (sql.helpers/where [:or
                          ;; we'll *always* select non-dashboard questions
                          [:= nil :card.dashboard_id]
                          ;; when we want dashboard questions too, we *only* include those that have a DashboardCard.
                          ;; A DashboardQuestion without a DashboardCard should effectively not exist: it's invisible
                          ;; from the collection picker or when browsing, so it shouldn't be visible in search either.
                          (when (:include-dashboard-questions? search-ctx)
                            [:exists
                             {:select 1
                              :from [:report_dashboardcard]
                              :where [:= :card_id :card.id]}])])
      (add-collection-join-and-where-clauses "card" search-ctx)
      (add-card-db-id-clause (:table-db-id search-ctx))
      (with-last-editing-info "card")
      (with-moderated-status "card")))

(defmethod search-query-for-model "action"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:report_card :model]
                             [:= :model.id :action.model_id])
      (sql.helpers/left-join :query_action
                             [:= :query_action.action_id :action.id])
      (add-collection-join-and-where-clauses model search-ctx)))

(defmethod search-query-for-model "card"
  [_model search-ctx]
  (shared-card-impl :question search-ctx))

(defmethod search-query-for-model "dataset"
  [_model search-ctx]
  (-> (shared-card-impl :model search-ctx)
      (update :select (fn [columns]
                        (cons [(h2x/literal "dataset") :model] (rest columns))))))

(defmethod search-query-for-model "metric"
  [_model search-ctx]
  (-> (shared-card-impl :metric search-ctx)
      (update :select (fn [columns]
                        (cons [(h2x/literal "metric") :model] (rest columns))))))

(defmethod search-query-for-model "collection"
  [model search-ctx]
  (-> (base-query-for-model "collection" search-ctx)
      (sql.helpers/left-join [:collection_bookmark :bookmark]
                             [:and
                              [:= :bookmark.collection_id :collection.id]
                              [:= :bookmark.user_id (:current-user-id search-ctx)]])
      (add-collection-join-and-where-clauses model search-ctx)))

(defmethod search-query-for-model "database"
  [model search-ctx]
  (base-query-for-model model search-ctx))

(defmethod search-query-for-model "dashboard"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:dashboard_bookmark :bookmark]
                             [:and
                              [:= :bookmark.dashboard_id :dashboard.id]
                              [:= :bookmark.user_id (:current-user-id search-ctx)]])
      (with-moderated-status "dashboard")
      (add-collection-join-and-where-clauses model search-ctx)
      (with-last-editing-info "dashboard")))

(defn- add-model-index-permissions-clause
  [query {:keys [current-user-id is-superuser?]}]
  (sql.helpers/where
   query
   (collection/visible-collection-filter-clause
    :collection_id
    {}
    {:current-user-id current-user-id
     :is-superuser?   is-superuser?})))

(defmethod search-query-for-model "indexed-entity"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:model_index :model-index]
                             [:= :model-index.id :model-index-value.model_index_id])
      (sql.helpers/left-join [:report_card :model] [:= :model-index.model_id :model.id])
      (sql.helpers/left-join [:collection :collection] [:= :model.collection_id :collection.id])
      (add-model-index-permissions-clause search-ctx)))

(defmethod search-query-for-model "segment"
  [model search-ctx]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:metabase_table :table] [:= :segment.table_id :table.id])))

(defmethod search-query-for-model "table"
  [model {:keys [current-user-perms table-db-id], :as search-ctx}]
  (when (seq current-user-perms)
    (-> (base-query-for-model model search-ctx)
        (add-table-db-id-clause table-db-id)
        (sql.helpers/left-join :metabase_database [:= :table.db_id :metabase_database.id]))))

(defmethod search.engine/model-set :search.engine/in-place
  [search-ctx]
  (let [model-queries (for [model (search.in-place.filter/search-context->applicable-models
                                   ;; It's unclear why we don't use the existing :models
                                   (assoc search-ctx :models search.config/all-models))]
                        {:nest (sql.helpers/limit (search-query-for-model model search-ctx) 1)})
        query         (when (pos-int? (count model-queries))
                        {:select [:*]
                         :from   [[{:union-all model-queries} :dummy_alias]]})]
    (into #{} (map :model) (some-> query mdb.query/query))))

(mu/defn full-search-query
  "Postgres 9 is not happy with the type munging it needs to do to make the union-all degenerate down to a trivial case
  of one model without errors. Therefore, we degenerate it down for it"
  [search-ctx :- SearchContext]
  (let [models       (:models search-ctx)
        order-clause [((fnil order-clause "") (:search-string search-ctx))]]
    (cond
      (= (count models) 0)
      {:select [nil]}

      (= (count models) 1)
      (merge (search-query-for-model (first models) search-ctx)
             {:limit search.config/*db-max-results*})

      :else
      {:select   [:*]
       :from     [[{:union-all (vec (for [model models
                                          :let [query (search-query-for-model model search-ctx)]
                                          :when (seq query)]
                                      query))} :alias_is_required_by_sql_but_not_needed_here]]
       :order-by order-clause
       :limit    search.config/*db-max-results*})))

;; Return a reducible-query corresponding to searching the entities without an index.
(defmethod search.engine/results
  :search.engine/in-place
  [search-ctx]
  (let [search-query (full-search-query search-ctx)]
    (log/tracef "Searching with query:\n%s\n%s"
                (u/pprint-to-str search-query)
                (mdb.query/format-sql (first (mdb.query/compile search-query))))
    (t2/reducible-query search-query)))

(defmethod search.engine/score :search.engine/in-place [search-ctx result]
  (scoring/score-and-result result search-ctx))
