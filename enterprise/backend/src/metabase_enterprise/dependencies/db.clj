(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
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
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def ^:private VisibleOpts
  "Opts consumed by [[visible-entities-expr]]: the current user (`:user-id`, `:is-superuser?`,
  `:is-data-analyst?`), plus whether to include archived items (`:include-archived-items`,
  default `:exclude`)."
  [:map {:closed true}
   [:user-id ::lib.schema.id/user]
   [:is-superuser? {:optional true} [:maybe :boolean]]
   [:is-data-analyst? {:optional true} [:maybe :boolean]]
   [:include-archived-items {:optional true} [:enum :exclude :all :only]]])

(def ^:private EntityType
  "A dependency-type keyword, or the equivalent string. Every column these entity types are filtered against uses
  Toucan's keyword transform, which coerces either representation, so callers (and tests) sometimes pass a plain
  string instead of the keyword."
  [:or ::deps.dependency-types/dependency-types :string])

(def ^:private RestrictionSpec
  "The edge-restriction filter spec consumed by [[edge-restriction-expr]]: nil for no restriction, or a map
  combining `:visible` ([[VisibleOpts]]), `:broken?`, `:types` (a set of dependency types), and/or
  `:entity-type` + `:ids` (restricting to specific entities of one type)."
  [:maybe
   [:map {:closed true}
    [:visible {:optional true} VisibleOpts]
    [:broken? {:optional true} :boolean]
    [:types {:optional true} [:set EntityType]]
    [:entity-type {:optional true} EntityType]
    [:ids {:optional true} [:sequential ::deps.dependency-types/entity-id]]]])

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
  - Collection-based (`:model/Card`, `:model/Dashboard`, `:model/Document`, `:model/NativeQuerySnippet`,
    `:model/Action`): filters
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

                    (:model/Card :model/Dashboard :model/Document :model/NativeQuerySnippet :model/Action)
                    (let [archived-column (keyword (name table-name) "archived")
                          visible-in-root (fn [root-namespace]
                                            (collection/visible-collection-filter-clause
                                             (keyword (name table-name) "collection_id")
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
       [:entity-type EntityType]
       [:entity-ids [:or [:set ::deps.dependency-types/entity-id] [:sequential ::deps.dependency-types/entity-id]]]
       [:destination-restriction RestrictionSpec]
       [:source-restriction RestrictionSpec]]]
  (t2/select :model/Dependency
             {:where (into [:and
                            [:= src-type (name entity-type)]
                            [:in src-id entity-ids]]
                           (keep identity)
                           [(edge-restriction-expr dst-type dst-id destination-restriction)
                            (edge-restriction-expr src-type src-id source-restriction)])}))

(mu/defn finding-errors-from-sources
  "The AnalysisFindingErrors caused by any of the entities `source-entity-type` `source-entity-ids`, whose analyzed
  entity is visible to the user described by `user-id`, `is-superuser?`, and `is-data-analyst?`."
  [source-entity-type  :- EntityType
   source-entity-ids   :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- VisibleOpts]
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
  [entity-type :- EntityType
   entity-ids  :- [:sequential ::deps.dependency-types/entity-id]
   {:keys [user-id is-superuser? is-data-analyst?]} :- VisibleOpts]
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

(defn action-root-namespace
  "The namespace of the root collection an action without a collection sits in: the data actions root for a
  `model-less?` action, and the default root for an action of a model."
  [model-less?]
  (when model-less?
    :data-actions))

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
    (:transform :snippet :dashboard :document :action) #{:collection}
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
    (:table joins) (conj (warehouse-schema-overlay/table-query {:alias :table}) [:= :entity.table_id :table.id])))

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
       [:source-entity-type EntityType]
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

(mu/defn instances
  "The instances of the entity type `entity-type` with `ids`."
  [entity-type :- ::deps.dependency-types/dependency-types
   ids         :- [:set ::deps.dependency-types/entity-id]]
  (t2/select (deps.dependency-types/dependency-type->model entity-type) :id [:in ids]))

