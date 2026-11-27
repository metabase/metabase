(ns metabase-enterprise.data-testing.models-test
  "Transform testing model behavior: TransformTest column transforms and deletion, plus the
  DataTestRun heartbeat and terminal-state lifecycle."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.data-testing.models :as data-testing.models]
   [metabase-enterprise.data-testing.models.card-test :as data-testing.models.card-test]
   [metabase-enterprise.data-testing.models.segment-test :as data-testing.models.segment-test]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.test-util :as data-testing.test-util]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.query-permissions.core :as query-perms]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.models.transform :as transform]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Fixtures ------------------------------------------------

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :cast_type "INTEGER"}]
    :rows    [{"ID" 1}]}
   {:table  {:schema "PUBLIC" :name "ORDERS"}
    :format "sql"
    :sql    "SELECT 1 AS ID"}])

(def ^:private equals-expectation
  ;; A warehouse column can be named 2024 or order-id. Keywordizing the row keys on the way back
  ;; out would corrupt the data, so both spellings are here on purpose.
  {:type    "equals"
   :name    "output matches the fixture"
   :format  "rows"
   :columns [{:name "ID" :cast_type "INTEGER"}
             {:name "2024" :cast_type "VARCHAR(255)"}
             {:name "order-id" :cast_type "BIGINT"}]
   :rows    [{"ID" 1 "2024" "jan" "order-id" 7}
             {"ID" 2 "2024" nil "order-id" 8}]})

(def ^:private empty-expectation
  {:type "empty" :name "no orphan rows" :sql "SELECT * FROM OUT WHERE ID IS NULL"})

(defn- saved-with
  "Call `f` with a TransformTest carrying `expectations`, selected back through the model so its
  `:out` transforms have run."
  [expectations f]
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                          :inputs       inputs
                                                          :expectations expectations}]
    (f (t2/select-one :model/TransformTest :id test-id))))

;;; ------------------------------------------ Normalized, not raw ------------------------------------------

(deftest expectations-read-back-normalized-test
  (saved-with
   [equals-expectation empty-expectation]
   (fn [transform-test]
     (let [expectations (:expectations transform-test)]
       (is (= 2 (count expectations)))
       (testing "a reader gets plain normalized data; the runner is what turns it into records"
         (doseq [e expectations]
           (is (map? e) (pr-str e))
           (is (not (satisfies? expectations.protocol/Expectation e)) (pr-str e))
           (is (keyword? (:type e)))))
       (testing "and every one of them builds into a record that can run"
         (doseq [e expectations]
           (is (satisfies? expectations.protocol/Expectation (expectations.protocol/build e)))))))))

;;; ------------------------------------------- Round-trip fidelity -------------------------------------------

(deftest equals-expectation-round-trip-test
  (saved-with
   [equals-expectation]
   (fn [transform-test]
     (let [[e] (:expectations transform-test)]
       (is (= "output matches the fixture" (:name e)))
       (is (= :equals (:type e)))
       (is (= :rows (:format e)))
       (testing "columns keep their raw SQL type names"
         (is (= [{:name "ID" :cast_type "INTEGER"}
                 {:name "2024" :cast_type "VARCHAR(255)"}
                 {:name "order-id" :cast_type "BIGINT"}]
                (:columns e))))
       (testing "row keys are still strings after the JSON round trip"
         (is (= [{"ID" 1 "2024" "jan" "order-id" 7}
                 {"ID" 2 "2024" nil "order-id" 8}]
                (:rows e)))
         (is (every? string? (mapcat keys (:rows e)))))
       (testing "a NULL cell survives as nil rather than being dropped"
         (is (contains? (second (:rows e)) "2024"))
         (is (nil? (get (second (:rows e)) "2024"))))))))

(deftest empty-expectation-round-trip-test
  (saved-with
   [empty-expectation]
   (fn [transform-test]
     (let [[e] (:expectations transform-test)]
       (is (= "no orphan rows" (:name e)))
       (is (= :empty (:type e)))
       (is (= "SELECT * FROM OUT WHERE ID IS NULL" (:sql e)))))))

(deftest expectation-order-is-preserved-test
  (testing "expectations come back in declared order — a failure report leads with the name"
    (saved-with
     [empty-expectation equals-expectation]
     (fn [transform-test]
       (is (= ["no orphan rows" "output matches the fixture"]
              (mapv :name (:expectations transform-test))))))))

