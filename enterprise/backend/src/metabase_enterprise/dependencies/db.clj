(ns metabase-enterprise.dependencies.db
  "Application database queries for the dependencies module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration methods, and transactions."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Composed queries ------------------------------------------------
;;; The dependency graph endpoints build their Honey SQL out of the permission visibility clause and per-entity-type
;;; union members, so those queries arrive here fully assembled.

(defn query-rows
  "Run the Honey SQL `query` and return its rows."
  [query]
  (t2/query query))

(defn dependencies-matching
  "The Dependencies matching the Honey SQL `where` clause."
  [where]
  (t2/select :model/Dependency {:where where}))

(defn finding-errors-matching
  "The AnalysisFindingErrors matching the Honey SQL `where` clause."
  [where]
  (t2/select :model/AnalysisFindingError {:where where}))

;;; ---------------------------------------------------- Entities ----------------------------------------------------

(defn instances
  "The instances of `model` with `ids`."
  [model ids]
  (t2/select model :id [:in ids]))

(defn instances-with-columns
  "The `columns` of the instances of `model` with `ids`."
  [model columns ids]
  (t2/select (into [model] columns) :id [:in ids]))

(defn instance-with-columns
  "The `columns` of the instance of `model` with `id`, or nil."
  [model columns id]
  (t2/select-one (into [model] columns) :id id))

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

(defn personal-root-collection-ids
  "The IDs of the personal Collections."
  []
  (t2/select-pks-vec :model/Collection :personal_owner_id [:not= nil] :location "/"))

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
  "Up to `batch-size` instances of `model` (of dependency type `entity-type`) without a DependencyStatus, or whose
  status is stale or below `current-version`, is not terminal, and whose retry time has passed at `now`; stale
  ones first."
  [model entity-type batch-size current-version now]
  (let [table-name     (t2/table-name model)
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
  "Up to `batch-size` instances of `model` (of dependency type `entity-type`) whose AnalysisFinding is stale,
  missing, or below `current-version`; stale ones first, then the longest unanalyzed."
  [model entity-type batch-size current-version]
  (let [table-name     (t2/table-name model)
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
