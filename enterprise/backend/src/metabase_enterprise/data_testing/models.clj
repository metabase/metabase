(ns metabase-enterprise.data-testing.models
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTest [_model] :transform_test)

(doto :model/TransformTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(mu/defn- json-column :- [:map {:closed true} [:in fn?] [:out fn?]]
  "A Toucan transform storing a value of `schema` as JSON, normalized and validated on its way in and normalized on its
  way out."
  [schema :- :keyword]
  {:in  (comp mi/json-in #(mu/validate-throw schema %) #(lib/normalize schema %))
   :out (comp #(lib/normalize schema %) mi/json-out-with-keywordization)})

(methodical/defmethod t2/model-for-automagic-hydration [:model/TransformTest :transform]
  [_original-model _k]
  :model/Transform)

(t2/deftransforms :model/TransformTest
  {:inputs       (json-column ::data-testing.schema/inputs)
   :expectations (json-column ::data-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :last_run]
  "Add the newest run, or nil, to each transform test."
  [_model _k transform-tests]
  (if-not (seq transform-tests)
    transform-tests
    (let [id->run (into {}
                        (map (juxt :test_id identity))
                        (data-testing.db/latest-test-runs :transform (into #{} (map :id) transform-tests)))]
      (for [transform-test transform-tests]
        (assoc transform-test :last_run (get id->run (:id transform-test)))))))

(defmethod audit-app/model-details :model/TransformTest
  [transform-test _event-type]
  (select-keys transform-test [:transform_id :name :description]))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(mu/defn- can-write-native-sql? :- :boolean
  "Whether the current user may run native SQL against the Database `db-id`. False for a nil `db-id`, unless the user
  is a superuser."
  [db-id :- [:maybe ::lib.schema.id/database]]
  (boolean
   (or api/*is-superuser?*
       (when db-id
         (query-perms/can-run-query?
          (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1"))))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Transform `transform-id`: they may edit it, and write the
  native SQL of a test against its source Database."
  [transform-id :- ::lib.schema.id/transform]
  (boolean
   (when-let [transform (data-testing.db/transform transform-id)]
     (and (mi/can-write? transform)
          (can-write-native-sql? (transforms-base.i/source-db-id transform))))))

(mu/defn can-run-test? :- :boolean
  "Whether the current user may run a test of the Transform `transform-id`: they may read it, and run the native SQL of
  a test against its source Database."
  [transform-id :- ::lib.schema.id/transform]
  (boolean
   (when-let [transform (data-testing.db/transform transform-id)]
     (and (mi/can-read? transform)
          (can-write-native-sql? (transforms-base.i/source-db-id transform))))))

(defmethod mi/can-read? :model/TransformTest
  ([instance]
   (mi/can-read? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (data-testing.db/transform-test pk)]
     (mi/can-read? transform-test))))

(defmethod mi/can-write? :model/TransformTest
  ([instance]
   (and (remote-sync/can-write? :model/TransformTest (:id instance))
        (can-save-test? (:transform_id instance))))
  ([_model pk]
   (when-let [transform-test (data-testing.db/transform-test pk)]
     (mi/can-write? transform-test))))

(defmethod mi/can-create? :model/TransformTest
  [_model instance]
  (can-save-test? (:transform_id instance)))

(defmethod mi/can-update? :model/TransformTest
  [instance changes]
  (and (can-save-test? (:transform_id instance))
       (can-save-test? (:transform_id changes (:transform_id instance)))
       (or (not (remote-sync/synced-changes? :model/TransformTest instance changes))
           (remote-sync/can-write? :model/TransformTest (:id instance)))))

;;; -------------------------------------------------- Revisions ---------------------------------------------------

(def ^:private revision-columns
  [:transform_id :name :description :inputs :expectations])

(defmethod revision/serialize-instance :model/TransformTest
  [_model _id transform-test]
  (select-keys transform-test revision-columns))

(defmethod revision/revision-readable? :model/TransformTest
  [_model object]
  (mi/can-read? (t2/instance :model/TransformTest object)))

(defmethod revision/revert-to-revision! :model/TransformTest
  [_model id _user-id serialized-instance]
  (data-testing.db/update-transform-test! id (select-keys serialized-instance revision-columns)))

;;; ---------------------------------------------------- Events ----------------------------------------------------

(t2/define-after-insert :model/TransformTest [transform-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/transform-test-create
                           {:object  (t2/instance :model/TransformTest transform-test)
                            :user-id (:creator_id transform-test)}))
  transform-test)

(t2/define-after-update :model/TransformTest [transform-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/transform-test-update
                           {:object (t2/instance :model/TransformTest transform-test)}))
  transform-test)

(defenterprise delete-transform-tests!
  "Enterprise implementation: delete the tests of the transform `transform-id`, each through its own hook. Runs
  whatever the token says, since the rows outlive the feature. See the OSS declaration in
  `metabase.transforms.models.transform`."
  :feature :none
  [transform-id]
  (data-testing.db/delete-transform-tests! transform-id))

(t2/define-before-delete :model/TransformTest [transform-test]
  ;; No foreign key keeps a run's test id valid, so the hook sets the test id of the test's runs to null, in the
  ;; delete's transaction. Toucan 2 has no after-delete hook.
  (data-testing.db/clear-test-id-of-runs! :transform (:id transform-test))
  (when-not mi/*deserializing?*
    (events/publish-event! :event/transform-test-delete {:object transform-test}))
  transform-test)

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/TransformTest [_]
  {:schema    ::data-testing.schema/external-transform-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:transform_id (serialization/fk-transform :model/Transform)
               :creator_id   serialization/user-transform}})

(defmethod serialization/storage-paths :model/TransformTest [_ entities _ctx]
  (let [transforms (u/index-by :entity_id (data-testing.db/transforms-by-entity-ids
                                           (vec (distinct (keep :transform_id entities)))))
        coll-eids  (zipmap (keys transforms)
                           (serialization/column-refs serialization/app-db-store :model/Collection
                                                      (map :collection_id (vals transforms))))
        paths      (serialization/batch-storage-paths
                    (for [transform-test entities
                          :let [{eid :entity_id transform-name :name} (get transforms (:transform_id transform-test))]]
                      {:serdes/meta   [{:model "Transform"}]
                       :name          transform-name
                       :entity_id     eid
                       :collection_id (get coll-eids eid)}))]
    (mapv (fn [transform-test path]
            (conj path {:label (:name transform-test) :key (:entity_id transform-test)}))
          entities paths)))

(defmethod serialization/import-dependencies :model/TransformTest [_ entities]
  (mapv (fn [{:keys [transform_id]}]
          #{[:model/Transform transform_id]})
        entities))

(defmethod remote-sync/spec :model/TransformTest
  [_model]
  {:parent               (fn [{:keys [transform_id]}] [:model/Transform transform_id])
   :synced-filter-clause data-testing.db/synced-transform-tests-clause})
