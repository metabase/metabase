(ns metabase-enterprise.data-testing.saved-test-models-test
  "What the four saved-test models share and where they differ: reading and writing a test through its subject, the
  remote-sync rule only transform tests follow, which revisions a user may read, and the events and run cleanup of
  their hooks."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.models.action-test]
   [metabase-enterprise.data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.transforms.models.transform :as transform]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-types
  "Each saved-test model, with its test type and the column that holds its subject's id."
  [{:model :model/TransformTest :test-type :transform :subject-key :transform_id}
   {:model :model/CardTest      :test-type :card      :subject-key :card_id}
   {:model :model/SegmentTest   :test-type :segment   :subject-key :segment_id}
   {:model :model/ActionTest    :test-type :action    :subject-key :action_id}])

(defn- do-with-subject
  "Call `f` with the id of a new subject of `test-type` that an admin may read and write and Rasta may not read."
  [test-type f]
  (case test-type
    :transform (mt/with-temp [:model/Transform {id :id} {}] (f id))
    :card      (mt/with-temp [:model/Card {id :id} {}] (f id))
    :segment   (mt/with-temp [:model/Segment {id :id} (data-testing.test-util/from-google-segment)] (f id))
    :action    (mt/with-actions [_ {:type :model :dataset_query (data-testing.test-util/categories-query)}
                                 {:keys [action-id]} {}]
                 (f action-id))))

(defn- do-with-each-test-type
  "Call `f` with each of [[test-types]] and the id of a saved test of a new subject, in a `testing` naming the model.
  Rasta has no collection or data permissions, so may read no subject; transforms are readable."
  [f]
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms.tu/with-no-data-perms-for-all-users!
          (doseq [{:keys [model test-type subject-key] :as spec} test-types]
            (testing model
              (do-with-subject
               test-type
               (fn [subject-id]
                 (mt/with-temp [model {test-id :id} {subject-key subject-id :name "A test"}]
                   (f (assoc spec :subject-id subject-id :test-id test-id))))))))))))

(defn- hydrated?
  "Whether the saved test `test-id` of `model`, hydrated with `k`, passes `check`, for `user`."
  [user model test-id k check]
  (mt/with-current-user (mt/user->id user)
    (boolean (check (t2/hydrate (t2/select-one model :id test-id) k)))))

(deftest a-test-is-read-and-written-through-its-subject-test
  (do-with-each-test-type
   (fn [{:keys [model test-id]}]
     (testing "an admin may read and write the test"
       (is (true? (hydrated? :crowberto model test-id :can_read mi/can-read?)))
       (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?))))
     (testing "a user who may not read the subject may neither read nor write the test"
       (is (false? (hydrated? :rasta model test-id :can_read mi/can-read?)))
       (is (false? (hydrated? :rasta model test-id :can_write mi/can-write?))))
     (testing "an admin may rename the test; a user who may not read the subject may not"
       (let [saved-test (t2/select-one model :id test-id)]
         (is (true? (mt/with-current-user (mt/user->id :crowberto)
                      (boolean (mi/can-update? saved-test {:name "Renamed"})))))
         (is (false? (mt/with-current-user (mt/user->id :rasta)
                       (boolean (mi/can-update? saved-test {:name "Renamed"})))))))
     (testing "an admin may create a test of the subject; a user who may not read it may not"
       (let [saved-test (t2/select-one model :id test-id)]
         (is (true? (mt/with-current-user (mt/user->id :crowberto)
                      (boolean (mi/can-create? model (dissoc saved-test :id)))))))
       (is (false? (mt/with-current-user (mt/user->id :rasta)
                     (boolean (mi/can-create? model (dissoc (t2/select-one model :id test-id) :id))))))))))

(deftest only-transform-tests-are-read-only-on-a-read-only-instance-test
  (do-with-each-test-type
   (fn [{:keys [model test-type test-id]}]
     (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-only]
       (let [saved-test  (t2/select-one model :id test-id)
             can-update? (fn [changes]
                           (mt/with-current-user (mt/user->id :crowberto)
                             (boolean (mi/can-update? saved-test changes))))]
         (if (= :transform test-type)
           (testing "the transform itself may not be written, so an admin may neither write nor change its test"
             (is (false? (hydrated? :crowberto model test-id :can_write mi/can-write?)))
             (is (false? (can-update? {:name "Renamed"})))
             (is (false? (can-update? {:name (:name saved-test)}))))
           (do
             (testing "the subject is not synced, so an admin may write the test"
               (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?))))
             (testing "the subject is not synced, so an admin may rename the test"
               (is (true? (can-update? {:name "Renamed"})))))))))))

