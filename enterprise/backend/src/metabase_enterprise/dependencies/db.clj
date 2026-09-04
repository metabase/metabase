(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Graph edge restrictions ------------------------------------------------
;;; The dependency graph is traversed generically over every entity type the module knows about; these private
;;; helpers build the permission and type-allowlist fragments the graph and item-list queries below restrict edges
;;; and items by.

(defn- visible-entities-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are readable by the user described by `user-id`,
  `is-superuser?`, and `is-data-analyst?`, honoring `include-archived-items` (`:exclude`, `:all`, or `:only`,
  default `:exclude`; applies to both archived collections and archived entities).

  Handles different entity types:
  - Superuser-only (`:model/Sandbox`): only if `is-superuser?` is true
  - Collection-based (`:model/Card`, `:model/Dashboard`, `:model/Document`, `:model/NativeQuerySnippet`): filters
    by collection visibility and archived status. Native query snippets have additional restrictions for
    sandboxed users.
  - Table: filters by table visibility permissions. Tables are NOT filtered by active/visibility_type regardless
    of `include-archived-items`, so dependencies broken by dropped or hidden tables stay visible.
  - Transform: analysts can view any transform they have source view permission to."
  [entity-type-field entity-id-field {:keys [user-id is-superuser? is-data-analyst? include-archived-items]
                                      :or   {include-archived-items :exclude}}]
  (into [:or]
        (keep (fn [[entity-type model]]
                (let [table-name (t2/table-name model)
                      id-column  (keyword (name table-name) "id")]
                  (case model
                    :model/Sandbox
                    (when is-superuser?
                      [:and
                       [:= entity-type-field (name entity-type)]
                       [:in entity-id-field ^:allow-subquery {:select [:id] :from [table-name]}]])

                    :model/Transform
                    (cond
                      is-superuser?
                      [:and
                       [:= entity-type-field (name entity-type)]
                       [:in entity-id-field ^:allow-subquery {:select [:id] :from [table-name]}]]

                      is-data-analyst?
                      [:and
                       [:= entity-type-field (name entity-type)]
                       [:in entity-id-field
                        ^:allow-subquery
                        {:select [:id]
                         :from   [table-name]
                         :where  [:in :source_database_id
                                  (perms/visible-database-filter-select
                                   {:user-id          user-id
                                    :is-superuser?    is-superuser?
                                    :is-data-analyst? is-data-analyst?}
                                   {:perms/create-queries :query-builder})]}]])

                    (:model/Card :model/Dashboard :model/Document :model/NativeQuerySnippet)
                    (let [archived-column (keyword (name table-name) "archived")]
                      (when-not (and (= model :model/NativeQuerySnippet)
                                     (or (perms/sandboxed-user?)
                                         (not (perms/user-has-any-perms-of-type? user-id :perms/create-queries))))
                        [:and
                         [:= entity-type-field (name entity-type)]
                         [:in entity-id-field
                          ^:allow-subquery
                          {:select [:id]
                           :from   [table-name]
                           :where  [:and
                                    (collection/visible-collection-filter-clause
                                     (keyword (name table-name) "collection_id")
                                     {:include-archived-items include-archived-items}
                                     {:current-user-id user-id
                                      :is-superuser?   is-superuser?})
                                    (case include-archived-items
                                      :exclude [:= archived-column false]
                                      :only    [:= archived-column true]
                                      :all     nil)]}]]))

                    :model/Table
                    [:and
                     [:= entity-type-field (name entity-type)]
                     [:in entity-id-field
                      ^:allow-subquery
                      {:select [:id]
                       :from   [table-name]
                       :where  [:in id-column
                                (perms/visible-table-filter-select
                                 :id
                                 {:user-id user-id :is-superuser? is-superuser?}
                                 {:perms/view-data :unrestricted :perms/create-queries :query-builder})]}]]

                    (:model/Segment :model/Measure)
                    (let [archived-column (keyword (name table-name) "archived")
                          table-id-column (keyword (name table-name) "table_id")]
                      [:and
                       [:= entity-type-field (name entity-type)]
                       [:in entity-id-field
                        ^:allow-subquery
                        {:select [:id]
                         :from   [table-name]
                         :where  [:and
                                  [:in table-id-column
                                   ^:allow-subquery
                                   {:select [:metabase_table.id]
                                    :from   [:metabase_table]
                                    :where  [:in :metabase_table.id
                                             (perms/visible-table-filter-select
                                              :id
                                              {:user-id user-id :is-superuser? is-superuser?}
                                              {:perms/view-data :unrestricted :perms/create-queries :query-builder})]}]
                                  (case include-archived-items
                                    :exclude [:= archived-column false]
                                    :only    [:= archived-column true]
                                    :all     nil)]}]])))))
        deps.dependency-types/dependency-type->model))

(defn- broken-entities-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that have failed analysis (an AnalysisFinding with
  `:result` false)."
  [entity-type-field entity-id-field]
  (into [:or]
        (keep (fn [[entity-type _model]]
                [:and
                 [:= entity-type-field (name entity-type)]
                 [:in entity-id-field
                  ^:allow-subquery
                  {:select [:analyzed_entity_id]
                   :from   [:analysis_finding]
                   :where  [:and
                            [:= :analysis_finding.analyzed_entity_type (name entity-type)]
                            [:= :analysis_finding.result false]]}]]))
        deps.dependency-types/dependency-type->model))

(defn- allowed-entity-types-expr
  "Matches entities at `entity-type-field` whose type is one of `entity-types`."
  [entity-type-field entity-types]
  (into [:or] (map (fn [entity-type] [:= entity-type-field (name entity-type)])) entity-types))

(defn- entity-ids-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are of type `entity-type` and whose id is in
  `ids`."
  [entity-type-field entity-id-field {:keys [entity-type ids]}]
  [:and [:= entity-type-field (name entity-type)] [:in entity-id-field ids]])

(defn- edge-restriction-expr
  "The combined `:where` fragment for `restriction-spec` (nil for no filter), which may include `:visible` (opts for
  [[visible-entities-expr]]), `:broken?` (restrict to [[broken-entities-expr]]), `:types` (restrict to
  [[allowed-entity-types-expr]]), or `:entity-type` + `:ids` (restrict to [[entity-ids-expr]]). Combinable
  fragments are AND-ed together."
  [entity-type-field entity-id-field {:keys [visible broken? types entity-type ids]}]
  (let [fragments (cond-> []
                    visible               (conj (visible-entities-expr entity-type-field entity-id-field visible))
                    broken?               (conj (broken-entities-expr entity-type-field entity-id-field))
                    types                 (conj (allowed-entity-types-expr entity-type-field types))
                    (and entity-type ids) (conj (entity-ids-expr entity-type-field entity-id-field
                                                                 {:entity-type entity-type :ids ids})))]
    (case (count fragments)
      0 nil
      1 (first fragments)
      (into [:and] fragments))))

