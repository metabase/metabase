(ns metabase.upload.parse-csv-test
  "Contract tests for [[metabase.upload.core/parse-csv]] — schema-directed CSV
  parsing. Driver-free: everything runs against in-memory strings or temp files."
  (:require
   [clojure.test :refer :all]
   [metabase.upload.core :as upload])
  (:import
   (java.io File FileOutputStream)
   (java.nio.charset StandardCharsets)
   (java.time LocalDate LocalDateTime OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn- cols->header-fn
  "A header->columns fn for a schema already in CSV column order."
  [cols]
  (constantly cols))

(deftest ^:parallel parse-csv-typed-cells-test
  (testing "each base-type parses to its contract value type; blank cells → nil"
    (let [csv  (str "id,price,active,day,ts,ts_tz,name\n"
                    "1,3.5,true,2024-01-02,2024-01-02T03:04:05,2024-01-02T03:04:05Z,widget\n"
                    "2,,false,,,,\n")
          cols [{:name "id"     :base-type :type/Integer}
                {:name "price"  :base-type :type/Float}
                {:name "active" :base-type :type/Boolean}
                {:name "day"    :base-type :type/Date}
                {:name "ts"     :base-type :type/DateTime}
                {:name "ts_tz"  :base-type :type/DateTimeWithTZ}
                {:name "name"   :base-type :type/Text}]
          {:keys [columns rows]} (upload/parse-csv csv (cols->header-fn cols))]
      (is (= cols columns))
      (let [[r1 r2] rows]
        (is (instance? BigInteger (nth r1 0)))
        (is (= 1 (int (nth r1 0))))
        (is (double? (nth r1 1)))
        (is (true? (nth r1 2)))
        (is (instance? LocalDate (nth r1 3)))
        (is (instance? LocalDateTime (nth r1 4)))
        (is (instance? OffsetDateTime (nth r1 5)))
        (is (= "widget" (nth r1 6)))
        (is (= [nil false nil nil nil nil]
               (subvec r2 1))
            "blank cells parse to nil for every column type, text included"))))
  (testing "whitespace-only cells → nil"
    (let [{:keys [rows]} (upload/parse-csv "n\n   \n"
                                           (cols->header-fn [{:name "n" :base-type :type/Integer}]))]
      (is (= [[nil]] rows))))
  (testing "the boolean parser accepts yes/no"
    (let [{:keys [rows]} (upload/parse-csv "b\ntrue\nfalse\nyes\nno\n"
                                           (cols->header-fn [{:name "b" :base-type :type/Boolean}]))]
      (is (= [[true] [false] [true] [false]] rows))))
  (testing "zero and false are values, not blanks — never nil"
    (let [{:keys [rows]} (upload/parse-csv "count,flag\n0,false\n"
                                           (cols->header-fn [{:name "count" :base-type :type/Integer}
                                                             {:name "flag"  :base-type :type/Boolean}]))]
      (is (= [[(biginteger 0) false]] rows))))
  (testing ":type/BigInteger parses to BigInteger"
    (let [{:keys [rows]} (upload/parse-csv "n\n42\n"
                                           (cols->header-fn [{:name "n" :base-type :type/BigInteger}]))]
      (is (instance? BigInteger (ffirst rows))))))

(deftest ^:parallel parse-csv-file-source-bom-test
  (testing "File source: UTF-8 BOM is stripped before the header is read"
    (let [f (File/createTempFile "parse-csv-test-" ".csv")]
      (try
        (with-open [out (FileOutputStream. f)]
          (.write out (byte-array [0xEF 0xBB 0xBF]))
          (.write out (.getBytes "id,name\n1,Alice\n" StandardCharsets/UTF_8)))
        (let [header* (atom nil)
              {:keys [rows]} (upload/parse-csv f (fn [header]
                                                   (reset! header* header)
                                                   [{:name "id" :base-type :type/Integer}
                                                    {:name "name" :base-type :type/Text}]))]
          (is (= ["id" "name"] @header*) "no BOM prefix on the first header name")
          (is (= [[(biginteger 1) "Alice"]] rows)))
        (finally
          (.delete f))))))

(deftest ^:parallel parse-csv-header-fn-contract-test
  (testing "header->columns receives the raw header row"
    (let [header* (atom nil)]
      (upload/parse-csv "a,b\n1,2\n" (fn [header]
                                       (reset! header* header)
                                       [{:name "a" :base-type :type/Integer}
                                        {:name "b" :base-type :type/Integer}]))
      (is (= ["a" "b"] @header*))))
  (testing "empty source → header is nil"
    (let [header* (atom ::unset)
          {:keys [rows]} (upload/parse-csv "" (fn [header]
                                                (reset! header* header)
                                                []))]
      (is (nil? @header*))
      (is (= [] rows))))
  (testing "header-only source → empty :rows"
    (let [{:keys [rows]} (upload/parse-csv "a,b\n"
                                           (cols->header-fn [{:name "a" :base-type :type/Integer}
                                                             {:name "b" :base-type :type/Text}]))]
      (is (= [] rows))))
  (testing "a throw from header->columns propagates unchanged, before any parsing"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (upload/parse-csv "a\nnot-an-int\n"
                                           (fn [_] (throw (ex-info "rejected" {:type ::my-marker}))))))]
      (is (= ::my-marker (:type (ex-data e))))))
  (testing "extra descriptor keys pass through to :columns untouched"
    (let [cols [{:name "a" :base-type :type/Integer :nullable? false :anything 42}]]
      (is (= cols (:columns (upload/parse-csv "a\n1\n" (cols->header-fn cols))))))))

(deftest ^:parallel parse-csv-ragged-row-test
  (testing "a short row fails closed"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (upload/parse-csv "a,b\n1\n"
                                           (cols->header-fn [{:name "a" :base-type :type/Integer}
                                                             {:name "b" :base-type :type/Integer}]))))]
      (is (= {:type                :metabase.upload/ragged-row
              :row-index           0
              :expected-cell-count 2
              :actual-cell-count   1}
             (ex-data e)))))
  (testing "a long row fails closed, with the 0-based data-row index"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (upload/parse-csv "a\n1\n2,3\n"
                                           (cols->header-fn [{:name "a" :base-type :type/Integer}]))))]
      (is (= {:type                :metabase.upload/ragged-row
              :row-index           1
              :expected-cell-count 1
              :actual-cell-count   2}
             (ex-data e))))))

(deftest ^:parallel parse-csv-unparseable-cell-test
  (testing "a cell its parser rejects fails closed with position, column, and cause"
    (let [e (is (thrown? clojure.lang.ExceptionInfo
                         (upload/parse-csv "n,s\n1,x\nabc,y\n"
                                           (cols->header-fn [{:name "n" :base-type :type/Integer}
                                                             {:name "s" :base-type :type/Text}]))))]
      (is (= {:type        :metabase.upload/unparseable-cell
              :row-index   1
              :column-name "n"
              :raw-value   "abc"}
             (ex-data e)))
      (is (some? (ex-cause e))))))

(deftest ^:parallel parse-csv-base-type-fallback-test
  (testing "a base type with no upload mapping parses as text"
    (let [{:keys [rows]} (upload/parse-csv "j\n{\"k\": 1}\n"
                                           (cols->header-fn [{:name "j" :base-type :type/JSON}]))]
      (is (= [["{\"k\": 1}"]] rows))))
  (testing "a nil base type parses as text"
    (let [{:keys [rows]} (upload/parse-csv "x\nhello\n"
                                           (cols->header-fn [{:name "x" :base-type nil}]))]
      (is (= [["hello"]] rows)))))
