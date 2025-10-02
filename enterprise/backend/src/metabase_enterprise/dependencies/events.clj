(ns metabase-enterprise.dependencies.events
  (:require
   [metabase-enterprise.dependencies.calculation :as deps.calculation]
   [metabase-enterprise.dependencies.models.dependency :as models.dependency]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; ## Maintaining the dependency graph
;; The below listens for inserts, updates and deletes of cards, snippets and transforms in order to keep the
;; dependency graph up to date. Transform *runs* are also a trigger, since the transform's output table may be created
;; or changed at that point.

;; ### Cards
(derive ::card-deps :metabase/event)
(derive :event/card-create ::card-deps)
(derive :event/card-update ::card-deps)

(methodical/defmethod events/publish-event! ::card-deps
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (t2/with-transaction [_conn]
      (models.dependency/replace-dependencies :card (:id object) (deps.calculation/upstream-deps:card object))
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
      (models.dependency/replace-dependencies :snippet (:id object) (deps.calculation/upstream-deps:snippet object))
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
(defn- drop-outdated-target-dep! [{:keys [id source target] :as _transform}]
  (let [db-id                (some-> source :query :database)
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
      (models.dependency/replace-dependencies :transform (:id object) (deps.calculation/upstream-deps:transform object))
      (when (not= (:dependency_analysis_version object) models.dependency/current-dependency-analysis-version)
        (t2/update! :model/Transform (:id object) {:dependency_analysis_version models.dependency/current-dependency-analysis-version}))
      (drop-outdated-target-dep! object))))

(derive ::transform-delete :metabase/event)
(derive :event/delete-transform ::transform-delete)

(methodical/defmethod events/publish-event! ::transform-delete
  [_ {:keys [id]}]
  (when (premium-features/has-feature? :dependencies)
    ;; TODO: (Braden 09/18/2025) Shouldn't we be deleting the downstream deps for dead edges as well as upstream?
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
      (models.dependency/replace-dependencies :table table-id {:transform #{transform-id}}))))

(methodical/defmethod events/publish-event! ::transform-run
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :dependencies)
    (transform-table-deps! object)))