(deftest inputs-round-trip-test
  (testing ":inputs uses the plain json-column, so it reads back as data — normalized, not records"
    (saved-with
     [empty-expectation]
     (fn [transform-test]
       (let [[rows-input sql-input] (:inputs transform-test)]
         (is (= {:table   {:schema "PUBLIC" :name "PEOPLE"}
                 :format  :rows
                 :columns [{:name "ID" :cast_type "INTEGER"}]
                 :rows    [{"ID" 1}]}
                rows-input))
         (is (= {:table {:schema "PUBLIC" :name "ORDERS"} :format :sql :sql "SELECT 1 AS ID"}
                sql-input))
         (testing "an input's row keys are strings too"
           (is (every? string? (mapcat keys (:rows rows-input)))))
         (is (not (satisfies? expectations.protocol/Expectation rows-input))))))))

;;; ----------------------------------------------- Rejection -----------------------------------------------

(defn- caught
  "The Throwable `thunk` threw, or nil."
  [thunk]
  (try (thunk) nil (catch Throwable t t)))

(defn- causes
  "`t` and everything it wraps. Toucan rebuilds a throw from a column transform to add its own
  context, so match anywhere in the chain rather than on one exception."
  [t]
  (take-while some? (iterate ex-cause t)))

(defn- valid-row [transform-id expectations]
  {:transform_id transform-id
   :creator_id   (mt/user->id :rasta)
   :name         "a test"
   :inputs       []
   :expectations expectations})

