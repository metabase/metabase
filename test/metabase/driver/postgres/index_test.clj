(ns ^:mb/driver-tests metabase.driver.postgres.index-test
  "Tests for the Postgres post-CTAS index driver methods (Index Manager, milestone 0):
  `supported-index-methods`, `compile-create-index`, and `refresh-table-stats!`.

  The rendering and execution tests are driven by case tables (`render-cases` / `execute-cases`) so that
  covering a new index kind is a one-line addition rather than another copy-pasted assertion block."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test :as mt]))

(deftest ^:parallel supports-post-ctas-create-test
  (testing "Postgres reports support for post-CTAS hints"
    (is (true? (driver/database-supports? :postgres :index/post-ctas-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "Postgres advertises single-column btree (which supports unique) as a post-CTAS hint method"
    (is (= {:btree {:lifecycle :post-ctas, :unique? true}}
           (driver/supported-index-methods :postgres nil)))))

(deftest default-impls-test
  (testing "a driver without :index/post-ctas-create inherits safe defaults"
    (is (false? (driver/database-supports? :h2 :index/post-ctas-create nil)))
    (is (= {} (driver/supported-index-methods :h2 nil)))
    (is (nil? (driver/refresh-table-stats! :h2 nil "public" "t" :table)))))

;;; ------------------------------------------ DDL rendering ------------------------------------------

(def ^:private render-cases
  "Each case: inputs to `compile-create-index` and the single SQL string it should render. Add a row to cover a
  new index kind, column shape, or quoting wrinkle."
  [{:label      "schema-qualified single-column btree"
    :schema     "public" :table "events"
    :structured {:kind :btree :name "idx_events_user_id" :columns [{:name "user_id"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"idx_events_user_id\" ON \"public\".\"events\" USING BTREE (\"user_id\")"}
   {:label      "no schema qualifier"
    :schema     nil :table "events"
    :structured {:kind :btree :name "idx_events_user_id" :columns [{:name "user_id"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"idx_events_user_id\" ON \"events\" USING BTREE (\"user_id\")"}
   {:label      "renders all columns, not just the first"
    :schema     nil :table "events"
    :structured {:kind :btree :name "idx_multi" :columns [{:name "a"} {:name "b"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"idx_multi\" ON \"events\" USING BTREE (\"a\", \"b\")"}
   {:label      "access method comes from :kind, so other index types render too"
    :schema     nil :table "events"
    :structured {:kind :gin :name "idx_gin" :columns [{:name "tags"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"idx_gin\" ON \"events\" USING GIN (\"tags\")"}
   {:label      "unique renders CREATE UNIQUE INDEX"
    :schema     nil :table "events"
    :structured {:kind :btree :name "idx_email" :columns [{:name "email"}] :unique true}
    :expected   "CREATE UNIQUE INDEX IF NOT EXISTS \"idx_email\" ON \"events\" USING BTREE (\"email\")"}
   {:label      "quotes identifiers that need it, including embedded double-quotes"
    :schema     nil :table "events"
    :structured {:kind :btree :name "weird idx" :columns [{:name "a\"b"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"weird idx\" ON \"events\" USING BTREE (\"a\"\"b\")"}
   ;; KNOWN LIMITATION: honey.sql treats `.` as a schema/table qualifier, so a dotted identifier is split. Pinned so
   ;; the behavior is visible and a future change (API-layer validation, or a different renderer) trips this test.
   {:label      "known limitation: a dotted column name is split into qualified parts"
    :schema     nil :table "events"
    :structured {:kind :btree :name "idx" :columns [{:name "weird.col"}]}
    :expected   "CREATE INDEX IF NOT EXISTS \"idx\" ON \"events\" USING BTREE (\"weird\".\"col\")"}])

(deftest ^:parallel compile-create-index-test
  (doseq [{:keys [label schema table structured expected]} render-cases]
    (testing label
      (is (= [[expected]] (driver/compile-create-index :postgres schema table structured))))))

;;; --------------------------------------- Live execute path ----------------------------------------

(defn- index-info
  "Access method and uniqueness of the index named `index-name` as `{:access-method ..., :unique? ...}`, or nil if it
  doesn't exist. Doubles as an existence check."
  [conn index-name]
  (when-let [row (first (jdbc/query conn
                                    [(str "SELECT am.amname AS access_method, i.indisunique AS is_unique "
                                          "FROM pg_class c "
                                          "JOIN pg_index i ON i.indexrelid = c.oid "
                                          "JOIN pg_am am ON am.oid = c.relam "
                                          "WHERE c.relkind = 'i' AND c.relname = ?")
                                     index-name]))]
    {:access-method (:access_method row), :unique? (:is_unique row)}))

(def ^:private execute-cases
  "Each case: a table to materialize (`columns` is the column DDL), the hint to apply, and the `index-info` the
  resulting index must report. Add a row to exercise a new kind end-to-end against a real database (e.g. a gin
  index over a jsonb column)."
  [{:label      "single-column btree"
    :table      "perf_hints_btree"
    :columns    "id INT, user_id INT"
    :structured {:kind :btree :name "idx_exec_btree_user_id" :columns [{:name "user_id"}]}
    :expected   {:access-method "btree", :unique? false}}
   {:label      "unique single-column btree"
    :table      "perf_hints_unique"
    :columns    "id INT, email TEXT"
    :structured {:kind :btree :name "idx_exec_unique_email" :columns [{:name "email"}] :unique true}
    :expected   {:access-method "btree", :unique? true}}])

(deftest post-materialization-path-test
  (testing "the post-CTAS path runs the rendered DDL and then ANALYZE against a real table"
    (mt/test-driver :postgres
      (mt/with-empty-db
        (let [admin-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              conn-spec  (driver/connection-spec :postgres (mt/db))
              schema     "public"]
          (doseq [{:keys [label table columns structured expected]} execute-cases]
            (testing label
              (let [index-name (:name structured)
                    qtable     (str (sql.u/quote-name :postgres :schema schema) "."
                                    (sql.u/quote-name :postgres :table table))]
                (jdbc/execute! admin-spec [(format "DROP TABLE IF EXISTS %s" qtable)])
                (jdbc/execute! admin-spec [(format "CREATE TABLE %s (%s)" qtable columns)])
                (try
                  (is (nil? (index-info admin-spec index-name))
                      "index absent before the post-materialization step")
                  (testing "rendered DDL creates the index with the expected access method and uniqueness"
                    (driver/execute-raw-queries! :postgres conn-spec
                                                 (driver/compile-create-index :postgres schema table structured))
                    (is (= expected (index-info admin-spec index-name))))
                  (testing "re-running is idempotent (IF NOT EXISTS)"
                    (driver/execute-raw-queries! :postgres conn-spec
                                                 (driver/compile-create-index :postgres schema table structured))
                    (is (= expected (index-info admin-spec index-name))))
                  (testing "refresh-table-stats! runs ANALYZE without error"
                    (is (some? (driver/refresh-table-stats! :postgres (mt/db) schema table :table))))
                  (finally
                    (jdbc/execute! admin-spec [(format "DROP TABLE IF EXISTS %s" qtable)])))))))))))
