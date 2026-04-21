(ns metabase-enterprise.dependencies.events
  (:require
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase-enterprise.dependencies.task.backfill :as task.backfill]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; ## Maintaining the dependency graph
;; The below listens for inserts, updates and deletes of cards, snippets and transforms in order to keep the
;; dependency graph up to date. Transform *runs* are also a trigger, since the transform's output table may be created
;; or changed at that point.
;;
;; Create/update handlers mark entities stale in dependency_status. The backfill task does the actual computation.

(defn- mark-stale-and-trigger!
  "Mark an entity as stale in dependency_status and trigger the backfill job."
  [entity-type entity-id]
  (try
    (deps.dependency-status/mark-stale! entity-type [entity-id])
    (task.backfill/trigger-backfill-job!)
    (catch Throwable e
      (log/error e "Failed to mark entity stale" {:entity-type entity-type :entity-id entity-id}))))

;; ### Cards
(derive ::card-deps :metabase/event)
(derive :event/card-create ::card-deps)
(derive :event/card-update ::card-deps)

(methodical/defmethod events/publish-event! ::card-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :card (:id object))))

(derive ::card-delete :metabase/event)
(derive :event/card-delete ::card-delete)

(methodical/defmethod events/publish-event! ::card-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :card :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :card :entity_id (:id object))))

;; ### Snippets
(derive ::snippet-deps :metabase/event)
(derive :event/snippet-create ::snippet-deps)
(derive :event/snippet-update ::snippet-deps)

(methodical/defmethod events/publish-event! ::snippet-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :snippet (:id object))))

(derive ::snippet-delete :metabase/event)
(derive :event/snippet-delete ::snippet-delete)

(methodical/defmethod events/publish-event! ::snippet-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :snippet :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :snippet :entity_id (:id object))))

;; ### Transforms
(derive ::transform-deps :metabase/event)
(derive :event/create-transform ::transform-deps)
(derive :event/update-transform ::transform-deps)

(methodical/defmethod events/publish-event! ::transform-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :transform (:id object))))

(derive ::transform-delete :metabase/event)
(derive :event/delete-transform ::transform-delete)

(methodical/defmethod events/publish-event! ::transform-delete
  [_ {:keys [id]}]
  ;; TODO: (Braden 09/18/2025) Shouldn't we be deleting the downstream deps for dead edges as well as upstream?
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :transform :from_entity_id id)
    (t2/delete! :model/DependencyStatus :entity_type :transform :entity_id id)))

;; On *executing* a transform, its (freshly synced) output table is made to depend on the transform.
;; (And if the target has changed, the old table's dep on the transform is dropped.)
;; The upstream deps of the transform are not touched - those change only when the transform is edited.
(derive ::transform-run :metabase/event)
(derive :event/transform-run-complete ::transform-run)

(defn- transform-table-deps! [{:keys [db-id output-schema output-table transform-id] :as _details}]
  (let [;; output-table is a keyword like :my_schema/my_table
        table-name (name output-table)]
    (when-let [table-id (t2/select-one-fn :id :model/Table :db_id db-id :schema output-schema :name table-name)]
      (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))))

(methodical/defmethod events/publish-event! ::transform-run
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (transform-table-deps! object)))

;; ### Dashboards
(derive ::dashboard-deps :metabase/event)
(derive :event/dashboard-create ::dashboard-deps)
(derive :event/dashboard-update ::dashboard-deps)

(methodical/defmethod events/publish-event! ::dashboard-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :dashboard (:id object))))

(derive ::dashboard-delete :metabase/event)
(derive :event/dashboard-delete ::dashboard-delete)

(methodical/defmethod events/publish-event! ::dashboard-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :dashboard :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :dashboard :entity_id (:id object))))

;; ### Documents
(derive ::document-deps :metabase/event)
(derive :event/document-create ::document-deps)
(derive :event/document-update ::document-deps)

(methodical/defmethod events/publish-event! ::document-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :document (:id object))))

(derive ::document-delete :metabase/event)
(derive :event/document-delete ::document-delete)

(methodical/defmethod events/publish-event! ::document-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :document :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :document :entity_id (:id object))))

;; ### Sandboxes
(derive ::sandbox-deps :metabase/event)
(derive :event/sandbox-create ::sandbox-deps)
(derive :event/sandbox-update ::sandbox-deps)

(methodical/defmethod events/publish-event! ::sandbox-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :sandbox (:id object))))

(derive ::sandbox-delete :metabase/event)
(derive :event/sandbox-delete ::sandbox-delete)

(methodical/defmethod events/publish-event! ::sandbox-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :sandbox :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :sandbox :entity_id (:id object))))

;; ### Segments
(derive ::segment-deps :metabase/event)
(derive :event/segment-create ::segment-deps)
(derive :event/segment-update ::segment-deps)

(methodical/defmethod events/publish-event! ::segment-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :segment (:id object))))

(derive ::segment-delete :metabase/event)
(derive :event/segment-delete ::segment-delete)

(methodical/defmethod events/publish-event! ::segment-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :segment :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :segment :entity_id (:id object))))