(defn dependency-edges
  "The Dependencies from the entities of type `entity-type` with `entity-ids`, where `src-type`/`src-id` name the
  Dependency columns identifying those entities and `dst-type`/`dst-id` name the columns identifying the related
  entities on the other side of the edge, optionally restricted by `destination-restriction` (applied to
  `dst-type`/`dst-id`) and `source-restriction` (applied to `src-type`/`src-id`) — see [[edge-restriction-expr]] for the
  filter spec shape."
  [{:keys [src-type src-id dst-type dst-id entity-type entity-ids destination-restriction source-restriction]}]
  (t2/select :model/Dependency
             {:where (into [:and
                            [:= src-type (name entity-type)]
                            [:in src-id entity-ids]]
                           (keep identity)
                           [(edge-restriction-expr dst-type dst-id destination-restriction)
                            (edge-restriction-expr src-type src-id source-restriction)])}))

(defn finding-errors-from-sources
  "The AnalysisFindingErrors caused by any of the entities `source-entity-type` `source-entity-ids`, whose analyzed
  entity is visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [source-entity-type source-entity-ids {:keys [user-id is-superuser? is-data-analyst?]}]
  (t2/select :model/AnalysisFindingError
             {:where [:and
                      [:= :source_entity_type (name source-entity-type)]
                      [:in :source_entity_id source-entity-ids]
                      (visible-entities-expr :analyzed_entity_type :analyzed_entity_id
                                             {:user-id user-id :is-superuser? is-superuser?
                                              :is-data-analyst? is-data-analyst?})]}))

