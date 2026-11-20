(ns metabase-enterprise.data-testing.saved-test-models-test
  "What the four saved-test models share and where they differ: reading and writing a test through its subject, the
  remote-sync rule only transform tests follow, which revisions a user may read, a test's newest run, the topics of
  their lifecycle events, and the run cleanup of their delete hook."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.action-test]
   [metabase-enterprise.data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.transforms.models.transform :as transform]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-types
  "Each saved-test model, with its test type and the column that holds its subject's id."
  [{:model :model/TransformTest :test-type :transform :subject-key :transform_id}
   {:model :model/CardTest      :test-type :card      :subject-key :card_id}
   {:model :model/SegmentTest   :test-type :segment   :subject-key :segment_id}
   {:model :model/ActionTest    :test-type :action    :subject-key :action_id}])

(defn- do-with-subject!
  "Call `f` with the id of a new subject of `test-type` that an admin may read and write."
  [test-type f]
  (case test-type
    :transform (mt/with-temp [:model/Transform {id :id} {}] (f id))
    :card      (mt/with-temp [:model/Card {id :id} {}] (f id))
    :segment   (mt/with-temp [:model/Segment {id :id} (data-testing.test-util/from-google-segment)] (f id))
    :action    (mt/with-actions [_ {:type :model :dataset_query (data-testing.test-util/table-query :categories)}
                                 {:keys [action-id]} {}]
                 (f action-id))))

(defn- do-with-each-test-type!
  "Call `f` with each of [[test-types]] and the id of a saved test of a new subject, in a `testing` naming the model.
  Rasta has no collection or data permissions and is not a data analyst, so may read no subject."
  [f]
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (mt/with-non-admin-groups-no-root-collection-perms
        (perms.tu/with-no-data-perms-for-all-users!
          (doseq [{:keys [model test-type subject-key] :as spec} test-types]
            (testing model
              (do-with-subject!
               test-type
               (fn [subject-id]
                 (mt/with-temp [model {test-id :id} {subject-key subject-id :name "A test"}]
                   (f (assoc spec :subject-id subject-id :test-id test-id))))))))))))

(defn- hydrated?
  "Whether the saved test `test-id` of `model`, hydrated with `k`, passes `check`, for `user`."
  [user model test-id k check]
  (mt/with-test-user user
    (boolean (check (t2/hydrate (t2/select-one model :id test-id) k)))))

(defn- can-update?
  "Whether `user` may make `changes` to `saved-test`."
  [user saved-test changes]
  (mt/with-test-user user
    (boolean (mi/can-update? (t2/hydrate saved-test :can_write) changes))))

(deftest every-saved-test-spec-matches-its-schema-test
  (testing "premise: each saved-test model, and no other, has a saved-test spec"
    (is (= (set (map :model test-types))
           (set (keys (methods data-testing.models/saved-test-spec))))))
  (doseq [{:keys [model test-type subject-key]} test-types]
    (testing model
      (let [spec (data-testing.models/saved-test-spec model)]
        (is (nil? (mr/explain ::data-testing.models/saved-test-spec spec)))
        (is (= {:test-type test-type :subject-key subject-key} (select-keys spec [:test-type :subject-key]))))))
  (testing "control: a spec with a key the schema does not declare does not match it"
    (is (some? (mr/explain ::data-testing.models/saved-test-spec
                           (assoc (data-testing.models/saved-test-spec :model/CardTest) :remote-sync-gaurd? true))))))

(deftest a-test-is-read-and-written-through-its-subject-test
  (do-with-each-test-type!
   (fn [{:keys [model subject-key test-id]}]
     (testing "an admin may read and write the test"
       (is (true? (hydrated? :crowberto model test-id :can_read mi/can-read?)))
       (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?))))
     (testing "a user who may not read the subject may neither read nor write the test"
       (is (false? (hydrated? :rasta model test-id :can_read mi/can-read?)))
       (is (false? (hydrated? :rasta model test-id :can_write mi/can-write?))))
     (testing "nobody, not even an admin, may read a test whose subject no longer exists"
       (is (false? (mt/with-test-user :crowberto
                     (mi/can-read? (t2/hydrate (t2/instance model {:id test-id subject-key Integer/MAX_VALUE})
                                               :can_read))))))
     (testing "an admin may rename the test; a user who may not read the subject may not"
       (let [saved-test (t2/select-one model :id test-id)]
         (is (true? (can-update? :crowberto saved-test {:name "Renamed"})))
         (is (false? (can-update? :rasta saved-test {:name "Renamed"})))))
     (testing "an admin may create a test of the subject; a user who may not read it may not"
       (let [new-test (dissoc (t2/select-one model :id test-id) :id)]
         (is (true? (mt/with-test-user :crowberto (boolean (mi/can-create? model new-test)))))
         (is (false? (mt/with-test-user :rasta (boolean (mi/can-create? model new-test))))))))))

