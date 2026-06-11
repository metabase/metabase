(ns ^:mb/driver-tests metabase.driver.redshift.index-test
  "Tests for the Redshift inline index driver methods (Index Manager, milestone 0): `supported-index-methods` and the
  sortkey rendering at both creation seams, the CTAS in `compile-transform` (SQL transforms) and the CREATE TABLE in
  `create-table!` (Python transforms). These are pure rendering/capability checks and need no connection."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.redshift :as redshift]))

(deftest ^:parallel feature-flags-test
  (testing "Redshift inlines hints into the CTAS and does not create them post-hoc"
    (is (true? (driver/database-supports? :redshift :index/inline-on-ctas nil)))
    (is (false? (driver/database-supports? :redshift :index/post-ctas-create nil)))))

;; A sortkey is inlined at table creation, and a transform target is created two ways: the CTAS for SQL transforms
;; (`compile-transform`) and the `CREATE TABLE` for Python transforms (`create-table!`). Each case below drives BOTH
;; seams with the same hint, so the same `SORTKEY` clause must appear at both (and the no-hint case must add nothing
;; to either: the CTAS delegates to the base, the CREATE TABLE stays upload-safe).
(def ^:private inline-columns
  [["a" "INTEGER"] ["b" "INTEGER"]])

(def ^:private inline-cases
  [{:label        "compound sortkey (style omitted), single column"
    :table        :events
    :indexes      [{:kind :sortkey :columns [{:name "a"}]}]
    :ctas         "CREATE TABLE \"events\" COMPOUND SORTKEY (\"a\") AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) COMPOUND SORTKEY (\"a\")"}
   {:label        "interleaved sortkey, multiple columns"
    :table        :events
    :indexes      [{:kind :sortkey :style :interleaved :columns [{:name "a"} {:name "b"}]}]
    :ctas         "CREATE TABLE \"events\" INTERLEAVED SORTKEY (\"a\", \"b\") AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) INTERLEAVED SORTKEY (\"a\", \"b\")"}
   {:label        "schema-qualified target"
    :table        :public/events
    :indexes      [{:kind :sortkey :columns [{:name "a"}]}]
    :ctas         "CREATE TABLE \"public\".\"events\" COMPOUND SORTKEY (\"a\") AS SELECT 1"
    :create-table "CREATE TABLE \"public\".\"events\" (\"a\" INTEGER, \"b\" INTEGER) COMPOUND SORTKEY (\"a\")"}
   {:label        "no sortkey hint -> no inline clause at either seam"
    :table        :events
    :indexes      []
    :ctas         "CREATE TABLE \"events\" AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER)"}])

(deftest ^:parallel sortkey-inlined-at-both-creation-seams-test
  (doseq [{:keys [label table indexes ctas create-table]} inline-cases]
    (testing label
      (testing "CTAS seam (compile-transform, SQL transforms)"
        (is (= [ctas ["p"]]
               (driver/compile-transform :redshift {:output-table table
                                                    :query        {:query "SELECT 1" :params ["p"]}
                                                    :indexes      indexes}))))
      (testing "CREATE TABLE seam (create-table!, Python transforms)"
        (is (= create-table
               (#'redshift/create-table-sql :redshift table inline-columns {:indexes indexes})))))))
