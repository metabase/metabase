(ns metabase-enterprise.data-testing.expectations.empty-test
  "The `empty` expectation: what it asks to run, and what it makes of the answer. Pure — no database
  and no warehouse connection."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.data-testing.expectations.empty]
   [metabase-enterprise.data-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.data-testing.expectations.report :as expectations.report]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase.lib.core :as lib]))

;; The expectation under test.
(comment
  metabase-enterprise.data-testing.expectations.empty/keep-me)

(set! *warn-on-reflection* true)

(defn- empty-expectation
  "One `empty` record, normalized and validated the way the model's `:in` transform does it, rather
  than built with the generated constructor."
  [m]
  (expectations.protocol/build (lib/normalize ::data-testing.schema/expectation m)))

(def ^:private an-expectation
  (delay (empty-expectation {:type "empty"
                             :name "no orphan rows"
                             :sql  "SELECT * FROM PEOPLE WHERE ID IS NULL"})))

;;; --------------------------------------------- interpret ---------------------------------------------

(def ^:private violation-columns
  [{:name "ID" :database_type "INTEGER"}
   {:name "NAME" :database_type "CHARACTER VARYING"}
   {:name "AMOUNT" :database_type "NUMERIC"}])

(defn- interpret-violations
  "`interpret` over `rows`, as the runner delivers them: the probe's rows and its column metadata."
  [rows]
  (expectations.protocol/interpret @an-expectation
                                   {}
                                   {:violations {:rows rows :columns violation-columns}}))

(deftest interpret-no-rows-test
  (let [result (interpret-violations [])]
    (is (= {:name "no orphan rows" :type :empty :status :passed} result))
    (testing "a pass carries no sample: there is nothing to show"
      (is (not (contains? result :sample)))
      (is (not (contains? result :truncated))))
    (testing "and no columns: they describe a sample that is not there"
      (is (not (contains? result :columns)))))
  (testing "no rows at all reads the same as an empty list"
    (is (= {:name "no orphan rows" :type :empty :status :passed}
           (interpret-violations nil)))))

(deftest interpret-rows-test
  (let [result (interpret-violations [[1 "a" nil] [2 "b" (java.math.BigDecimal. "1.50")]])]
    (is (= :failed (:status result)))
    (testing "the result always identifies itself by the author's name and its type"
      (is (= "no orphan rows" (:name result)))
      (is (= :empty (:type result))))
    (testing "the sample names its cells, as an equals diff does"
      (is (= [{"ID" 1 "NAME" "a" "AMOUNT" nil}
              {"ID" 2 "NAME" "b" "AMOUNT" "1.50"}]
             (:sample result))))
    (testing "the columns carry the warehouse's own type for each"
      (is (= violation-columns (:columns result))))
    (is (= 0 (:truncated result)))))

(deftest interpret-truncation-test
  (let [rows   (mapv (fn [i] [i nil nil]) (range (+ expectations.report/row-cap 4)))
        result (interpret-violations rows)]
    (is (= :failed (:status result)))
    (is (= expectations.report/row-cap (count (:sample result))))
    (is (= 4 (:truncated result)))
    (testing "the sample is the first rows, not an arbitrary selection"
      (is (= (mapv (fn [[i]] {"ID" i "NAME" nil "AMOUNT" nil})
                   (take expectations.report/row-cap rows))
             (:sample result))))))

;;; ----------------------------------------------- probes -----------------------------------------------

(def ^:private checked-query
  "The SQL a run's plan carries for the expectation: its author's SQL as the statement check returned it."
  "SELECT * FROM TMP_IN_1 WHERE ID IS NULL")

(defn- probes []
  (expectations.protocol/probes @an-expectation
                                {:driver            :postgres
                                 :output-table      "TMP_OUT"
                                 :output-columns    ["ID"]
                                 :replacements      {}
                                 :expectation-query checked-query}))

(deftest probes-shape-test
  (let [ps (probes)]
    (testing "one probe"
      (is (= [:violations] (keys ps))))
    (let [{:keys [params max-rows]} (:violations ps)]
      (is (= [] params))
      (testing "the cap is the report's, so a runaway failure cannot be read into memory whole"
        (is (= expectations.report/row-cap max-rows))))))

(deftest probes-run-the-checked-query-test
  (testing "the probe runs the SQL the run's context carries for the expectation, not the author's SQL"
    (is (= checked-query (:query (:violations (probes)))))))