;; ### Measures
(derive ::measure-deps :metabase/event)
(derive :event/measure-create ::measure-deps)
(derive :event/measure-update ::measure-deps)

(methodical/defmethod events/publish-event! ::measure-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (mark-stale-and-trigger! :measure (:id object))))

(derive ::measure-delete :metabase/event)
(derive :event/measure-delete ::measure-delete)

(methodical/defmethod events/publish-event! ::measure-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :measure :from_entity_id (:id object))
    (t2/delete! :model/DependencyStatus :entity_type :measure :entity_id (:id object))))

;; ## Checking dependents for breakage (analysis_finding staleness)
;;
;; This is a SEPARATE staleness system from the dependency_status table above.
;; - dependency_status.stale: tracks whether an entity's upstream *dependency graph* needs recomputation.
;;   Handled by the backfill job (task.backfill).
;; - analysis_finding staleness: tracks whether an entity's dependents need re-analysis for *breakage detection*
;;   (e.g., a model column was removed — are downstream cards broken?). Handled by the entity-check job
;;   (task.entity-check).
;;
;; Both are triggered from the same entity events but serve different purposes and run independently.

(derive ::check-card-dependents :metabase/event)
(derive :event/card-create ::check-card-dependents)
(derive :event/card-update ::check-card-dependents)

(methodical/defmethod events/publish-event! ::check-card-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (deps.findings/mark-entity-stale! :card (:id object))
    (task.entity-check/trigger-entity-check-job!)))

(derive ::check-card-dependents-on-delete :metabase/event)
(derive :event/card-delete ::check-card-dependents-on-delete)

(methodical/defmethod events/publish-event! ::check-card-dependents-on-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :card (:id object))
      (task.entity-check/trigger-entity-check-job!))))

(derive ::check-transform :metabase/event)
(derive :event/create-transform ::check-transform)
(derive :event/update-transform ::check-transform)

(methodical/defmethod events/publish-event! ::check-transform
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (deps.findings/mark-entity-stale! :transform (:id object))
    (task.entity-check/trigger-entity-check-job!)))

(derive ::check-transform-on-delete :metabase/event)
(derive :event/delete-transform ::check-transform-on-delete)

(methodical/defmethod events/publish-event! ::check-transform-on-delete
  [_ {:keys [id]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :transform id)
      (task.entity-check/trigger-entity-check-job!))))

(derive ::check-segment-dependents :metabase/event)
(derive :event/segment-create ::check-segment-dependents)
(derive :event/segment-update ::check-segment-dependents)

(methodical/defmethod events/publish-event! ::check-segment-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (deps.findings/mark-entity-stale! :segment (:id object))
    (task.entity-check/trigger-entity-check-job!)))

(derive ::check-segment-dependents-on-delete :metabase/event)
(derive :event/segment-delete ::check-segment-dependents-on-delete)

(methodical/defmethod events/publish-event! ::check-segment-dependents-on-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :segment (:id object))
      (task.entity-check/trigger-entity-check-job!))))

(derive ::check-transform-dependents :metabase/event)
(derive :event/transform-run-complete ::check-transform-dependents)

(methodical/defmethod events/publish-event! ::check-transform-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :transform (:transform-id object))
      (task.entity-check/trigger-entity-check-job!))))

(defn- synced-db->direct-dependents-of-changed-tables
  "Given the `:db_id` of a freshly synced database, this examines all tables in the DB which were updated, or have
  fields which were updated, since the last time any cards depending on them were analyzed.

  It is important that this doesn't re-run the analysis for all dependents of every table whose DB got synced -
  most of the tables have no change every time.

  Returns the set of table IDs which have dependents that need re-analysis, possibly empty."
  [db-id]
  (t2/select-fn-set :table_id :model/AnalysisFinding
                    {:select    [:field_updates/table_id]
                     :from      [[{:select    [[:table/id :table_id]
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
                                   [:= :dep/to_entity_type [:inline "table"]]
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

(derive ::sync-completed-on-database :metabase/event)
(derive :event/sync-end ::sync-completed-on-database)

(methodical/defmethod events/publish-event! ::sync-completed-on-database
  [_ {db-id :database_id}]
  (when (premium-features/has-feature? :dependencies)
    (let [changes (synced-db->direct-dependents-of-changed-tables db-id)]
      (when (and (seq changes)
                 (deps.findings/mark-all-immediate-dependents-stale! {:table changes}))
        (task.entity-check/trigger-entity-check-job!)))))

;; ### Admin UI Table/Field Metadata Updates
;; When a table or field's metadata is updated via the admin UI, re-analyze all dependents of that table.
(derive ::check-table-metadata-update :metabase/event)
(derive :event/table-update ::check-table-metadata-update)

(methodical/defmethod events/publish-event! ::check-table-metadata-update
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :table (:id object))
      (task.entity-check/trigger-entity-check-job!))))

(derive ::check-field-metadata-update :metabase/event)
(derive :event/field-update ::check-field-metadata-update)

(methodical/defmethod events/publish-event! ::check-field-metadata-update
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-immediate-dependents-stale! :table (:table_id object))
      (task.entity-check/trigger-entity-check-job!))))
