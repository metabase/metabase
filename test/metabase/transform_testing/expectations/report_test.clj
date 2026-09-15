(ns metabase.transform-testing.expectations.report-test
  "Rendering warehouse values into a failure report, and capping how much of one is carried. Pure —
  no database."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.transform-testing.expectations.report :as expectations.report])
  (:import
   (java.math BigDecimal)
   (java.sql Timestamp)
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ cell ------------------------------------------------

(deftest cell-passthrough-test
  (testing "nil stays nil — a NULL cell must not become the string \"null\""
    (is (nil? (expectations.report/cell nil))))
  (testing "what JSON already carries goes through untouched"
    (is (= "abc" (expectations.report/cell "abc")))
    (is (= "" (expectations.report/cell "")))
    (is (= 7 (expectations.report/cell 7)))
    (is (= 7 (expectations.report/cell (long 7))))
    (is (= 1.5 (expectations.report/cell 1.5)))
    (is (= true (expectations.report/cell true)))
    (is (= false (expectations.report/cell false)))))

(deftest cell-bigdecimal-keeps-scale-test
  ;; When scale is the very difference between expected and actual, normalizing it away makes the
  ;; report contradict itself: it would show the two rows the comparison called different as equal.
  (testing "a BigDecimal renders as its plain string with its scale intact"
    (is (= "1.50" (expectations.report/cell (BigDecimal. "1.50"))))
    (is (= "1.5" (expectations.report/cell (BigDecimal. "1.5"))))
    (is (= "0.00" (expectations.report/cell (BigDecimal. "0.00"))))
    (is (= "-2.500" (expectations.report/cell (BigDecimal. "-2.500")))))
  (testing "1.50 and 1.5 stay distinguishable"
    (is (not= (expectations.report/cell (BigDecimal. "1.50"))
              (expectations.report/cell (BigDecimal. "1.5"))))))

(deftest cell-bigdecimal-is-plain-not-scientific-test
  (testing "a BigDecimal whose toString would use an exponent renders in plain form"
    (doseq [s ["1E+3" "1.0E-8" "1E-10" "123456789E+10"]]
      (let [rendered (expectations.report/cell (BigDecimal. ^String s))]
        (is (string? rendered))
        (is (not (str/includes? (str/upper-case rendered) "E"))
            (str s " rendered as " (pr-str rendered))))))
  (testing "the plain form is the value, not an approximation of it"
    (is (= "1000" (expectations.report/cell (BigDecimal. "1E+3"))))
    (is (= "0.000000010" (expectations.report/cell (BigDecimal. "1.0E-8"))))))

(deftest cell-temporal-test
  (testing "a temporal value becomes a string rather than leaking a Java object into JSON"
    (doseq [v [(Timestamp/valueOf "2024-01-31 12:34:56") (LocalDate/of 2024 1 31)]]
      (let [rendered (expectations.report/cell v)]
        (is (string? rendered) (str (class v)))
        (is (= (str v) rendered)))))
  (is (= "2024-01-31" (expectations.report/cell (LocalDate/of 2024 1 31)))))

;;; ----------------------------------------------- capped -----------------------------------------------

(defn- numbered-rows
  "`n` distinguishable rows, so a cap can be checked for taking the first ones and not just `n` of them."
  [n]
  (mapv (fn [i] [i]) (range n)))

(deftest capped-under-the-cap-test
  (let [rows (numbered-rows (dec expectations.report/row-cap))]
    (is (= [rows 0] (expectations.report/capped rows)))))

(deftest capped-at-the-cap-test
  (testing "exactly at the cap nothing is dropped — the boundary is inclusive"
    (let [rows (numbered-rows expectations.report/row-cap)]
      (is (= [rows 0] (expectations.report/capped rows))))))

(deftest capped-over-the-cap-test
  (let [rows             (numbered-rows (+ expectations.report/row-cap 7))
        [kept dropped]   (expectations.report/capped rows)]
    (is (= expectations.report/row-cap (count kept)))
    (is (= 7 dropped))
    (testing "the rows kept are the first ones, in order"
      (is (= (vec (take expectations.report/row-cap rows)) kept)))))

(deftest capped-empty-test
  (is (= [[] 0] (expectations.report/capped [])))
  (is (= [[] 0] (expectations.report/capped nil))))

(deftest capped-returns-a-vector-test
  (testing "the sample is a vector, so a lazy seq cannot escape into the report"
    (is (vector? (first (expectations.report/capped (range 3)))))))