(deftest schema-invalid-expectation-is-rejected-on-write-test
  (testing "the :in transform validates, so a malformed expectation never reaches the column"
    (mt/with-temp [:model/Transform {transform-id :id} {}]
      (try
        (doseq [[label bad]
                [["no :sql on an empty expectation" {:type "empty" :name "x"}]
                 ["no :name"                        {:type "empty" :sql "SELECT 1"}]
                 ["a blank :name"                   {:type "empty" :name "" :sql "SELECT 1"}]
                 ["an undeclared key"               {:type "empty" :name "x" :sql "SELECT 1" :nope 1}]
                 ["an unknown :type"                {:type "nope" :name "x" :sql "SELECT 1"}]]]
          (testing label
            (is (some? (caught #(t2/insert! :model/TransformTest (valid-row transform-id [bad])))))))
        (finally
          ;; Raw: the model's before-delete hook reads the row back, which is the very thing under
          ;; test here. Nothing should have been written, but a leftover row would break the
          ;; Transform's own cleanup on its FK.
          (t2/query {:delete-from (t2/table-name :model/TransformTest) :where [:= :transform_id transform-id]}))))))

(deftest duplicate-expectation-names-test
  ;; Uniqueness is a property of the vector rather than of one expectation, so `::expectations`
  ;; carries it as a predicate over the whole sequence.
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (try
      (let [dupes [{:type "empty" :name "dup" :sql "SELECT 1"}
                   {:type "empty" :name "dup" :sql "SELECT 2"}]
            e     (caught #(t2/insert! :model/TransformTest (valid-row transform-id dupes)))]
        (is (some? e) "two expectations sharing a name must not be storable")
        (is (re-find #"unique" (pr-str (keep (comp :error ex-data) (causes e))))
            (pr-str (mapv ex-message (causes e)))))
      (finally
        (t2/query {:delete-from (t2/table-name :model/TransformTest) :where [:= :transform_id transform-id]})))))

(deftest update-is-validated-too-test
  (testing "an update goes through the same :in transform as an insert"
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                            :inputs       inputs
                                                            :expectations [empty-expectation]}]
      (is (some? (caught #(t2/update! :model/TransformTest :id test-id {:expectations [{:type "empty" :name "x"}]}))))
      (testing "and the stored value is unchanged"
        (is (= ["no orphan rows"]
               (mapv :name (:expectations (t2/select-one :model/TransformTest :id test-id)))))))))

;;; ------------------------------------------------ Deletion ------------------------------------------------

(deftest deleting-a-transform-deletes-its-tests-through-toucan-test
  (testing "Deleting a transform takes its tests with it, through their own hook"
    (let [published (atom [])]
      (mt/with-temp [:model/Transform     {transform-id :id} {:name "Orders Summary"}
                     :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                              :name         "No nulls"
                                                              :inputs       []
                                                              :expectations []}
                     :model/TransformTest {other-id :id}     {:transform_id transform-id
                                                              :name         "No dupes"
                                                              :inputs       []
                                                              :expectations []}]
        (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
          (transform/delete-transforms! [transform-id]))
        (testing "the rows are gone"
          (is (false? (t2/exists? :model/TransformTest :id test-id)))
          (is (false? (t2/exists? :model/TransformTest :id other-id))))
        (testing "and each test published its own delete event on the way out"
          (is (= #{test-id other-id}
                 (into #{}
                       (comp (filter (comp #{:event/transform-test-delete} first))
                             (mapcat (fn [[_topic event]] (map (comp :id :previous-object) (:changes event)))))
                       @published))))))))

;;; --------------------------------------------- Run tracking ---------------------------------------------

(defn- minutes-ago ^OffsetDateTime [^long n]
  (.minusMinutes (OffsetDateTime/now ZoneOffset/UTC) n))

(defn- recent?
  [timestamp]
  (.isAfter ^OffsetDateTime timestamp (minutes-ago 1)))

(deftest transform-test-run-lifecycle-test
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
    (let [initiated-by (mt/user->id :crowberto)
          {run-id :id :as started} (data-testing.run-tracking/start-run! :transform transform-test-id initiated-by)]
      (testing "a new run is started with database timestamps"
        (is (= :started (:status started)))
        (is (= :transform (:test_type started)))
        (is (= transform-test-id (:test_id started)))
        (is (= initiated-by (:initiated_by started)))
        (is (some? (:start_time started)))
        (is (nil? (:end_time started)))
        (is (some? (:last_heartbeat started))))
      (testing "the owning process heartbeats its registered run"
        (t2/update! :model/DataTestRun :id run-id {:last_heartbeat (minutes-ago 10)})
        (data-testing.run-tracking/heartbeat-and-reconcile-runs!)
        (is (recent? (t2/select-one-fn :last_heartbeat :model/DataTestRun :id run-id))))
      (testing "finishing sets a terminal status and end time"
        (is (= 1 (data-testing.run-tracking/finish-run! run-id :passed)))
        (let [finished (t2/select-one :model/DataTestRun :id run-id)]
          (is (= :passed (:status finished)))
          (is (some? (:end_time finished))))))))

(deftest reap-orphaned-transform-test-runs-test
  (mt/with-temp [:model/Transform        {transform-id :id} {}
                 :model/TransformTest    {transform-test-id :id} {:transform_id transform-id}
                 :model/DataTestRun {stale-id :id} {:test_type :transform
                                                    :test_id transform-test-id
                                                    :last_heartbeat    (minutes-ago 10)}
                 :model/DataTestRun {fresh-id :id} {:test_type :transform
                                                    :test_id transform-test-id
                                                    :last_heartbeat    (minutes-ago 1)}]
    (testing "only a stale started run is reaped"
      (is (= [stale-id]
             (mapv :id (data-testing.run-tracking/reap-orphaned-runs! 5))))
      (is (= :timeout (t2/select-one-fn :status :model/DataTestRun :id stale-id)))
      (is (some? (t2/select-one-fn :end_time :model/DataTestRun :id stale-id)))
      (is (= :started (t2/select-one-fn :status :model/DataTestRun :id fresh-id))))
    (testing "a late completion cannot overwrite the cluster reaper's timeout"
      (is (zero? (data-testing.run-tracking/finish-run! stale-id :passed)))
      (is (= :timeout (t2/select-one-fn :status :model/DataTestRun :id stale-id))))
    (testing "a second sweep is idempotent"
      (is (empty? (data-testing.run-tracking/reap-orphaned-runs! 5))))))

(deftest reap-orphaned-runs-times-out-runs-of-every-test-type-test
  ;; A node can find a run of a type it does not know, written by a node of a newer version.
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {transform-test-id :id} {:transform_id transform-id}
                 :model/DataTestRun {transform-run :id} {:test_type      :transform
                                                         :test_id        transform-test-id
                                                         :last_heartbeat (minutes-ago 10)}
                 :model/DataTestRun {unknown-run :id}   {:test_type      :type-from-a-newer-version
                                                         :test_id        transform-test-id
                                                         :last_heartbeat (minutes-ago 10)}]
    (let [reaped    (atom nil)
          published (atom [])]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! published conj [topic (-> event :object :id)])
                                            event)]
        (testing "a sweep over a stale run of a type this version does not know does not throw"
          (is (nil? (caught #(reset! reaped (data-testing.run-tracking/reap-orphaned-runs! 5)))))))
      (testing "the stale transform run is timed out, returned, and its timeout event published"
        (is (= :timeout (t2/select-one-fn :status :model/DataTestRun :id transform-run)))
        (is (contains? (into #{} (map :id) @reaped) transform-run))
        (is (some #{[:event/transform-test-run-timeout transform-run]} @published)))
      (testing "the stale run of the unknown type is timed out and returned, with no event"
        (is (= :timeout (t2/select-one-fn :status :model/DataTestRun :id unknown-run)))
        (is (contains? (into #{} (map :id) @reaped) unknown-run))
        (is (not-any? (fn [[_topic id]] (= unknown-run id)) @published))))))

(deftest deleting-transform-test-preserves-runs-test
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {transform-test-id :id} {:transform_id transform-id}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :transform transform-test-id)]
      (data-testing.models/delete-transform-tests! [transform-test-id])
      (is (nil? (t2/select-one-fn :test_id :model/DataTestRun :id run-id)))
      (is (= 1 (data-testing.run-tracking/finish-run! run-id :passed)))
      (is (= :passed (t2/select-one-fn :status :model/DataTestRun :id run-id))))))

(deftest last-run-hydration-finds-only-transform-runs-test
  (mt/with-temp [:model/Transform   {transform-id :id} {}
                 :model/TransformTest {test-id :id :as transform-test} {:transform_id transform-id}
                 :model/DataTestRun {transform-run :id} {:test_type :transform, :test_id test-id}
                 :model/DataTestRun _                   {:test_type :card, :test_id test-id}]
    (is (= transform-run (-> (t2/hydrate transform-test :last_run) :last_run :id)))))

(deftest deleting-transform-test-keeps-runs-of-other-test-types-test
  (mt/with-temp [:model/Transform   {transform-id :id} {}
                 :model/TransformTest {test-id :id} {:transform_id transform-id}
                 :model/DataTestRun {card-run :id} {:test_type :card, :test_id test-id}]
    (data-testing.models/delete-transform-tests! [test-id])
    (is (= test-id (t2/select-one-fn :test_id :model/DataTestRun :id card-run)))))

(deftest deleting-run-initiator-preserves-run-test
  (mt/with-temp [:model/Transform     {transform-id :id} {}
                 :model/TransformTest {transform-test-id :id} {:transform_id transform-id}
                 :model/User          {user-id :id} {}]
    (let [{run-id :id} (data-testing.run-tracking/start-run! :transform transform-test-id user-id)]
      (t2/delete! :model/User :id user-id)
      (is (nil? (t2/select-one-fn :initiated_by :model/DataTestRun :id run-id)))
      (is (= 1 (data-testing.run-tracking/finish-run! run-id :passed)))
      (is (= :passed (t2/select-one-fn :status :model/DataTestRun :id run-id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (let [created (atom [])
          create! (fn [n]
                    (events.tu/statement-count! (fn [] (swap! created into
                                                              (map :id (data-testing.models/create-transform-tests!
                                                                        (vec (repeat n (valid-row transform-id [])))))))))]
      (try
        (testing "creating transform tests"
          (create! 1)
          (is (= (create! 2) (create! 6))))
        (testing "updating transform tests"
          (let [[warm-up & ids] @created
                update!         (fn [ids]
                                  (events.tu/statement-count!
                                   (fn [] (data-testing.models/update-transform-tests! (mapv (fn [row-id] (assoc {:description "same"} :id row-id)) ids)))))]
            (update! [warm-up])
            (is (= (update! (take 2 ids)) (update! (take 6 (drop 2 ids)))))))
        (testing "deleting a transform deletes its tests in a fixed number of statements"
          (let [delete! (fn [n]
                          (data-testing.models/create-transform-tests! (vec (repeat n (valid-row transform-id []))))
                          (events.tu/statement-count! (fn [] (data-testing.models/delete-transform-tests-for-transforms! [transform-id]))))]
            (delete! 1)
            (is (= (delete! 2) (delete! 6)))))
        (finally
          (t2/delete! :model/TransformTest :transform_id transform-id))))))

(deftest mixed-state-saved-test-write-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Transform {t1 :id} {}
                 :model/Transform {t2 :id} {}
                 :model/Transform {t3 :id} {}
                 :model/Transform {t4 :id} {}
                 :model/Transform {t5 :id} {}
                 :model/Transform {t6 :id} {}]
    (let [subjects [t1 t2 t3 t4 t5 t6]]
      (testing "creating, updating and deleting the tests of several transforms"
        (let [make!   (fn [n]
                        (mapv :id (data-testing.models/create-transform-tests!
                                   (vec (map-indexed (fn [i transform-id]
                                                       (cond-> (valid-row transform-id [])
                                                         (even? i) (assoc :description "same")))
                                                     (take n subjects))))))
              counted (fn [n]
                        (let [create (events.tu/statement-count!
                                      #(data-testing.models/create-transform-tests! (mapv (fn [s] (valid-row s [])) (take n subjects))))
                              ids    (make! n)
                              update (events.tu/statement-count!
                                      #(data-testing.models/update-transform-tests! (mapv (fn [row-id] (assoc {:description "same"} :id row-id)) ids)))
                              delete (events.tu/statement-count!
                                      #(data-testing.models/delete-transform-tests-for-transforms! (vec (take n subjects))))]
                          [create update delete]))]
          (counted 1)
          (let [[create-2 update-2 delete-2] (counted 2)
                [create-6 update-6 delete-6] (counted 6)]
            (is (= [create-2 delete-2] [create-6 delete-6]))
            (is (= update-2 update-6))))))))

(deftest card-and-segment-test-write-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Card    {c1 :id} {}
                 :model/Card    {c2 :id} {}
                 :model/Card    {c3 :id} {}
                 :model/Card    {c4 :id} {}
                 :model/Card    {c5 :id} {}
                 :model/Card    {c6 :id} {}
                 :model/Segment {s1 :id} {}
                 :model/Segment {s2 :id} {}
                 :model/Segment {s3 :id} {}
                 :model/Segment {s4 :id} {}
                 :model/Segment {s5 :id} {}
                 :model/Segment {s6 :id} {}]
    (let [row-of  (fn [subject-key id i]
                    (cond-> {subject-key id :creator_id (mt/user->id :rasta) :name "a test" :inputs [] :expectations []}
                      (even? i) (assoc :description "same")))
          measure (fn [subject-key subjects create! update! delete! delete-subjects!]
                    (fn [n]
                      (let [rows   #(vec (map-indexed (fn [i id] (row-of subject-key id i)) (take n subjects)))
                            create (events.tu/statement-count! #(create! (rows)))
                            ids    (mapv :id (create! (rows)))
                            update (events.tu/statement-count! #(update! (mapv (fn [row-id] {:id row-id :description "same"}) ids)))
                            delete (events.tu/statement-count! #(delete! ids))
                            _      (create! (rows))
                            by-subject (events.tu/statement-count! #(delete-subjects! (vec (take n subjects))))]
                        [create update delete by-subject])))
          cards    (measure :card_id [c1 c2 c3 c4 c5 c6]
                            data-testing.models.card-test/create-card-tests!
                            data-testing.models.card-test/update-card-tests!
                            data-testing.models.card-test/delete-card-tests!
                            data-testing.models.card-test/delete-card-tests-for-cards!)
          segments (measure :segment_id [s1 s2 s3 s4 s5 s6]
                            data-testing.models.segment-test/create-segment-tests!
                            data-testing.models.segment-test/update-segment-tests!
                            data-testing.models.segment-test/delete-segment-tests!
                            data-testing.models.segment-test/delete-segment-tests-for-segments!)]
      (doseq [[test-name measured] [["card tests" cards] ["segment tests" segments]]]
        (testing test-name
          (measured 1)
          (let [[create-2 update-2 delete-2 by-subject-2] (measured 2)
                [create-6 update-6 delete-6 by-subject-6] (measured 6)]
            (is (= [create-2 delete-2 by-subject-2] [create-6 delete-6 by-subject-6]))
            (is (= update-2 update-6))))))))

;;; ------------------------------------------ Native query Databases ------------------------------------------

(defn- per-query-answer
  "What the run permission check of a native query on the Database `db-id` answers, or `:throws`."
  [db-id]
  (try
    (first (query-perms/query-run-answers [(lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")]))
    (catch Throwable _
      :throws)))

(defn- native-answers
  "The answers of the per-query check, the per-Database check and the bulk check for each of `db-ids`."
  [db-ids]
  (let [bulk (query-perms/native-query-database-ids db-ids)]
    {:per-query    (into {} (map (juxt identity per-query-answer)) db-ids)
     :per-database (into {} (map (juxt identity data-testing.models/can-run-native-query?)) db-ids)
     :bulk         (into {} (map (juxt identity #(contains? bulk %))) db-ids)}))

(defn- check-native-answers
  "Assert that the three checks agree for `user` on `db-ids` and that the Databases allowed are `expected`."
  [user db-ids expected]
  (mt/with-current-user (mt/user->id user)
    (let [{:keys [per-query per-database bulk]} (native-answers db-ids)]
      (is (= per-query bulk))
      (is (= per-database bulk))
      (is (= expected (into #{} (comp (filter val) (map key)) bulk))))))

(defn- grant-native!
  "Give `group` native queries on the Database `db-id`."
  [group db-id]
  (perms/set-database-permission! group db-id :perms/view-data :unrestricted)
  (perms/set-database-permission! group db-id :perms/create-queries :query-builder-and-native))

(deftest native-query-database-ids-matches-per-query-check-test
  (mt/with-premium-features #{:advanced-permissions :sandboxes}
    (mt/with-temp [:model/Database {db-b :id} {:engine :h2 :details (:details (mt/db))}]
      (perms.tu/with-no-data-perms-for-all-users!
        (let [db-a (mt/id)]
          (grant-native! (perms-group/all-users) db-a)
          (perms/set-database-permission! (perms-group/all-users) db-b :perms/view-data :unrestricted)
          (perms/set-database-permission! (perms-group/all-users) db-b :perms/create-queries :query-builder)
          (testing "superuser"
            (check-native-answers :crowberto [db-a db-b] #{db-a db-b}))
          (testing "native queries on one Database and query builder on another, asked in one call"
            (check-native-answers :rasta [db-a db-b] #{db-a}))
          (testing "query builder only"
            (check-native-answers :rasta [db-b] #{}))
          (testing "native queries with one blocked Table"
            (perms/set-table-permission! (perms-group/all-users) (mt/id :venues) :perms/view-data :blocked)
            (check-native-answers :rasta [db-a db-b] #{}))
          (testing "Database that does not exist"
            (mt/with-current-user (mt/user->id :rasta)
              (is (= :throws (per-query-answer Integer/MAX_VALUE)))
              (is (= #{} (query-perms/native-query-database-ids [Integer/MAX_VALUE])))
              (is (false? (data-testing.models/can-run-native-query? Integer/MAX_VALUE))))))))))

(deftest native-query-database-ids-sandboxed-user-test
  (met/with-gtaps! {:gtaps {:venues {}}}
    (mt/with-temp [:model/Database {db-b :id} {:engine :h2 :details (:details (mt/db))}]
      (grant-native! &group (mt/id))
      (grant-native! &group db-b)
      (testing "enforced sandbox on one Database"
        (check-native-answers :rasta [(mt/id) db-b] #{db-b}))
      (testing "sandbox lifted by another group with full access to its Table"
        (mt/with-temp [:model/PermissionsGroup           {group-id :id} {}
                       :model/PermissionsGroupMembership _              {:group_id group-id :user_id (mt/user->id :rasta)}]
          (perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
          (check-native-answers :rasta [(mt/id) db-b] #{(mt/id) db-b}))))))

(deftest native-query-database-ids-impersonated-user-test
  (mt/with-premium-features #{:advanced-permissions}
    (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "KEY"}]
                                                   :attributes     {"KEY" "VAL"}}
      (check-native-answers :rasta [(mt/id)] #{(mt/id)}))))

(deftest native-query-database-ids-router-and-destination-test
  (mt/with-premium-features #{:database-routing}
    (mt/with-temp [:model/Database       {router :id}      {:engine :h2 :details (:details (mt/db))}
                   :model/DatabaseRouter _                 {:database_id router :user_attribute "db_name"}
                   :model/Database       {destination :id} {:engine             :h2
                                                            :name               "native-destination"
                                                            :details            (:details (mt/db))
                                                            :router_database_id router}]
      (perms.tu/with-no-data-perms-for-all-users!
        (grant-native! (perms-group/all-users) router)
        (met/with-user-attributes! :rasta {"db_name" "native-destination"}
          (check-native-answers :rasta [router destination] #{router})
          (check-native-answers :crowberto [router destination] #{router destination}))))))

(deftest native-query-database-ids-statements-do-not-grow-with-databases-test
  (met/with-gtaps! {:gtaps {:venues {}}}
    (mt/with-temp [:model/Database {d1 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d2 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d3 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d4 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d5 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d6 :id} {:engine :h2 :details (:details (mt/db))}]
      (let [db-ids [(mt/id) d1 d2 d3 d4 d5 d6]]
        (doseq [db-id db-ids]
          (grant-native! &group db-id))
        (mt/with-current-user (mt/user->id :rasta)
          (let [measure (fn [n]
                          (t2/with-call-count [call-count]
                            (let [allowed (query-perms/native-query-database-ids (vec (take n db-ids)))]
                              {:statements (call-count)
                               :allowed    allowed})))]
            (measure 1)
            (is (= (:statements (measure 2)) (:statements (measure 6))))
            (is (= (set (rest (take 6 db-ids))) (:allowed (measure 6))))))))))

(defn- native-transform
  "Attributes of a transform whose source is a native query on the Database `db-id`, writing table number `i`."
  [db-id i]
  {:source {:type  :query
            :query (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1 AS ID")}
   :target {:type     "table"
            :schema   "PUBLIC"
            :name     (str "NATIVE_DB_TARGET_" i)
            :database db-id}})

(defn- native-card
  "Attributes of a card in the collection `collection-id` whose query is native SQL on the Database `db-id`."
  [collection-id db-id]
  {:collection_id collection-id
   :dataset_query (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")})

(deftest transform-test-can-write-statements-do-not-grow-with-databases-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/Database {d1 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d2 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d3 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d4 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d5 :id} {:engine :h2 :details (:details (mt/db))}
                   :model/Database {d6 :id} {:engine :h2 :details (:details (mt/db))}]
      (perms.tu/with-no-data-perms-for-all-users!
        (let [db-ids [d1 d2 d3 d4 d5 d6]]
          (doseq [db-id db-ids]
            (grant-native! (perms-group/all-users) db-id)
            (perms/set-database-permission! (perms-group/all-users) db-id :perms/transforms :yes))
          (perms/set-database-permission! (perms-group/all-users) d6 :perms/create-queries :query-builder)
          (mt/with-temp [:model/Transform {tr1 :id} (native-transform d1 1)
                         :model/Transform {tr2 :id} (native-transform d2 2)
                         :model/Transform {tr3 :id} (native-transform d3 3)
                         :model/Transform {tr4 :id} (native-transform d4 4)
                         :model/Transform {tr5 :id} (native-transform d5 5)
                         :model/Transform {tr6 :id} (native-transform d6 6)]
            (mt/with-data-analyst-role! (mt/user->id :lucky)
              (mt/with-current-user (mt/user->id :lucky)
                (let [tests   (mapv (fn [i transform-id] (t2/instance :model/TransformTest {:id i :transform_id transform-id}))
                                    (range 6) [tr1 tr2 tr3 tr4 tr5 tr6])
                      hydrate (fn [k n]
                                (t2/with-call-count [call-count]
                                  (let [hydrated (doall (t2/hydrate (vec (take n tests)) k))]
                                    {:statements (call-count)
                                     :values     (mapv k hydrated)})))]
                  (testing "the statements of the hydration on transforms of distinct Databases, beyond loading the transforms and their own check"
                    (let [own        (fn [subject-ks n]
                                       (t2/with-call-count [call-count]
                                         (doseq [subject-k subject-ks]
                                           (doall (t2/hydrate (data-testing.db/transforms (vec (take n [tr1 tr2 tr3 tr4 tr5 tr6])))
                                                              subject-k)))
                                         (call-count)))
                          beyond-own (fn [k subject-ks n]
                                       (own subject-ks n)
                                       (- (:statements (hydrate k n)) (own subject-ks n)))]
                      (doseq [[k subject-k] [[:can_write [:can_write]] [:can_query [:can_read :can_query]]]]
                        (beyond-own k subject-k 1)
                        (is (= (beyond-own k subject-k 2) (beyond-own k subject-k 6))))))
                  (testing "each test gets the answer the per-test check gave"
                    (is (= [true true true true true false] (:values (hydrate :can_write 6))))
                    (is (= [true true true true true false] (:values (hydrate :can_query 6))))
                    (is (= (mapv #(boolean (some-> (data-testing.db/transform (:transform_id %)) (t2/hydrate :can_write) mi/can-write?)) tests)
                           (:values (hydrate :can_write 6))))))))))))))

(defn- per-query-native?
  "Whether the per-query run check allows a native query on the Database `db-id`."
  [db-id]
  (true? (per-query-answer db-id)))

(defn- single-row-can-run-transform-test?
  "The single-row run check of a transform test that its `:can_query` hydration replaces."
  [{:keys [transform_id]}]
  (let [transform (t2/select-one :model/Transform :id transform_id)]
    (boolean
     (and transform
          (mi/can-read? (t2/hydrate transform :can_read))
          (or (mi/superuser?)
              (some-> (transforms-base.i/source-db-id transform) per-query-native?))))))

(defn- single-row-subject-allows?
  "The single-row run check of a card or segment test, given its `subject` and the subject's `query`."
  [subject query]
  (boolean
   (when subject
     (and (mi/can-read? (t2/hydrate subject :can_read))
          (first (query-perms/query-run-answers [query]))
          (or (mi/superuser?)
              (some-> (data-testing.models/query-database-id query) per-query-native?))))))

(defn- single-row-can-run-card-test?
  [{:keys [card_id]}]
  (let [card (t2/select-one :model/Card :id card_id)]
    (single-row-subject-allows? card (:dataset_query card))))

(defn- single-row-can-run-segment-test?
  [{:keys [segment_id]}]
  (let [segment (t2/select-one :model/Segment :id segment_id)]
    (single-row-subject-allows? segment (:definition segment))))

(defn- check-can-query
  "Assert that the `:can_query` of `tests`, hydrated together, is what `single-row` answers for each, and is `expected`."
  [tests single-row expected]
  (let [hydrated (mapv mi/can-query? (t2/hydrate tests :can_query))]
    (is (= (mapv single-row tests) hydrated))
    (is (= expected hydrated))))

(deftest can-query-matches-single-row-run-check-test
  (met/with-gtaps-for-user! :lucky {:gtaps {:venues {}}}
    (data-testing.test-util/with-transforms-enabled (conj data-testing.test-util/data-analyst-features :sandboxes)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Database   {db-b :id}       {:engine :h2 :details (:details (mt/db))}
                       :model/Database   {db-c :id}       {:engine :h2 :details (:details (mt/db))}
                       :model/Collection {readable :id}   {}
                       :model/Collection {unreadable :id} {}]
          (let [db-a (mt/id)]
            (grant-native! &group db-b)
            (perms/set-database-permission! &group db-c :perms/view-data :unrestricted)
            (perms/set-database-permission! &group db-c :perms/create-queries :query-builder)
            (perms/set-database-permission! (perms-group/all-users) db-c :perms/create-queries :query-builder)
            (perms/grant-collection-read-permissions! (perms-group/all-users) readable)
            (mt/with-temp [:model/Transform {tr-a :id}      (native-transform db-a 1)
                           :model/Transform {tr-b :id}      (native-transform db-b 2)
                           :model/Transform {tr-c :id}      (native-transform db-c 3)
                           :model/Card      {card-a :id}    (native-card readable db-a)
                           :model/Card      {card-b :id}    (native-card readable db-b)
                           :model/Card      {card-c :id}    (native-card readable db-c)
                           :model/Card      {hidden-b :id}  (native-card unreadable db-b)
                           :model/Segment   {segment-a :id} (data-testing.test-util/from-google-segment)]
              (let [transform-tests (mapv #(t2/instance :model/TransformTest {:id %1 :transform_id %2})
                                          (range) [tr-a tr-b tr-c Integer/MAX_VALUE])
                    card-tests      (mapv #(t2/instance :model/CardTest {:id %1 :card_id %2})
                                          (range) [card-a card-b card-c hidden-b Integer/MAX_VALUE])
                    segment-tests   (mapv #(t2/instance :model/SegmentTest {:id %1 :segment_id %2})
                                          (range) [segment-a Integer/MAX_VALUE])]
                (testing "data analyst: sandboxed Database, native, query builder only, deleted subject"
                  (mt/with-data-analyst-role! (mt/user->id :lucky)
                    (mt/with-current-user (mt/user->id :lucky)
                      (check-can-query transform-tests single-row-can-run-transform-test? [false true false false])
                      (check-can-query card-tests single-row-can-run-card-test? [false true false false false])
                      (check-can-query segment-tests single-row-can-run-segment-test? [false false]))))
                (testing "user who reads no transform, with native queries on one Database"
                  (mt/with-current-user (mt/user->id :lucky)
                    (check-can-query transform-tests single-row-can-run-transform-test? [false false false false])
                    (check-can-query card-tests single-row-can-run-card-test? [false true false false false])))
                (testing "superuser"
                  (mt/with-current-user (mt/user->id :crowberto)
                    (check-can-query transform-tests single-row-can-run-transform-test? [true true true false])
                    (check-can-query card-tests single-row-can-run-card-test? [true true true true false])
                    (check-can-query segment-tests single-row-can-run-segment-test? [true false])))))))))))

(deftest transform-test-runs-in-worktree-test
  (data-testing.test-util/with-transforms-enabled data-testing.test-util/data-analyst-features
    (mt/with-temp [:model/RemoteSyncWorktree {worktree-id :id} {:branch "test-branch"}]
      (mdb/with-worktree-scope (mdb/worktree-id->scope worktree-id)
        (mt/with-temp [:model/Transform     transform      (native-transform (mt/id) 1)
                       :model/TransformTest transform-test {:transform_id (:id transform)}]
          (mt/with-current-user (mt/user->id :crowberto)
            (testing "transform itself is not run"
              (is (false? (:can_execute (t2/hydrate transform :can_execute)))))
            (testing "its test is run, created and moved to it"
              (is (mi/can-query? (t2/hydrate transform-test :can_query)))
              (is (mi/can-create? :model/TransformTest {:transform_id (:id transform)}))
              (is (mi/can-update? (assoc (t2/hydrate transform-test :can_write) :transform_id Integer/MAX_VALUE)
                                  {:transform_id (:id transform)})))))))))
