(ns metabase-enterprise.transform-testing.models
  (:require
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase.api.common :as api]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
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
  {:inputs       (json-column ::transform-testing.schema/inputs)
   :expectations (json-column ::transform-testing.schema/expectations)})

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :last_run]
  "Add the newest run, or nil, to each transform test."
  [_model _k transform-tests]
  (if-not (seq transform-tests)
    transform-tests
    (let [id->run (into {}
                        (map (juxt :transform_test_id identity))
                        (transform-testing.db/latest-transform-test-runs (into #{} (map :id) transform-tests)))]
      (for [transform-test transform-tests]
        (assoc transform-test :last_run (get id->run (:id transform-test)))))))

(defmethod audit-app/model-details :model/TransformTest
  [transform-test _event-type]
  (select-keys transform-test [:transform_id :name :description]))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(mu/defn can-run-test? :- :boolean
  "Whether the current user may run test SQL they write against the source Database of `transform`, as an ad hoc
  native query and a transform there need."
  [transform :- ::transforms.schema/transform.definition]
  (let [db-id (transforms-base.i/source-db-id transform)]
    (boolean
     (or api/*is-superuser?*
         (and db-id
              (transforms.u/source-readable? transform)
              (perms/has-db-transforms-permission? api/*current-user-id* db-id)
              (query-perms/can-run-query?
               (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")))))))

(mu/defn- can-save-test? :- :boolean
  "Whether the current user may save or delete a test of the Transform `transform-id`, while remote sync allows editing
  transforms."
  [transform-id :- ::lib.schema.id/transform]
  (boolean
   (and (remote-sync/transforms-editable?)
        (when-let [transform (transform-testing.db/transform transform-id)]
          (or api/*is-superuser?*
              (and (transforms-base.i/source-db-id transform)
                   (can-run-test? (transforms.u/->definition transform))))))))

(defmethod mi/can-read? :model/TransformTest
  ([instance]
   (mi/can-read? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (transform-testing.db/transform-test pk)]
     (mi/can-read? transform-test))))

(defmethod mi/can-write? :model/TransformTest
  ([instance]
   (can-save-test? (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (transform-testing.db/transform-test pk)]
     (mi/can-write? transform-test))))

(defmethod mi/can-create? :model/TransformTest
  [_model instance]
  (can-save-test? (:transform_id instance)))

(defmethod mi/can-update? :model/TransformTest
  [instance changes]
  (let [transform-id (:transform_id changes (:transform_id instance))]
    (and (can-save-test? (:transform_id instance))
         (or (= transform-id (:transform_id instance))
             (can-save-test? transform-id)))))

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
  (transform-testing.db/update-transform-test! id (select-keys serialized-instance revision-columns)))

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
  (transform-testing.db/delete-transform-tests! transform-id))

(t2/define-before-delete :model/TransformTest [transform-test]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/transform-test-delete {:object transform-test}))
  transform-test)

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serdes/make-spec "TransformTest"
  [_model-name _opts]
  {:schema    ::transform-testing.schema/external-transform-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:transform_id (serdes/fk :model/Transform)
               :creator_id   (serdes/fk :model/User)}})

(defmethod serdes/deserialization-dependencies "TransformTest"
  [{:keys [transform_id]}]
  #{[{:model "Transform" :id transform_id}]})

(defmethod serdes/storage-path "TransformTest" [transform-test ctx]
  (let [{:keys [transform]} (t2/hydrate (transform-testing.db/transform-test-by-entity-id (:entity_id transform-test))
                                        :transform)]
    (conj (serdes/storage-path {:serdes/meta   [{:model "Transform" :id (:entity_id transform)}]
                                :name          (:name transform)
                                :entity_id     (:entity_id transform)
                                :collection_id (serdes/*export-fk* (:collection_id transform) :model/Collection)}
                               ctx)
          {:label (:name transform-test) :key (:entity_id transform-test)})))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serialization/spec :model/TransformTest [_]
  {:schema    ::transform-testing.schema/external-transform-test
   :copy      [:entity_id :name :description :inputs :expectations]
   :transform {:transform_id (serialization/fk-transform :model/Transform)
               :creator_id   serialization/user-transform}})

(defmethod serialization/storage-paths :model/TransformTest [_ entities _ctx]
  (let [transforms (u/index-by :entity_id (transform-testing.db/transforms-by-entity-ids
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
