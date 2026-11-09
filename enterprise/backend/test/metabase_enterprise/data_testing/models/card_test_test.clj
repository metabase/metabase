(ns metabase-enterprise.data-testing.models.card-test-test
  "CardTest model behavior: JSON columns, the newest run, and what deleting a test or its card does."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
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
  (mt/with-temp [:model/Card     {card-id :id} {}
                 :model/CardTest {test-id :id} {:card_id      card-id
                                                :inputs       inputs
                                                :expectations expectations}]
    (let [card-test (t2/select-one :model/CardTest :id test-id)]
      (testing "the inputs and expectations read back normalized"
        (is (= [{:table   {:schema "PUBLIC" :name "PEOPLE"}
                 :format  :rows
                 :columns [{:name "ID" :cast_type "INTEGER"}]
                 :rows    [{"ID" 1}]}]
               (:inputs card-test)))
        (is (= [{:type :empty :name "no orphan rows" :sql "SELECT * FROM {{output}} WHERE ID IS NULL"}]
               (:expectations card-test))))
      (testing "an entity id and timestamps are set on insert"
        (is (=? {:entity_id string? :created_at some? :updated_at some?} card-test))))))

(deftest invalid-expectation-is-rejected-on-write-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (is (thrown? Exception
                 (t2/insert! :model/CardTest {:card_id      card-id
                                              :creator_id   (mt/user->id :rasta)
                                              :name         "a test"
                                              :inputs       []
                                              :expectations [{:type "empty" :name "no sql"}]})))
    (is (zero? (t2/count :card_test :card_id card-id)))))

(deftest last-run-hydration-finds-only-card-runs-test
  (mt/with-temp [:model/Card        {card-id :id} {}
                 :model/CardTest    {test-id :id :as card-test} {:card_id card-id}
                 :model/DataTestRun _                           {:test_type :card, :test_id test-id}
                 :model/DataTestRun {card-run :id}              {:test_type :card, :test_id test-id}
                 :model/DataTestRun _                           {:test_type :transform, :test_id test-id}]
    (testing "the newest run of the test, not a run of a transform test with the same id"
      (is (= card-run (-> (t2/hydrate card-test :last_run) :last_run :id))))
    (testing "a test with no runs has none"
      (mt/with-temp [:model/CardTest other {:card_id card-id}]
        (is (nil? (:last_run (t2/hydrate other :last_run))))))))

(deftest deleting-a-card-test-keeps-its-runs-test
  (mt/with-temp [:model/Card        {card-id :id} {}
                 :model/CardTest    {test-id :id} {:card_id card-id}
                 :model/DataTestRun {other-run :id} {:test_type :transform, :test_id test-id}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :card test-id)]
      (data-testing.run-tracking/finish-run! run-id :passed)
      (t2/delete! :model/CardTest :id test-id)
      (testing "the run stays, with no test id"
        (is (=? {:test_id nil :status :passed} (t2/select-one :model/DataTestRun :id run-id))))
      (testing "a run of a transform test with the same id keeps its test id"
        (is (= test-id (t2/select-one-fn :test_id :model/DataTestRun :id other-run))))
      (t2/delete! :model/DataTestRun :id run-id))))

(deftest deleting-a-card-deletes-its-tests-test
  (mt/with-temp [:model/Card     {card-id :id}  {}
                 :model/CardTest {test-id :id}  {:card_id card-id}
                 :model/CardTest {other-id :id} {:card_id card-id}]
    (let [run-ids (mapv #(:id (data-testing.run-tracking/start-run! :card %)) [test-id other-id])]
      (try
        (doseq [run-id run-ids]
          (data-testing.run-tracking/finish-run! run-id :passed))
        (t2/delete! :model/Card :id card-id)
        (testing "the tests are gone"
          (is (false? (t2/exists? :model/CardTest :card_id card-id))))
        (testing "each test was deleted through its own hook, so its runs stay with no test id"
          (is (= [nil nil] (mapv #(t2/select-one-fn :test_id :model/DataTestRun :id %) run-ids))))
        (finally
          (t2/delete! :model/DataTestRun :id [:in run-ids]))))))

;;; ------------------------------------------------ Permissions ------------------------------------------------

(defn- permissions-of-rasta!
  "What rasta may do with a test of a card in a collection where all users have `collection-perms` (`:none`, `:read` or
  `:write`), when all users may write native queries on the card's database iff `native?`."
  [collection-perms native?]
  (mt/with-non-admin-groups-no-root-collection-perms
    (perms.tu/with-no-data-perms-for-all-users!
      (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                    :perms/create-queries (if native?
                                                                                            :query-builder-and-native
                                                                                            :query-builder)}
        (mt/with-temp [:model/Collection {coll-id :id}   {}
                       :model/Card       {card-id :id}   {:collection_id coll-id
                                                          :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                       :model/CardTest   {test-id :id :as card-test} {:card_id card-id}]
          (case collection-perms
            :none  nil
            :read  (perms/grant-collection-read-permissions! (perms-group/all-users) coll-id)
            :write (perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll-id))
          (mt/with-current-user (mt/user->id :rasta)
            {:read      (boolean (mi/can-read? card-test))
             :read-pk   (boolean (mi/can-read? :model/CardTest test-id))
             :run       (boolean (data-testing.models.card-test/can-run? card-test))
             :create    (boolean (mi/can-create? :model/CardTest {:card_id card-id}))
             :update    (boolean (mi/can-update? card-test {:name "renamed"}))
             :write     (boolean (mi/can-write? card-test))
             :write-pk  (boolean (mi/can-write? :model/CardTest test-id))}))))))

(defn- allowed
  [& ks]
  (merge {:read false :read-pk false :run false :create false :update false :write false :write-pk false}
         (zipmap ks (repeat true))))

(deftest card-test-permissions-test
  (testing "no collection access to the card: nothing"
    (is (= (allowed) (permissions-of-rasta! :none true))))
  (testing "collection read and native queries: read and run"
    (is (= (allowed :read :read-pk :run) (permissions-of-rasta! :read true))))
  (testing "collection read without native queries: read only"
    (is (= (allowed :read :read-pk) (permissions-of-rasta! :read false))))
  (testing "collection write and native queries: everything"
    (is (= (allowed :read :read-pk :run :create :update :write :write-pk) (permissions-of-rasta! :write true))))
  (testing "collection write without native queries: read only"
    (is (= (allowed :read :read-pk) (permissions-of-rasta! :write false)))))

(deftest moving-a-card-test-needs-write-on-both-cards-test
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp [:model/Collection {writable :id} {}
                   :model/Collection {readable :id} {}
                   :model/Card       {card-id :id}  {:collection_id writable
                                                     :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/Card       {other-id :id} {:collection_id readable
                                                     :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}
                   :model/CardTest   card-test      {:card_id card-id}]
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) writable)
      (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
      (mt/with-current-user (mt/user->id :rasta)
        (is (true? (boolean (mi/can-update? card-test {:name "renamed"}))))
        (is (false? (boolean (mi/can-update? card-test {:card_id other-id}))))))))
