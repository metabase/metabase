(ns metabase-enterprise.data-testing.models
  (:require
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.audit-app.core :as audit-app]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.query-permissions.core :as query-perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTest [_model] :transform_test)

(doto :model/TransformTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(mu/defn json-column :- [:map {:closed true} [:in fn?] [:out fn?]]
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

(defn with-last-runs
  "`tests`, saved tests of `test-type`, each with its newest run, or nil, under `:last_run`."
  [test-type tests]
  (if-not (seq tests)
    tests
    (let [id->run (into {}
                        (map (juxt :test_id identity))
                        (data-testing.db/latest-test-runs test-type (into #{} (map :id) tests)))]
      (for [saved-test tests]
        (assoc saved-test :last_run (get id->run (:id saved-test)))))))

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :last_run]
  "Add the newest run, or nil, to each transform test."
  [_model _k transform-tests]
  (with-last-runs :transform transform-tests))

(defmethod audit-app/model-details :model/TransformTest
  [transform-test _event-type]
  (select-keys transform-test [:transform_id :name :description]))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defn can-run-native-query?
  "Whether the current user may run native SQL against the Database with `db-id`, as the input and expectation SQL of a
  test does."
  [db-id]
  (query-perms/can-run-query? (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")))

(defn- can-save-for-transform?
  "Whether the current user may save or delete a test of `transform`: they may edit it, as `transform-writable?` says,
  and run the native SQL of a test against its source Database, as `can-run-native-query?` says."
  [transform transform-writable? can-run-native-query?]
  (boolean
   (and transform
        transform-writable?
        (or (mi/superuser?)
            (some-> (transforms-base.i/source-db-id transform) can-run-native-query?)))))

(mu/defn- can-save? :- :boolean
  "Whether the current user may save or delete a test of the Transform `transform-id` (see [[can-save-for-transform?]])."
  [transform-id :- ::lib.schema.id/transform]
  (let [transform (data-testing.db/transform transform-id)]
    (can-save-for-transform? transform (some-> transform mi/can-write?) can-run-native-query?)))

(mu/defn can-run-test? :- :boolean
  "Whether the current user may run a test of the Transform `transform-id`: they may read it, and run the native SQL of
  a test against its source Database."
  [transform-id :- ::lib.schema.id/transform]
  (let [transform (data-testing.db/transform transform-id)]
    (boolean
     (and transform
          (mi/can-read? transform)
          (or (mi/superuser?)
              (some-> (transforms-base.i/source-db-id transform) can-run-native-query?))))))

(defmethod mi/can-read? :model/TransformTest
  ([instance]
   (mi/can-read? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (data-testing.db/transform-test pk)]
     (mi/can-read? transform-test))))

(defmethod mi/can-write? :model/TransformTest
  ([instance]
   (and (remote-sync/can-write? :model/TransformTest (:id instance))
        (can-save? (:transform_id instance))))
  ([_model pk]
   (when-let [transform-test (data-testing.db/transform-test pk)]
     (mi/can-write? transform-test))))

(methodical/defmethod t2/batched-hydrate [:model/TransformTest :can_write]
  "Add whether the current user can write each transform test, loading their transforms at once and checking each
  source Database once."
  [_model k transform-tests]
  (mi/instances-with-hydrated-data
   transform-tests k
   #(let [transforms (u/index-by :id (t2/hydrate (data-testing.db/transforms
                                                  (into [] (comp (keep :transform_id) (distinct)) transform-tests))
                                                 :can_write))
          native?    (memoize can-run-native-query?)]
      (into {}
            (map (fn [{:keys [id transform_id]}]
                   [id (and (remote-sync/can-write? :model/TransformTest id)
                            (let [transform (get transforms transform_id)]
                              (can-save-for-transform? transform (:can_write transform) native?)))]))
            (remove nil? transform-tests)))
   :id
   {:default false}))

(defmethod mi/can-create? :model/TransformTest
  [_model instance]
  (can-save? (:transform_id instance)))

(defmethod mi/can-update? :model/TransformTest
  [instance changes]
  (and (can-save? (:transform_id instance))
       (can-save? (:transform_id changes (:transform_id instance)))
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

(defmethod revision/check-revisions-available :model/TransformTest
  [_model]
  (premium-features/assert-has-feature :transforms-testing (tru "Transforms Testing")))

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

(defn subject-storage-paths
  "The storage path of each of `tests`, saved tests whose `subject-key` holds the entity id of a row of
  `subject-model`: the path of the subject's file, as a directory, then the test's name. `fk-models` maps each column of
  the subject that the subject's storage path reads to the model the column references."
  [tests subject-model subject-key fk-models]
  (let [rows     (vals (serialization/rows-by-refs subject-model
                                                   (into #{} (keep subject-key) tests)
                                                   (into [:entity_id :name] (keys fk-models))))
        fk-refs  (into {}
                       (map (fn [[k model]]
                              [k (zipmap (map :entity_id rows)
                                         (serialization/column-refs serialization/app-db-store model (map k rows)))]))
                       fk-models)
        subjects (into {}
                       (map (fn [{eid :entity_id subject-name :name}]
                              [eid (into {:serdes/meta [{:model (name subject-model)}]
                                          :name        subject-name
                                          :entity_id   eid}
                                         (map (fn [[k refs]] [k (get refs eid)]))
                                         fk-refs)]))
                       rows)
        paths    (serialization/batch-storage-paths (mapv #(get subjects (subject-key %)) tests))]
    (mapv (fn [saved-test path]
            (conj path {:label (:name saved-test) :key (:entity_id saved-test)}))
          tests paths)))

(defmethod serialization/storage-paths :model/TransformTest [_ entities _ctx]
  (subject-storage-paths entities :model/Transform :transform_id {:collection_id :model/Collection}))

(defmethod serialization/import-dependencies :model/TransformTest [_ entities]
  (mapv (fn [{:keys [transform_id]}]
          #{[:model/Transform transform_id]})
        entities))

(defmethod remote-sync/spec :model/TransformTest
  [_model]
  {:parent               (fn [{:keys [transform_id]}] [:model/Transform transform_id])
   :synced-filter-clause data-testing.db/synced-transform-tests-clause})