(deftest a-batch-gives-each-test-the-answer-for-its-own-subject-test
  ;; Card tests only: a non-admin's write on a transform or a segment needs the data analyst role, not a collection,
  ;; and only a superuser may write an action.
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {writable :id}       {}
                     :model/Collection {read-only :id}      {}
                     :model/Collection {hidden :id}         {}
                     :model/Card       {writable-card :id}  {:collection_id writable
                                                             :dataset_query (data-testing.test-util/table-query :categories)}
                     :model/Card       {read-only-card :id} {:collection_id read-only
                                                             :dataset_query (data-testing.test-util/table-query :categories)}
                     :model/Card       {hidden-card :id}    {:collection_id hidden
                                                             :dataset_query (data-testing.test-util/table-query :categories)}
                     :model/CardTest   {writable-test :id}  {:card_id writable-card :name "On the writable card"}
                     :model/CardTest   {read-only-test :id} {:card_id read-only-card :name "On the read-only card"}
                     :model/CardTest   {hidden-test :id}    {:card_id hidden-card :name "On the hidden card"}
                     :model/CardTest   {hidden-test-2 :id}  {:card_id hidden-card :name "Also on the hidden card"}]
        (perms/grant-collection-readwrite-permissions! (perms/all-users-group) writable)
        (perms/grant-collection-read-permissions! (perms/all-users-group) read-only)
        (let [batch (fn [user k check test-ids]
                      (mt/with-test-user user
                        (mapv (comp boolean check)
                              (t2/hydrate (mapv #(t2/select-one :model/CardTest :id %) test-ids) k))))]
          (testing "premise: hydrated alone, Rasta may write the test of the writable card and not the other"
            (is (true? (hydrated? :rasta :model/CardTest writable-test :can_write mi/can-write?)))
            (is (false? (hydrated? :rasta :model/CardTest read-only-test :can_write mi/can-write?))))
          (testing "premise: hydrated alone, Rasta may read the test of the read-only card and not of the hidden one"
            (is (true? (hydrated? :rasta :model/CardTest read-only-test :can_read mi/can-read?)))
            (is (false? (hydrated? :rasta :model/CardTest hidden-test :can_read mi/can-read?))))
          (testing "in one batch, each test gets the answer for its own card, whichever comes first"
            (is (= [true false] (batch :rasta :can_write mi/can-write? [writable-test read-only-test])))
            (is (= [false true] (batch :rasta :can_write mi/can-write? [read-only-test writable-test])))
            (is (= [true false true false]
                   (batch :rasta :can_read mi/can-read? [read-only-test hidden-test writable-test hidden-test-2])))
            (is (= [false true false]
                   (batch :rasta :can_read mi/can-read? [hidden-test-2 read-only-test hidden-test]))))
          (testing "control: an admin may read and write every test of the batch"
            (is (= [true true] (batch :crowberto :can_write mi/can-write? [writable-test read-only-test])))
            (is (= [true true true]
                   (batch :crowberto :can_read mi/can-read? [hidden-test read-only-test writable-test])))))))))

(deftest only-transform-tests-are-read-only-on-a-read-only-instance-test
  (do-with-each-test-type!
   (fn [{:keys [model test-type test-id]}]
     (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-only]
       (let [saved-test (t2/select-one model :id test-id)]
         (if (= :transform test-type)
           (testing "the transform itself may not be written, so an admin may neither write nor change its test"
             (is (false? (hydrated? :crowberto model test-id :can_write mi/can-write?)))
             (is (false? (can-update? :crowberto saved-test {:name "Renamed"})))
             (is (false? (can-update? :crowberto saved-test {:name (:name saved-test)}))))
           (do
             (testing "the subject is not synced, so an admin may write the test"
               (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?))))
             (testing "the subject is not synced, so an admin may rename the test"
               (is (true? (can-update? :crowberto saved-test {:name "Renamed"})))))))))))

