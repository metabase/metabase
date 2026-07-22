(ns ^:mb/driver-tests metabase.driver.redshift.index-test
  "Tests for the Redshift inline index driver methods (Index Manager, milestone 0): `supported-index-methods` and the
  sortkey rendering at both creation seams, the CTAS in `compile-transform` (SQL transforms) and the CREATE TABLE in
  `create-table!` (Python transforms).

  The rendering/capability checks are pure and need no connection. `sortkey-inlined-live-test` runs both seams against
  a real Redshift and reads the sortkey back out of the system catalog, so an inlined `SORTKEY` clause is verified to
  actually take effect on the physical table (not just to render)."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.redshift :as redshift]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.redshift :as redshift.tx]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel feature-flags-test
  (testing "Redshift inlines indexes into the table-creation statement and does not create them afterwards"
    (is (true? (driver/database-supports? :redshift :index/inline-create nil)))
    (is (false? (driver/database-supports? :redshift :index/standalone-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "Redshift advertises inline sortkey + distkey with their form fields"
    (let [methods       (driver/supported-index-methods :redshift nil)
          style-options (fn [kind]
                          (->> (get-in methods [kind :fields])
                               (filter #(= "style" (:name %)))
                               first :options (map :value) set))]
      (is (mr/validate :metabase.driver/supported-index-methods methods))
      (is (= {:sortkey :inline :distkey :inline} (update-vals methods :lifecycle)))
      (is (= ["columns" "style"] (map :name (get-in methods [:sortkey :fields]))))
      (is (= ["style" "columns"] (map :name (get-in methods [:distkey :fields]))))
      (is (= #{"compound" "interleaved"} (style-options :sortkey)))
      (is (= #{"key" "all" "even"} (style-options :distkey))))))

;;; ------------------------------------------ DDL rendering ------------------------------------------

;; A sortkey is inlined at table creation, and a transform target is created two ways: the CTAS for SQL transforms
;; (`compile-transform`) and the `CREATE TABLE` for Python transforms (`create-table!`). Each case below drives BOTH
;; seams with the same index, so the same `SORTKEY` clause must appear at both (and the no-sortkey case must add
;; nothing to either: the CTAS delegates to the base, the CREATE TABLE stays upload-safe).
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
   {:label        "no sortkey -> no inline clause at either seam"
    :table        :events
    :indexes      []
    :ctas         "CREATE TABLE \"events\" AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER)"}
   {:label        "key distribution renders DISTSTYLE KEY DISTKEY"
    :table        :events
    :indexes      [{:kind :distkey :style :key :columns [{:name "a"}]}]
    :ctas         "CREATE TABLE \"events\" DISTSTYLE KEY DISTKEY (\"a\") AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) DISTSTYLE KEY DISTKEY (\"a\")"}
   {:label        "all distribution renders DISTSTYLE ALL, no column"
    :table        :events
    :indexes      [{:kind :distkey :style :all}]
    :ctas         "CREATE TABLE \"events\" DISTSTYLE ALL AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) DISTSTYLE ALL"}
   {:label        "even distribution renders DISTSTYLE EVEN, no column"
    :table        :events
    :indexes      [{:kind :distkey :style :even}]
    :ctas         "CREATE TABLE \"events\" DISTSTYLE EVEN AS SELECT 1"
    :create-table "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) DISTSTYLE EVEN"}
   {:label        "distkey + sortkey render in Redshift's required order (distribution then sort)"
    :table        :events
    :indexes      [{:kind :distkey :style :key :columns [{:name "a"}]}
                   {:kind :sortkey :columns [{:name "b"}]}]
    :ctas         "CREATE TABLE \"events\" DISTSTYLE KEY DISTKEY (\"a\") COMPOUND SORTKEY (\"b\") AS SELECT 1"
    :create-table (str "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) "
                       "DISTSTYLE KEY DISTKEY (\"a\") COMPOUND SORTKEY (\"b\")")}
   {:label        "a SQL-injection payload in a sortkey column is quoted+escaped at both seams"
    :table        :events
    :indexes      [{:kind :sortkey :columns [{:name "a\"; DROP TABLE x; --"}]}]
    :ctas         "CREATE TABLE \"events\" COMPOUND SORTKEY (\"a\"\"; DROP TABLE x; --\") AS SELECT 1"
    :create-table (str "CREATE TABLE \"events\" (\"a\" INTEGER, \"b\" INTEGER) "
                       "COMPOUND SORTKEY (\"a\"\"; DROP TABLE x; --\")")}])

(deftest ^:parallel sortkey-inlined-at-both-creation-seams-test
  (doseq [{:keys [label table indexes ctas create-table]} inline-cases]
    (testing label
      (testing "CTAS seam (compile-transform, SQL transforms)"
        (is (= [ctas nil]
               (driver/compile-transform :redshift {:output-table table
                                                    :query        {:query "SELECT 1"}
                                                    :indexes      indexes}))))
      (testing "CREATE TABLE seam (create-table!, Python transforms)"
        (is (= create-table
               (#'redshift/create-table-sql :redshift table inline-columns {:indexes indexes})))))))

;;; --------------------------------------- Live execute path ----------------------------------------

(defn- sortkey-info
  "Read the sortkey of `schema`.`table` back out of the Redshift catalog as `{:columns [...] :style ...}`, or nil when
  the table has no sortkey. `svv_redshift_columns.sortkey` encodes both facts in one column: a positive value is the
  column's 1-based position in a COMPOUND key; an INTERLEAVED key alternates the sign, so any negative value marks the
  whole key interleaved while `abs` still gives the position."
  [spec schema table]
  (let [rows (jdbc/query spec
                         [(str "SELECT column_name, sortkey FROM svv_redshift_columns "
                               "WHERE schema_name = ? AND table_name = ? AND sortkey <> 0 "
                               "ORDER BY abs(sortkey)")
                          schema table])]
    (when (seq rows)
      {:columns (mapv :column_name rows)
       :style   (if (some (comp neg? :sortkey) rows) :interleaved :compound)})))

(def ^:private live-cases
  "Each case drives one sortkey through both live seams and asserts the `sortkey-info` the physical table reports.
  Add a row to exercise a new style or column shape end-to-end against a real Redshift."
  [{:label    "compound single-column sortkey"
    :indexes  [{:kind :sortkey :columns [{:name "a"}]}]
    :expected {:columns ["a"] :style :compound}}
   {:label    "interleaved multi-column sortkey"
    :indexes  [{:kind :sortkey :style :interleaved :columns [{:name "a"} {:name "b"}]}]
    :expected {:columns ["a" "b"] :style :interleaved}}])

(deftest sortkey-inlined-live-test
  (testing "an inlined SORTKEY clause actually takes effect on the physical table at both creation seams"
    (mt/test-driver :redshift
      (let [db-details (tx/dbdef->connection-details :redshift nil nil)]
        (mt/with-temp [:model/Database database {:engine :redshift, :details db-details}]
          (let [schema (redshift.tx/unique-session-schema)
                spec   (sql-jdbc.conn/db->pooled-connection-spec database)]
            (doseq [{:keys [label indexes expected]} live-cases]
              (testing label
                ;; unique per-case table names so the two seams (and parallel runs) don't collide in the shared schema
                (let [ctas-table   (tx/db-qualified-table-name (:name database) "sk_ctas")
                      create-table (tx/db-qualified-table-name (:name database) "sk_create")
                      drop!        (fn [t] (jdbc/execute! spec [(format "DROP TABLE IF EXISTS \"%s\".\"%s\"" schema t)]))]
                  (testing "CTAS seam (compile-transform): run the rendered CTAS, read the sortkey back"
                    (drop! ctas-table)
                    (try
                      (let [[sql params] (driver/compile-transform
                                          :redshift
                                          {:output-table (keyword schema ctas-table)
                                           :query        {:query "SELECT 1 AS a, 2 AS b"}
                                           :indexes      indexes})]
                        (jdbc/execute! spec (into [sql] params))
                        (is (= expected (sortkey-info spec schema ctas-table))))
                      (finally (drop! ctas-table))))
                  (testing "CREATE TABLE seam (create-table!): create the table, read the sortkey back"
                    (drop! create-table)
                    (try
                      (driver/create-table! :redshift (u/the-id database) (keyword schema create-table)
                                            inline-columns {:indexes indexes})
                      (is (= expected (sortkey-info spec schema create-table)))
                      (finally (drop! create-table)))))))))))))
