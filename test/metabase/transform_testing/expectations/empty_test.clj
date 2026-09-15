(ns metabase.transform-testing.expectations.empty-test
  "The `empty` expectation: what it asks to run, and what it makes of the answer. Pure — no database
  and no warehouse connection; `probes` only parses and rewrites SQL."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.transform-testing.expectations :as transform-testing.expectations]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.expectations.report :as expectations.report]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; Rewriting a table reference dispatches on an initialized driver. No connection is opened.
(use-fixtures :once (fn [f] (driver/the-initialized-driver :h2) (f)))

(defn- empty-expectation
  "One `empty` record, built through the front door rather than the generated constructor."
  [m]
  (first (transform-testing.expectations/expectations [m])))

(def ^:private an-expectation
  (delay (empty-expectation {:type "empty"
                             :name "no orphan rows"
                             :sql  "SELECT * FROM PEOPLE WHERE ID IS NULL"})))

;;; --------------------------------------------- interpret ---------------------------------------------

(deftest interpret-no-rows-test
  (let [result (expectations.protocol/interpret @an-expectation {:rows []})]
    (is (= {:name "no orphan rows" :type :empty :status :passed} result))
    (testing "a pass carries no sample: there is nothing to show"
      (is (not (contains? result :sample)))
      (is (not (contains? result :truncated)))))
  (testing "no rows at all reads the same as an empty list"
    (is (= {:name "no orphan rows" :type :empty :status :passed}
           (expectations.protocol/interpret @an-expectation {:rows nil})))))

(deftest interpret-rows-test
  (let [result (expectations.protocol/interpret @an-expectation
                                                {:rows [[1 "a" nil] [2 "b" (java.math.BigDecimal. "1.50")]]})]
    (is (= :failed (:status result)))
    (testing "the result always identifies itself by the author's name and its type"
      (is (= "no orphan rows" (:name result)))
      (is (= :empty (:type result))))
    (testing "the sample is the rows rendered through report/cell"
      (is (= [[1 "a" nil] [2 "b" "1.50"]] (:sample result))))
    (is (= 0 (:truncated result)))))

(deftest interpret-truncation-test
  (let [rows   (mapv (fn [i] [i]) (range (+ expectations.report/row-cap 4)))
        result (expectations.protocol/interpret @an-expectation {:rows rows})]
    (is (= :failed (:status result)))
    (is (= expectations.report/row-cap (count (:sample result))))
    (is (= 4 (:truncated result)))
    (testing "the sample is the first rows, not an arbitrary selection"
      (is (= (vec (take expectations.report/row-cap rows)) (:sample result))))))

;;; ----------------------------------------------- probes -----------------------------------------------

(def ^:private replacements
  "PEOPLE stands in for the run's input temp table; the shape is what `compile/table-replacements`
  produces."
  {{:table "PEOPLE"} {:db nil :schema nil :table "TMP_IN_1"}})

(defn- probes []
  (expectations.protocol/probes @an-expectation
                                {:driver         :h2
                                 :output-table   "TMP_OUT"
                                 :output-columns ["ID"]
                                 :replacements   replacements}))

(deftest probes-shape-test
  (let [ps (probes)]
    (testing "one probe"
      (is (= [:rows] (keys ps))))
    (let [{:keys [params max-rows]} (:rows ps)]
      (is (= [] params))
      (testing "the cap is the report's, so a runaway failure cannot be read into memory whole"
        (is (= expectations.report/row-cap max-rows))))))

(deftest probes-query-is-the-authors-sql-rewritten-test
  (let [query (u/lower-case-en (:query (:rows (probes))))]
    (testing "the author's SQL is put through table replacement"
      (is (str/includes? query "tmp_in_1"))
      (is (not (str/includes? query "people"))))
    (testing "the rest of the author's SQL survives the rewrite"
      (is (str/includes? query "is null")))))
