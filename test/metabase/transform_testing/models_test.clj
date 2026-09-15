(ns metabase.transform-testing.models-test
  "The `:model/TransformTest` column transforms. Expectations are built into records in the model's
  `:out`, so every reader gets validated values — including a serdes import, which goes through
  Toucan and never touches an API endpoint."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Fixtures ------------------------------------------------

(def ^:private inputs
  [{:table   {:schema "PUBLIC" :name "PEOPLE"}
    :format  "rows"
    :columns [{:name "ID" :database_type "INTEGER"}]
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
   :columns [{:name "ID" :database_type "INTEGER"}
             {:name "2024" :database_type "VARCHAR(255)"}
             {:name "order-id" :database_type "BIGINT"}]
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

;;; --------------------------------------------- Records, not maps ---------------------------------------------

(deftest expectations-read-back-as-records-test
  (saved-with
   [equals-expectation empty-expectation]
   (fn [transform-test]
     (let [expectations (:expectations transform-test)]
       (is (= 2 (count expectations)))
       (testing "every expectation a reader gets satisfies the protocol — a record, not a plain map"
         (doseq [e expectations]
           (is (satisfies? expectations.protocol/Expectation e) (pr-str e))))
       (testing "the assertion is not vacuous: the same entries as a plain map do not satisfy it"
         (doseq [e expectations]
           (is (not (satisfies? expectations.protocol/Expectation (into {} e))))))))))

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
         (is (= [{:name "ID" :database_type "INTEGER"}
                 {:name "2024" :database_type "VARCHAR(255)"}
                 {:name "order-id" :database_type "BIGINT"}]
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
                 :columns [{:name "ID" :database_type "INTEGER"}]
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

(defn- error-type [t]
  (some (comp :error-type ex-data) (causes t)))

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
        ;; The write goes through the same constructor a read does, so each refusal is the feature's
        ;; own typed error rather than a bare malli explain — and an unrecognized `:type` is named
        ;; as such rather than lumped in with everything else the schema rejects.
        (doseq [[label bad expected]
                [["no :sql on an empty expectation" {:type "empty" :name "x"}
                  ::transform-testing.errors/invalid-expectation]
                 ["no :name"                        {:type "empty" :sql "SELECT 1"}
                  ::transform-testing.errors/invalid-expectation]
                 ["a blank :name"                   {:type "empty" :name "" :sql "SELECT 1"}
                  ::transform-testing.errors/invalid-expectation]
                 ["an undeclared key"               {:type "empty" :name "x" :sql "SELECT 1" :nope 1}
                  ::transform-testing.errors/invalid-expectation]
                 ["an unknown :type"                {:type "nope" :name "x" :sql "SELECT 1"}
                  ::transform-testing.errors/unknown-expectation-type]]]
          (testing label
            (let [e (caught #(t2/insert! :model/TransformTest (valid-row transform-id [bad])))]
              (is (some? e))
              (is (= expected (error-type e))
                  (pr-str (mapv ex-message (causes e)))))))
        (finally
          ;; Raw: the model's before-delete hook reads the row back, which is the very thing under
          ;; test here. Nothing should have been written, but a leftover row would break the
          ;; Transform's own cleanup on its FK.
          (t2/query {:delete-from :transform_test :where [:= :transform_id transform-id]}))))))

(deftest duplicate-expectation-names-test
  ;; Uniqueness is a property of the vector, so no schema can express it. The `:in` transform
  ;; therefore goes through the same constructor a read does, and the write is refused outright
  ;; rather than stored as a value every later read would reject.
  (mt/with-temp [:model/Transform {transform-id :id} {}]
    (try
      (let [dupes [{:type "empty" :name "dup" :sql "SELECT 1"}
                   {:type "empty" :name "dup" :sql "SELECT 2"}]
            e     (caught #(t2/insert! :model/TransformTest (valid-row transform-id dupes)))]
        (is (some? e) "two expectations sharing a name must not be storable")
        (is (= ::transform-testing.errors/duplicate-expectation-name (error-type e))
            (pr-str (mapv ex-message (causes e)))))
      (finally
        (t2/query {:delete-from :transform_test :where [:= :transform_id transform-id]})))))

(deftest update-is-validated-too-test
  (testing "an update goes through the same :in transform as an insert"
    (mt/with-temp [:model/Transform     {transform-id :id} {}
                   :model/TransformTest {test-id :id}      {:transform_id transform-id
                                                            :inputs       inputs
                                                            :expectations [empty-expectation]}]
      (let [e (caught #(t2/update! :model/TransformTest test-id {:expectations [{:type "empty" :name "x"}]}))]
        (is (some? e))
        (is (= ::transform-testing.errors/invalid-expectation (error-type e))))
      (testing "and the stored value is unchanged"
        (is (= ["no orphan rows"]
               (mapv :name (:expectations (t2/select-one :model/TransformTest :id test-id)))))))))
