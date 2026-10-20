(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module, so the rest of the module only touches `toucan2.core` for
  model definitions, hydration methods, and transactions."
  (:require
   [clojure.set :as set]
   [malli.util :as mut]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def ^:private Column
  "A Honey SQL column keyword, or a string literal standing in for one."
  [:or :keyword :string])

(def ^:private Join
  "A LEFT JOIN [[build-left-joins]] adds."
  [:enum :collection :dashboard :database :document :table])

(def ^:private HoneySQLForm
  "A Honey SQL expression or query map."
  [:or ::h2x/honeysql-expr ::h2x/honeysql-clause-opts])

;;; ------------------------------------------------ Graph edge restrictions ------------------------------------------------
;;; The dependency graph is traversed generically over every entity type the module knows about; these private
;;; helpers build the permission and type-allowlist fragments the graph and item-list queries below restrict edges
;;; and items by.

(mu/defn- visible-entities-expr :- ::h2x/honeysql-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are readable by the user described by `user-id`,
  `is-superuser?`, and `is-data-analyst?`, honoring `include-archived-items` (`:exclude`, `:all`, or `:only`,
  default `:exclude`; applies to both archived collections and archived entities).

  Handles different entity types:
  - Superuser-only (`:model/Sandbox`): only if `is-superuser?` is true
  - Collection-based (`:model/Card`, `:model/Dashboard`, `:model/Document`, `:model/NativeQuerySnippet`,
    `:model/Action`): filters
    by collection visibility and archived status. Native query snippets have additional restrictions for
    sandboxed users.
  - Table: filters by table visibility permissions. Tables are NOT filtered by active/visibility_type regardless
    of `include-archived-items`, so dependencies broken by dropped or hidden tables stay visible.
  - Transform: analysts can view any transform they have source view permission to."
  [entity-type-field :- Column
   entity-id-field   :- Column
   {:keys [user-id is-superuser? is-data-analyst? include-archived-items]
    :or   {include-archived-items :exclude}} :- ::dependencies.schema/visible-opts]
  (into [:or]
        (keep (fn [[entity-type model]]
                (let [table-name (t2/table-name model)
                      id-column  (u/qualified-key table-name :id)]
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

                    (:model/Card :model/Dashboard :model/Document :model/NativeQuerySnippet :model/Action)
                    (let [archived-column (u/qualified-key table-name :archived)
                          visible-in-root (fn [root-namespace]
                                            (collection/visible-collection-filter-clause
                                             (u/qualified-key table-name :collection_id)
                                             {:include-archived-items include-archived-items
                                              :root-namespace         root-namespace}
                                             {:current-user-id user-id
                                              :is-superuser?   is-superuser?}))]
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
                                    (case model
                                      :model/NativeQuerySnippet (visible-in-root collection/snippets-ns)
                                      :model/Action             [:or
                                                                 [:and
                                                                  [:not= :action.model_id nil]
                                                                  (visible-in-root nil)]
                                                                 [:and
                                                                  [:= :action.model_id nil]
                                                                  (visible-in-root collection/data-actions-ns)]]
                                      (visible-in-root nil))
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
                    (let [archived-column (u/qualified-key table-name :archived)
                          table-id-column (u/qualified-key table-name :table_id)]
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

(mu/defn- broken-entities-expr :- ::h2x/honeysql-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that have failed analysis (an AnalysisFinding with
  `:result` false)."
  [entity-type-field :- Column
   entity-id-field   :- Column]
  (into [:or]
        (keep (fn [[entity-type _model]]
                [:and
                 [:= entity-type-field (name entity-type)]
                 [:in entity-id-field
                  ^:allow-subquery
                  {:select [:entity_id]
                   :from   [:analysis_finding]
                   :where  [:and
                            [:= :analysis_finding.entity_type (name entity-type)]
                            [:= :analysis_finding.result false]]}]]))
        deps.dependency-types/dependency-type->model))

(mu/defn- allowed-entity-types-expr :- ::h2x/honeysql-expr
  "Matches entities at `entity-type-field` whose type is one of `entity-types`."
  [entity-type-field :- Column
   entity-types      :- [:set ::dependencies.schema/entity-type]]
  (into [:or] (map (fn [entity-type] [:= entity-type-field (name entity-type)])) entity-types))

(mu/defn- entity-ids-expr :- ::h2x/honeysql-expr
  "Matches entities at `entity-type-field`/`entity-id-field` that are of type `entity-type` and whose id is in
  `ids`."
  [entity-type-field          :- Column
   entity-id-field            :- Column
   {:keys [entity-type ids]}  :- [:map {:closed true}
                                  [:entity-type ::dependencies.schema/entity-type]
                                  [:ids         [:sequential ::deps.dependency-types/entity-id]]]]
  [:and [:= entity-type-field (name entity-type)] [:in entity-id-field ids]])

(mu/defn- edge-restriction-expr :- [:maybe ::h2x/honeysql-expr]
  "The combined `:where` fragment for `restriction-spec` (nil for no filter), which may include `:visible` (opts for
  [[visible-entities-expr]]), `:broken?` (restrict to [[broken-entities-expr]]), `:types` (restrict to
  [[allowed-entity-types-expr]]), or `:entity-type` + `:ids` (restrict to [[entity-ids-expr]]). Combinable
  fragments are AND-ed together."
  [entity-type-field                              :- Column
   entity-id-field                                :- Column
   {:keys [visible broken? types entity-type ids]} :- ::dependencies.schema/edge-restriction]
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

(mu/defn dependency-edges
  "The Dependencies from the entities of type `entity-type` with `entity-ids`, where `src-type`/`src-id` name the
  Dependency columns identifying those entities and `dst-type`/`dst-id` name the columns identifying the related
  entities on the other side of the edge, optionally restricted by `destination-restriction` (applied to
  `dst-type`/`dst-id`) and `source-restriction` (applied to `src-type`/`src-id`) — see [[edge-restriction-expr]] for the
  filter spec shape."
  [{:keys [src-type src-id dst-type dst-id entity-type entity-ids destination-restriction source-restriction]}
   :- [:map {:closed true}
       [:src-type [:enum :from_entity_type :to_entity_type]]
       [:src-id   [:enum :from_entity_id :to_entity_id]]
       [:dst-type [:enum :from_entity_type :to_entity_type]]
       [:dst-id   [:enum :from_entity_id :to_entity_id]]
       [:entity-type ::dependencies.schema/entity-type]
       [:entity-ids [:sequential ::deps.dependency-types/entity-id]]
       [:destination-restriction ::dependencies.schema/edge-restriction]
       [:source-restriction ::dependencies.schema/edge-restriction]]]
  (into []
        (mapcat (fn [batch]
                  (t2/select :model/Dependency
                             {:where (into [:and
                                            [:= src-type (name entity-type)]
                                            [:in src-id batch]]
                                           (keep identity)
                                           [(edge-restriction-expr dst-type dst-id destination-restriction)
                                            (edge-restriction-expr src-type src-id source-restriction)])})))
        (partition-all 1000 entity-ids)))

(mu/defn finding-errors-from-sources
  "The AnalysisFindingErrors caused by any of the entities `source-entity-type` `source-entity-ids`, whose analyzed
  entity is visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [source-entity-type  :- ::dependencies.schema/entity-type
   source-entity-ids   :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- ::dependencies.schema/visible-opts]
  (t2/select :model/AnalysisFindingError
             {:where [:and
                      [:= :source_entity_type (name source-entity-type)]
                      [:in :source_entity_id source-entity-ids]
                      (visible-entities-expr :analyzed_entity_type :analyzed_entity_id
                                             {:user-id user-id :is-superuser? is-superuser?
                                              :is-data-analyst? is-data-analyst?})]}))

(mu/defn finding-errors-for-entities-with-visible-sources
  "The AnalysisFindingErrors analyzing any of the entities `entity-type` `entity-ids`, excluding those whose source
  entity exists but is not visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- ::dependencies.schema/visible-opts]
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

(def ^:private DependencyItemParams
  "Params shared by [[dependency-item-ids]] and [[dependency-item-count]]."
  [:map {:closed true}
   [:query-type [:enum :unreferenced :breaking]]
   [:entity-types [:sequential ::deps.dependency-types/dependency-types]]
   [:card-types {:optional true} [:maybe [:sequential [:or :keyword :string]]]]
   [:search-text {:optional true} [:maybe :string]]
   [:include-personal-collections? :boolean]
   [:sort-column {:optional true} [:maybe [:enum :name :location :dependents-errors :dependents-with-errors]]]
   [:sort-direction [:enum :asc :desc]]
   [:offset ms/IntGreaterThanOrEqualToZero]
   [:limit ms/PositiveInt]
   [:user-id ::lib.schema.id/user]
   [:is-superuser? {:optional true} [:maybe :boolean]]
   [:is-data-analyst? {:optional true} [:maybe :boolean]]])

(def ^:private DependencyItemSelectParams
  "The [[DependencyItemParams]] of the SELECT of one `:entity-type`."
  (mut/assoc DependencyItemParams :entity-type ::deps.dependency-types/dependency-types))

(mu/defn- personal-root-collection-ids :- [:sequential ::lib.schema.id/collection]
  "The IDs of the personal Collections."
  []
  (or (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil] :location "/") []))

(mu/defn action-root-namespace :- [:maybe [:= :data-actions]]
  "The namespace of the root collection an action without a collection sits in: the data actions root for a
  `model-less?` action, and the default root for an action of a model."
  [model-less? :- :boolean]
  (when model-less?
    :data-actions))

(def ^:private EntityTypeConfig
  "What [[entity-type-config]] returns for an entity type."
  [:map {:closed true}
   [:table-name      [:or :keyword ::h2x/honeysql-clause-opts]]
   [:name-column     ::h2x/honeysql-expr]
   [:location-column ::h2x/honeysql-expr]])

(mu/defn- entity-type-config :- EntityTypeConfig
  "The table name and name/location column expressions to select an item list row for `entity-type`."
  [entity-type :- ::deps.dependency-types/dependency-types]
  (let [root-collection (collection.root/root-collection-with-ui-details
                         (case entity-type
                           :transform :transforms
                           :snippet :snippets
                           nil))]
    {:table-name (case entity-type
                   :card :report_card
                   :table (first (warehouse-schema-overlay/table-query))
                   :transform :transform
                   :snippet :native_query_snippet
                   :dashboard :report_dashboard
                   :document :document
                   :sandbox :sandboxes
                   :segment :segment
                   :measure :measure
                   :action :action)
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
                        :action [:coalesce
                                 :collection.name
                                 [:case
                                  [:= :entity.model_id nil]
                                  (:name (collection.root/root-collection-with-ui-details (action-root-namespace true)))
                                  :else
                                  (:name (collection.root/root-collection-with-ui-details (action-root-namespace false)))]]
                        :sandbox [:cast :entity.id (if (= :mysql (mdb/db-type)) :char :text)]
                        (:segment :measure) :table.display_name)}))

(mu/defn- item-query-join :- [:map {:closed true}
                              [:join        [:sequential HoneySQLForm]]
                              [:join-filter ::h2x/honeysql-expr]]
  "The join and join-filter for `query-type`, restricting the joined-in dependency/finding-error rows to those
  whose other-side entity passes `default-visible-restriction` (see [[edge-restriction-expr]]; this is independent of any
  archived-items override applied to the item's own visibility)."
  [query-type                  :- [:enum :unreferenced :broken :breaking]
   entity-type                 :- ::deps.dependency-types/dependency-types
   default-visible-restriction :- ::dependencies.schema/edge-restriction]
  (case query-type
    :unreferenced {:join [:dependency [:and
                                       [:= :dependency.to_entity_id :entity.id]
                                       [:= :dependency.to_entity_type (name entity-type)]
                                       (edge-restriction-expr :dependency.from_entity_type :dependency.from_entity_id
                                                              default-visible-restriction)]]
                   :join-filter [:= :dependency.id nil]}
    :broken {:join [:analysis_finding [:and
                                       [:= :analysis_finding.entity_id :entity.id]
                                       [:= :analysis_finding.entity_type (name entity-type)]]]
             :join-filter [:= :analysis_finding.result false]}
    :breaking {:join [:analysis_finding_error [:and
                                               [:= :analysis_finding_error.source_entity_id :entity.id]
                                               [:= :analysis_finding_error.source_entity_type (name entity-type)]
                                               (edge-restriction-expr :analysis_finding_error.analyzed_entity_type
                                                                      :analysis_finding_error.analyzed_entity_id
                                                                      default-visible-restriction)]]
               :join-filter [:!= :analysis_finding_error.id nil]}))

(mu/defn- location-joins-for-entity :- [:set Join]
  "The set of join keywords needed for location-based operations on `entity-type`."
  [entity-type :- ::deps.dependency-types/dependency-types]
  (case entity-type
    :card #{:collection :dashboard :document}
    (:transform :snippet :dashboard :document :action) #{:collection}
    (:segment :measure) #{:table}
    :table #{:database}
    #{}))

(mu/defn- optional-item-expr-and-joins :- [:map {:closed true}
                                           [:exprs [:sequential ::h2x/honeysql-expr]]
                                           [:joins [:set Join]]]
  "The extra `:where` fragments and joins for `params`' card-type, search-text, database, internal-content,
  archived, and personal-collection restrictions."
  [{:keys [query-type entity-type card-types search-text include-personal-collections?]} :- DependencyItemSelectParams
   {:keys [name-column location-column]}                                                  :- EntityTypeConfig]
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
                                 (:card :dashboard :document :snippet :segment :measure :action)
                                 [:= :entity.archived false]
                                 nil)
                         :joins #{}})
        personal-expr (when-not include-personal-collections?
                        (case entity-type
                          (:card :dashboard :document :snippet :action)
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

(mu/defn- sort-key-expr-and-joins :- [:map {:closed true}
                                      [:sort-expr HoneySQLForm]
                                      [:joins     [:set Join]]]
  "The sort expression and extra joins for `sort-column`, restricting the `dependents-errors`/`dependents-with-errors`
  counts to finding errors whose analyzed entity passes `default-visible-restriction` (see [[edge-restriction-expr]])."
  [sort-column                 :- [:maybe [:enum :name :location :dependents-errors :dependents-with-errors]]
   entity-type                 :- ::deps.dependency-types/dependency-types
   name-column                 :- ::h2x/honeysql-expr
   location-column             :- ::h2x/honeysql-expr
   default-visible-restriction :- ::dependencies.schema/edge-restriction]
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

(mu/defn- build-left-joins :- [:sequential HoneySQLForm]
  "`base-join` with the LEFT JOINs needed for `joins` (a set of `:database`, `:collection`, `:dashboard`,
  `:document`, and/or `:table`) appended."
  [base-join :- [:sequential HoneySQLForm]
   joins     :- [:set Join]]
  (cond-> base-join
    (:database joins) (conj [:metabase_database :database] [:= :entity.db_id :database.id])
    (:collection joins) (conj :collection [:= :entity.collection_id :collection.id])
    (:dashboard joins) (conj [:report_dashboard :dashboard] [:= :entity.dashboard_id :dashboard.id])
    (:document joins) (conj :document [:= :entity.document_id :document.id])
    (:table joins) (conj (warehouse-schema-overlay/table-query {:alias :table}) [:= :entity.table_id :table.id])))

(mu/defn- dependency-item-select :- ::h2x/honeysql-clause-opts
  "The per-entity-type SELECT that [[dependency-item-ids]] and [[dependency-item-count]] union together, matching
  `query-type` (`:unreferenced` or `:breaking`) items of `entity-type`, restricted to `card-types`, `search-text`,
  and `include-personal-collections?`, visible to the user described by `user-id`, `is-superuser?`, and
  `is-data-analyst?`, with `sort-column`'s expression selected as `:sort_key`. Throws when `user-id` is missing,
  since the visibility restriction must always be applied."
  [{:keys [query-type entity-type sort-column user-id is-superuser? is-data-analyst?] :as params}
   :- DependencyItemSelectParams]
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
        ;; a plain string here compiles to a `?` parameter, and H2 can't work out the type of a parameter in the
        ;; select list of a derived table -- `h2x/literal` emits a real quoted SQL literal instead. The value comes
        ;; from the closed `dependency-types` enum, never from user input.
        select-clause [[(h2x/literal (name entity-type)) :entity_type]
                       [:entity.id :entity_id]
                       [sort-expr :sort_key]]]
    ^:allow-subquery
    {(if (= query-type :breaking) :select-distinct :select) select-clause
     :from [[table-name :entity]]
     :left-join (build-left-joins join all-joins)
     :where (into [:and join-filter item-visible-expr] (keep identity) exprs)}))

(mu/defn dependency-item-ids
  "A page of `[entity-type entity-id]` pairs for `query-type` (`:unreferenced` or `:breaking`), restricted to
  `entity-types`, `card-types` (applied only to `:card` entities), `search-text` (nil for none), and
  `include-personal-collections?`; sorted by `sort-column` (`:name`, `:location`, `:dependents-errors`, or
  `:dependents-with-errors`) in `sort-direction`, skipping `offset` and returning up to `limit`. Entities are
  restricted to those visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`; throws
  when `user-id` is missing."
  [{:keys [entity-types sort-direction offset limit] :as params} :- DependencyItemParams]
  (let [union-query ^:allow-subquery {:union-all (mapv #(dependency-item-select (assoc params :entity-type %))
                                                       entity-types)}]
    (->> (t2/query (assoc union-query
                          :order-by [[:sort_key sort-direction] [:entity_id sort-direction] [:entity_type sort-direction]]
                          :offset offset
                          :limit limit))
         (map (fn [{:keys [entity_id entity_type]}] [(keyword entity_type) entity_id])))))

(mu/defn dependency-item-count
  "The total count of items matching the same criteria as [[dependency-item-ids]] (ignoring sort direction, offset,
  and limit); throws when `user-id` is missing."
  [{:keys [entity-types] :as params} :- DependencyItemParams]
  (let [union-query ^:allow-subquery {:union-all (mapv #(dependency-item-select (assoc params :entity-type %))
                                                       entity-types)}]
    (-> (t2/query {:select [[:%count.* :total]] :from [[union-query :subquery]]})
        first
        :total)))

(mu/defn broken-entity-pairs
  "The `[:analyzed_entity_type :analyzed_entity_id]` pairs whose analysis failed and were caused by the entity
  `source-entity-type` `source-entity-id`, restricted to `dependent-types` and `dependent-card-types` (each nil
  for no restriction), visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [{:keys [source-entity-type source-entity-id dependent-types dependent-card-types
           user-id is-superuser? is-data-analyst?]}
   :- [:map {:closed true}
       [:source-entity-type ::dependencies.schema/entity-type]
       [:source-entity-id ms/PositiveInt]
       [:dependent-types {:optional true} [:maybe [:sequential :string]]]
       [:dependent-card-types {:optional true} [:maybe [:sequential :string]]]
       [:user-id ::lib.schema.id/user]
       [:is-superuser? {:optional true} [:maybe :boolean]]
       [:is-data-analyst? {:optional true} [:maybe :boolean]]]]
  (t2/query
   (cond-> {:select-distinct [[:afe.analyzed_entity_type :entity_type] [:afe.analyzed_entity_id :entity_id]]
            :from [[:analysis_finding_error :afe]]
            :join [[:analysis_finding :af]
                   [:and
                    [:= :af.entity_type :afe.analyzed_entity_type]
                    [:= :af.entity_id :afe.analyzed_entity_id]]]
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

(mu/defn entities
  "The entities of the entity type `entity-type` with `ids`."
  [entity-type :- ::deps.dependency-types/dependency-types
   ids         :- [:set ::deps.dependency-types/entity-id]]
  (t2/select (deps.dependency-types/dependency-type->model entity-type) :id [:in ids]))

(mu/defn- entity-source :- [:map {:closed true}
                            [:from {:optional true} [:sequential HoneySQLForm]]]
  "What a read of `entity-type` selects from: the overlay for a Table, else the model's own table."
  [entity-type :- ::deps.dependency-types/dependency-types]
  (if (= entity-type :table)
    {:from [(warehouse-schema-overlay/table-query)]}
    {}))

(mu/defn entities-with-columns
  "The `columns` of the entities of the entity type `entity-type` with `ids`."
  [entity-type :- ::deps.dependency-types/dependency-types
   columns     :- [:sequential :keyword]
   ids         :- [:sequential ::deps.dependency-types/entity-id]]
  (t2/select (into [(deps.dependency-types/dependency-type->model entity-type)] columns)
             :id [:in ids] (entity-source entity-type)))

(mu/defn entity-with-columns
  "The `columns` of the entity of the entity type `entity-type` with `id`, or nil."
  [entity-type :- ::deps.dependency-types/dependency-types
   columns     :- [:sequential :keyword]
   id          :- ::deps.dependency-types/entity-id]
  (t2/select-one (into [(deps.dependency-types/dependency-type->model entity-type)] columns)
                 :id id (entity-source entity-type)))

(mu/defn query-action-queries
  "The `:dataset_query` of the QueryActions of the Actions with `action-ids`, keyed by Action id."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/select-fn->fn :action_id :dataset_query :model/QueryAction :action_id [:in action-ids]))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-types-by-id
  "A map of Card ID to type for `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-fn->fn :id :type [:model/Card :id :type] :id [:in card-ids]))

(mu/defn card-database-ids
  "The `:id` and `:database_id` of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id] :id [:in card-ids]))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-database-ids
  "The `:id` and `:db_id` of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn dashcard-dashboard-id :- [:maybe ::lib.schema.id/dashboard]
  "The `:dashboard_id` of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :dashboard_id :model/DashboardCard :id dashcard-id))

(mu/defn field-table-id :- [:maybe ::lib.schema.id/table]
  "The `:table_id` of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :table_id :model/Field :id field-id {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn transform-sources
  "The `:id` and `:source` of the Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select [:model/Transform :id :source] :id [:in transform-ids]))

(mu/defn source-database-transform-ids :- [:set ::lib.schema.id/transform]
  "The IDs of the Transforms reading from the Database with `db-id`."
  [db-id :- ::lib.schema.id/database]
  (or (t2/select-pks-set :model/Transform :source_database_id db-id) #{}))

;;; -------------------------------------------------- Dependencies --------------------------------------------------

(mu/defn dependencies-from
  "The `:id`, `:to_entity_type`, and `:to_entity_id` of the Dependencies of the entity `entity-type` `entity-id`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt]
  (t2/select [:model/Dependency :id :to_entity_type :to_entity_id]
             :from_entity_type entity-type
             :from_entity_id entity-id))

(mu/defn dependency-exists?
  "Whether the entity `from-type` `from-id` depends on the entity `to-type` `to-id`."
  [from-type :- ::dependencies.schema/entity-type
   from-id   :- ms/PositiveInt
   to-type   :- ::dependencies.schema/entity-type
   to-id     :- ms/PositiveInt]
  (t2/exists? :model/Dependency
              :from_entity_type from-type :from_entity_id from-id
              :to_entity_type to-type :to_entity_id to-id))

(mu/defn insert-dependencies!
  "Insert the Dependency `rows`, returning the number inserted."
  [rows :- [:sequential [:map {:closed true}
                         [:id               {:optional true} ms/PositiveInt]
                         [:from_entity_type {:optional true} [:maybe [:or :keyword :string]]]
                         [:from_entity_id   {:optional true} [:maybe ms/PositiveInt]]
                         [:to_entity_type   {:optional true} [:maybe [:or :keyword :string]]]
                         [:to_entity_id     {:optional true} [:maybe ms/PositiveInt]]]]]
  (t2/insert! :model/Dependency rows))

(mu/defn retarget-dependency!
  "Point the Dependency of the entity `from-type` `from-id` on the entity `old-to-type` `old-to-id` at the entity
  `new-to-type` `new-to-id`, returning the number updated."
  [from-type   :- ::dependencies.schema/entity-type
   from-id     :- ms/PositiveInt
   old-to-type :- ::dependencies.schema/entity-type
   old-to-id   :- ms/PositiveInt
   new-to-type :- ::dependencies.schema/entity-type
   new-to-id   :- ms/PositiveInt]
  (t2/update! :model/Dependency
              {:from_entity_type from-type :from_entity_id from-id
               :to_entity_type old-to-type :to_entity_id old-to-id}
              {:to_entity_type new-to-type :to_entity_id new-to-id}))

(mu/defn delete-dependencies!
  "Delete the Dependencies with `dependency-ids`, returning the number deleted."
  [dependency-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Dependency :id [:in dependency-ids]))

(mu/defn delete-dependency!
  "Delete the Dependency of the entity `from-type` `from-id` on the entity `to-type` `to-id`, returning the number
  deleted."
  [from-type :- ::dependencies.schema/entity-type
   from-id   :- ms/PositiveInt
   to-type   :- ::dependencies.schema/entity-type
   to-id     :- ms/PositiveInt]
  (t2/delete! :model/Dependency
              :from_entity_type from-type :from_entity_id from-id
              :to_entity_type to-type :to_entity_id to-id))

(mu/defn delete-dependencies-from!
  "Delete the Dependencies of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Dependency :from_entity_type entity-type :from_entity_id [:in entity-ids]))

(mu/defn downstream-table-ids-of-transform
  "The IDs of the Tables that depend on the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-fn-set :from_entity_id :model/Dependency
                    :from_entity_type :table
                    :to_entity_type   :transform
                    :to_entity_id     transform-id))

(mu/defn delete-table-dependencies-on-transform!
  "Delete the Dependencies of the Tables with `table-ids` on the Transform with `transform-id`, returning the
  number deleted."
  [table-ids    :- [:sequential ::lib.schema.id/table]
   transform-id :- ::lib.schema.id/transform]
  (t2/delete! :model/Dependency
              :from_entity_type :table
              :from_entity_id   [:in table-ids]
              :to_entity_type   :transform
              :to_entity_id     transform-id))

;;; -------------------------------------------- Statuses, shared by the jobs --------------------------------------------

(def ^:private StatusModel
  "A job's status model."
  [:enum :model/DependencyStatus :model/ResultMetadataStatus :model/AnalysisFindingStatus])

(def ^:private one-more-write
  "The `stale` count of a status after one more write changed what its job reads, as Honey SQL."
  [:+ :stale [:inline 1]])

(def ^:private fresh-attempts
  "The columns of a status a write resets, so that the job tries an entity it gave up on again."
  {:fail_count 0 :terminal false})

(mu/defn- mark-stale!
  "Count one more write in the statuses in the status `model` of the entities `type->ids`, with fresh attempts, so the
  job processes them until it clears a count no write raised meanwhile; an entity without a status is processed
  anyway."
  [model      :- StatusModel
   type->ids  :- ::dependencies.schema/type->ids]
  (doseq [[entity-type ids] type->ids
          batch             (partition-all 1000 ids)]
    (t2/update! model :entity_type entity-type :entity_id [:in batch] (assoc fresh-attempts :stale one-more-write))))

(mu/defn- mark-dependents-stale!
  "Count one more write in the statuses in the status `model` of the entities directly depending on the entities
  `entity-type` `entity-ids`, in one UPDATE per 1,000 of them."
  [model       :- StatusModel
   entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (let [table (t2/table-name model)]
    (doseq [batch (partition-all 1000 entity-ids)]
      (t2/query {:update table
                 :set    (assoc fresh-attempts :stale one-more-write)
                 :where  [:exists ^:allow-subquery
                          {:select [1]
                           :from   [[(t2/table-name :model/Dependency) :d]]
                           :where  [:and
                                    [:= :d.to_entity_type (name entity-type)]
                                    [:in :d.to_entity_id batch]
                                    [:= :d.from_entity_type (u/qualified-key table :entity_type)]
                                    [:= :d.from_entity_id (u/qualified-key table :entity_id)]]}]}))))

(mu/defn- clear-stale! :- :boolean
  "Record that a job processed the entity `entity-type` `entity-id` with its logic of `current-version`, clearing the
  `stale` count of its status in the status `model` when it is still the `stale` the job picked it with, so a write
  while it was processed has the job process it again, returning whether it cleared it."
  [model           :- StatusModel
   entity-type     :- ::dependencies.schema/entity-type
   entity-id       :- ms/PositiveInt
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (pos? (t2/update! model :entity_type entity-type :entity_id entity-id :stale stale
                    {:stale 0 :fail_count 0 :analysis_version current-version})))

(mu/defn- record-failure! :- :boolean
  "Record that a job failed to process the entity `entity-type` `entity-id`, giving up on it until a write changes it
  once it failed `max-failures` times in a row, returning whether it gave up."
  [model        :- StatusModel
   entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (t2/update! model :entity_type entity-type :entity_id entity-id {:fail_count [:+ :fail_count [:inline 1]]})
  (pos? (t2/update! model :entity_type entity-type :entity_id entity-id :fail_count [:>= max-failures]
                    {:terminal true})))

(mu/defn mark-dependency-statuses-stale!
  "Mark the DependencyStatuses of the entities `type->ids` stale, so the dependency job computes their dependencies
  again."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/DependencyStatus type->ids))

(mu/defn mark-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities `type->ids` stale, so the result metadata job re-derives them."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/ResultMetadataStatus type->ids))

(mu/defn mark-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities `type->ids` stale, so the analysis job analyzes them again."
  [type->ids :- ::dependencies.schema/type->ids]
  (mark-stale! :model/AnalysisFindingStatus type->ids))

(mu/defn mark-dependents-result-metadata-statuses-stale!
  "Mark the ResultMetadataStatuses of the entities directly depending on the entities `entity-type` `entity-ids` stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (mark-dependents-stale! :model/ResultMetadataStatus entity-type entity-ids))

(mu/defn mark-dependents-analysis-finding-statuses-stale!
  "Mark the AnalysisFindingStatuses of the entities directly depending on the entities `entity-type` `entity-ids`
  stale."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:set ms/PositiveInt]]
  (mark-dependents-stale! :model/AnalysisFindingStatus entity-type entity-ids))

(mu/defn- current-dependencies-clause
  "Whether the dependency status of the entity of `entity-type` with `id-field` is current for the dependency logic of
  `dependency-version`, as Honey SQL."
  [entity-type        :- ::deps.dependency-types/dependency-types
   id-field           :- :keyword
   dependency-version :- ms/PositiveInt]
  [:exists ^:allow-subquery {:select [1]
                             :from   [[:dependency_status :ds]]
                             :where  [:and
                                      [:= :ds.entity_type (name entity-type)]
                                      [:= :ds.entity_id id-field]
                                      [:= :ds.stale 0]
                                      [:= :ds.analysis_version dependency-version]]}])

(mu/defn- pending-statuses :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of `entity-type` without a status in `status-model`, or whose status the job has not
  given up on and that counts a write or records a version of the job's logic below `current-version`, those last,
  with their `stale` counts, nil without a status; `user-mbql-only?` narrows cards to MBQL ones that Metabase did not create itself, and `dependency-version`
  to the entities whose dependencies are current."
  [entity-type     :- ::deps.dependency-types/dependency-types
   status-model    :- StatusModel
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt
   {:keys [user-mbql-only? dependency-version]} :- [:map {:closed true}
                                                    [:user-mbql-only?    {:optional true} :boolean]
                                                    [:dependency-version {:optional true} ms/PositiveInt]]]
  (let [table-name (t2/table-name (deps.dependency-types/dependency-type->model entity-type))
        id-field   (u/qualified-key table-name :id)
        outdated   [:< :status.analysis_version current-version]]
    (mapv #(select-keys % [:entity_id :stale])
          (t2/query
           {:select    [[id-field :entity_id] [:status.stale :stale]]
            :from      [table-name]
            :left-join [[(t2/table-name status-model) :status] [:and
                                                                [:= :status.entity_type (name entity-type)]
                                                                [:= :status.entity_id id-field]]]
            :where     (cond-> [:and [:or [:= :status.id nil]
                                      [:and [:= :status.terminal false] [:or [:> :status.stale 0] outdated]]]]
                         user-mbql-only?    (conj [:or [:= :report_card.query_type nil]
                                                   [:not= :report_card.query_type "native"]]
                                                  (mi/exclude-internal-content-hsql :model/Card
                                                                                    :table-alias :report_card))
                         dependency-version (conj (current-dependencies-clause
                                                   entity-type id-field dependency-version)))
            :order-by  [[[:case outdated [:inline 1] :else [:inline 0]]]]
            :limit     batch-size}))))

(mu/defn- take-pending-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "The [[pending-statuses]] a job is to process, each with the `stale` count it clears afterwards, inserting a status
  counting one write for each entity without one before the job reads it, so a write while it is processed counts."
  [entity-type     :- ::deps.dependency-types/dependency-types
   status-model    :- StatusModel
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt
   opts            :- [:map {:closed true}
                       [:user-mbql-only?    {:optional true} :boolean]
                       [:dependency-version {:optional true} ms/PositiveInt]]]
  (let [statuses (pending-statuses entity-type status-model batch-size current-version opts)
        missing  (remove :stale statuses)]
    (when (seq missing)
      (t2/insert! status-model (for [{:keys [entity_id]} missing]
                                 {:entity_type      entity-type
                                  :entity_id        entity_id
                                  :stale            1
                                  :analysis_version 0})))
    (mapv #(update % :stale (fnil identity 1)) statuses)))

(mu/defn- deleted-entity-ids-with-status :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have a status in `status-model`."
  [status-model :- StatusModel
   entity-type  :- ::deps.dependency-types/dependency-types
   batch-size   :- ms/PositiveInt]
  (let [table-name (t2/table-name (deps.dependency-types/dependency-type->model entity-type))]
    (mapv :entity_id (t2/query {:select [:status.entity_id]
                                :from   [[(t2/table-name status-model) :status]]
                                :where  [:and
                                         [:= :status.entity_type (name entity-type)]
                                         [:not [:exists ^:allow-subquery {:select [1]
                                                                          :from   [[table-name :entity]]
                                                                          :where  [:= :entity.id :status.entity_id]}]]]
                                :limit  batch-size}))))

;;; ---------------------------------------------- Dependency job ----------------------------------------------

(mu/defn dependency-deleted-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have a DependencyStatus."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/DependencyStatus entity-type batch-size))

(mu/defn delete-dependency-statuses!
  "Delete the DependencyStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DependencyStatus :entity_type entity-type :entity_id [:in entity-ids]))

(mu/defn record-dependency-failure! :- :boolean
  "Record that the dependency job failed to compute the dependencies of the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (record-failure! :model/DependencyStatus entity-type entity-id max-failures))

(mu/defn clear-dependency-status! :- :boolean
  "Record that the dependency job computed the dependencies of the entity `entity-type` `entity-id` with the analysis
  of `current-version`, clearing its count of `stale` writes unless a write raised it, returning whether it cleared it."
  [entity-type     :- ::dependencies.schema/entity-type
   entity-id       :- ms/PositiveInt
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (clear-stale! :model/DependencyStatus entity-type entity-id stale current-version))

(mu/defn dependency-pending? :- :boolean
  "Whether an entity of the type `entity-type` has no DependencyStatus, or one that counts a write or records a version
  of the dependency logic below `current-version`."
  [entity-type     :- ::deps.dependency-types/dependency-types
   current-version :- ms/PositiveInt]
  (boolean (seq (pending-statuses entity-type :model/DependencyStatus 1 current-version {}))))

(mu/defn take-pending-dependency-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of the type `entity-type` without a DependencyStatus, or whose status counts a write or
  records a version of the dependency logic below `current-version`, outdated ones last, with the `stale` count the job
  clears afterwards."
  [entity-type     :- ::deps.dependency-types/dependency-types
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt]
  (take-pending-statuses! entity-type :model/DependencyStatus batch-size current-version {}))

;;; ------------------------------------------- Result metadata job -------------------------------------------

(mu/defn take-pending-result-metadata-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` MBQL cards Metabase did not create itself without a ResultMetadataStatus, or whose status counts a
  write or records a version of the logic below `current-version`, and whose dependencies the dependency logic of
  `dependency-version` computed, outdated ones last, with the `stale` count the job clears afterwards."
  [batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (take-pending-statuses! :card :model/ResultMetadataStatus batch-size current-version
                          {:user-mbql-only?    true
                           :dependency-version dependency-version}))

(mu/defn record-result-metadata-failure! :- :boolean
  "Record that the result metadata job failed to re-derive the Card with `card-id`, giving up on it until a write
  changes it once it failed `max-failures` times in a row, returning whether it gave up."
  [card-id      :- ::lib.schema.id/card
   max-failures :- ms/PositiveInt]
  (record-failure! :model/ResultMetadataStatus :card card-id max-failures))

(mu/defn clear-result-metadata-status! :- :boolean
  "Record that the result metadata job re-derived the Card with `card-id` with the logic of `current-version`, clearing
  its count of `stale` writes unless a write raised it, returning whether it cleared it."
  [card-id         :- ::lib.schema.id/card
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (clear-stale! :model/ResultMetadataStatus :card card-id stale current-version))

(mu/defn result-metadata-deleted-card-ids :- [:sequential ::lib.schema.id/card]
  "Up to `batch-size` IDs of deleted Cards that still have a ResultMetadataStatus."
  [batch-size :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/ResultMetadataStatus :card batch-size))

(mu/defn delete-result-metadata-statuses!
  "Delete the ResultMetadataStatuses of the Cards with `card-ids`, returning the number deleted."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/delete! :model/ResultMetadataStatus :entity_type :card :entity_id [:in card-ids]))

(mu/defn remapped-table-ids :- [:set ::lib.schema.id/table]
  "The IDs of the Tables of the Fields remapped to one of the Fields with `field-ids` as their human-readable field."
  [field-ids :- [:set ::lib.schema.id/field]]
  (or (t2/select-fn-set :table_id [:model/Field :metabase_field.table_id]
                        {:from  [(warehouse-schema-overlay/field-query {:user-settings? false})]
                         :join  [:dimension [:= :dimension.field_id :metabase_field.id]]
                         :where [:in :dimension.human_readable_field_id field-ids]})
      #{}))

(mu/defn internal-remap? :- :boolean
  "Whether the Field with `field-id` has an internal remap, which shows its FieldValues' human-readable values."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/Dimension :field_id field-id :type "internal"))

(mu/defn native-card-ids :- [:set ::lib.schema.id/card]
  "The IDs of the native Cards among `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (or (t2/select-pks-set :model/Card :id [:in card-ids] :query_type :native) #{}))

(mu/defn card-state :- [:maybe ::dependencies.schema/card-state]
  "The `updated_at` and `result_metadata` of the Card with `card-id`, locking its row until the transaction ends when
  `lock?`, or nil."
  [card-id :- ::lib.schema.id/card
   lock?   :- :boolean]
  (some-> (t2/select-one [:model/Card :updated_at :result_metadata]
                         (cond-> {:where [:= :id card-id]} lock? (assoc :for :update)))
          (select-keys [:updated_at :result_metadata])))

(mu/defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id` to `result-metadata` through the Card model, without touching
  `updated_at`."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::lib.schema.metadata/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata
                                   :updated_at      :updated_at}))

;;; ------------------------------------------- Analysis finding job -------------------------------------------

(mu/defn upsert-finding!
  "Insert or update the AnalysisFinding of the entity `entity-type` `entity-id` with `result`, updating the row a
  concurrent analysis inserted meanwhile."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt
   result      :- :boolean]
  (mdb/update-or-insert! :model/AnalysisFinding {:entity_type entity-type :entity_id entity-id}
                         (constantly {:result result})))

(mu/defn take-pending-analysis-finding-statuses! :- [:sequential ::dependencies.schema/pending-status]
  "Up to `batch-size` entities of the type `entity-type` without an AnalysisFindingStatus, or whose status counts a
  write or records an analysis below `current-version`, and whose dependencies the analysis of `dependency-version`
  computed, outdated ones last, with the `stale` count the job clears afterwards."
  [entity-type        :- ::deps.dependency-types/dependency-types
   batch-size         :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   dependency-version :- ms/PositiveInt]
  (take-pending-statuses! entity-type :model/AnalysisFindingStatus batch-size current-version
                          {:dependency-version dependency-version}))

(mu/defn record-analysis-finding-failure! :- :boolean
  "Record that the analysis job failed to analyze the entity `entity-type` `entity-id`, giving up on it until a write changes it once it failed
  `max-failures` times in a row, returning whether it gave up."
  [entity-type  :- ::dependencies.schema/entity-type
   entity-id    :- ms/PositiveInt
   max-failures :- ms/PositiveInt]
  (record-failure! :model/AnalysisFindingStatus entity-type entity-id max-failures))

(mu/defn clear-analysis-finding-status! :- :boolean
  "Record that the analysis job analyzed the entity `entity-type` `entity-id` with the analysis of `current-version`,
  clearing its count of `stale` writes unless a write raised it, returning whether it cleared it."
  [entity-type     :- ::dependencies.schema/entity-type
   entity-id       :- ms/PositiveInt
   stale           :- ms/IntGreaterThanOrEqualToZero
   current-version :- ms/PositiveInt]
  (clear-stale! :model/AnalysisFindingStatus entity-type entity-id stale current-version))

(mu/defn analysis-finding-deleted-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have an AnalysisFindingStatus."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (deleted-entity-ids-with-status :model/AnalysisFindingStatus entity-type batch-size))

(mu/defn delete-analysis-finding-statuses!
  "Delete the AnalysisFindingStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-ids  :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/AnalysisFindingStatus :entity_type entity-type :entity_id [:in entity-ids]))

;;; --------------------------------------------- Analysis finding errors ---------------------------------------------

(mu/defn finding-errors-for-entity
  "The AnalysisFindingErrors of the entity `entity-type` `entity-id`."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))

(mu/defn finding-errors-from-source
  "The AnalysisFindingErrors caused by the entity `source-type` `source-id`."
  [source-type :- [:maybe :metabase.lib.schema.validate/source-entity-type]
   source-id   :- ms/PositiveInt]
  (t2/select :model/AnalysisFindingError :source_entity_type source-type :source_entity_id source-id))

(mu/defn insert-finding-errors!
  "Insert the AnalysisFindingError `rows`, returning the number inserted."
  [rows :- [:sequential (mut/select-keys ::dependencies.schema/analysis-finding-error.update [:analyzed_entity_type :analyzed_entity_id :error_type :error_detail :source_entity_type :source_entity_id])]]
  (t2/insert! :model/AnalysisFindingError rows))

(mu/defn delete-finding-errors-for-entity!
  "Delete the AnalysisFindingErrors of the entity `entity-type` `entity-id`, returning the number deleted."
  [entity-type :- ::dependencies.schema/entity-type
   entity-id   :- ms/PositiveInt]
  (t2/delete! :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))
