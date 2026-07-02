(ns metabase-enterprise.transforms-test.fixtures-test
  "Tests for fixture CSV parsing: CSV → typed rows against a target schema.

  These tests are pure/driver-free — no database required."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.transforms-test.fixtures :as fixtures])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Test helpers
;; ---------------------------------------------------------------------------

(defn- write-csv-file!
  "Write `content` string to a temp file. Returns the File. Caller is responsible
  for deletion."
  ^File [^String content]
  (let [f (File/createTempFile "fixtures-test-" ".csv")]
    (.deleteOnExit f)
    (spit f content)
    f))

(defn- write-csv-bom-file!
  "Write `content` with a UTF-8 BOM prefix to a temp file."
  ^File [^String content]
  (let [f (File/createTempFile "fixtures-test-bom-" ".csv")]
    (.deleteOnExit f)
    (with-open [out (java.io.FileOutputStream. f)]
      ;; UTF-8 BOM: EF BB BF
      (.write out (byte-array [0xEF 0xBB 0xBF]))
      (.write out (.getBytes content "UTF-8")))
    f))

;; ---------------------------------------------------------------------------
;; Happy path — typed parsing against a target schema
;; ---------------------------------------------------------------------------

(deftest parse-fixture-with-schema-integer-test
  (testing "Integer column parsed as BigInteger"
    (let [csv  (write-csv-file! "id,count\n1,100\n2,200\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= [{:name "id"    :base-type :type/Integer :nullable? false}
              {:name "count" :base-type :type/Integer :nullable? true}]
             (:columns result)))
      (is (= 2 (count (:rows result))))
      (is (= (biginteger 1) (get-in result [:rows 0 0])))
      (is (= (biginteger 100) (get-in result [:rows 0 1])))
      (is (= (biginteger 2) (get-in result [:rows 1 0]))))))