(defn finding-errors-for-entities-with-visible-sources
  "The AnalysisFindingErrors analyzing any of the entities `entity-type` `entity-ids`, excluding those whose source
  entity exists but is not visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [entity-type entity-ids {:keys [user-id is-superuser? is-data-analyst?]}]
  (t2/select :model/AnalysisFindingError
             {:where [:and
                      [:= :analyzed_entity_type (name entity-type)]
                      [:in :analyzed_entity_id entity-ids]
                      [:or
                       [:= :source_entity_type nil]
                       (visible-entities-expr :source_entity_type :source_entity_id
                                              {:user-id user-id :is-superuser? is-superuser?
                                               :is-data-analyst? is-data-analyst?})]]}))

;;; ------------------------------------------ Dependency item list queries -------------------------------------------
;;; The /graph/unreferenced and /graph/breaking endpoints union together one SELECT per entity type, each producing
;;; `entity_type`/`entity_id`/`sort_key` rows, then page and count that union. These private helpers build the
;;; per-entity-type SELECT and the pieces (joins, extra filters, sort expression) that make it up.

(defn- personal-root-collection-ids
  "The IDs of the personal Collections."
  []
  (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil] :location "/"))

(defn- entity-type-config
  "The table name and name/location column expressions to select an item list row for `entity-type`."
  [entity-type]
  (let [root-collection (collection.root/root-collection-with-ui-details
                         (case entity-type
                           :transform :transforms
                           :snippet :snippets
                           nil))]
    {:table-name (case entity-type
                   :card :report_card
                   :table :metabase_table
                   :transform :transform
                   :snippet :native_query_snippet
                   :dashboard :report_dashboard
                   :document :document
                   :sandbox :sandboxes
                   :segment :segment
                   :measure :measure)
     :name-column (case entity-type
                    :table :entity.display_name
                    :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                    :entity.name)
     :location-column (case entity-type
                        :card [:case
                               [:not= :entity.dashboard_id nil] :dashboard.name
                               [:not= :entity.document_id nil] :document.name
                               :else [:coalesce :collection.name (:name root-collection)]]
                        :table :database.name
                        (:transform :snippet :dashboard :document) [:coalesce :collection.name (:name root-collection)]
                        :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                        (:segment :measure) :table.display_name)}))

