(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions.

  This module is dominated by graph/analysis queries (recursive traversal, batch upserts, big `:in` sets) that do not
  fit a per-model `::opts` shape; those stay bespoke. Where a query on `:model/Dependency`, `:model/DependencyStatus`,
  `:model/AnalysisFinding`, or `:model/AnalysisFindingError` obviously fits scalar/set filters, it follows that
  model's `::opts`; everything else lives in the dependencies-only sections."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.dependencies.dependency-types :as deps.dependency-types]
   [metabase-enterprise.dependencies.schema :as dependencies.schema]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
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

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn card-types-by-id
  "A map of Card ID to type for `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-fn->fn :id :type [:model/Card :id :type :card_schema] :id [:in card-ids]))

(mu/defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(mu/defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::queries.schema/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-database-ids
  "The `:id` and `:db_id` of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Table :id :db_id] :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn table-id-by-name
  "The ID of the Table named `table-name` in `schema` of the Database with `db-id`, or nil."
  [db-id      :- ::lib.schema.id/database
   schema     :- [:maybe :string]
   table-name :- :string]
  (t2/select-one-fn :id :model/Table :db_id db-id :schema schema :name table-name {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn transform-sources
  "The `:id` and `:source` of the Transforms with `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select [:model/Transform :id :source] :id [:in transform-ids]))

(mu/defn transform-ids-of-source-database
  "The IDs of the Transforms reading from the Database with `db-id`."
  [db-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Transform :source_database_id db-id))

;;; -------------------------------------------------- Dependencies --------------------------------------------------
;;; The queries on `:model/Dependency` below follow [[::dependency-opts]]; the graph traversal above and the
;;; single-column read at the bottom of this section do not fit it and stay bespoke.

(mr/def ::dependency-filters
  "Which Dependencies a query applies to. Keys mirror the columns of `dependency`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id               {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:from_entity_type {:optional true} [:or EntityType [:set EntityType]]]
   [:from_entity_id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:to_entity_type   {:optional true} [:or EntityType [:set EntityType]]]
   [:to_entity_id     {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::dependency-opts
  "The filters above plus the columns to select."
  [:merge
   ::dependency-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::dependencies.schema/dependency.column]]]])

(defn- dependency-model [columns] (u.query/model-with-columns :model/Dependency columns))
(defn- dependency-args [opts] (u.query/opts->args opts))
(defn- dependency-kv-args [opts] (u.query/opts->kv-args opts))

(mu/defn select-dependencies :- [:sequential ::dependencies.schema/dependency.partial]
  "The Dependencies matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::dependency-opts]]
  (apply t2/select (dependency-model columns) (dependency-args opts)))

(mu/defn dependency-exists? :- :boolean
  "Whether a Dependency matching `opts` exists."
  [opts :- [:maybe ::dependency-opts]]
  (apply t2/exists? :model/Dependency (dependency-args opts)))

(mu/defn insert-dependencies! :- :int
  "Insert the Dependency `rows`, returning the number inserted."
  [rows :- [:sequential ::dependencies.schema/dependency.create]]
  (t2/insert! :model/Dependency rows))

(mu/defn update-dependencies! :- :int
  "Apply `changes` to every Dependency matching `opts`, returning the number updated."
  [opts    :- [:maybe ::dependency-opts]
   changes :- ::dependencies.schema/dependency.update]
  (apply t2/update! :model/Dependency (conj (dependency-kv-args opts) changes)))

(mu/defn delete-dependencies! :- :int
  "Delete every Dependency matching `opts`, returning the number deleted."
  [opts :- [:maybe ::dependency-opts]]
  (apply t2/delete! :model/Dependency (dependency-args opts)))

(mu/defn downstream-table-ids-of-transform
  "The IDs of the Tables that depend on the Transform with `transform-id`."
  [transform-id :- ::lib.schema.id/transform]
  (t2/select-fn-set :from_entity_id :model/Dependency
                    :from_entity_type :table
                    :to_entity_type   :transform
                    :to_entity_id     transform-id))

;;; ------------------------------------------------ Dependency status ------------------------------------------------
;;; The queries on `:model/DependencyStatus` below follow [[::dependency-status-opts]]; the upsert helpers (which
;;; branch on whether a row already exists) do not fit it and stay bespoke.

(def ^:private dependency-status-set-columns
  "Maps the `next_retry_at_set` filter key to the column whose nullness it tests."
  {:next_retry_at_set :next_retry_at})

(mr/def ::dependency-status-filters
  "Which DependencyStatuses a query applies to. Keys mirror the columns of `dependency_status`: a scalar matches
  that value. `:next_retry_at_set` matches the rows where `:next_retry_at` is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:entity_type       {:optional true} EntityType]
   [:entity_id         {:optional true} ms/PositiveInt]
   [:terminal          {:optional true} :boolean]
   [:next_retry_at_set {:optional true} :boolean]])

(mr/def ::dependency-status-opts
  "The filters above plus the columns to select."
  [:merge
   ::dependency-status-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::dependencies.schema/dependency-status.column]]]])