(deftest transform-tests-follow-the-read-only-rule-on-their-own-test
  (testing "with the transform's own write check allowing everything, a read-only instance still refuses an admin"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-temp [:model/Transform     {transform-id :id} {}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "A test"}]
          (with-redefs [transform/transform-deletable? (constantly true)]
            (let [saved-test  (t2/select-one :model/TransformTest :id test-id)
                  can-update? (fn [changes]
                                (mt/with-current-user (mt/user->id :crowberto)
                                  (boolean (mi/can-update? saved-test changes))))]
              (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-only]
                (testing "premise: the transform may be written"
                  (is (true? (mt/with-current-user (mt/user->id :crowberto)
                               (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/Transform :id transform-id)
                                                                   :can_write)))))))
                (testing "an admin may not write the test"
                  (is (false? (hydrated? :crowberto :model/TransformTest test-id :can_write mi/can-write?))))
                (testing "an admin may not change a column that remote sync exports"
                  (is (false? (can-update? {:name "Renamed"}))))
                (testing "control: an update that changes no exported column is allowed"
                  (is (true? (can-update? {:name (:name saved-test)})))))
              (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-write]
                (testing "control: on a read-write instance an admin may write and rename the test"
                  (is (true? (hydrated? :crowberto :model/TransformTest test-id :can_write mi/can-write?)))
                  (is (true? (can-update? {:name "Renamed"}))))))))))))

(deftest a-test-is-writable-on-a-read-write-instance-test
  (do-with-each-test-type
   (fn [{:keys [model test-id]}]
     (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-write]
       (testing "control: on a read-write instance an admin may write and rename every kind of test"
         (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?)))
         (is (true? (mt/with-current-user (mt/user->id :crowberto)
                      (boolean (mi/can-update? (t2/select-one model :id test-id) {:name "Renamed"}))))))))))

(deftest revisions-are-readable-through-their-subject-test
  (do-with-each-test-type
   (fn [{:keys [model subject-key subject-id]}]
     (let [objects [{subject-key subject-id :name "On the subject"}
                    {subject-key Integer/MAX_VALUE :name "On a deleted subject"}]
           readable (fn [user]
                      (mt/with-current-user (mt/user->id user)
                        (mapv boolean (revision/revisions-readable? model objects))))]
       (testing "an admin may read a revision about the subject, and not one about a subject that no longer exists"
         (is (= [true false] (readable :crowberto))))
       (testing "a user who may not read the subject may read neither"
         (is (= [false false] (readable :rasta))))))))

(defn- published-topics
  "The topics `thunk` publishes, in order, with the `:user-id` of each event that has one."
  [thunk]
  (let [published (atom [])]
    (with-redefs [events/publish-event! (fn [topic event]
                                          (swap! published conj (cond-> [topic]
                                                                  (:user-id event) (conj (:user-id event))))
                                          event)]
      (thunk))
    @published))

(deftest hooks-publish-events-and-clear-runs-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (doseq [{:keys [model test-type subject-key]} test-types
            :let [topic   #(keyword "event" (str (name test-type) "-test-" %))
                  creator (mt/user->id :crowberto)]]
      (testing model
        (do-with-subject
         test-type
         (fn [subject-id]
           (let [test-id (atom nil)
                 run-id  (atom nil)]
             (try
               (testing "an insert publishes the create event with the creator, an update the update event"
                 (is (= [[(topic "create") creator] [(topic "update")]]
                        (published-topics
                         (fn []
                           (reset! test-id (t2/insert-returning-pk! model {subject-key  subject-id
                                                                           :creator_id   creator
                                                                           :name         "A test"
                                                                           :inputs       []
                                                                           :expectations []}))
                           (t2/update! model :id @test-id {:name "Renamed"}))))))
               (reset! run-id (:id (data-testing.run-tracking/start-run! test-type @test-id creator)))
               (testing "a delete publishes the delete event and clears the test id of the test's runs"
                 (is (= [[(topic "delete")]]
                        (published-topics #(t2/delete! model :id @test-id))))
                 (is (= {:test_type test-type :test_id nil}
                        (t2/select-one [:model/DataTestRun :test_type :test_id] :id @run-id))))
               (testing "while deserializing, no hook publishes"
                 (is (= []
                        (published-topics
                         (fn []
                           (binding [mi/*deserializing?* true]
                             (let [id (t2/insert-returning-pk! model {subject-key  subject-id
                                                                      :creator_id   creator
                                                                      :name         "Imported"
                                                                      :inputs       []
                                                                      :expectations []})]
                               (t2/update! model :id id {:name "Renamed"})
                               (t2/delete! model :id id))))))))
               (finally
                 (some->> @run-id (t2/delete! :model/DataTestRun :id))
                 (some->> @test-id (t2/delete! model :id)))))))))))
