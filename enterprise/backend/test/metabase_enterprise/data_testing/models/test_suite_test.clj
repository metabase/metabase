(ns metabase-enterprise.data-testing.models.test-suite-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
   [metabase-enterprise.data-testing.models.test-suite :as test-suite]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.segments.models.segment :as segment]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(defn- recent?
  [timestamp]
  (.isAfter ^OffsetDateTime timestamp (minutes-ago 1)))

(defn- members
  "The members of the suite `suite-id`, as a set of `[test-type test-entity-id]`."
  [suite-id]
  (set (data-testing.test-util/member-refs suite-id)))

(deftest deleting-a-test-removes-it-from-every-suite-test
  (mt/with-temp [:model/Card          {card-id :id}        {}
                 :model/CardTest      {card-test-id :id
                                       card-eid :entity_id} {:card_id card-id}
                 :model/CardTest      {kept-eid :entity_id} {:card_id card-id}
                 :model/Transform     {transform-id :id}   {}
                 :model/TransformTest {transform-test-id :id
                                       transform-eid :entity_id} {:transform_id transform-id}
                 :model/Segment       {segment-id :id}     (data-testing.test-util/from-google-segment)
                 :model/SegmentTest   {segment-test-id :id
                                       segment-eid :entity_id} {:segment_id segment-id}
                 :model/SegmentTest   {cascaded-eid :entity_id} {:segment_id segment-id}
                 :model/TestSuite     {suite-1 :id}        {}
                 :model/TestSuite     {suite-2 :id}        {}]
    (t2/insert! :model/TestSuiteMember
                [{:suite_id suite-1 :test_type :card :test_entity_id card-eid :position 0}
                 {:suite_id suite-1 :test_type :card :test_entity_id kept-eid :position 1}
                 {:suite_id suite-1 :test_type :transform :test_entity_id transform-eid :position 2}
                 {:suite_id suite-2 :test_type :card :test_entity_id card-eid :position 0}
                 {:suite_id suite-2 :test_type :segment :test_entity_id segment-eid :position 1}
                 {:suite_id suite-2 :test_type :segment :test_entity_id cascaded-eid :position 2}])
    (testing "deleting a card test removes it from both suites, and nothing else"
      (data-testing.models.card-test/delete-card-tests! [card-test-id])
      (is (= #{[:card kept-eid] [:transform transform-eid]} (members suite-1)))
      (is (= #{[:segment segment-eid] [:segment cascaded-eid]} (members suite-2))))
    (testing "deleting a transform test removes it"
      (data-testing.models/delete-transform-tests! [transform-test-id])
      (is (= #{[:card kept-eid]} (members suite-1))))
    (testing "deleting a segment test removes it"
      (data-testing.models.segment-test/delete-segment-tests! [segment-test-id])
      (is (= #{[:segment cascaded-eid]} (members suite-2))))
    (testing "deleting a segment removes the members of its tests"
      (segment/delete-segments! [segment-id])
      (is (= #{} (members suite-2))))))

(deftest test-suite-audit-events-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Card     {card-id :id}              {}
                     :model/CardTest {card-test-eid :entity_id} {:card_id card-id}]
        (mt/with-model-cleanup [:model/TestSuite]
          (let [{suite-id :id} (first (test-suite/create-test-suites! [{:creator_id  (mt/user->id :crowberto)
                                                                        :name        "Nightly"
                                                                        :description "abc"}]))]
            (testing "create names the acting user"
              (is (= {:model_id suite-id
                      :user_id  (mt/user->id :rasta)
                      :details  {:name "Nightly" :description "abc"}
                      :topic    :test-suite-create
                      :model    "TestSuite"}
                     (mt/latest-audit-log-entry :test-suite-create suite-id))))
            (testing "update names the acting user, and the changed columns"
              (test-suite/update-test-suites! [suite-id] {:name "Renamed"})
              (is (= {:model_id suite-id
                      :user_id  (mt/user->id :rasta)
                      :details  {:previous {:name "Nightly"} :new {:name "Renamed"}}
                      :topic    :test-suite-update
                      :model    "TestSuite"}
                     (mt/latest-audit-log-entry :test-suite-update suite-id))))
            (testing "a change of the members alone is audited as one update of the suite"
              (let [updates #(mt/all-entries-for :test-suite-update :model/TestSuite suite-id)
                    before  (count (updates))]
                (test-suite/update-test-suite! suite-id {:members [{:test_type :card :test_entity_id card-test-eid}]})
                (is (= (inc before) (count (updates))))
                (is (= {:model_id suite-id
                        :user_id  (mt/user->id :rasta)
                        :details  {:previous {} :new {}}
                        :topic    :test-suite-update
                        :model    "TestSuite"}
                       (first (updates))))))
            (testing "delete names the acting user"
              (test-suite/delete-test-suites! [suite-id])
              (is (= {:model_id suite-id
                      :user_id  (mt/user->id :rasta)
                      :details  {:name "Renamed" :description "abc"}
                      :topic    :test-suite-delete
                      :model    "TestSuite"}
                     (mt/latest-audit-log-entry :test-suite-delete suite-id))))))))))

(deftest test-suite-writes-record-one-audit-row-each-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/Card     {card-id :id}     {}
                     :model/CardTest {eid-1 :entity_id} {:card_id card-id}
                     :model/CardTest {eid-2 :entity_id} {:card_id card-id}]
        (let [suite-id (:id (first (test-suite/create-test-suites! [{:name       "Nightly"
                                                                     :creator_id (mt/user->id :rasta)
                                                                     :members    [{:test_type :card :test_entity_id eid-1}
                                                                                  {:test_type :card :test_entity_id eid-2}]}])))
              topics   #(t2/select-fn-vec :topic :model/AuditLog :model "TestSuite" :model_id suite-id
                                          {:order-by [[:id :asc]]})]
          (try
            (testing "a create with members records one create"
              (is (= [:test-suite-create] (topics))))
            (testing "a replacement of the members records one update"
              (test-suite/update-test-suite! suite-id {:members [{:test_type :card :test_entity_id eid-2}]})
              (is (= [:test-suite-create :test-suite-update] (topics))))
            (testing "a change of the name and the members records one update"
              (test-suite/update-test-suite! suite-id {:name "Renamed" :members [{:test_type :card :test_entity_id eid-1}]})
              (is (= [:test-suite-create :test-suite-update :test-suite-update] (topics))))
            (finally
              (t2/delete! :model/TestSuite :id suite-id))))))))

(deftest suite-run-lifecycle-test
  (mt/with-temp [:model/TestSuite {suite-id :id} {}]
    (let [initiated-by             (mt/user->id :crowberto)
          {run-id :id :as started} (data-testing.run-tracking/start-suite-run! suite-id initiated-by)
          members                  [{:test_type :card :test_entity_id "abc" :position 0 :status :missing}]]
      (testing "a new run is started, with no members yet"
        (is (=? {:suite_id suite-id :initiated_by initiated-by :status :started :end_time nil :members nil}
                started)))
      (testing "the owning process heartbeats its run"
        (t2/update! :model/TestSuiteRun :id run-id {:last_heartbeat (minutes-ago 10)})
        (data-testing.run-tracking/heartbeat-and-reconcile-runs!)
        (is (recent? (t2/select-one-fn :last_heartbeat :model/TestSuiteRun :id run-id))))
      (testing "finishing sets the status, the end time, and the member outcomes"
        (is (= 1 (data-testing.run-tracking/finish-suite-run! run-id :failed members)))
        (is (=? {:status :failed :end_time some? :members members}
                (t2/select-one :model/TestSuiteRun :id run-id)))))))

(deftest reap-orphaned-suite-runs-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/TestSuite    {suite-id :id} {}
                   :model/TestSuiteRun {stale-id :id} {:suite_id       suite-id
                                                       :initiated_by   (mt/user->id :rasta)
                                                       :last_heartbeat (minutes-ago 10)}
                   :model/TestSuiteRun {fresh-id :id} {:suite_id suite-id :last_heartbeat (minutes-ago 1)}]
      (testing "only a stale started run is timed out"
        (is (= [stale-id] (mapv :id (data-testing.run-tracking/reap-orphaned-suite-runs! 5))))
        (is (= :timeout (t2/select-one-fn :status :model/TestSuiteRun :id stale-id)))
        (is (= :started (t2/select-one-fn :status :model/TestSuiteRun :id fresh-id))))
      (testing "the timeout is audited, naming the user who started the run"
        (is (= {:model_id stale-id
                :user_id  (mt/user->id :rasta)
                :details  {:suite_id suite-id :status "timeout"}
                :topic    :test-suite-run-timeout
                :model    "TestSuiteRun"}
               (mt/latest-audit-log-entry :test-suite-run-timeout stale-id))))
      (testing "a late completion cannot overwrite the timeout"
        (is (zero? (data-testing.run-tracking/finish-suite-run! stale-id :passed [])))
        (is (= :timeout (t2/select-one-fn :status :model/TestSuiteRun :id stale-id)))))))

(deftest suite-run-start-is-audited-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-temp [:model/TestSuite {suite-id :id} {}]
      (let [{run-id :id} (data-testing.run-tracking/start-suite-run! suite-id (mt/user->id :rasta))]
        (try
          (is (= {:model_id run-id
                  :user_id  (mt/user->id :rasta)
                  :details  {:suite_id suite-id :status "started"}
                  :topic    :test-suite-run-start
                  :model    "TestSuiteRun"}
                 (mt/latest-audit-log-entry :test-suite-run-start run-id)))
          (finally
            (data-testing.run-tracking/finish-suite-run! run-id :error nil)))))))

(deftest deleting-a-suite-keeps-its-runs-test
  (mt/with-temp [:model/TestSuite    {suite-id :id} {}
                 :model/TestSuiteRun {run-id :id}   {:suite_id suite-id :status :passed}]
    (t2/delete! :model/TestSuite :id suite-id)
    (is (=? {:suite_id nil :status :passed} (t2/select-one :model/TestSuiteRun :id run-id)))))

(deftest a-throw-for-test-runs-does-not-stop-the-suite-run-heartbeat-test
  (mt/with-temp [:model/TestSuite     {suite-id :id}  {}
                 :model/Transform     {transform-id :id} {}
                 :model/TransformTest {test-id :id}   {:transform_id transform-id}]
    ;; The test-run heartbeat runs only while this process owns a test run, so one is started.
    (let [{run-id :id}      (data-testing.run-tracking/start-suite-run! suite-id nil)
          {test-run-id :id} (data-testing.run-tracking/start-run! :transform test-id)]
      (try
        (doseq [[thrown-name throwable] [["an Exception" (ex-info "boom" {})]
                                         ["an Error (AssertionError)" (AssertionError. "boom")]]]
          (testing (str thrown-name " in the test-run heartbeat still lets the suite runs heartbeat")
            (t2/update! :model/TestSuiteRun :id run-id {:last_heartbeat (minutes-ago 10)})
            (mt/with-dynamic-fn-redefs [data-testing.run-tracking/heartbeat-runs! (fn [_] (throw throwable))]
              (data-testing.run-tracking/heartbeat-and-reconcile-runs!))
            (is (recent? (t2/select-one-fn :last_heartbeat :model/TestSuiteRun :id run-id)))))
        (testing "an InterruptedException is rethrown, so the heartbeat thread can be stopped"
          (mt/with-dynamic-fn-redefs [data-testing.run-tracking/heartbeat-runs! (fn [_] (throw (InterruptedException.)))]
            (is (thrown? InterruptedException (data-testing.run-tracking/heartbeat-and-reconcile-runs!)))))
        (finally
          (data-testing.run-tracking/finish-suite-run! run-id :error nil)
          (data-testing.run-tracking/finish-run! test-run-id :error))))))

(deftest a-throw-reaping-test-runs-does-not-stop-reaping-suite-runs-test
  (doseq [[thrown-name throwable] [["an Exception" (ex-info "boom" {})]
                                   ["an Error (AssertionError)" (AssertionError. "boom")]]]
    (testing (str thrown-name " while reaping test runs still lets the stale suite runs be timed out")
      (mt/with-temp [:model/TestSuite    {suite-id :id} {}
                     :model/TestSuiteRun {run-id :id}   {:suite_id suite-id :last_heartbeat (minutes-ago 10)}]
        (mt/with-dynamic-fn-redefs [data-testing.run-tracking/reap-orphaned-runs! (fn [_] (throw throwable))]
          (is (= [run-id] (mapv :id (data-testing.run-tracking/reap-orphaned-test-and-suite-runs! 5)))))
        (is (= :timeout (t2/select-one-fn :status :model/TestSuiteRun :id run-id))))))
  (testing "an InterruptedException is rethrown"
    (mt/with-dynamic-fn-redefs [data-testing.run-tracking/reap-orphaned-runs! (fn [_] (throw (InterruptedException.)))]
      (is (thrown? InterruptedException (doall (data-testing.run-tracking/reap-orphaned-test-and-suite-runs! 5)))))))

(defn- member-rows
  "`n` suite members, as the `:members` of a suite takes them, naming tests that do not exist."
  [n]
  (vec (repeatedly n (fn [] {:test_type :card :test_entity_id (u/generate-nano-id)}))))

(deftest suite-update-with-members-statement-count-does-not-grow-with-members-test
  (mt/with-temp [:model/TestSuite {small :id} {}
                 :model/TestSuite {large :id} {}]
    (test-suite/update-test-suite! small {:members (member-rows 2)})
    (test-suite/update-test-suite! large {:members (member-rows 6)})
    (testing "replacing the members of a suite that has members"
      (is (= (events.tu/statement-count! #(test-suite/update-test-suite! small {:name "A" :members (member-rows 2)}))
             (events.tu/statement-count! #(test-suite/update-test-suite! large {:name "B" :members (member-rows 6)})))))))

(deftest deleting-tests-that-are-members-statement-count-does-not-grow-with-tests-test
  (mt/with-temp [:model/Card      {card-id :id} {}
                 :model/TestSuite {suite-id :id} {}]
    (let [make-tests! (fn [n]
                        (data-testing.models.card-test/create-card-tests!
                         (vec (repeatedly n (fn [] {:card_id      card-id
                                                    :creator_id   (mt/user->id :rasta)
                                                    :name         (str (random-uuid))
                                                    :inputs       []
                                                    :expectations []})))))
          warm-up     (make-tests! 1)
          small       (make-tests! 2)
          large       (make-tests! 6)
          delete!     (fn [tests]
                        (events.tu/statement-count! #(data-testing.models/delete-saved-tests! :card :model/CardTest (mapv :id tests))))]
      (test-suite/update-test-suite! suite-id {:members (mapv (fn [{:keys [entity_id]}] {:test_type :card :test_entity_id entity_id})
                                                              (concat warm-up small large))})
      (delete! warm-up)
      (is (= (delete! small) (delete! large))))))

(deftest suite-writes-publish-one-suite-event-test
  (mt/with-temp [:model/TestSuite {suite-id :id} {}]
    (let [published (atom [])]
      (with-redefs [events/publish-event! (fn [topic _event] (swap! published conj topic))]
        (testing "a change of the members alone is one update of the suite"
          (test-suite/update-test-suite! suite-id {:members (member-rows 2)})
          (is (= [:event/test-suite-update] @published)))
        (testing "a change of the columns and the members is one update of the suite"
          (test-suite/update-test-suite! suite-id {:name "Renamed" :members (member-rows 1)})
          (is (= [:event/test-suite-update :event/test-suite-update] @published)))
        (testing "an import that wrote the members on their own touches the suite"
          (test-suite/update-test-suite! suite-id {} {:writer :import})
          (is (= [:event/test-suite-update :event/test-suite-update :event/test-suite-update] @published)))
        (testing "a change of nothing publishes nothing"
          (test-suite/update-test-suite! suite-id {})
          (is (= 3 (count @published))))))))

(deftest create-test-suites-with-different-key-sets-test
  (mt/with-model-cleanup [:model/TestSuite]
    (let [creator-id         (mt/user->id :crowberto)
          [plain described]  (test-suite/create-test-suites! [{:name "Plain" :creator_id creator-id}
                                                              {:name "Described" :creator_id creator-id :description "About"}])]
      (is (nil? (t2/select-one-fn :description :model/TestSuite :id (:id plain))))
      (is (= "About" (t2/select-one-fn :description :model/TestSuite :id (:id described)))))))

(deftest suite-write-statement-counts-do-not-grow-with-suites-test
  (mt/with-model-cleanup [:model/TestSuite]
    (let [creator-id (mt/user->id :crowberto)
          rows       (fn [n]
                       (mapv (fn [i] {:name (str (random-uuid)) :creator_id creator-id :members (member-rows (inc (mod i 3)))}) (range n)))
          counted    (fn [n]
                       (let [create (events.tu/statement-count! #(test-suite/create-test-suites! (rows n)))
                             suites (test-suite/create-test-suites! (rows n))
                             update (events.tu/statement-count!
                                     #(test-suite/update-test-suites! (mapv :id suites) {:description "d"}))
                             delete (events.tu/statement-count! #(test-suite/delete-test-suites! (mapv :id suites)))]
                         [create update delete]))]
      (counted 1)
      (is (= (counted 2) (counted 6))))))
