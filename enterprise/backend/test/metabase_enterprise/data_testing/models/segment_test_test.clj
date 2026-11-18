(ns metabase-enterprise.data-testing.models.segment-test-test
  "SegmentTest model behavior: JSON columns, the newest run, what deleting a test or its segment does, and permissions."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"}]
    :rows    [{"ID" 1}]}])

(def ^:private expectations
  [{:type "empty" :name "no orphan rows" :sql "SELECT * FROM {{output}} WHERE ID IS NULL"}])

(deftest json-columns-round-trip-test
  (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                 :model/SegmentTest {test-id :id}    {:segment_id   segment-id
                                                      :inputs       inputs
                                                      :expectations expectations}]
    (let [segment-test (t2/select-one :model/SegmentTest :id test-id)]
      (testing "the inputs and expectations read back normalized"
        (is (= [{:table   {:schema "PUBLIC" :name "PEOPLE"}
                 :format  :rows
                 :columns [{:name "ID" :cast_type "INTEGER"}]
                 :rows    [{"ID" 1}]}]
               (:inputs segment-test)))
        (is (= [{:type :empty :name "no orphan rows" :sql "SELECT * FROM {{output}} WHERE ID IS NULL"}]
               (:expectations segment-test))))
      (testing "an entity id and timestamps are set on insert"
        (is (=? {:entity_id string? :created_at some? :updated_at some?} segment-test))))))

(deftest invalid-expectation-is-rejected-on-write-test
  (mt/with-temp [:model/Segment {segment-id :id} (data-testing.test-util/from-google-segment)]
    (is (thrown? Exception
                 (t2/insert! :model/SegmentTest {:segment_id   segment-id
                                                 :creator_id   (mt/user->id :rasta)
                                                 :name         "a test"
                                                 :inputs       []
                                                 :expectations [{:type "empty" :name "no sql"}]})))
    (is (zero? (t2/count :segment_test :segment_id segment-id)))))

(deftest last-run-hydration-finds-only-segment-runs-test
  (mt/with-temp [:model/Segment     {segment-id :id}                  (data-testing.test-util/from-google-segment)
                 :model/SegmentTest {test-id :id :as segment-test}    {:segment_id segment-id}
                 :model/DataTestRun _                                 {:test_type :segment, :test_id test-id}
                 :model/DataTestRun {segment-run :id}                 {:test_type :segment, :test_id test-id}
                 :model/DataTestRun _                                 {:test_type :card, :test_id test-id}]
    (testing "the newest run of the test, not a run of a card test with the same id"
      (is (= segment-run (-> (t2/hydrate segment-test :last_run) :last_run :id))))
    (testing "a test with no runs has none"
      (mt/with-temp [:model/SegmentTest other {:segment_id segment-id}]
        (is (nil? (:last_run (t2/hydrate other :last_run))))))))

(deftest deleting-a-segment-test-keeps-its-runs-test
  (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                 :model/SegmentTest {test-id :id}    {:segment_id segment-id}
                 :model/DataTestRun {other-run :id}  {:test_type :card, :test_id test-id}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :segment test-id)]
      (data-testing.run-tracking/finish-run! run-id :passed)
      (t2/delete! :model/SegmentTest :id test-id)
      (testing "the run stays, with no test id"
        (is (=? {:test_id nil :status :passed} (t2/select-one :model/DataTestRun :id run-id))))
      (testing "a run of a card test with the same id keeps its test id"
        (is (= test-id (t2/select-one-fn :test_id :model/DataTestRun :id other-run))))
      (t2/delete! :model/DataTestRun :id run-id))))

(deftest deleting-a-segment-deletes-its-tests-test
  (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                 :model/SegmentTest {test-id :id}    {:segment_id segment-id}
                 :model/SegmentTest {other-id :id}   {:segment_id segment-id}]
    (let [run-ids   (mapv #(:id (data-testing.run-tracking/start-run! :segment %)) [test-id other-id])
          published (atom [])]
      (try
        (doseq [run-id run-ids]
          (data-testing.run-tracking/finish-run! run-id :passed))
        (with-redefs [events/publish-event! (fn [topic event]
                                              (when (= :event/segment-test-delete topic)
                                                (swap! published conj (:id (:previous-object event)))))]
          (t2/delete! :model/Segment :id segment-id))
        (testing "the tests are gone"
          (is (false? (t2/exists? :model/SegmentTest :segment_id segment-id))))
        (testing "each test was deleted through its own hook, so its runs stay with no test id"
          (is (=? [{:test_id nil :status :passed} {:test_id nil :status :passed}]
                  (mapv #(t2/select-one :model/DataTestRun :id %) run-ids))))
        (testing "each test published one delete event"
          (is (= (sort [test-id other-id]) (sort @published))))
        (finally
          (t2/delete! :model/DataTestRun :id [:in run-ids]))))))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(defn- permissions-of-lucky!
  "What lucky may do with a test of a segment on the people table when all users have `view-data` and
  `create-queries` on the database, and lucky is a data analyst iff `analyst?`."
  [view-data create-queries analyst?]
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      view-data
                                                                    :perms/create-queries create-queries}
        (mt/with-temp [:model/Segment     {segment-id :id :as _segment} (data-testing.test-util/from-google-segment)
                       :model/SegmentTest {test-id :id :as segment-test} {:segment_id segment-id}]
          (letfn [(permissions []
                    (mt/with-current-user (mt/user->id :lucky)
                      {:read     (boolean (mi/can-read? (t2/hydrate segment-test :can_read)))
                       :read-pk  (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/SegmentTest :id test-id) :can_read)))
                       :run      (boolean (data-testing.models.segment-test/can-run? segment-test))
                       :create   (boolean (mi/can-create? :model/SegmentTest {:segment_id segment-id}))
                       :update   (boolean (mi/can-update? (t2/hydrate segment-test :can_write) {:name "renamed"}))
                       :write    (boolean (mi/can-write? (t2/hydrate segment-test :can_write)))
                       :write-pk (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/SegmentTest :id test-id) :can_write)))}))]
            (if analyst?
              (mt/with-data-analyst-role! (mt/user->id :lucky) (permissions))
              (permissions))))))))