(deftest transform-tests-follow-the-read-only-rule-on-their-own-test
  (testing "with the transform's own write check allowing everything, a read-only instance still refuses an admin"
    (mt/with-premium-features #{:transforms-basic :transforms-testing}
      (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
        (mt/with-temp [:model/Transform     {transform-id :id} {}
                       :model/TransformTest {test-id :id}      {:transform_id transform-id :name "A test"}]
          (mt/with-dynamic-fn-redefs [transform/transform-deletable? (constantly true)]
            (let [saved-test (t2/select-one :model/TransformTest :id test-id)]
              (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-only]
                (testing "premise: the transform may be written"
                  (is (true? (mt/with-test-user :crowberto
                               (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/Transform :id transform-id)
                                                                   :can_write)))))))
                (testing "an admin may not write the test"
                  (is (false? (hydrated? :crowberto :model/TransformTest test-id :can_write mi/can-write?))))
                (testing "an admin may not change a column that remote sync exports"
                  (is (false? (can-update? :crowberto saved-test {:name "Renamed"}))))
                (testing "control: an update that changes no exported column is allowed"
                  (is (true? (can-update? :crowberto saved-test {:name (:name saved-test)})))))
              (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-write]
                (testing "control: on a read-write instance an admin may write and rename the test"
                  (is (true? (hydrated? :crowberto :model/TransformTest test-id :can_write mi/can-write?)))
                  (is (true? (can-update? :crowberto saved-test {:name "Renamed"}))))))))))))

(deftest a-test-is-writable-on-a-read-write-instance-test
  (do-with-each-test-type!
   (fn [{:keys [model test-id]}]
     (remote-sync.tu/with-remote-sync ["file:///nonexistent/saved-test-models-test" :read-write]
       (testing "control: on a read-write instance an admin may write and rename every kind of test"
         (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?)))
         (is (true? (can-update? :crowberto (t2/select-one model :id test-id) {:name "Renamed"}))))))))

(deftest revisions-are-readable-through-their-subject-test
  (do-with-each-test-type!
   (fn [{:keys [model subject-key subject-id]}]
     (let [objects [{subject-key subject-id :name "On the subject"}
                    {subject-key Integer/MAX_VALUE :name "On a deleted subject"}]
           readable (fn [user]
                      (mt/with-test-user user
                        (mapv boolean (revision/revisions-readable? model objects))))]
       (testing "an admin may read a revision about the subject, and not one about a subject that no longer exists"
         (is (= [true false] (readable :crowberto))))
       (testing "a user who may not read the subject may read neither"
         (is (= [false false] (readable :rasta))))))))

(deftest last-run-is-the-newest-run-of-the-test-itself-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (doseq [{:keys [model test-type subject-key]} test-types
            :let [other-type (if (= :card test-type) :transform :card)]]
      (testing model
        (do-with-subject!
         test-type
         (fn [subject-id]
           ;; The run of another test type is the newest row, so a lookup that ignored the test type would find it.
           (mt/with-temp [model              {test-id :id}  {subject-key subject-id :name "With runs"}
                          model              {never-id :id} {subject-key subject-id :name "Never run"}
                          :model/DataTestRun _              {:test_type test-type :test_id test-id}
                          :model/DataTestRun {newest :id}   {:test_type test-type :test_id test-id}
                          :model/DataTestRun _              {:test_type other-type :test_id test-id}]
             (let [last-run-ids (fn [test-ids]
                                  (mapv (comp :id :last_run)
                                        (t2/hydrate (mapv #(t2/select-one model :id %) test-ids) :last_run)))]
               (testing "the newest run of the test, not an older one or a run of another test type with the same id"
                 (is (= [newest] (last-run-ids [test-id]))))
               (testing "a test with no runs has none"
                 (is (= [nil] (last-run-ids [never-id]))))
               (testing "in one batch, each test gets its own newest run, or none"
                 (is (= [nil newest] (last-run-ids [never-id test-id]))))))))))))

(deftest lifecycle-topics-and-run-cleanup-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (doseq [{:keys [model test-type subject-key]} test-types
            :let [topic   #(keyword "event" (str (name test-type) "-test-" %))
                  creator (mt/user->id :crowberto)]]
      (testing model
        (testing "a write publishes the lifecycle event named after the test type"
          (is (= {:create (topic "create") :update (topic "update") :delete (topic "delete")}
                 (events/spec model))))
        (do-with-subject!
         test-type
         (fn [subject-id]
           (let [test-id (t2/insert-returning-pk! model {subject-key  subject-id
                                                         :creator_id   creator
                                                         :name         "A test"
                                                         :inputs       []
                                                         :expectations []})
                 run-id  (:id (data-testing.run-tracking/start-run! test-type test-id creator))]
             (try
               (testing "a delete clears the test id of the test's runs"
                 (t2/delete! model :id test-id)
                 (is (= {:test_type test-type :test_id nil}
                        (t2/select-one [:model/DataTestRun :test_type :test_id] :id run-id))))
               (finally
                 (t2/delete! :model/DataTestRun :id run-id)
                 (t2/delete! model :id test-id))))))))))