(defn- dependency-status-model [columns] (u.query/model-with-columns :model/DependencyStatus columns))
(defn- dependency-status-args [opts] (u.query/opts->args opts {:set-columns dependency-status-set-columns}))

(mu/defn select-one-dependency-status :- [:maybe ::dependencies.schema/dependency-status.partial]
  "The first DependencyStatus matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::dependency-status-opts]]
  (apply t2/select-one (dependency-status-model columns) (dependency-status-args opts)))

(mu/defn dependency-status-exists? :- :boolean
  "Whether a DependencyStatus matching `opts` exists."
  [opts :- [:maybe ::dependency-status-opts]]
  (apply t2/exists? :model/DependencyStatus (dependency-status-args opts)))

(mu/defn delete-dependency-statuses! :- :int
  "Delete every DependencyStatus matching `opts`, returning the number deleted."
  [opts :- [:maybe ::dependency-status-opts]]
  (apply t2/delete! :model/DependencyStatus (dependency-status-args opts)))

(mu/defn mark-dependency-status-stale!
  "Mark the DependencyStatus of `entity-type` `entity-id` as stale for dependency recalculation, creating it if it
  doesn't exist. Resets retry state so previously-failed entities get a fresh chance."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt]
  (mdb/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   (fn [existing]
     (if existing
       {:stale true :fail_count 0 :next_retry_at nil :terminal false}
       {:stale true :dependency_analysis_version 0}))))

(mu/defn upsert-dependency-status!
  "Upsert the DependencyStatus of `entity-type` `entity-id`, setting stale=false, `dependency_analysis_version` to
  `current-version`, and clearing any failure state."
  [entity-type     :- EntityType
   entity-id       :- ms/PositiveInt
   current-version :- ms/PositiveInt]
  (mdb/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   (fn [_existing]
     {:dependency_analysis_version current-version
      :stale false
      :fail_count 0
      :next_retry_at nil})))

(mu/defn record-dependency-status-failure!
  "Upsert the DependencyStatus of `entity-type` `entity-id`, creating it if needed. `update-fn` receives the
  existing DependencyStatus row (or nil if none exists) and must return the columns to set."
  [entity-type :- EntityType
   entity-id   :- ms/PositiveInt
   update-fn   :- fn?]
  (mdb/update-or-insert!
   :model/DependencyStatus
   {:entity_type entity-type :entity_id entity-id}
   update-fn))

(mu/defn pending-retry-exists?
  "Whether a non-terminal DependencyStatus is waiting for a retry."
  []
  (dependency-status-exists? {:terminal false :next_retry_at_set true}))

(mu/defn instances-for-dependency-calculation
  "Up to `batch-size` instances of the entity type `entity-type` without a DependencyStatus, or whose status is
  stale or below `current-version`, is not terminal, and whose retry time has passed at `now`; stale ones first."
  [entity-type     :- ::deps.dependency-types/dependency-types
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt
   now             :- ms/TemporalInstant]
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
;;; The queries on `:model/AnalysisFinding` below follow [[::analysis-finding-opts]]; the join/aggregate query at the
;;; bottom of this section does not fit it and stays bespoke.

(mr/def ::analysis-finding-filters
  "Which AnalysisFindings a query applies to. Keys mirror the columns of `analysis_finding`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id                   {:optional true} ms/PositiveInt]
   [:analyzed_entity_type {:optional true} EntityType]
   [:analyzed_entity_id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:stale                {:optional true} :boolean]])

(mr/def ::analysis-finding-opts
  "The filters above plus the columns to select."
  [:merge
   ::analysis-finding-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::dependencies.schema/analysis-finding.column]]]])

(defn- analysis-finding-model [columns] (u.query/model-with-columns :model/AnalysisFinding columns))
(defn- analysis-finding-args [opts] (u.query/opts->args opts))
(defn- analysis-finding-kv-args [opts] (u.query/opts->kv-args opts))

(mu/defn select-one-analysis-finding-pk :- [:maybe ms/PositiveInt]
  "The id of the first AnalysisFinding matching `opts`, or nil."
  [opts :- [:maybe ::analysis-finding-opts]]
  (apply t2/select-one-pk :model/AnalysisFinding (analysis-finding-args opts)))