(defn- allowed
  [& ks]
  (merge {:read false :read-pk false :run false :create false :update false :write false :write-pk false}
         (zipmap ks (repeat true))))

(deftest segment-test-permissions-test
  (testing "no access to the segment's table: nothing"
    (is (= (allowed) (permissions-of-lucky! :blocked :no false))))
  (testing "a user who may read the segment and write native queries: read and run"
    (is (= (allowed :read :read-pk :run) (permissions-of-lucky! :unrestricted :query-builder-and-native false))))
  (testing "a user who may read the segment, without native queries: read only"
    (is (= (allowed :read :read-pk) (permissions-of-lucky! :unrestricted :query-builder false))))
  (testing "a data analyst who may edit the segment and write native queries: everything"
    (is (= (allowed :read :read-pk :run :create :update :write :write-pk) (permissions-of-lucky! :unrestricted :query-builder-and-native true))))
  (testing "a data analyst who may edit the segment, without native queries: read only"
    (is (= (allowed :read :read-pk) (permissions-of-lucky! :unrestricted :query-builder true)))))

(deftest moving-a-segment-test-to-a-missing-segment-is-refused-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder-and-native}
        (mt/with-temp [:model/Segment     {segment-id :id} (data-testing.test-util/from-google-segment)
                       :model/SegmentTest segment-test      {:segment_id segment-id}]
          (mt/with-data-analyst-role! (mt/user->id :lucky)
            (mt/with-current-user (mt/user->id :lucky)
              (testing "control: an analyst may edit the test of a segment on a table they may see"
                (is (true? (boolean (mi/can-update? (t2/hydrate segment-test :can_write) {:name "renamed"})))))
              (testing "a segment that does not exist cannot be the test's new segment"
                (is (false? (boolean (mi/can-update? (t2/hydrate segment-test :can_write) {:segment_id Integer/MAX_VALUE}))))))))))))

(deftest moving-a-segment-test-needs-save-rights-on-the-old-and-the-new-segment-test
  (mt/with-premium-features data-testing.test-util/data-analyst-features
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries :query-builder-and-native}
        (mt/with-temp [:model/Database {other-db :id}    {:engine :h2 :details {:db "mem:segment-test-other-db"}}
                       :model/Table    {other-table :id} {:db_id other-db :name "OTHER" :schema "PUBLIC" :active true}
                       :model/Field    {other-field :id} {:table_id other-table :name "X" :base_type :type/Integer
                                                          :database_type "INTEGER"}]
          ;; A new Database gets default permissions for All Users; set them.
          (mt/with-db-perms-for-group! (perms-group/all-users) other-db {:perms/view-data      :unrestricted
                                                                         :perms/create-queries :query-builder}
            (let [mp (lib-be/application-database-metadata-provider other-db)]
              (mt/with-temp [:model/Segment     {writable-id :id}  (data-testing.test-util/from-google-segment)
                             :model/Segment     {other-id :id}     {:table_id   other-table
                                                                    :definition (lib/filter (lib/query mp (lib.metadata/table mp other-table))
                                                                                            (lib/> (lib.metadata/field mp other-field) 0))}
                             :model/SegmentTest test-on-writable   {:segment_id writable-id}
                             :model/SegmentTest test-on-other      {:segment_id other-id}]
                (mt/with-data-analyst-role! (mt/user->id :lucky)
                  (mt/with-current-user (mt/user->id :lucky)
                    (testing "premise: the analyst may save tests of the first segment, and may read and edit the other segment but not save its tests, having no native queries on its database"
                      (is (true? (boolean (mi/can-create? :model/SegmentTest {:segment_id writable-id}))))
                      (is (true? (boolean (mi/can-read? (t2/hydrate (t2/select-one :model/Segment :id other-id) :can_read)))))
                      (is (true? (boolean (mi/can-write? (t2/hydrate (t2/select-one :model/Segment :id other-id) :can_write)))))
                      (is (false? (boolean (data-testing.models/can-run-native-query? other-db))))
                      (is (false? (boolean (mi/can-create? :model/SegmentTest {:segment_id other-id})))))
                    (testing "control: the analyst may rename the test of the first segment"
                      (is (true? (boolean (mi/can-update? (t2/hydrate test-on-writable :can_write) {:name "renamed"})))))
                    (testing "a test cannot move to a segment whose tests the analyst may not save"
                      (is (false? (boolean (mi/can-update? (t2/hydrate test-on-writable :can_write) {:segment_id other-id})))))
                    (testing "a test cannot move away from a segment whose tests the analyst may not save"
                      (is (false? (boolean (mi/can-update? (t2/hydrate test-on-other :can_write) {:segment_id writable-id})))))))))))))))
