(ns metabase.api.search
  (:require
   [cheshire.core :as json]
   [compojure.core :refer [GET]]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.db :as mdb]
   [metabase.db.query :as mdb.query]
   [metabase.models.collection :as collection]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config :refer [SearchableModel SearchContext]]
   [metabase.search.filter :as search.filter]
   [metabase.search.scoring :as scoring]
   [metabase.search.util :as search.util]
   [metabase.server.middleware.offset-paging :as mw.offset-paging]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru deferred-tru]]
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
  [honeysql-query                                :- ms/Map
   collection-id-column                          :- keyword?
   {:keys [current-user-perms
           filter-items-in-personal-collection]} :- SearchContext]
  (let [visible-collections      (collection/permissions-set->visible-collection-ids current-user-perms)
        collection-filter-clause (collection/visible-collection-ids->honeysql-filter-clause
                                  collection-id-column
                                  visible-collections)]
    (cond-> honeysql-query
      true
      (sql.helpers/where collection-filter-clause (perms/audit-namespace-clause :collection.namespace nil))
      ;; add a JOIN against Collection *unless* the source table is already Collection
      (not= collection-id-column :collection.id)
      (sql.helpers/left-join [:collection :collection]
                             [:= collection-id-column :collection.id])

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
               [:= collection-id-column nil]))))))

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
  "Replace a select from query that has alias is `target-alias` with [`with` `target-alias`] column, throw an error if
  can't find the target select.

  This works with the assumption that `query` contains a list of select from [[select-clause-for-model]],
  and some of them are dummy column casted to the correct type.

  This function then will replace the dummy column with alias is `target-alias` with the `with` column."
  [query        :- :map
   target-alias :- :keyword
   with         :- :keyword]
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

(mu/defn ^:private with-last-editing-info :- :map
  [query :- :map
   model :- [:enum "card" "dataset" "dashboard" "metric"]]
  (-> query
      (replace-select :last_editor_id :r.user_id)
      (replace-select :last_edited_at :r.timestamp)
      (sql.helpers/left-join [:revision :r]
                             [:and [:= :r.model_id (search.config/column-with-model-alias model :id)]
                              [:= :r.most_recent true]
                              [:= :r.model (search.config/search-model->revision-model model)]])))

(mu/defn ^:private with-moderated-status :- :map
  [query :- :map
   model :- [:enum "card" "dataset"]]
  (-> query
      (replace-select :moderated_status :mr.status)
      (sql.helpers/left-join [:moderation_review :mr]
                             [:and
                              [:= :mr.moderated_item_type "card"]
                              [:= :mr.moderated_item_id (search.config/column-with-model-alias model :id)]
                              [:= :mr.most_recent true]])))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Search Queries for each Toucan Model                                      |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti ^:private search-query-for-model
  {:arglists '([model search-context])}
  (fn [model _] model))

