(ns metabase-enterprise.dependencies.events
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.findings :as deps.findings]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase-enterprise.dependencies.task.entity-check :as task.entity-check]
   [metabase-enterprise.transforms.core :as transforms]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; ## Maintaining the dependency graph
;; The below listens for inserts, updates and deletes of cards, snippets and transforms in order to keep the
;; dependency graph up to date. Transform *runs* are also a trigger, since the transform's output table may be created
;; or changed at that point.

(defmacro ignore-errors
  "Ignore errors.

  In practice, we cannot reliably distinguish permanent and temporary errors, so in principle
  every error should be retried a few times. Unfortunately that doesn't work, because updating the
  dependency_analysis_version field itself is a trigger for new analysis, so the caller has no
  way to give up and commit the new version after a few retries. We stop on every error until this
  becomes a serious enough issue, at which point we will have to redesign version marking and
  analysis triggering."
  {:style/indent 0}
  [& body]
  `(try
     ~@body
     (catch Throwable e#
       (log/error e# "Dependency calculation failed")
       nil)))

;; ### Cards
(derive ::card-deps :metabase/event)
(derive :event/card-create ::card-deps)
(derive :event/card-update ::card-deps)
;; Backfill-only event that triggers dependency calculation without creating a revision (#66365)
(derive :event/card-dependency-backfill ::card-deps)

(methodical/defmethod events/publish-event! ::card-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :card (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:card object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Card (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::card-delete :metabase/event)
(derive :event/card-delete ::card-delete)

(methodical/defmethod events/publish-event! ::card-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :card :from_entity_id (:id object))))

;; ### Snippets
(derive ::snippet-deps :metabase/event)
(derive :event/snippet-create ::snippet-deps)
(derive :event/snippet-update ::snippet-deps)

(methodical/defmethod events/publish-event! ::snippet-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :snippet (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:snippet object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/NativeQuerySnippet (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::snippet-delete :metabase/event)
(derive :event/snippet-delete ::snippet-delete)

(methodical/defmethod events/publish-event! ::snippet-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :snippet :from_entity_id (:id object))))

;; ### Transforms
(derive ::transform-deps :metabase/event)
(derive :event/create-transform ::transform-deps)
(derive :event/update-transform ::transform-deps)

;; On *saving* a transform, the upstream deps of its query are computed and saved.
(defn- drop-outdated-target-dep! [{:keys [id target] :as transform}]
  (let [db-id                (transforms/transform-source-database transform)
        downstream-table-ids (t2/select-fn-set :from_entity_id :model/Dependency
                                               :from_entity_type :table
                                               :to_entity_type   :transform
                                               :to_entity_id     id)
        downstream-tables    (when (seq downstream-table-ids)
                               (t2/select :model/Table :id [:in downstream-table-ids]))
        outdated-tables      (remove (fn [table]
                                       (and (= (:schema table) (:schema target))
                                            (= (:name   table) (:name   target))
                                            (or (not db-id)
                                                (= db-id (:db_id table)))))
                                     downstream-tables)
        not-found-table-ids  (remove (into #{} (map :id) downstream-tables)
                                     downstream-table-ids)]
    (when-let [outdated-downstream-table-ids (seq (into (set not-found-table-ids)
                                                        (map :id) outdated-tables))]
      (t2/delete! :model/Dependency
                  :from_entity_type :table
                  :from_entity_id   [:in outdated-downstream-table-ids]
                  :to_entity_type   :transform
                  :to_entity_id     id))))

(methodical/defmethod events/publish-event! ::transform-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :transform (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:transform object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Transform (:id object) {:dependency_analysis_version models.dependency/current-dependency-analysis-version}))
      (drop-outdated-target-dep! object))))

(derive ::transform-delete :metabase/event)
(derive :event/delete-transform ::transform-delete)

(methodical/defmethod events/publish-event! ::transform-delete
  [_ {:keys [id]}]
  ;; TODO: (Braden 09/18/2025) Shouldn't we be deleting the downstream deps for dead edges as well as upstream?
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :transform :from_entity_id id)))

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
;; Backfill-only event that triggers dependency calculation without creating a revision
(derive :event/dashboard-dependency-backfill ::dashboard-deps)

(methodical/defmethod events/publish-event! ::dashboard-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (let [dashboard-id (:id object)
            dashcards (t2/select :model/DashboardCard :dashboard_id dashboard-id)
            series-card-ids (when (seq dashcards)
                              (t2/select-fn-set :card_id :model/DashboardCardSeries
                                                :dashboardcard_id [:in (map :id dashcards)]))
            dashboard (assoc object :dashcards dashcards :series-card-ids series-card-ids)]
        (models.dependency/replace-dependencies! :dashboard dashboard-id
                                                 (ignore-errors
                                                  (deps.calculation/upstream-deps:dashboard dashboard))))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Dashboard (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::dashboard-delete :metabase/event)
(derive :event/dashboard-delete ::dashboard-delete)

(methodical/defmethod events/publish-event! ::dashboard-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :dashboard :from_entity_id (:id object))))

;; ### Documents
(derive ::document-deps :metabase/event)
(derive :event/document-create ::document-deps)
(derive :event/document-update ::document-deps)

(methodical/defmethod events/publish-event! ::document-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :document (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:document object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Document (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::document-delete :metabase/event)
(derive :event/document-delete ::document-delete)

(methodical/defmethod events/publish-event! ::document-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :document :from_entity_id (:id object))))

;; ### Sandboxes
(derive ::sandbox-deps :metabase/event)
(derive :event/sandbox-create ::sandbox-deps)
(derive :event/sandbox-update ::sandbox-deps)

(methodical/defmethod events/publish-event! ::sandbox-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :sandbox (:id object) (ignore-errors
                                                                      (deps.calculation/upstream-deps:sandbox object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Sandbox (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::sandbox-delete :metabase/event)
(derive :event/sandbox-delete ::sandbox-delete)

(methodical/defmethod events/publish-event! ::sandbox-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :sandbox :from_entity_id (:id object))))

;; ### Segments
(derive ::segment-deps :metabase/event)
(derive :event/segment-create ::segment-deps)
(derive :event/segment-update ::segment-deps)

(methodical/defmethod events/publish-event! ::segment-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :segment (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:segment object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Segment (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::segment-delete :metabase/event)
(derive :event/segment-delete ::segment-delete)

(methodical/defmethod events/publish-event! ::segment-delete
  [_ {:keys [object]}]
  (t2/delete! :model/Dependency :from_entity_type :segment :from_entity_id (:id object)))

;; ### Measures
(derive ::measure-deps :metabase/event)
(derive :event/measure-create ::measure-deps)
(derive :event/measure-update ::measure-deps)

(methodical/defmethod events/publish-event! ::measure-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies! :measure (:id object)
                                               (ignore-errors
                                                (deps.calculation/upstream-deps:measure object)))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Measure (:id object)
                    {:dependency_analysis_version models.dependency/current-dependency-analysis-version})))))

(derive ::measure-delete :metabase/event)
(derive :event/measure-delete ::measure-delete)

(methodical/defmethod events/publish-event! ::measure-delete
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/delete! :model/Dependency :from_entity_type :measure :from_entity_id (:id object))))

(derive ::check-card-dependents :metabase/event)
(derive :event/card-create ::check-card-dependents)
(derive :event/card-update ::check-card-dependents)
(derive :event/card-delete ::check-card-dependents)

(methodical/defmethod events/publish-event! ::check-card-dependents
  [_ {:keys [object]}]
  (when (and (premium-features/has-feature? :dependencies)
             (not (models.dependency/is-native-entity? :card object)))
    (lib-be/with-metadata-provider-cache
      (let [has-stale-dependents? (t2/with-transaction [_conn]
                                    (deps.findings/upsert-analysis! object)
                                    (deps.findings/mark-dependents-stale! :card (:id object)))]
        (when has-stale-dependents?
          (task.entity-check/trigger-entity-check-job!))))))

(derive ::check-transform :metabase/event)
(derive :event/create-transform ::check-transform)
(derive :event/update-transform ::check-transform)
(derive :event/delete-transform ::check-transform)

(methodical/defmethod events/publish-event! ::check-transform
  [_ {:keys [object]}]
  (when (and (premium-features/has-feature? :dependencies)
             (not (models.dependency/is-native-entity? :transform object)))
    (lib-be/with-metadata-provider-cache
      (deps.findings/upsert-analysis! object))))

(derive ::check-segment-dependents :metabase/event)
(derive :event/segment-create ::check-segment-dependents)
(derive :event/segment-update ::check-segment-dependents)
(derive :event/segment-delete ::check-segment-dependents)

(methodical/defmethod events/publish-event! ::check-segment-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (lib-be/with-metadata-provider-cache
      (let [has-stale-dependents? (t2/with-transaction [_conn]
                                    (deps.findings/upsert-analysis! object)
                                    (deps.findings/mark-dependents-stale! :segment (:id object)))]
        (when has-stale-dependents?
          (task.entity-check/trigger-entity-check-job!))))))

(derive ::check-transform-dependents :metabase/event)
(derive :event/transform-run-complete ::check-transform-dependents)

(methodical/defmethod events/publish-event! ::check-transform-dependents
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (when (deps.findings/mark-dependents-stale! :transform (:transform-id object))
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
                 (deps.findings/mark-all-dependents-stale! {:table changes}))
        (task.entity-check/trigger-entity-check-job!)))))
