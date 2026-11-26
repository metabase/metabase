(ns metabase-enterprise.data-testing.saved-test-models-test
  "What the four saved-test models share and where they differ: reading and writing a test through its subject, who
  may create, change and run a transform test and an action test, the remote-sync rule only transform tests follow,
  which revisions a user may read, a test's newest run, the statements their hydrations run, the topics of their
  lifecycle events, and the run cleanup of their delete."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.action-test]
   [metabase-enterprise.data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.data-test-run]
   [metabase-enterprise.data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.test-type :as data-testing.test-type]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.remote-sync.test-util :as remote-sync.tu]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.revisions.models.revision :as revision]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-types
  "Each saved-test model, with its test type, the column that holds its subject's id, and the function that loads
  subjects by their ids."
  [{:model :model/TransformTest :test-type :transform :subject-key :transform_id :subjects data-testing.db/transforms}
   {:model :model/CardTest      :test-type :card      :subject-key :card_id      :subjects data-testing.db/cards-by-ids}
   {:model :model/SegmentTest   :test-type :segment   :subject-key :segment_id   :subjects data-testing.db/segments-by-ids}
   {:model :model/ActionTest    :test-type :action    :subject-key :action_id    :subjects data-testing.db/actions-by-ids}])

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

(defn- do-with-subjects!
  "Call `f` with the ids of `n` new subjects of `test-type`."
  ([test-type n f]
   (do-with-subjects! test-type n [] f))
  ([test-type n subject-ids f]
   (if (zero? n)
     (f subject-ids)
     (do-with-subject! test-type #(do-with-subjects! test-type (dec n) (conj subject-ids %) f)))))

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

(deftest every-test-type-names-its-model-test
  (doseq [{:keys [model test-type]} test-types]
    (testing model
      (is (= model (:model (data-testing.test-type/spec test-type)))))))

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
       (let [saved-test  (t2/select-one model :id test-id)
             can-create? #(mt/with-test-user :crowberto
                            (boolean (mi/can-create? model (dissoc saved-test :id))))]
         (if (= :transform test-type)
           (testing "the transform itself may not be written, so an admin may neither write nor change its test"
             (is (false? (hydrated? :crowberto model test-id :can_write mi/can-write?)))
             (is (false? (can-update? :crowberto saved-test {:name "Renamed"})))
             (is (false? (can-update? :crowberto saved-test {:name (:name saved-test)})))
             (testing "nor apply a change that names no column"
               (is (false? (can-update? :crowberto saved-test {}))))
             (testing "nor create another test of it"
               (is (false? (can-create?)))))
           (do
             (testing "the subject is not synced, so an admin may write the test"
               (is (true? (hydrated? :crowberto model test-id :can_write mi/can-write?))))
             (testing "the subject is not synced, so an admin may rename the test"
               (is (true? (can-update? :crowberto saved-test {:name "Renamed"}))))
             (testing "the subject is not synced, so an admin may create another test of it"
               (is (true? (can-create?)))))))))))

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
                 (get @#'data-testing.models/saved-test-topics model))))
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
               (testing "a delete through the model's write function clears the test id of the test's runs"
                 ((:delete! (serialization/spec model)) [test-id])
                 (is (= {:test_type test-type :test_id nil}
                        (t2/select-one [:model/DataTestRun :test_type :test_id] :id run-id))))
               (finally
                 (t2/delete! :model/DataTestRun :id run-id)
                 (t2/delete! model :id test-id))))))))))