(defn- entity-source
  "What a read of `entity-type` selects from: the overlay for a Table, else the model's own table."
  [entity-type]
  (if (= entity-type :table)
    {:from [(warehouse-schema-overlay/table-query)]}
    {}))

(mu/defn instances-with-columns
  "The `columns` of the instances of the entity type `entity-type` with `ids`."
  [entity-type :- ::deps.dependency-types/dependency-types
   columns     :- [:sequential :keyword]
   ids         :- [:sequential ::deps.dependency-types/entity-id]]
  (t2/select (into [(deps.dependency-types/dependency-type->model entity-type)] columns)
             :id [:in ids] (entity-source entity-type)))

(mu/defn instance-with-columns
  "The `columns` of the instance of the entity type `entity-type` with `id`, or nil."
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

(mu/defn touch-transforms-of-source-database!
  "Move the `updated_at` of the Transforms reading from the Database with `db-id`, returning the number updated."
  [db-id :- ::lib.schema.id/database]
  (t2/query-one {:update (t2/table-name :model/Transform)
                 :set    {:updated_at (mi/now)}
                 :where  [:= :source_database_id db-id]}))

;;; -------------------------------------------------- Dependencies --------------------------------------------------

(mu/defn dependencies-from
  "The `:id`, `:to_entity_type`, and `:to_entity_id` of the Dependencies of the entity `entity-type` `entity-id`."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (t2/select [:model/Dependency :id :to_entity_type :to_entity_id]
             :from_entity_type entity-type
             :from_entity_id entity-id))

(mu/defn dependency-exists?
  "Whether the entity `from-type` `from-id` depends on the entity `to-type` `to-id`."
  [from-type :- EntityType
   from-id   :- ms/PositiveInt
   to-type   :- EntityType
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
  [from-type   :- EntityType
   from-id     :- ms/PositiveInt
   old-to-type :- EntityType
   old-to-id   :- ms/PositiveInt
   new-to-type :- EntityType
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
  [from-type :- EntityType
   from-id   :- ms/PositiveInt
   to-type   :- EntityType
   to-id     :- ms/PositiveInt]
  (t2/delete! :model/Dependency
              :from_entity_type from-type :from_entity_id from-id
              :to_entity_type to-type :to_entity_id to-id))

(mu/defn delete-dependencies-from!
  "Delete the Dependencies of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- EntityType
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

;;; ------------------------------------------------ Dependency status ------------------------------------------------

(def ^:private entity-parts
  "For each entity type made of rows of other tables, a query of those rows for the entity whose ID column is `id`, with
  the alias it gives the rows."
  {:dashboard [(fn [id] [:dc {:from [[(t2/table-name :model/DashboardCard) :dc]] :where [:= :dc.dashboard_id id]}])
               (fn [id] [:ds {:from [[(t2/table-name :model/DashboardCardSeries) :ds]]
                              :join [[(t2/table-name :model/DashboardCard) :ds_dc] [:= :ds_dc.id :ds.dashboardcard_id]]
                              :where [:= :ds_dc.dashboard_id id]}])
               (fn [id] [:dt {:from [[(t2/table-name :model/DashboardTab) :dt]] :where [:= :dt.dashboard_id id]}])]
   :action    [(fn [id] [:qa {:from [[(t2/table-name :model/QueryAction) :qa]] :where [:= :qa.action_id id]}])]
   :table     [(fn [id] [:f {:from [[(t2/table-name :model/Field) :f]] :where [:= :f.table_id id]}])
               (fn [id] [:fus {:from [[(t2/table-name :model/FieldUserSettings) :fus]]
                               :join [[(t2/table-name :model/Field) :fus_f] [:= :fus_f.id :fus.field_id]]
                               :where [:= :fus_f.table_id id]}])
               (fn [id] [:tus {:from [[(t2/table-name :model/TableUserSettings) :tus]] :where [:= :tus.table_id id]}])
               (fn [id] [:dim {:from [[(t2/table-name :model/Dimension) :dim]]
                               :join [[(t2/table-name :model/Field) :dim_f] [:= :dim_f.id :dim.field_id]]
                               :where [:= :dim_f.table_id id]}])]})

(defn- entity-version
  "The version of the entities of `entity-type` in the table aliased `alias`, as Honey SQL expressions: `:updated-at`,
  the latest `updated_at` of the entity and of the rows it is made of, and `:count`, the number of those rows."
  [entity-type alias]
  (let [column     #(keyword (name alias) (name %))
        updated-at (column :updated_at)
        parts      (map #(% (column :id)) (get entity-parts entity-type))]
    {:updated-at (if (seq parts)
                   (into [:greatest updated-at]
                         (for [[part-alias query] parts]
                           [:coalesce (with-meta (assoc query :select [[[:max (keyword (name part-alias) "updated_at")]]])
                                                 {:allow-subquery true})
                            updated-at]))
                   updated-at)
     :count      (if (seq parts)
                   (into [:+]
                         (for [[_ query] parts]
                           (with-meta (assoc query :select [[[:count :*]]]) {:allow-subquery true})))
                   [:inline 0])}))

(defn- version-changed-expr
  "The condition of a status aliased `status` that records a version other than `version`, or none."
  [status {:keys [updated-at count]}]
  (let [column #(keyword (name status) (name %))]
    [:or
     [:= (column :seen_updated_at) nil]
     [:not= (column :seen_updated_at) updated-at]
     [:not= (column :seen_count) count]]))

(mu/defn dependency-status
  "The DependencyStatus of the entity `entity-type` `entity-id`, or nil."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (t2/select-one :model/DependencyStatus :entity_type entity-type :entity_id entity-id))

(mu/defn delete-dependency-statuses!
  "Delete the DependencyStatuses of the entities `entity-type` `entity-ids`, returning the number deleted."
  [entity-type :- EntityType
   entity-ids  :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DependencyStatus :entity_type entity-type :entity_id [:in entity-ids]))

(mu/defn deleted-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of the type `entity-type` that still have a DependencyStatus."
  [entity-type :- ::deps.dependency-types/dependency-types
   batch-size  :- ms/PositiveInt]
  (let [table-name (t2/table-name (deps.dependency-types/dependency-type->model entity-type))]
    (vec (t2/select-fn-vec :entity_id :model/DependencyStatus
                           {:where [:and
                                    [:= :dependency_status.entity_type (name entity-type)]
                                    [:not [:exists ^:allow-subquery
                                           {:select [1]
                                            :from   [[table-name :entity]]
                                            :where  [:= :entity.id :dependency_status.entity_id]}]]]
                            :limit batch-size}))))

(mu/defn clear-dependency-status-version!
  "Clear the version the DependencyStatus of `entity-type` `entity-id` records, creating it if it doesn't exist, so the
  dependencies of the entity are computed again."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (mdb/update-or-insert! :model/DependencyStatus
                         {:entity_type entity-type :entity_id entity-id}
                         (constantly {:seen_updated_at nil :seen_count nil :updated_at (mi/now)})))

(mu/defn upsert-dependency-status!
  "Record that the dependencies of `entity-type` `entity-id` were computed from its version `seen-updated-at`
  `seen-count` by the analysis of `current-version`, and whether it names tables that match nothing."
  [entity-type        :- EntityType
   entity-id          :- ms/PositiveInt
   current-version    :- ms/PositiveInt
   unresolved-tables? :- :boolean
   seen-updated-at    :- ms/TemporalInstant
   seen-count         :- :int]
  (mdb/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   (fn [_existing]
     {:dependency_analysis_version current-version
      :unresolved_tables           unresolved-tables?
      :seen_updated_at             seen-updated-at
      :seen_count                  seen-count
      :updated_at                  (mi/now)})))

(mu/defn entities-for-dependency-calculation :- [:sequential [:map {:closed true}
                                                              [:id                 ms/PositiveInt]
                                                              [:version_updated_at ms/TemporalInstant]
                                                              [:version_count      :int]]]
  "The IDs and versions of up to `batch-size` entities of the type `entity-type` without a DependencyStatus, or whose
  status records a version other than theirs or an analysis below `current-version`, and with `recheck-unresolved?`
  also those that name tables matching nothing while a table changed since; outdated ones last."
  [entity-type         :- ::deps.dependency-types/dependency-types
   batch-size          :- ms/PositiveInt
   current-version     :- ms/PositiveInt
   recheck-unresolved? :- :boolean]
  (let [model          (deps.dependency-types/dependency-type->model entity-type)
        table-name     (t2/table-name model)
        id-field       (keyword (name table-name) "id")
        version        (entity-version entity-type table-name)
        changed        (version-changed-expr :dependency_status version)]
    (mapv #(update % :version_count long)
          (t2/query {:select    [[id-field :id]
                                 [(:updated-at version) :version_updated_at]
                                 [(:count version) :version_count]]
                     :from      table-name
                     :left-join [:dependency_status [:and
                                                     [:= :dependency_status.entity_id id-field]
                                                     [:= :dependency_status.entity_type (name entity-type)]]]
                     :where     (cond-> [:or
                                         [:= :dependency_status.id nil]
                                         changed
                                         [:< :dependency_status.dependency_analysis_version current-version]]
                                  recheck-unresolved?
                                  (conj [:and
                                         [:= :dependency_status.unresolved_tables true]
                                         [:< :dependency_status.updated_at
                                          ^:allow-subquery {:select [[[:max :updated_at]]]
                                                            :from   [(warehouse-schema-overlay/table-query
                                                                      {:user-settings? false})]}]]))
                     :order-by  [[[:case [:< :dependency_status.dependency_analysis_version current-version] [:inline 1]
                                   :else [:inline 0]]]]
                     :limit     batch-size}))))

;;; ------------------------------------------- Dependents statuses -------------------------------------------

(def ^:private DependentsStatusModel
  "A model recording, for each entity, the version of it that its dependents were last processed from."
  [:enum :model/ResultMetadataStatus :model/AnalysisFindingStatus])

(mu/defn entities-with-changed-version :- [:sequential [:map {:closed true}
                                                        [:entity_id          ms/PositiveInt]
                                                        [:version_updated_at ms/TemporalInstant]
                                                        [:version_count      :int]
                                                        [:status_id          [:maybe ms/PositiveInt]]
                                                        [:status_updated_at  [:maybe ms/TemporalInstant]]]]
  "Up to `batch-size` entities of `entity-type` that something depends on, without a `status-model` row or whose row
  records a version other than theirs, with their version and status."
  [status-model :- DependentsStatusModel
   entity-type  :- ::deps.dependency-types/dependency-types
   batch-size   :- ms/PositiveInt]
  (let [table-name (t2/table-name (deps.dependency-types/dependency-type->model entity-type))
        id-field   (keyword (name table-name) "id")
        version    (entity-version entity-type table-name)]
    (mapv #(update % :version_count long)
          (t2/query {:select    [[id-field :entity_id]
                                 [(:updated-at version) :version_updated_at]
                                 [(:count version) :version_count]
                                 [:status.id :status_id]
                                 [:status.updated_at :status_updated_at]]
                     :from      [table-name]
                     :left-join [[(t2/table-name status-model) :status]
                                 [:and
                                  [:= :status.entity_type (name entity-type)]
                                  [:= :status.entity_id id-field]]]
                     :where     [:and
                                 [:exists ^:allow-subquery {:select [1]
                                                            :from   [[(t2/table-name :model/Dependency) :dep]]
                                                            :where  [:and
                                                                     [:= :dep.to_entity_type (name entity-type)]
                                                                     [:= :dep.to_entity_id id-field]]}]
                                 [:or
                                  [:= :status.id nil]
                                  (version-changed-expr :status version)]]
                     :limit     batch-size}))))

(mu/defn clear-status-version!
  "Clear the version the `status-model` row of `entity-type` `entity-id` records, creating it if it doesn't exist, so
  the dependents of the entity are processed again."
  [status-model :- DependentsStatusModel
   entity-type  :- EntityType
   entity-id    :- ms/PositiveInt]
  (mdb/update-or-insert! status-model
                         {:entity_type entity-type :entity_id entity-id}
                         (constantly {:seen_updated_at nil :seen_count nil :updated_at (mi/now)})))

(mu/defn clear-status-versions-recorded-since!
  "Clear the versions the `status-model` rows of the entities `nodes`, `[[entity-type entity-id]]`, record when they
  were written at or after `since`, so the dependents of those entities are processed again, returning the number
  updated."
  [status-model :- DependentsStatusModel
   nodes        :- [:sequential [:tuple EntityType ms/PositiveInt]]
   since        :- ms/TemporalInstant]
  (if (seq nodes)
    (t2/query-one {:update (t2/table-name status-model)
                   :set    {:seen_updated_at nil :seen_count nil :updated_at (mi/now)}
                   :where  [:and
                            [:>= :updated_at since]
                            (into [:or]
                                  (for [[entity-type typed-nodes] (group-by first nodes)]
                                    [:and
                                     [:= :entity_type (name entity-type)]
                                     [:in :entity_id (mapv second typed-nodes)]]))]})
    0))

(mu/defn record-status-version!
  "Record that the dependents of `entity-type` `entity-id` were processed from its version `seen-updated-at`
  `seen-count`, on the `status-model` row with `status-id` unless its `updated_at` is no longer `status-updated-at`, or
  on a new row unless one was created meanwhile."
  [status-model      :- DependentsStatusModel
   entity-type       :- EntityType
   entity-id         :- ms/PositiveInt
   status-id         :- [:maybe ms/PositiveInt]
   status-updated-at :- [:maybe ms/TemporalInstant]
   seen-updated-at   :- ms/TemporalInstant
   seen-count        :- :int]
  (let [version {:seen_updated_at seen-updated-at :seen_count seen-count :updated_at (mi/now)}]
    (if status-id
      (t2/update! status-model :id status-id :updated_at status-updated-at version)
      (try
        (t2/insert! status-model (assoc version :entity_type entity-type :entity_id entity-id))
        (catch Exception e
          (when-not (t2/exists? status-model :entity_type entity-type :entity_id entity-id)
            (throw e)))))))

(mu/defn deleted-status-entity-ids :- [:sequential ms/PositiveInt]
  "Up to `batch-size` IDs of deleted entities of `entity-type` that still have a `status-model` row."
  [status-model :- DependentsStatusModel
   entity-type  :- ::deps.dependency-types/dependency-types
   batch-size   :- ms/PositiveInt]
  (let [status-table (t2/table-name status-model)
        table-name   (t2/table-name (deps.dependency-types/dependency-type->model entity-type))]
    (vec (t2/select-fn-vec :entity_id status-model
                           {:where [:and
                                    [:= (keyword (name status-table) "entity_type") (name entity-type)]
                                    [:not [:exists ^:allow-subquery
                                           {:select [1]
                                            :from   [[table-name :entity]]
                                            :where  [:= :entity.id (keyword (name status-table) "entity_id")]}]]]
                            :limit batch-size}))))

(mu/defn delete-statuses!
  "Delete the `status-model` rows of the entities `entity-type` `entity-ids`, returning the number deleted."
  [status-model :- DependentsStatusModel
   entity-type  :- EntityType
   entity-ids   :- [:sequential ms/PositiveInt]]
  (t2/delete! status-model :entity_type entity-type :entity_id [:in entity-ids]))

;;; --------------------------------------------- Result metadata ---------------------------------------------

(mu/defn native-card-ids
  "The IDs of the native Cards among `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pks-set [:model/Card :id] :id [:in card-ids] :query_type :native))

(mu/defn card-stored-result-metadata
  "The `updated_at` and the stored, unparsed `result_metadata` of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/query-one {:select [:updated_at :result_metadata]
                 :from   [(t2/table-name :model/Card)]
                 :where  [:= :id card-id]}))

(mu/defn set-unchanged-card-result-metadata!
  "Set the result metadata of the Card with `card-id` without running the Card model's hooks, unless its `updated_at`
  and stored `result_metadata` are no longer `stored`, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   stored          :- [:map {:closed true}
                       [:updated_at      ms/TemporalInstant]
                       [:result_metadata [:maybe :string]]]
   result-metadata :- [:maybe ::lib.schema.metadata/card.result-metadata]]
  (t2/query-one {:update (t2/table-name :model/Card)
                 :set    {:result_metadata ((:in mi/transform-result-metadata) result-metadata)
                          :updated_at      (mi/now)}
                 :where  [:and
                          [:= :id card-id]
                          [:= :updated_at (:updated_at stored)]
                          [:= :result_metadata (:result_metadata stored)]]}))

;;; ------------------------------------------------ Analysis findings ------------------------------------------------

(mu/defn finding-id
  "The ID of the AnalysisFinding of the entity `entity-type` `entity-id`, or nil."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (t2/select-one-fn :id [:model/AnalysisFinding :id]
                    :analyzed_entity_type entity-type
                    :analyzed_entity_id entity-id))

(mu/defn insert-finding!
  "Insert the AnalysisFinding `row`, returning the number inserted."
  [row :- [:map {:closed true}
           [:id                   {:optional true} ms/PositiveInt]
           [:analyzed_at          {:optional true} [:maybe ms/TemporalInstant]]
           [:analysis_version     {:optional true} ms/PositiveInt]
           [:result               {:optional true} :boolean]
           [:seen_updated_at      {:optional true} [:maybe ms/TemporalInstant]]
           [:seen_count           {:optional true} [:maybe :int]]
           [:analyzed_entity_type {:optional true} [:maybe [:or :keyword :string]]]
           [:analyzed_entity_id   {:optional true} [:maybe ms/PositiveInt]]]]
  (t2/insert! :model/AnalysisFinding row))

(mu/defn update-finding!
  "Apply `changes` to the AnalysisFinding with `finding-id`, returning the number updated."
  [finding-id :- ms/PositiveInt
   changes    :- (mut/select-keys ::dependencies.schema/analysis-finding.update
                                  [:analyzed_at :analysis_version :result :seen_updated_at :seen_count])]
  (t2/update! :model/AnalysisFinding finding-id changes))

(mu/defn entities-for-analysis :- [:sequential [:map {:closed true}
                                                [:id                 ms/PositiveInt]
                                                [:version_updated_at ms/TemporalInstant]
                                                [:version_count      :int]]]
  "The IDs and versions of up to `batch-size` entities of the type `entity-type` without an AnalysisFinding, or whose
  finding records a version other than theirs or an analysis below `current-version`; outdated ones last."
  [entity-type     :- ::deps.dependency-types/dependency-types
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt]
  (let [model          (deps.dependency-types/dependency-type->model entity-type)
        table-name     (t2/table-name model)
        id-field       (keyword (name table-name) "id")
        version        (entity-version entity-type table-name)]
    (mapv #(update % :version_count long)
          (t2/query {:select    [[id-field :id]
                                 [(:updated-at version) :version_updated_at]
                                 [(:count version) :version_count]]
                     :from      table-name
                     :left-join [:analysis_finding [:and
                                                    [:= :analysis_finding.analyzed_entity_id id-field]
                                                    [:= :analysis_finding.analyzed_entity_type (name entity-type)]]]
                     :where     [:or
                                 [:= :analysis_finding.id nil]
                                 (version-changed-expr :analysis_finding version)
                                 [:< :analysis_finding.analysis_version current-version]]
                     :order-by  [[[:case [:< :analysis_finding.analysis_version current-version] [:inline 1]
                                   :else [:inline 0]]]]
                     :limit     batch-size}))))

;;; --------------------------------------------- Analysis finding errors ---------------------------------------------

(mu/defn finding-errors-for-entity
  "The AnalysisFindingErrors of the entity `entity-type` `entity-id`."
  [entity-type :- EntityType
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
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (t2/delete! :model/AnalysisFindingError :analyzed_entity_type entity-type :analyzed_entity_id entity-id))