(defn- item-query-join
  "The join and join-filter for `query-type`, restricting the joined-in dependency/finding-error rows to those
  whose other-side entity passes `default-visible-restriction` (see [[edge-restriction-expr]]; this is independent of any
  archived-items override applied to the item's own visibility)."
  [query-type entity-type default-visible-restriction]
  (case query-type
    :unreferenced {:join [:dependency [:and
                                       [:= :dependency.to_entity_id :entity.id]
                                       [:= :dependency.to_entity_type (name entity-type)]
                                       (edge-restriction-expr :dependency.from_entity_type :dependency.from_entity_id
                                                              default-visible-restriction)]]
                   :join-filter [:= :dependency.id nil]}
    :broken {:join [:analysis_finding [:and
                                       [:= :analysis_finding.analyzed_entity_id :entity.id]
                                       [:= :analysis_finding.analyzed_entity_type (name entity-type)]]]
             :join-filter [:= :analysis_finding.result false]}
    :breaking {:join [:analysis_finding_error [:and
                                               [:= :analysis_finding_error.source_entity_id :entity.id]
                                               [:= :analysis_finding_error.source_entity_type (name entity-type)]
                                               (edge-restriction-expr :analysis_finding_error.analyzed_entity_type
                                                                      :analysis_finding_error.analyzed_entity_id
                                                                      default-visible-restriction)]]
               :join-filter [:!= :analysis_finding_error.id nil]}))

(defn- location-joins-for-entity
  "The set of join keywords needed for location-based operations on `entity-type`."
  [entity-type]
  (case entity-type
    :card #{:collection :dashboard :document}
    (:transform :snippet :dashboard :document) #{:collection}
    (:segment :measure) #{:table}
    :table #{:database}
    #{}))

(defn- optional-item-expr-and-joins
  "The extra `:where` fragments and joins for `params`' card-type, search-text, database, internal-content,
  archived, and personal-collection restrictions."
  [{:keys [query-type entity-type card-types search-text include-personal-collections?]}
   {:keys [name-column location-column]}]
  (let [card-type-expr (when (and (= entity-type :card) (seq card-types))
                         {:expr [:in :entity.type (mapv name card-types)]
                          :joins #{}})
        search-expr (when (and search-text (not= entity-type :sandbox))
                      (let [pattern (h2x/like-substring search-text)]
                        {:expr [:or
                                [:like [:lower name-column] pattern]
                                [:like [:lower location-column] pattern]]
                         :joins (location-joins-for-entity entity-type)}))
        database-expr (when (= entity-type :table)
                        {:expr [:and [:not :database.is_sample] [:not :database.is_audit]]
                         :joins #{:database}})
        ;; Hide system-managed (internal-user) content like Usage Analytics from the unreferenced
        ;; list — analytics dashboards have nothing pointing at them by design and would just be
        ;; noise. The breaking-items list intentionally still surfaces them, since broken analytics
        ;; deps are real signals worth showing.
        internal-content-expr (when-let [model (and (= query-type :unreferenced)
                                                    (case entity-type
                                                      :card      :model/Card
                                                      :dashboard :model/Dashboard
                                                      nil))]
                                {:expr (mi/exclude-internal-content-hsql model :table-alias :entity)
                                 :joins #{}})
        ;; note that tables are not filtered by active/visibility_type, so that dependencies
        ;; broken by dropped tables stay visible
        archived-expr (when-not (= query-type :breaking)
                        {:expr (case entity-type
                                 (:card :dashboard :document :snippet :segment :measure)
                                 [:= :entity.archived false]
                                 nil)
                         :joins #{}})
        personal-expr (when-not include-personal-collections?
                        (case entity-type
                          (:card :dashboard :document :snippet)
                          (let [personal-ids (personal-root-collection-ids)]
                            (when (seq personal-ids)
                              {:expr [:or
                                      [:= :entity.collection_id nil]
                                      [:and
                                       [:= :collection.personal_owner_id nil]
                                       (into [:and]
                                             (for [pid personal-ids]
                                               [:not-like :collection.location (str "/" pid "/%")]))]]
                               :joins #{:collection}}))
                          nil))
        results (keep identity [card-type-expr search-expr database-expr
                                internal-content-expr archived-expr personal-expr])]
    {:exprs (keep :expr results)
     :joins (reduce set/union #{} (map :joins results))}))

(defn- sort-key-expr-and-joins
  "The sort expression and extra joins for `sort-column`, restricting the `dependents-errors`/`dependents-with-errors`
  counts to finding errors whose analyzed entity passes `default-visible-restriction` (see [[edge-restriction-expr]])."
  [sort-column entity-type name-column location-column default-visible-restriction]
  (case sort-column
    :location {:sort-expr location-column
               :joins (location-joins-for-entity entity-type)}
    :dependents-errors {:sort-expr ^:allow-subquery
                        {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                                        [:concat :error_type "-" [:coalesce :error_detail ""]]
                                                        [:composite :error_type :error_detail])]]]]
                         :from [:analysis_finding_error]
                         :where [:and
                                 [:= :source_entity_id :entity.id]
                                 [:= :source_entity_type (name entity-type)]
                                 (edge-restriction-expr :analyzed_entity_type :analyzed_entity_id default-visible-restriction)]}
                        :joins #{}}
    :dependents-with-errors {:sort-expr ^:allow-subquery
                             {:select [[[:count [:distinct (if (= :mysql (mdb/db-type))
                                                             [:concat :analyzed_entity_id "-" :analyzed_entity_type]
                                                             [:composite :analyzed_entity_id :analyzed_entity_type])]]]]
                              :from [:analysis_finding_error]
                              :where [:and
                                      [:= :source_entity_id :entity.id]
                                      [:= :source_entity_type (name entity-type)]
                                      (edge-restriction-expr :analyzed_entity_type :analyzed_entity_id default-visible-restriction)]}
                             :joins #{}}
    {:sort-expr name-column
     :joins #{}}))

(defn- build-left-joins
  "`base-join` with the LEFT JOINs needed for `joins` (a set of `:database`, `:collection`, `:dashboard`,
  `:document`, and/or `:table`) appended."
  [base-join joins]
  (cond-> base-join
    (:database joins) (conj [:metabase_database :database] [:= :entity.db_id :database.id])
    (:collection joins) (conj :collection [:= :entity.collection_id :collection.id])
    (:dashboard joins) (conj [:report_dashboard :dashboard] [:= :entity.dashboard_id :dashboard.id])
    (:document joins) (conj :document [:= :entity.document_id :document.id])
    (:table joins) (conj [:metabase_table :table] [:= :entity.table_id :table.id])))

(defn- dependency-item-select
  "The per-entity-type SELECT that [[dependency-item-ids]] and [[dependency-item-count]] union together, matching
  `query-type` (`:unreferenced` or `:breaking`) items of `entity-type`, restricted to `card-types`, `search-text`,
  and `include-personal-collections?`, visible to the user described by `user-id`, `is-superuser?`, and
  `is-data-analyst?`, with `sort-column`'s expression selected as `:sort_key`. Throws when `user-id` is missing,
  since the visibility restriction must always be applied."
  [{:keys [query-type entity-type sort-column user-id is-superuser? is-data-analyst?] :as params}]
  (when-not user-id
    (throw (ex-info "dependency-item-select requires a user-id so the visibility restriction is always applied"
                    {:query-type query-type :entity-type entity-type})))
  (let [{:keys [table-name name-column location-column] :as config} (entity-type-config entity-type)
        visible {:user-id user-id :is-superuser? is-superuser? :is-data-analyst? is-data-analyst?}
        default-visible-restriction {:visible visible}
        ;; The item's own visibility check includes archived items when listing what's breaking other entities,
        ;; so dependencies broken by an archived source still surface; nothing else is affected by this.
        item-visible-restriction (cond-> default-visible-restriction
                                   (= query-type :breaking) (assoc-in [:visible :include-archived-items] :all))
        {:keys [join join-filter]} (item-query-join query-type entity-type default-visible-restriction)
        {:keys [exprs joins]} (optional-item-expr-and-joins params config)
        {sort-expr :sort-expr sort-joins :joins} (sort-key-expr-and-joins sort-column entity-type name-column
                                                                          location-column default-visible-restriction)
        all-joins (set/union joins sort-joins)
        item-visible-expr (edge-restriction-expr (name entity-type) :entity.id item-visible-restriction)
        select-clause [[^:allow-raw-sql [:inline (name entity-type)] :entity_type]
                       [:entity.id :entity_id]
                       [sort-expr :sort_key]]]
    ^:allow-subquery
    {(if (= query-type :breaking) :select-distinct :select) select-clause
     :from [[table-name :entity]]
     :left-join (build-left-joins join all-joins)
     :where (into [:and join-filter item-visible-expr] (keep identity) exprs)}))

(defn dependency-item-ids
  "A page of `[entity-type entity-id]` pairs for `query-type` (`:unreferenced` or `:breaking`), restricted to
  `entity-types`, `card-types` (applied only to `:card` entities), `search-text` (nil for none), and
  `include-personal-collections?`; sorted by `sort-column` (`:name`, `:location`, `:dependents-errors`, or
  `:dependents-with-errors`) in `sort-direction`, skipping `offset` and returning up to `limit`. Entities are
  restricted to those visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`; throws
  when `user-id` is missing."
  [{:keys [entity-types sort-direction offset limit] :as params}]
  (let [union-query ^:allow-subquery {:union-all (mapv #(dependency-item-select (assoc params :entity-type %))
                                                       entity-types)}]
    (->> (t2/query (assoc union-query
                          :order-by [[:sort_key sort-direction] [:entity_id sort-direction] [:entity_type sort-direction]]
                          :offset offset
                          :limit limit))
         (map (fn [{:keys [entity_id entity_type]}] [(keyword entity_type) entity_id])))))

(defn dependency-item-count
  "The total count of items matching the same criteria as [[dependency-item-ids]] (ignoring sort direction, offset,
  and limit); throws when `user-id` is missing."
  [{:keys [entity-types] :as params}]
  (let [union-query ^:allow-subquery {:union-all (mapv #(dependency-item-select (assoc params :entity-type %))
                                                       entity-types)}]
    (-> (t2/query {:select [[:%count.* :total]] :from [[union-query :subquery]]})
        first
        :total)))

(defn broken-entity-pairs
  "The `[:analyzed_entity_type :analyzed_entity_id]` pairs whose analysis failed and were caused by the entity
  `source-entity-type` `source-entity-id`, restricted to `dependent-types` and `dependent-card-types` (each nil
  for no restriction), visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [{:keys [source-entity-type source-entity-id dependent-types dependent-card-types
           user-id is-superuser? is-data-analyst?]}]
  (t2/query
   (cond-> {:select-distinct [[:afe.analyzed_entity_type :entity_type] [:afe.analyzed_entity_id :entity_id]]
            :from [[:analysis_finding_error :afe]]
            :join [[:analysis_finding :af]
                   [:and
                    [:= :af.analyzed_entity_type :afe.analyzed_entity_type]
                    [:= :af.analyzed_entity_id :afe.analyzed_entity_id]]]
            :where (cond-> [:and
                            [:= :afe.source_entity_type (name source-entity-type)]
                            [:= :afe.source_entity_id source-entity-id]
                            [:= :af.result false]
                            (visible-entities-expr :afe.analyzed_entity_type :afe.analyzed_entity_id
                                                   {:user-id user-id :is-superuser? is-superuser?
                                                    :is-data-analyst? is-data-analyst?
                                                    :include-archived-items :exclude})]
                     dependent-types      (conj [:in :afe.analyzed_entity_type dependent-types])
                     dependent-card-types (conj [:or
                                                 [:!= :afe.analyzed_entity_type "card"]
                                                 [:in :rc.type dependent-card-types]]))}
     dependent-card-types (assoc :left-join [[:report_card :rc]
                                             [:and
                                              [:= :afe.analyzed_entity_type "card"]
                                              [:= :rc.id :afe.analyzed_entity_id]]]))))

;;; ---------------------------------------------------- Entities ----------------------------------------------------

(defn instances
  "The instances of the entity type `entity-type` with `ids`."
  [entity-type ids]
  (t2/select (deps.dependency-types/dependency-type->model entity-type) :id [:in ids]))

(defn instances-with-columns
  "The `columns` of the instances of the entity type `entity-type` with `ids`."
  [entity-type columns ids]
  (t2/select (into [(deps.dependency-types/dependency-type->model entity-type)] columns) :id [:in ids]))

(defn instance-with-columns
  "The `columns` of the instance of the entity type `entity-type` with `id`, or nil."
  [entity-type columns id]
  (t2/select-one (into [(deps.dependency-types/dependency-type->model entity-type)] columns) :id id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn card-types-by-id
  "A map of Card ID to type for `card-ids`."
  [card-ids]
  (t2/select-fn->fn :id :type [:model/Card :id :type :card_schema] :id [:in card-ids]))

(defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`."
  [card-id result-metadata]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn table-database-ids
  "The `:id` and `:db_id` of the Tables with `table-ids`."
  [table-ids]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids]))

(defn table-id-by-name
  "The ID of the Table named `table-name` in `schema` of the Database with `db-id`, or nil."
  [db-id schema table-name]
  (t2/select-one-fn :id :model/Table :db_id db-id :schema schema :name table-name))

(defn transform-sources
  "The `:id` and `:source` of the Transforms with `transform-ids`."
  [transform-ids]
  (t2/select [:model/Transform :id :source] :id [:in transform-ids]))

(defn transform-ids-of-source-database
  "The IDs of the Transforms reading from the Database with `db-id`."
  [db-id]
  (t2/select-pks-set :model/Transform :source_database_id db-id))

;;; -------------------------------------------------- Dependencies --------------------------------------------------

(defn dependencies-from
  "The `:id`, `:to_entity_type`, and `:to_entity_id` of the Dependencies of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (t2/select [:model/Dependency :id :to_entity_type :to_entity_id]
             :from_entity_type entity-type
             :from_entity_id entity-id))

(defn dependency-exists?
  "Whether the entity `from-type` `from-id` depends on the entity `to-type` `to-id`."
  [from-type from-id to-type to-id]
  (t2/exists? :model/Dependency
              :from_entity_type from-type :from_entity_id from-id
              :to_entity_type to-type :to_entity_id to-id))

(defn insert-dependencies!
  "Insert the Dependency `rows`."
  [rows]
  (t2/insert! :model/Dependency rows))

(defn retarget-dependency!
  "Point the Dependency of the entity `from-type` `from-id` on the entity `old-to-type` `old-to-id` at the entity
  `new-to-type` `new-to-id`."
  [from-type from-id old-to-type old-to-id new-to-type new-to-id]
  (t2/update! :model/Dependency
              {:from_entity_type from-type :from_entity_id from-id
               :to_entity_type old-to-type :to_entity_id old-to-id}
              {:to_entity_type new-to-type :to_entity_id new-to-id}))

(defn delete-dependencies!
  "Delete the Dependencies with `dependency-ids`."
  [dependency-ids]
  (t2/delete! :model/Dependency :id [:in dependency-ids]))

(defn delete-dependency!
  "Delete the Dependency of the entity `from-type` `from-id` on the entity `to-type` `to-id`."
  [from-type from-id to-type to-id]
  (t2/delete! :model/Dependency
              :from_entity_type from-type :from_entity_id from-id
              :to_entity_type to-type :to_entity_id to-id))

(defn delete-dependencies-from!
  "Delete the Dependencies of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (t2/delete! :model/Dependency :from_entity_type entity-type :from_entity_id entity-id))

(defn downstream-table-ids-of-transform
  "The IDs of the Tables that depend on the Transform with `transform-id`."
  [transform-id]
  (t2/select-fn-set :from_entity_id :model/Dependency
                    :from_entity_type :table
                    :to_entity_type   :transform
                    :to_entity_id     transform-id))

(defn delete-table-dependencies-on-transform!
  "Delete the Dependencies of the Tables with `table-ids` on the Transform with `transform-id`."
  [table-ids transform-id]
  (t2/delete! :model/Dependency
              :from_entity_type :table
              :from_entity_id   [:in table-ids]
              :to_entity_type   :transform
              :to_entity_id     transform-id))

;;; ------------------------------------------------ Dependency status ------------------------------------------------

(defn dependency-status
  "The DependencyStatus of the entity `entity-type` `entity-id`, or nil."
  [entity-type entity-id]
  (t2/select-one :model/DependencyStatus :entity_type entity-type :entity_id entity-id))

(defn delete-dependency-status!
  "Delete the DependencyStatus of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (t2/delete! :model/DependencyStatus :entity_type entity-type :entity_id entity-id))

(defn pending-retry-exists?
  "Whether a non-terminal DependencyStatus is waiting for a retry."
  []
  (t2/exists? :model/DependencyStatus :terminal false :next_retry_at [:not= nil]))

(defn instances-for-dependency-calculation
  "Up to `batch-size` instances of the entity type `entity-type` without a DependencyStatus, or whose status is
  stale or below `current-version`, is not terminal, and whose retry time has passed at `now`; stale ones first."
  [entity-type batch-size current-version now]
  (let [model          (deps.dependency-types/dependency-type->model entity-type)
        table-name     (t2/table-name model)
        id-field       (keyword (name table-name) "id")
        table-wildcard (keyword (name table-name) "*")]
    (t2/select model
               {:select    [table-wildcard]
                :from      table-name
                :left-join [:dependency_status [:and
                                                [:= :dependency_status.entity_id id-field]
                                                [:= :dependency_status.entity_type (name entity-type)]]]
                :where     [:or
                            [:= :dependency_status.entity_id nil]
                            [:and
                             [:or
                              [:= :dependency_status.stale true]
                              [:< :dependency_status.dependency_analysis_version current-version]]
                             [:= :dependency_status.terminal false]
                             [:or
                              [:is :dependency_status.next_retry_at nil]
                              [:<= :dependency_status.next_retry_at now]]]]
                :order-by  [[[:case [:= :dependency_status.stale true] [:inline 0] :else [:inline 1]]]]
                :limit     batch-size})))

;;; ------------------------------------------------ Analysis findings ------------------------------------------------

(defn finding-id
  "The ID of the AnalysisFinding of the entity `entity-type` `entity-id`, or nil."
  [entity-type entity-id]
  (t2/select-one-fn :id [:model/AnalysisFinding :id]
                    :analyzed_entity_type entity-type
                    :analyzed_entity_id entity-id))

(defn insert-finding!
  "Insert the AnalysisFinding `row`."
  [row]
  (t2/insert! :model/AnalysisFinding row))

(defn update-finding!
  "Apply `changes` to the AnalysisFinding with `finding-id`."
  [finding-id changes]
  (t2/update! :model/AnalysisFinding finding-id changes))

(defn mark-findings-stale!
  "Mark the AnalysisFindings of the entities `entity-type` `entity-ids` as stale."
  [entity-type entity-ids]
  (t2/update! :model/AnalysisFinding
              :analyzed_entity_type entity-type
              :analyzed_entity_id [:in entity-ids]
              {:stale true}))

(defn stale-finding-exists?
  "Whether a stale AnalysisFinding exists."
  []
  (t2/exists? :model/AnalysisFinding :stale true))

(defn stale-finding-count
  "The number of stale AnalysisFindings."
  []
  (t2/count :model/AnalysisFinding :stale true))

(defn instances-for-analysis
  "Up to `batch-size` instances of the entity type `entity-type` whose AnalysisFinding is stale, missing, or below
  `current-version`; stale ones first, then the longest unanalyzed."
  [entity-type batch-size current-version]
  (let [model          (deps.dependency-types/dependency-type->model entity-type)
        table-name     (t2/table-name model)
        id-field       (keyword (name table-name) "id")
        table-wildcard (keyword (name table-name) "*")]
    (t2/select model
               {:select    [table-wildcard]
                :from      table-name
                :left-join [:analysis_finding [:and
                                               [:= :analysis_finding.analyzed_entity_id id-field]
                                               [:= :analysis_finding.analyzed_entity_type (name entity-type)]]]
                :where     [:or
                            [:= :analysis_finding.stale true]
                            [:<
                             [:coalesce :analysis_finding.analysis_version 0]
                             current-version]]
                :order-by  [[[:case [:= :analysis_finding.stale true] [:inline 0] :else [:inline 1]]]
                            [:analysis_finding.analyzed_at :asc]]
                :limit     batch-size})))

(defn table-ids-with-outdated-findings
  "The IDs of the Tables of the Database with `db-id` whose dependents were analyzed before the Table or one of
  its Fields last changed."
  [db-id]
  (t2/select-fn-set :table_id :model/AnalysisFinding
                    {:select     [:field_updates/table_id]
                     :from       [[^:allow-subquery {:select    [[:table/id :table_id]
                                                                 [:table/updated_at :last_table_update]
                                                                 [[:max :field/updated_at] :last_field_update]]
                                                     :from      [[(t2/table-name :model/Table) :table]]
                                                     :left-join [[(t2/table-name :model/Field) :field]
                                                                 [:= :field/table_id :table/id]]
                                                     :where     [:= :table/db_id db-id]
                                                     :group-by  [:table/id
                                                                 :table/updated_at]}
                                   :field_updates]]
                     :inner-join [[(t2/table-name :model/Dependency) :dep]
                                  [:and
                                   [:= :dep/to_entity_type "table"]
                                   [:= :field_updates/table_id :dep/to_entity_id]]
                                  [(t2/table-name :model/AnalysisFinding) :finding]
                                  [:and
                                   [:= :finding/analyzed_entity_type :dep/from_entity_type]
                                   [:= :finding/analyzed_entity_id   :dep/from_entity_id]]]
                     :where      [:and
                                  [:!= :finding/analyzed_entity_id nil]
                                  [:or
                                   [:< :finding/analyzed_at :field_updates/last_table_update]
                                   [:< :finding/analyzed_at :field_updates/last_field_update]]]}))

;;; --------------------------------------------- Analysis finding errors ---------------------------------------------

(defn finding-errors-for-entity
  "The AnalysisFindingErrors of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (t2/select :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))

(defn finding-errors-from-source
  "The AnalysisFindingErrors caused by the entity `source-type` `source-id`."
  [source-type source-id]
  (t2/select :model/AnalysisFindingError :source_entity_type source-type :source_entity_id source-id))

(defn insert-finding-errors!
  "Insert the AnalysisFindingError `rows`."
  [rows]
  (t2/insert! :model/AnalysisFindingError rows))

(defn delete-finding-errors-for-entity!
  "Delete the AnalysisFindingErrors of the entity `entity-type` `entity-id`."
  [entity-type entity-id]
  (t2/delete! :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))
