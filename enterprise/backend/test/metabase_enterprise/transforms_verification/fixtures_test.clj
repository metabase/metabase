(ns metabase-enterprise.transforms-verification.fixtures-test
  "Tests for [[fixtures/parse-fixture]]: header validation against the target
  schema, the typed-error re-wrap contract, and one end-to-end delegation
  check. CSV parsing mechanics (cell typing, blank→nil, BOM, ragged/unparseable
  detail) are pinned in `metabase.upload.parse-csv-test`, where the
  implementation lives.

  These tests are pure/driver-free — no database required."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-verification.errors :as errors]
   [metabase-enterprise.transforms-verification.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Delegation: typed parsing flows through upload/parse-csv
;; ---------------------------------------------------------------------------

(deftest ^:parallel parse-fixture-multi-column-test
  (testing "Multi-column CSV with mixed types"
    (let [csv    "id,name,score,active,dt\n1,alpha,9.5,true,2024-03-15\n2,beta,3.2,false,2024-06-01\n"
          schema [{:name "id"     :base-type :type/Integer :nullable? false}
                  {:name "name"   :base-type :type/Text    :nullable? true}
                  {:name "score"  :base-type :type/Float   :nullable? true}
                  {:name "active" :base-type :type/Boolean :nullable? true}
                  {:name "dt"     :base-type :type/Date    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= 2 (count (:rows result))))
      (let [[id name score active dt] (first (:rows result))]
        (is (= (biginteger 1) id))
        (is (= "alpha" name))
        (is (= (double 9.5) score))
        (is (true? active))
        (is (instance? java.time.LocalDate dt))))))

;; ---------------------------------------------------------------------------
;; Header mismatch errors
;; ---------------------------------------------------------------------------

(deftest ^:parallel header-mismatch-missing-columns-test
  (testing "CSV missing columns that target schema requires → typed error"
    (let [csv    "id,name\n1,alpha\n"
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "name"  :base-type :type/Text    :nullable? true}
                  {:name "score" :base-type :type/Float   :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-verification.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= #{"score"} (set (:missing-columns (ex-data ex))))))))

(deftest ^:parallel header-mismatch-extra-columns-test
  (testing "CSV has extra columns not in target schema → typed error"
    (let [csv    "id,name,unexpected_col\n1,alpha,extra\n"
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-verification.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= #{"unexpected_col"} (set (:extra-columns (ex-data ex))))))))

(deftest ^:parallel header-mismatch-case-sensitive-test
  (testing "Header matching is case-sensitive — 'Name' ≠ 'name'"
    (let [csv    "id,Name\n1,alpha\n"
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown — 'Name' ≠ 'name'")
      (is (= :metabase-enterprise.transforms-verification.errors/header-mismatch
             (:error-type (ex-data ex))))
      ;; 'Name' is extra; 'name' is missing
      (is (= #{"Name"} (set (:extra-columns  (ex-data ex)))))
      (is (= #{"name"} (set (:missing-columns (ex-data ex))))))))

(deftest ^:parallel header-mismatch-both-missing-and-extra-test
  (testing "ex-data includes both :missing-columns and :extra-columns when applicable"
    (let [csv    "id,wrong_col\n1,alpha\n"
          schema [{:name "id"        :base-type :type/Integer :nullable? false}
                  {:name "right_col" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex))
      (is (= #{"right_col"} (set (:missing-columns (ex-data ex)))))
      (is (= #{"wrong_col"} (set (:extra-columns   (ex-data ex))))))))

(deftest ^:parallel duplicate-header-names-test
  (testing "duplicate CSV header names → typed error naming the duplicates"
    ;; A duplicated name passes a set-based check while its row values misalign
    ;; against the real table columns.
    (let [csv    "id,id\n1,2\n"
          schema [{:name "id" :base-type :type/Integer :nullable? false}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-verification.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= ["id"] (:duplicate-columns (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; Ragged row errors
;; ---------------------------------------------------------------------------

(deftest ^:parallel ragged-row-short-test
  (testing "a data row with fewer cells than the header → typed error with row index"
    (let [csv    "id,count\n1,100\n2\n"
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-verification.errors/ragged-row
             (:error-type (ex-data ex))))
      (is (= 1 (:row-index (ex-data ex))))
      (is (= 2 (:expected-cell-count (ex-data ex))))
      (is (= 1 (:actual-cell-count (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; Unparseable cell errors
;; ---------------------------------------------------------------------------

(deftest ^:parallel unparseable-cell-error-test
  (testing "Unparseable cell → typed error with row-index, column name, raw value"
    (let [csv    "id,count\n1,100\n2,not-a-number\n3,300\n"
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-verification.errors/unparseable-cell
             (:error-type (ex-data ex))))
      (is (= 1 (:row-index (ex-data ex))) "0-based row index (not counting header)")
      (is (= "count" (:column-name (ex-data ex))))
      (is (= "not-a-number" (:raw-value (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; Output shape: feeds insert-from-source!
;; ---------------------------------------------------------------------------

(deftest ^:parallel output-shape-feeds-insert-test
  (testing "Output :columns has :name :base-type :nullable? keys for create-table-from-schema!"
    (let [csv    "id,name\n1,foo\n"
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (doseq [col (:columns result)]
        (is (string? (:name col)))
        (is (keyword? (:base-type col)))
        (is (contains? col :nullable?)))))
  (testing "Output :rows are vectors of plain values (insert-from-source! :rows path)"
    (let [csv    "id,name\n1,foo\n2,bar\n"
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (doseq [row (:rows result)]
        (is (vector? row))))))

;; ---------------------------------------------------------------------------
;; Edge cases
;; ---------------------------------------------------------------------------

(deftest ^:parallel target-schema-required-test
  (testing "parse-fixture rejects an empty target schema with a typed ::empty-target-schema error"
    (let [csv "id\n1\n"]
      (doseq [empty-schema [nil []]]
        (let [e (try (fixtures/parse-fixture csv empty-schema) nil
                     (catch clojure.lang.ExceptionInfo ex ex))]
          (is (= ::errors/empty-target-schema (:error-type (ex-data e)))
              (str "empty-schema " (pr-str empty-schema) " must throw typed error")))))))

(deftest ^:parallel column-order-preserved-test
  (testing "Row values are in the same order as :columns"
    (let [csv    "z,a,m\n3,1,2\n"
          schema [{:name "z" :base-type :type/Integer :nullable? true}
                  {:name "a" :base-type :type/Integer :nullable? true}
                  {:name "m" :base-type :type/Integer :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= [(biginteger 3) (biginteger 1) (biginteger 2)]
             (first (:rows result)))))))

;; ---------------------------------------------------------------------------
;; ignore-columns: ignored cells parse as raw text, never type-checked
;; ---------------------------------------------------------------------------

(deftest ^:parallel ignore-columns-skip-type-parsing-test
  ;; The `ts` cell carries an offset (`Z`) that the :type/DateTime parser rejects —
  ;; the exact shape that breaks on drivers whose NOW() column is tz-less (e.g.
  ;; ClickHouse). Ignoring the column must skip that parse entirely.
  (let [csv    "user_id,order_count,ts\n1,2,1970-01-01T00:00:00Z\n"
        schema [{:name "user_id"     :base-type :type/Integer  :nullable? false}
                {:name "order_count" :base-type :type/Integer  :nullable? true}
                {:name "ts"          :base-type :type/DateTime :nullable? true}]]
    (testing "without ignoring ts, the offset-bearing value fails its :type/DateTime parser"
      (is (thrown? clojure.lang.ExceptionInfo
                   (fixtures/parse-fixture csv schema))
          "control: the placeholder is genuinely unparseable as :type/DateTime"))
    (testing "ignoring ts parses its cell as raw text, so parsing succeeds"
      (let [result (fixtures/parse-fixture csv schema #{"ts"})]
        (is (= 1 (count (:rows result))))
        (let [[user-id order-count ts] (first (:rows result))]
          (is (= (biginteger 1) user-id) "non-ignored columns keep their real type")
          (is (= (biginteger 2) order-count))
          (is (= "1970-01-01T00:00:00Z" ts)
              "ignored column is the raw, unparsed string"))))))
