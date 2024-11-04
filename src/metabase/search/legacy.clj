(ns metabase.search.legacy
  (:require
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.collection :as collection]
   [metabase.models.permissions :as perms]
   [metabase.search.api :as search.api]
   [metabase.search.config
    :as search.config
    :refer [SearchContext SearchableModel]]
   [metabase.search.filter :as search.filter]
   [metabase.search.scoring :as scoring]
   [metabase.search.util :as search.util]
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

(mu/defn- ->column-alias :- keyword?
  "Returns the column name. If the column is aliased, i.e. [`:original_name` `:aliased_name`], return the aliased
  column name"
  [column-or-aliased :- HoneySQLColumn]
  (if (sequential? column-or-aliased)
    (second column-or-aliased)
    column-or-aliased))

(mu/defn- canonical-columns :- [:sequential HoneySQLColumn]
  "Returns a seq of lists of canonical columns for the search query with the given `model` Will return column names
  prefixed with the `model` name so that it can be used in criteria. Projects a `nil` for columns the `model` doesn't
  have and doesn't modify aliases."
  [model :- SearchableModel, col-alias->honeysql-clause :- [:map-of :keyword HoneySQLColumn]]
  (for [[search-col col-type] search.config/all-search-columns
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
                              [:= :r.model (search.config/search-model->revision-model model)]])))

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
        columns-to-search (->> search.config/all-search-columns
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

(mu/defn- select-clause-for-model :- [:sequential HoneySQLColumn]
  "The search query uses a `union-all` which requires that there be the same number of columns in each of the segments
  of the query. This function will take the columns for `model` and will inject constant `nil` values for any column
  missing from `entity-columns` but found in `search.config/all-search-columns`."
  [model :- SearchableModel]
  (let [entity-columns                (search.config/columns-for-model model)
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
      (search.filter/build-filters model context)))

;; This isn't a legacy method, we can keep it if we just find a new home.
(mu/defn add-collection-join-and-where-clauses
  "Add a `WHERE` clause to the query to only return Collections the Current User has access to; join against Collection,
  so we can return its `:name`."
  [honeysql-query :- ms/Map
   model :- [:maybe :string]
   {:keys [filter-items-in-personal-collection
           archived
           current-user-id
           is-superuser?]} :- SearchContext]
  (let [collection-id-col        (if (= model "collection")
                                   :collection.id
                                   :collection_id)
        collection-filter-clause (collection/visible-collection-filter-clause
                                  collection-id-col
                                  {:include-archived-items    :all
                                   :include-trash-collection? true
                                   :permission-level          (if archived
                                                                :write
                                                                :read)}
                                  {:current-user-id current-user-id
                                   :is-superuser?   is-superuser?})]
    (cond-> honeysql-query
      true
      (sql.helpers/where collection-filter-clause (perms/audit-namespace-clause :collection.namespace nil))
      ;; add a JOIN against Collection *unless* the source table is already Collection
      (not= model "collection")
      (sql.helpers/left-join [:collection :collection]
                             [:= collection-id-col :collection.id])

      (some? filter-items-in-personal-collection)
      (sql.helpers/where
       (case filter-items-in-personal-collection
         "only"
         (concat [:or]
                 ;; sub personal collections
                 (for [id (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil])]
                   [:like :collection.location (format "/%d/%%" id)])
                 ;; top level personal collections
                 [[:and
                   [:= :collection.location "/"]
                   [:not= :collection.personal_owner_id nil]]])

         "exclude"
         (conj [:or]
               (into
                [:and [:= :collection.personal_owner_id nil]]
                (for [id (t2/select-pks-set :model/Collection :personal_owner_id [:not= nil])]
                  [:not-like :collection.location (format "/%d/%%" id)]))
               [:= collection-id-col nil]))))))

(mu/defn- shared-card-impl
  [model :- :metabase.models.card/type
   search-ctx :- SearchContext]
  (-> (base-query-for-model "card" search-ctx)
      (sql.helpers/where [:= :card.type (name model)])
      (sql.helpers/left-join [:card_bookmark :bookmark]
                             [:and
                              [:= :bookmark.card_id :card.id]
                              [:= :bookmark.user_id (:current-user-id search-ctx)]])
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

(defmethod search.api/model-set :search.engine/in-place
  [search-ctx]
  (let [model-queries (for [model (search.filter/search-context->applicable-models
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
(defmethod search.api/results
  :search.engine/in-place
  [search-ctx]
  (let [search-query (full-search-query search-ctx)]
    (log/tracef "Searching with query:\n%s\n%s"
                (u/pprint-to-str search-query)
                (mdb.query/format-sql (first (mdb.query/compile search-query))))
    (t2/reducible-query search-query)))

(defmethod search.api/score :search.engine/in-place [results search-ctx]
  (scoring/score-and-result results search-ctx))