(mu/defn ^:private shared-card-impl
  [model      :- [:enum "card" "dataset"] ; TODO -- use :metabase.models.card/type instead and have this `:question`/`:model`/etc.
   search-ctx :- SearchContext]
  (-> (base-query-for-model "card" search-ctx)
      (sql.helpers/where [:= :card.type (if (= model "dataset") "model" "question")])
      (sql.helpers/left-join [:card_bookmark :bookmark]
                             [:and
                              [:= :bookmark.card_id :card.id]
                              [:= :bookmark.user_id api/*current-user-id*]])
      (add-collection-join-and-where-clauses :card.collection_id search-ctx)
      (add-card-db-id-clause (:table-db-id search-ctx))
      (with-last-editing-info model)
      (with-moderated-status model)))

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

(defn- add-model-index-permissions-clause
  [query current-user-perms]
  (let [build-path (fn [x y z] (h2x/concat (h2x/literal x) y (h2x/literal z)))
        has-perm-clause (fn [x y z] [:in (build-path x y z) current-user-perms])]
    (if (contains? current-user-perms "/")
      query
      ;; User has /collection/:id/ or /collection/:id/read/ for the collection the model is in. We will check
      ;; permissions on the database after the query is complete, in `check-permissions-for-model`
      (let [has-root-access?
            (or (contains? current-user-perms "/collection/root/")
                (contains? current-user-perms "/collection/root/read/"))

            collection-perm-clause
            [:or
             (when has-root-access? [:= :model.collection_id nil])
             [:and
              [:not= :model.collection_id nil]
              [:or
               (has-perm-clause "/collection/" :model.collection_id "/")
               (has-perm-clause "/collection/" :model.collection_id "/read/")]]]]
        (sql.helpers/where
         query
         collection-perm-clause)))))

(defmethod search-query-for-model "indexed-entity"
  [model {:keys [current-user-perms] :as search-ctx}]
  (-> (base-query-for-model model search-ctx)
      (sql.helpers/left-join [:model_index :model-index]
                             [:= :model-index.id :model-index-value.model_index_id])
      (sql.helpers/left-join [:report_card :model] [:= :model-index.model_id :model.id])
      (sql.helpers/left-join [:collection :collection] [:= :model.collection_id :collection.id])
      (add-model-index-permissions-clause current-user-perms)))

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

(defmulti ^:private check-permissions-for-model
  {:arglists '([archived? search-result])}
  (fn [_ search-result] ((comp keyword :model) search-result)))

(defmethod check-permissions-for-model :default
  [archived? instance]
  (if archived?
    (mi/can-write? instance)
    ;; We filter what we can (ie. everything that is in a collection) out already when querying
    true))

(defmethod check-permissions-for-model :table
  [_archived instance]
  ;; we've already filtered out tables w/o collection permissions in the query itself.
  (and
   (data-perms/user-has-permission-for-table?
    api/*current-user-id*
    :perms/view-data
    :unrestricted
    (database/table-id->database-id (:id instance))
    (:id instance))
   (data-perms/user-has-permission-for-table?
    api/*current-user-id*
    :perms/create-queries
    :query-builder
    (database/table-id->database-id (:id instance))
    (:id instance))))

(defmethod check-permissions-for-model :indexed-entity
  [_archived? instance]
  (and
   (= :query-builder-and-native
      (data-perms/full-db-permission-for-user api/*current-user-id* :perms/create-queries (:database_id instance)))
   (= :unrestricted
      (data-perms/full-db-permission-for-user api/*current-user-id* :perms/view-data (:database_id instance)))))

(defmethod check-permissions-for-model :metric
  [archived? instance]
  (if archived?
    (mi/can-write? instance)
    (mi/can-read? instance)))

(defmethod check-permissions-for-model :segment
  [archived? instance]
  (if archived?
    (mi/can-write? instance)
    (mi/can-read? instance)))

(defmethod check-permissions-for-model :database
  [archived? instance]
  (if archived?
    (mi/can-write? instance)
    (mi/can-read? instance)))

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
      (merge (search-query-for-model (first models) search-ctx)
             {:limit search.config/*db-max-results*})

      :else
      {:select   [:*]
       :from     [[{:union-all (vec (for [model models
                                          :let  [query (search-query-for-model model search-ctx)]
                                          :when (seq query)]
                                      query))} :alias_is_required_by_sql_but_not_needed_here]]
       :order-by order-clause
       :limit search.config/*db-max-results*})))

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

(defn add-dataset-collection-hierarchy
  "Adds `collection_effective_ancestors` to *datasets* in the search results."
  [search-results]
  (let [;; this helper function takes a search result (with `collection_id` and `collection_location`) and returns the
        ;; effective location of the result.
        result->loc  (fn [{:keys [collection_id collection_location]}]
                       (:effective_location
                        (t2/hydrate
                         (if (nil? collection_id)
                           collection/root-collection
                           {:location collection_location})
                         :effective_location)))
        ;; a map of collection-ids to collection info
        col-id->info (into {}
                           (for [item  search-results
                                 :when (= (:model item) "dataset")]
                             [(:collection_id item)
                              {:id                 (:collection_id item)
                               :name               (:collection_name item)
                               :type               (:collection_type item)
                               :effective_location (result->loc item)}]))
        ;; the set of all collection IDs where we *don't* know the collection name. For example, if `col-id->info`
        ;; contained `{1 {:effective_location "/2/" :name "Foo"}}`, we need to look up the name of collection `2`.
        to-fetch     (into #{} (comp (keep :effective_location)
                                     (mapcat collection/location-path->ids)
                                     ;; already have these names
                                     (remove col-id->info))
                           (vals col-id->info))
        ;; the now COMPLETE map of collection IDs to info
        col-id->info (merge (if (seq to-fetch)
                              (t2/select-pk->fn #(select-keys % [:name :type :id]) :model/Collection :id [:in to-fetch])
                              {})
                            (update-vals col-id->info #(dissoc % :effective_location)))
        annotate     (fn [x]
                       (cond-> x
                         (= (:model x) "dataset")
                         (assoc :collection_effective_ancestors
                                (if-let [loc (result->loc x)]
                                  (->> (collection/location-path->ids loc)
                                       (map col-id->info))
                                  []))))]
    (map annotate search-results)))

(defn- add-collection-effective-location
  "Batch-hydrates :effective_location and :effective_parent on collection search results. Keeps search results in
  order."
  [search-results]
  (let [collections    (filter #(mi/instance-of? :model/Collection %) search-results)
        hydrated-colls (t2/hydrate collections :effective_parent)
        idx->coll      (into {} (map (juxt :id identity) hydrated-colls))]
    (map (fn [search-result]
           (if (mi/instance-of? :model/Collection search-result)
             (idx->coll (:id search-result))
             (assoc search-result :effective_location nil)))
         search-results)))

(defn- add-can-write [row]
  (if (some #(mi/instance-of? % row) [:model/Dashboard :model/Card])
    (assoc row :can_write (mi/can-write? row))
    row))

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
        reducible-results  (t2/reducible-query search-query)
        xf                 (comp
                            (take search.config/*db-max-results*)
                            (map t2.realize/realize)
                            (map to-toucan-instance)
                            (map #(cond-> %
                                    (t2/instance-of? :model/Collection %) (assoc :type (:collection_type %))))
                            (filter (partial check-permissions-for-model (:archived? search-ctx)))
                            ;; MySQL returns `:bookmark` and `:archived` as `1` or `0` so convert those to boolean as
                            ;; needed
                            (map #(update % :bookmark api/bit->boolean))
                            (map #(update % :archived api/bit->boolean))
                            (map #(update % :pk_ref json/parse-string))
                            (map add-can-write)
                            (map #(scoring/score-and-result % (select-keys search-ctx [:search-string :search-native-query])))
                            (filter #(pos? (:score %))))
        total-results       (cond->> (scoring/top-results reducible-results search.config/max-filtered-results xf)
                              true                           hydrate-user-metadata
                              (:model-ancestors? search-ctx) (add-dataset-collection-hierarchy)
                              true                           (add-collection-effective-location)
                              true                           (map scoring/serialize))
        add-perms-for-col  (fn [item]
                             (cond-> item
                               (mi/instance-of? :model/Collection item)
                               (assoc :can_write (mi/can-write? item))))]
    ;; We get to do this slicing and dicing with the result data because
    ;; the pagination of search is for UI improvement, not for performance.
    ;; We intend for the cardinality of the search results to be below the default max before this slicing occurs
    {:total            (count total-results)
     :data             (cond->> total-results
                         (some? (:offset-int search-ctx)) (drop (:offset-int search-ctx))
                         (some? (:limit-int search-ctx)) (take (:limit-int search-ctx))
                         true (map add-perms-for-col))
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
           filter-items-in-personal-collection
           offset
           search-string
           model-ancestors?
           table-db-id
           search-native-query
           verified
           ids]}           :- [:map {:closed true}
                               [:search-string                                        [:maybe ms/NonBlankString]]
                               [:models                                               [:maybe [:set SearchableModel]]]
                               [:archived                            {:optional true} [:maybe :boolean]]
                               [:created-at                          {:optional true} [:maybe ms/NonBlankString]]
                               [:created-by                          {:optional true} [:maybe [:set ms/PositiveInt]]]
                               [:filter-items-in-personal-collection {:optional true} [:maybe [:enum "only" "exclude"]]]
                               [:last-edited-at                      {:optional true} [:maybe ms/NonBlankString]]
                               [:last-edited-by                      {:optional true} [:maybe [:set ms/PositiveInt]]]
                               [:limit                               {:optional true} [:maybe ms/Int]]
                               [:offset                              {:optional true} [:maybe ms/Int]]
                               [:table-db-id                         {:optional true} [:maybe ms/PositiveInt]]
                               [:search-native-query                 {:optional true} [:maybe true?]]
                               [:model-ancestors?                    {:optional true} [:maybe boolean?]]
                               [:verified                            {:optional true} [:maybe true?]]
                               [:ids                                 {:optional true} [:maybe [:set ms/PositiveInt]]]]] :- SearchContext
  (when (some? verified)
    (premium-features/assert-has-any-features
     [:content-verification :official-collections]
     (deferred-tru "Content Management or Official Collections")))
  (let [models (if (string? models) [models] models)
        ctx    (cond-> {:search-string      search-string
                        :current-user-perms @api/*current-user-permissions-set*
                        :archived?          (boolean archived)
                        :models             models
                        :model-ancestors?   (boolean model-ancestors?)}
                 (some? created-at)                          (assoc :created-at created-at)
                 (seq created-by)                            (assoc :created-by created-by)
                 (some? filter-items-in-personal-collection) (assoc :filter-items-in-personal-collection filter-items-in-personal-collection)
                 (some? last-edited-at)                     (assoc :last-edited-at last-edited-at)
                 (seq last-edited-by)                       (assoc :last-edited-by last-edited-by)
                 (some? table-db-id)                        (assoc :table-db-id table-db-id)
                 (some? limit)                              (assoc :limit-int limit)
                 (some? offset)                             (assoc :offset-int offset)
                 (some? search-native-query)                (assoc :search-native-query search-native-query)
                 (some? verified)                           (assoc :verified verified)
                 (seq ids)                                  (assoc :ids ids))]
    (when (and (seq ids)
               (not= (count models) 1))
      (throw (ex-info (tru "Filtering by ids work only when you ask for a single model") {:status-code 400})))
    (assoc ctx :models (search.filter/search-context->applicable-models ctx))))

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
  (query-model-set (search-context {:search-string       q
                                    :archived            archived
                                    :table-db-id         table-db-id
                                    :created-at          created_at
                                    :created-by          (set (u/one-or-many created_by))
                                    :filter-items-in-personal-collection filter_items_in_personal_collection
                                    :last-edited-at      last_edited_at
                                    :last-edited-by      (set (u/one-or-many last_edited_by))
                                    :search-native-query search_native_query
                                    :verified            verified
                                    :models              search.config/all-models})))

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
  [q archived created_at created_by table_db_id models last_edited_at last_edited_by
   filter_items_in_personal_collection model_ancestors search_native_query verified ids]
  {q                                   [:maybe ms/NonBlankString]
   archived                            [:maybe :boolean]
   table_db_id                         [:maybe ms/PositiveInt]
   models                              [:maybe (ms/QueryVectorOf SearchableModel)]
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
  (let [models-set (if (seq models)
                     (set models)
                     search.config/all-models)]
    (search (search-context
             {:search-string       q
              :archived            archived
              :created-at          created_at
              :created-by          (set created_by)
              :filter-items-in-personal-collection filter_items_in_personal_collection
              :last-edited-at      last_edited_at
              :last-edited-by      (set last_edited_by)
              :table-db-id         table_db_id
              :models              models-set
              :limit               mw.offset-paging/*limit*
              :offset              mw.offset-paging/*offset*
              :model-ancestors?    model_ancestors
              :search-native-query search_native_query
              :verified            verified
              :ids                 (set ids)}))))

(api/define-routes)
