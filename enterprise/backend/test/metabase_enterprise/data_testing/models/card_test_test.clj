(ns metabase-enterprise.data-testing.models.card-test-test
  "CardTest model behavior: JSON columns, the newest run, and what deleting a test or its card does."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
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
  (mt/with-temp [:model/Card     {card-id :id} {}
                 :model/CardTest {test-id :id} {:card_id card-id}]
    (t2/delete! :model/Card :id card-id)
    (is (false? (t2/exists? :model/CardTest :id test-id)))))
