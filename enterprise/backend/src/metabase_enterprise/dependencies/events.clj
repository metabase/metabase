(ns metabase-enterprise.dependencies.events
  (:require
   [metabase-enterprise.dependencies.db :as dependencies.db]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.analysis-finding :as deps.analysis-finding]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [methodical.core :as methodical]))

;; Writes of the tracked content are followed by the hooks in `metabase-enterprise.dependencies.hooks`. These
;; handlers cover the changes that are not content writes: transform runs, syncs and metadata edits.

;; On *executing* a transform, its (freshly synced) output table is made to depend on the transform.
;; (And if the target has changed, the old table's dep on the transform is dropped.)
;; The upstream deps of the transform are not touched - those change only when the transform is edited.
(events/derive! ::transform-run :metabase/event)
(events/derive! :event/transform-run-complete ::transform-run)

(defn- transform-table-deps! [{:keys [db-id output-schema output-table transform-id] :as _details}]
  (let [;; output-table is a keyword like :my_schema/my_table
        table-name (name output-table)]
    (when-let [table-id (dependencies.db/table-id-by-name db-id output-schema table-name)]
      (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))))

(methodical/defmethod events/publish-event! ::transform-run
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (transform-table-deps! object)))

(events/derive! ::check-transform-dependents :metabase/event)
(events/derive! :event/transform-run-complete ::check-transform-dependents)

(methodical/defmethod events/publish-event! ::check-transform-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-transitive-dependents-stale! {:transform [(:transform-id object)]})
      (task.entity-check/trigger-entity-check-job!))))

(defn- synced-db->direct-dependents-of-changed-tables
  "Given the `:db_id` of a freshly synced database, this examines all tables in the DB which were updated, or have
  fields which were updated, since the last time any cards depending on them were analyzed.

  It is important that this doesn't re-run the analysis for all dependents of every table whose DB got synced -
  most of the tables have no change every time.

  Returns the set of table IDs which have dependents that need re-analysis, possibly empty."
  [db-id]
  (dependencies.db/table-ids-with-outdated-findings db-id))

(events/derive! ::sync-completed-on-database :metabase/event)
(events/derive! :event/sync-end ::sync-completed-on-database)

(methodical/defmethod events/publish-event! ::sync-completed-on-database
  [_ {db-id :database_id}]
  (when (premium-features/has-feature? :dependencies)
    (let [changes (synced-db->direct-dependents-of-changed-tables db-id)]
      (when (and (seq changes)
                 (deps.findings/mark-transitive-dependents-stale! {:table changes}))
        (task.entity-check/trigger-entity-check-job!)))))

;; ### Admin UI Table/Field Metadata Updates
;; When a table or field's metadata is updated via the admin UI, re-analyze all dependents of that table.
(events/derive! ::check-table-metadata-update :metabase/event)
(events/derive! :event/table-update ::check-table-metadata-update)

(methodical/defmethod events/publish-event! ::check-table-metadata-update
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-transitive-dependents-stale! {:table [(:id object)]})
      (task.entity-check/trigger-entity-check-job!))))

(events/derive! ::check-field-metadata-update :metabase/event)
(events/derive! :event/field-update ::check-field-metadata-update)

(methodical/defmethod events/publish-event! ::check-field-metadata-update
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-transitive-dependents-stale! {:table [(:table_id object)]})
      (task.entity-check/trigger-entity-check-job!))))

;; ### Database Deletion (orphans transforms)
;; Transforms whose `source_database_id` matches the database being deleted survive the delete
;; but their existing `analysis_finding` rows still say "OK". Mark them stale here so the entity-check
;; job re-runs and surfaces them on `/monitor/dependency-diagnostics/broken`.
(defenterprise mark-transforms-stale-on-database-delete!
  "Enterprise implementation: mark all transforms whose source database is being deleted as stale
   for dependency re-analysis. See the OSS declaration in `metabase.warehouses.models.database`."
  :feature :dependencies
  [db-id]
  (when-let [transform-ids (not-empty (dependencies.db/transform-ids-of-source-database db-id))]
    (deps.analysis-finding/mark-stale! :transform transform-ids)
    (deps.findings/mark-transitive-dependents-stale! {:transform transform-ids})
    (task.entity-check/trigger-entity-check-job!)))