(mu/defn insert-analysis-finding! :- ::dependencies.schema/analysis-finding
  "Insert the AnalysisFinding `row` and return the inserted instance."
  [row :- ::dependencies.schema/analysis-finding.create]
  (t2/insert-returning-instance! :model/AnalysisFinding row))

(mu/defn update-analysis-findings! :- :int
  "Apply `changes` to every AnalysisFinding matching `opts`, returning the number updated."
  [opts    :- [:maybe ::analysis-finding-opts]
   changes :- ::dependencies.schema/analysis-finding.update]
  (apply t2/update! :model/AnalysisFinding (conj (analysis-finding-kv-args opts) changes)))

(mu/defn analysis-finding-exists? :- :boolean
  "Whether an AnalysisFinding matching `opts` exists."
  [opts :- [:maybe ::analysis-finding-opts]]
  (apply t2/exists? :model/AnalysisFinding (analysis-finding-args opts)))

(mu/defn count-analysis-findings :- :int
  "The number of AnalysisFindings matching `opts`."
  [opts :- [:maybe ::analysis-finding-opts]]
  (apply t2/count :model/AnalysisFinding (analysis-finding-args opts)))

(mu/defn instances-for-analysis
  "Up to `batch-size` instances of the entity type `entity-type` whose AnalysisFinding is stale, missing, or below
  `current-version`; stale ones first, then the longest unanalyzed."
  [entity-type     :- ::deps.dependency-types/dependency-types
   batch-size      :- ms/PositiveInt
   current-version :- ms/PositiveInt]
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

(mu/defn table-ids-with-outdated-findings
  "The IDs of the Tables of the Database with `db-id` whose dependents were analyzed before the Table, one of its
  Fields, or one of its Fields' user settings last changed."
  [db-id :- ::lib.schema.id/database]
  (t2/select-fn-set :table_id :model/AnalysisFinding
                    {:select     [:field_updates/table_id]
                     :from       [[^:allow-subquery {:select    [[:table/id :table_id]
                                                                 [:table/updated_at :last_table_update]
                                                                 [[:max [:case
                                                                         [:>= :field/updated_at
                                                                          [:coalesce :field_settings/updated_at :field/updated_at]]
                                                                         :field/updated_at
                                                                         :else :field_settings/updated_at]]
                                                                  :last_field_update]]
                                                     :from      [(warehouse-schema-overlay/table-query {:alias :table})]
                                                     :left-join [(warehouse-schema-overlay/field-query {:alias :field})
                                                                 [:= :field/table_id :table/id]
                                                                 [(t2/table-name :model/FieldUserSettings) :field_settings]
                                                                 [:= :field_settings/field_id :field/id]]
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
;;; The queries on `:model/AnalysisFindingError` below follow [[::analysis-finding-error-opts]]; the visibility-aware
;;; reads above do not fit it and stay bespoke.

(mr/def ::analysis-finding-error-filters
  "Which AnalysisFindingErrors a query applies to. Keys mirror the columns of `analysis_finding_error`: a scalar
  matches that value."
  [:map {:closed true}
   [:analyzed_entity_type {:optional true} EntityType]
   [:analyzed_entity_id   {:optional true} ms/PositiveInt]
   [:source_entity_type   {:optional true} [:maybe EntityType]]
   [:source_entity_id     {:optional true} ms/PositiveInt]])

(mr/def ::analysis-finding-error-opts
  "The filters above plus the columns to select."
  [:merge
   ::analysis-finding-error-filters
   [:map {:closed true}
    [:columns {:optional true} [:sequential ::dependencies.schema/analysis-finding-error.column]]]])

(defn- analysis-finding-error-model [columns] (u.query/model-with-columns :model/AnalysisFindingError columns))
(defn- analysis-finding-error-args [opts] (u.query/opts->args opts))

(mu/defn select-analysis-finding-errors :- [:sequential ::dependencies.schema/analysis-finding-error.partial]
  "The AnalysisFindingErrors matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::analysis-finding-error-opts]]
  (apply t2/select (analysis-finding-error-model columns) (analysis-finding-error-args opts)))

(mu/defn insert-analysis-finding-errors! :- :int
  "Insert the AnalysisFindingError `rows`, returning the number inserted."
  [rows :- [:sequential ::dependencies.schema/analysis-finding-error.create]]
  (t2/insert! :model/AnalysisFindingError rows))

(mu/defn delete-analysis-finding-errors! :- :int
  "Delete every AnalysisFindingError matching `opts`, returning the number deleted."
  [opts :- [:maybe ::analysis-finding-error-opts]]
  (apply t2/delete! :model/AnalysisFindingError (analysis-finding-error-args opts)))