(deftest parse-fixture-with-schema-float-test
  (testing "Float column parsed as Double"
    (let [csv    (write-csv-file! "price,weight\n3.14,1.5\n2.71,0.5\n")
          schema [{:name "price"  :base-type :type/Float :nullable? true}
                  {:name "weight" :base-type :type/Float :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= (double 3.14) (get-in result [:rows 0 0])))
      (is (= (double 1.5)  (get-in result [:rows 0 1]))))))

(deftest parse-fixture-with-schema-boolean-test
  (testing "Boolean column parsed as Boolean"
    (let [csv    (write-csv-file! "active\ntrue\nfalse\nyes\nno\n")
          schema [{:name "active" :base-type :type/Boolean :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= [true false true false]
             (mapv #(get % 0) (:rows result)))))))

(deftest parse-fixture-with-schema-date-test
  (testing "Date column parsed as LocalDate"
    (let [csv    (write-csv-file! "created_at\n2024-03-15\n2024-01-01\n")
          schema [{:name "created_at" :base-type :type/Date :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (instance? java.time.LocalDate (get-in result [:rows 0 0])))
      (is (= "2024-03-15" (str (get-in result [:rows 0 0])))))))

(deftest parse-fixture-with-schema-datetime-test
  (testing "DateTime column parsed as LocalDateTime"
    (let [csv    (write-csv-file! "ts\n2024-03-15T10:30:00\n2024-01-01T00:00:00\n")
          schema [{:name "ts" :base-type :type/DateTime :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (instance? java.time.LocalDateTime (get-in result [:rows 0 0])))
      (is (= "2024-03-15T10:30" (str (get-in result [:rows 0 0])))))))

(deftest parse-fixture-with-schema-offset-datetime-test
  (testing "DateTimeWithTZ column parsed as OffsetDateTime"
    (let [csv    (write-csv-file! "ts\n2024-03-15T10:30:00Z\n2024-01-01T00:00:00+05:30\n")
          schema [{:name "ts" :base-type :type/DateTimeWithTZ :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (instance? java.time.OffsetDateTime (get-in result [:rows 0 0]))))))

(deftest parse-fixture-with-schema-text-test
  (testing "Text column parsed as String (identity)"
    (let [csv    (write-csv-file! "name\nalpha\nbeta\n")
          schema [{:name "name" :base-type :type/Text :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= "alpha" (get-in result [:rows 0 0])))
      (is (= "beta" (get-in result [:rows 1 0]))))))

(deftest parse-fixture-multi-column-test
  (testing "Multi-column CSV with mixed types"
    (let [csv    (write-csv-file! "id,name,score,active,dt\n1,alpha,9.5,true,2024-03-15\n2,beta,3.2,false,2024-06-01\n")
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
;; NULL vs empty-string rule
;; ---------------------------------------------------------------------------

(deftest null-vs-empty-string-test
  (testing "Blank and whitespace-only cells become nil (SQL NULL), not empty string"
    (let [csv    (write-csv-file! "id,name,score\n1,,9.5\n2,   ,\n3,beta,3.2\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? true}
                  {:name "name"  :base-type :type/Text    :nullable? true}
                  {:name "score" :base-type :type/Float   :nullable? true}]
          result (fixtures/parse-fixture csv schema)
          rows   (:rows result)]
      ;; Row 0: name is empty → nil; score is 9.5
      (is (nil? (get (nth rows 0) 1)) "empty string → nil")
      (is (= (double 9.5) (get (nth rows 0) 2)))
      ;; Row 1: name is whitespace → nil; score is empty → nil
      (is (nil? (get (nth rows 1) 1)) "whitespace-only → nil")
      (is (nil? (get (nth rows 1) 2)) "empty cell → nil")
      ;; Row 2: name is non-blank → preserved
      (is (= "beta" (get (nth rows 2) 1)))))
  (testing "Zero and false are preserved (not nil)"
    (let [csv    (write-csv-file! "count,flag\n0,false\n")
          schema [{:name "count" :base-type :type/Integer :nullable? true}
                  {:name "flag"  :base-type :type/Boolean :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= (biginteger 0) (get-in result [:rows 0 0])))
      (is (= false (get-in result [:rows 0 1]))))))

;; ---------------------------------------------------------------------------
;; Header mismatch errors
;; ---------------------------------------------------------------------------

(deftest header-mismatch-missing-columns-test
  (testing "CSV missing columns that target schema requires → typed error"
    (let [csv    (write-csv-file! "id,name\n1,alpha\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "name"  :base-type :type/Text    :nullable? true}
                  {:name "score" :base-type :type/Float   :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= #{"score"} (set (:missing-columns (ex-data ex))))))))

(deftest header-mismatch-extra-columns-test
  (testing "CSV has extra columns not in target schema → typed error"
    (let [csv    (write-csv-file! "id,name,unexpected_col\n1,alpha,extra\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= #{"unexpected_col"} (set (:extra-columns (ex-data ex))))))))

(deftest header-mismatch-case-sensitive-test
  (testing "Header matching is case-sensitive — 'Name' ≠ 'name'"
    (let [csv    (write-csv-file! "id,Name\n1,alpha\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown — 'Name' ≠ 'name'")
      (is (= :metabase-enterprise.transforms-test.errors/header-mismatch
             (:error-type (ex-data ex))))
      ;; 'Name' is extra; 'name' is missing
      (is (= #{"Name"} (set (:extra-columns  (ex-data ex)))))
      (is (= #{"name"} (set (:missing-columns (ex-data ex))))))))

(deftest header-mismatch-both-missing-and-extra-test
  (testing "ex-data includes both :missing-columns and :extra-columns when applicable"
    (let [csv    (write-csv-file! "id,wrong_col\n1,alpha\n")
          schema [{:name "id"        :base-type :type/Integer :nullable? false}
                  {:name "right_col" :base-type :type/Text    :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex))
      (is (= #{"right_col"} (set (:missing-columns (ex-data ex)))))
      (is (= #{"wrong_col"} (set (:extra-columns   (ex-data ex))))))))

(deftest duplicate-header-names-test
  (testing "duplicate CSV header names → typed error naming the duplicates"
    ;; A duplicated name passes a set-based check while its row values misalign
    ;; against the real table columns.
    (let [csv    (write-csv-file! "id,id\n1,2\n")
          schema [{:name "id" :base-type :type/Integer :nullable? false}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/header-mismatch
             (:error-type (ex-data ex))))
      (is (= ["id"] (:duplicate-columns (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; Ragged row errors
;; ---------------------------------------------------------------------------

(deftest ragged-row-short-test
  (testing "a data row with fewer cells than the header → typed error with row index"
    (let [csv    (write-csv-file! "id,count\n1,100\n2\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/ragged-row
             (:error-type (ex-data ex))))
      (is (= 1 (:row-index (ex-data ex))))
      (is (= 2 (:expected-cell-count (ex-data ex))))
      (is (= 1 (:actual-cell-count (ex-data ex)))))))

(deftest ragged-row-long-test
  (testing "a data row with more cells than the header → typed error with row index"
    (let [csv    (write-csv-file! "id,count\n1,100,999\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/ragged-row
             (:error-type (ex-data ex))))
      (is (= 0 (:row-index (ex-data ex))))
      (is (= 2 (:expected-cell-count (ex-data ex))))
      (is (= 3 (:actual-cell-count (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; Unparseable cell errors
;; ---------------------------------------------------------------------------

(deftest unparseable-cell-error-test
  (testing "Unparseable cell → typed error with row-index, column name, raw value"
    (let [csv    (write-csv-file! "id,count\n1,100\n2,not-a-number\n3,300\n")
          schema [{:name "id"    :base-type :type/Integer :nullable? false}
                  {:name "count" :base-type :type/Integer :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (some? ex) "should have thrown")
      (is (= :metabase-enterprise.transforms-test.errors/unparseable-cell
             (:error-type (ex-data ex))))
      (is (= 1 (:row-index (ex-data ex))) "0-based row index (not counting header)")
      (is (= "count" (:column-name (ex-data ex))))
      (is (= "not-a-number" (:raw-value (ex-data ex)))))))

(deftest unparseable-cell-first-row-test
  (testing "Unparseable cell in first data row → row-index 0"
    (let [csv    (write-csv-file! "score\nnot-a-float\n")
          schema [{:name "score" :base-type :type/Float :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (= 0 (:row-index (ex-data ex))))
      (is (= "score" (:column-name (ex-data ex))))
      (is (= "not-a-float" (:raw-value (ex-data ex)))))))

(deftest unparseable-date-cell-test
  (testing "Unparseable date cell reports column name and raw value"
    (let [csv    (write-csv-file! "created_at\n2024-13-01\n")
          schema [{:name "created_at" :base-type :type/Date :nullable? true}]
          ex     (try (fixtures/parse-fixture csv schema)
                      nil
                      (catch Exception e e))]
      (is (= :metabase-enterprise.transforms-test.errors/unparseable-cell
             (:error-type (ex-data ex))))
      (is (= "created_at" (:column-name (ex-data ex))))
      (is (= "2024-13-01" (:raw-value (ex-data ex)))))))

;; ---------------------------------------------------------------------------
;; BOM / charset handling
;; ---------------------------------------------------------------------------

(deftest bom-stripping-test
  (testing "UTF-8 BOM is stripped from the first column header"
    (let [csv    (write-csv-bom-file! "id,name\n1,alpha\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      ;; Should parse cleanly — BOM stripped, "id" matched correctly
      (is (= 1 (count (:rows result))))
      (is (= (biginteger 1) (get-in result [:rows 0 0]))))))

;; ---------------------------------------------------------------------------
;; Output shape: feeds insert-from-source!
;; ---------------------------------------------------------------------------

(deftest output-shape-feeds-insert-test
  (testing "Output :columns has :name :base-type :nullable? keys for create-table-from-schema!"
    (let [csv    (write-csv-file! "id,name\n1,foo\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (doseq [col (:columns result)]
        (is (string? (:name col)))
        (is (keyword? (:base-type col)))
        (is (contains? col :nullable?)))))
  (testing "Output :rows are vectors of plain values (insert-from-source! :rows path)"
    (let [csv    (write-csv-file! "id,name\n1,foo\n2,bar\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (doseq [row (:rows result)]
        (is (vector? row))))))

;; ---------------------------------------------------------------------------
;; Edge cases
;; ---------------------------------------------------------------------------

(deftest empty-csv-body-test
  (testing "CSV with header but no data rows returns empty :rows"
    (let [csv    (write-csv-file! "id,name\n")
          schema [{:name "id"   :base-type :type/Integer :nullable? false}
                  {:name "name" :base-type :type/Text    :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= [] (:rows result))))))

(deftest target-schema-required-test
  (testing "parse-fixture requires a non-empty target schema"
    (let [csv (write-csv-file! "id\n1\n")]
      (is (thrown? AssertionError (fixtures/parse-fixture csv nil)))
      (is (thrown? AssertionError (fixtures/parse-fixture csv []))))))

(deftest column-order-preserved-test
  (testing "Row values are in the same order as :columns"
    (let [csv    (write-csv-file! "z,a,m\n3,1,2\n")
          schema [{:name "z" :base-type :type/Integer :nullable? true}
                  {:name "a" :base-type :type/Integer :nullable? true}
                  {:name "m" :base-type :type/Integer :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (= [(biginteger 3) (biginteger 1) (biginteger 2)]
             (first (:rows result)))))))

(deftest biginteger-not-double-for-integer-columns-test
  (testing "Integer columns produce BigInteger, not Double"
    (let [csv    (write-csv-file! "n\n42\n")
          schema [{:name "n" :base-type :type/BigInteger :nullable? true}]
          result (fixtures/parse-fixture csv schema)]
      (is (instance? java.math.BigInteger (get-in result [:rows 0 0]))))))