(deftest a-batch-keeps-its-order-and-its-gaps-test
  (do-with-each-test-type!
   (fn [{:keys [model subject-key test-id]}]
     (let [saved-test (t2/select-one model :id test-id)
           orphan     (t2/instance model {:id Integer/MAX_VALUE subject-key Integer/MAX_VALUE})
           answers    (fn [k check]
                        (mt/with-test-user :crowberto
                          (mapv #(some-> % check boolean) (t2/hydrate [saved-test nil orphan] k))))]
       (testing "an admin's answer for a test, for no test, and for a test whose subject no longer exists"
         (is (= [true nil false] (answers :can_read mi/can-read?)))
         (is (= [true nil false] (answers :can_write mi/can-write?)))
         (is (= [true nil false] (answers :can_query mi/can-query?))))))))

(deftest hydration-statements-do-not-grow-with-tests-test
  (mt/with-premium-features #{:transforms-basic :transforms-testing}
    (mt/with-temporary-raw-setting-values [transforms-enabled "true"]
      (doseq [{:keys [model test-type subject-key subjects]} test-types]
        (testing model
          (do-with-subjects!
           test-type 6
           (fn [subject-ids]
             (let [tests      (mapv #(t2/instance model {:id %1 subject-key %2}) (range 1 7) subject-ids)
                   statements (fn [thunk]
                                (t2/with-call-count [call-count]
                                  (thunk)
                                  (call-count)))
                   hydration  (fn [k n]
                                (statements #(doall (t2/hydrate (vec (take n tests)) k))))
                   own        (fn [k n]
                                (statements #(doall (t2/hydrate (subjects (vec (take n subject-ids))) k))))
                   beyond-own (fn [k n]
                                (- (hydration k n) (own k n)))]
               (doseq [user [:crowberto :rasta]]
                 (testing user
                   (mt/with-test-user user
                     (testing "the newest runs of the tests are read at once"
                       (hydration :last_run 1)
                       (is (= (hydration :last_run 2) (hydration :last_run 6))))
                     (testing "the statements of `:can_read`, beyond loading the subjects and their own checks"
                       (beyond-own :can_read 1)
                       (is (= (beyond-own :can_read 2) (beyond-own :can_read 6)))))))))))))))

(defn- other-inputs
  "Inputs that differ from those of a test made with no inputs."
  []
  (lib/normalize ::data-testing.schema/inputs
                 [{:table {:schema "PUBLIC" :name "PEOPLE"} :format "sql" :sql "SELECT 1 AS ID"}]))

(defn- answers-for
  "What the current user may do with `saved-test` of `model`, a test of the subject that `subject-key` names: read
  it, write it, create another test of its subject, rename it, change its inputs, and run it."
  [model subject-key saved-test]
  (let [writable (t2/hydrate saved-test :can_write)]
    {:read          (boolean (mi/can-read? (t2/hydrate saved-test :can_read)))
     :write         (boolean (mi/can-write? writable))
     :create        (boolean (mi/can-create? model (select-keys saved-test [subject-key])))
     :update-name   (boolean (mi/can-update? writable {:name "renamed"}))
     :update-inputs (boolean (mi/can-update? writable {:inputs (other-inputs)}))
     :run           (boolean (mi/can-query? (t2/hydrate saved-test :can_query)))}))

(defn- only
  "The answers of [[answers-for]] with those under `ks` true and the others false."
  [& ks]
  (merge (zipmap [:read :write :create :update-name :update-inputs :run] (repeat false))
         (zipmap ks (repeat true))))

(deftest transform-test-create-update-and-run-matrix-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Transform     {transform-id :id} (data-testing.test-util/id-transform :people)
                   :model/TransformTest transform-test     {:transform_id transform-id :inputs [] :expectations []}]
      (let [answers (fn [user transforms create-queries]
                      (mt/with-db-perms-for-group! (perms/all-users-group) (mt/id) {:perms/transforms     transforms
                                                                                    :perms/create-queries create-queries}
                        (mt/with-current-user (mt/user->id user)
                          (answers-for :model/TransformTest :transform_id transform-test))))]
        (testing "superuser: everything"
          (is (= (only :read :write :create :update-name :update-inputs :run)
                 (answers :crowberto :no :no))))
        (testing "a user who is no data analyst reads no transform: nothing"
          (is (= (only) (answers :rasta :no :query-builder-and-native))))
        (mt/with-data-analyst-role! (mt/user->id :lucky)
          (testing "a data analyst with native queries and no transforms permission: read, create and run"
            (is (= (only :read :create :run) (answers :lucky :no :query-builder-and-native))))
          (testing "a data analyst with neither: read and run"
            (is (= (only :read :run) (answers :lucky :no :query-builder))))
          (testing "a data analyst with both: everything"
            (is (= (only :read :write :create :update-name :update-inputs :run)
                   (answers :lucky :yes :query-builder-and-native)))))))))

(deftest action-test-create-update-and-run-matrix-test
  (mt/with-premium-features #{:transforms-testing}
    (mt/with-non-admin-groups-no-root-collection-perms
      (perms.tu/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Collection {coll-id :id} {}]
          (mt/with-actions [_                   {:type          :model
                                                 :dataset_query (data-testing.test-util/table-query :categories)
                                                 :collection_id coll-id}
                            {:keys [action-id]} {}]
            (mt/with-temp [:model/ActionTest action-test {:action_id    action-id
                                                          :parameters   {"id" 1 "name" "Wood"}
                                                          :inputs       []
                                                          :expectations []}]
              (let [answers (fn [user collection? create-queries]
                              (mt/with-db-perms-for-group! (perms/all-users-group) (mt/id) {:perms/view-data      :unrestricted
                                                                                            :perms/create-queries create-queries}
                                (when collection?
                                  (perms/grant-collection-readwrite-permissions! (perms/all-users-group) coll-id))
                                (try
                                  (mt/with-current-user (mt/user->id user)
                                    (answers-for :model/ActionTest :action_id action-test))
                                  (finally
                                    (perms/revoke-collection-permissions! (perms/all-users-group) coll-id)))))]
                (testing "superuser: everything"
                  (is (= (only :read :write :create :update-name :update-inputs :run)
                         (answers :crowberto false :no))))
                (testing "a user who reads the action and has native queries: read and run, since only a superuser edits an action"
                  (is (= (only :read :run) (answers :rasta true :query-builder-and-native))))
                (testing "a user who reads the action, without native queries: read"
                  (is (= (only :read) (answers :rasta true :query-builder))))
                (testing "native queries without access to the action: nothing"
                  (is (= (only) (answers :rasta false :query-builder-and-native))))))))))))
