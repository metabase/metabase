(ns ^:mb/driver-tests metabase.driver.postgres.index-test
  "Tests for the Postgres standalone index driver methods (Index Manager, milestone 0):
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

(deftest ^:parallel supports-standalone-create-test
  (testing "Postgres reports support for standalone index creation"
    (is (true? (driver/database-supports? :postgres :index/standalone-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "Postgres advertises btree (with unique) plus the gin/gist/brin access methods, all standalone"
    (let [methods (driver/supported-index-methods :postgres nil)]
      (is (= #{:btree :gin :gist :brin} (set (keys methods))))
      (is (= {:btree :standalone :gin :standalone :gist :standalone :brin :standalone}
             (update-vals methods :lifecycle)))
      (testing "only btree offers the unique toggle"
        (is (= ["name" "unique" "columns"] (map :name (get-in methods [:btree :fields]))))
        (is (= ["name" "columns"] (map :name (get-in methods [:gin :fields]))))))))

(deftest default-impls-test
  (testing "a driver without :index/standalone-create inherits safe defaults"
    (is (false? (driver/database-supports? :h2 :index/standalone-create nil)))
    (is (= {} (driver/supported-index-methods :h2 nil)))
    (is (nil? (driver/refresh-table-stats! :h2 nil "public" "t" :table)))))

;;; ------------------------------------------ DDL rendering ------------------------------------------

(def ^:private render-cases
  "Each case: inputs to `compile-create-index` and the single SQL string it should render. The index's `:name` is
  rendered verbatim as the physical index name. Add a row to cover a new index kind, column shape, or quoting
  wrinkle."
  [{:label      "schema-qualified single-column btree"
    :schema     "public" :table "events"
    :structured {:kind :btree :name "events_user_id" :columns [{:name "user_id"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"events_user_id\" ON \"public\".\"events\" (\"user_id\")"}
   {:label      "no schema qualifier"
    :schema     nil :table "events"
    :structured {:kind :btree :name "events_user_id" :columns [{:name "user_id"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"events_user_id\" ON \"events\" (\"user_id\")"}
   {:label      "without :if-not-exists the create is not idempotent"
    :schema     nil :table "events"
    :structured {:kind :btree :name "events_user_id" :columns [{:name "user_id"}]}
    :expected   "CREATE INDEX \"events_user_id\" ON \"events\" (\"user_id\")"}
   {:label      "renders all columns, not just the first"
    :schema     nil :table "events"
    :structured {:kind :btree :name "multi" :columns [{:name "a"} {:name "b"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"multi\" ON \"events\" (\"a\", \"b\")"}
   {:label      "unique renders CREATE UNIQUE INDEX"
    :schema     nil :table "events"
    :structured {:kind :btree :name "email" :columns [{:name "email"}] :unique true :if-not-exists true}
    :expected   "CREATE UNIQUE INDEX IF NOT EXISTS \"email\" ON \"events\" (\"email\")"}
   {:label      "identifiers that need quoting still get it"
    :schema     nil :table "events"
    :structured {:kind :btree :name "weird idx" :columns [{:name "a\"b"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"weird idx\" ON \"events\" (\"a\"\"b\")"}
   {:label      "a SQL-injection payload in the name and column is quoted+escaped, so it can only ever be an identifier"
    :schema     nil :table "events"
    :structured {:kind :btree :name "idx\"; DROP TABLE users; --" :columns [{:name "a\"; DROP TABLE x; --"}]}
    :expected   "CREATE INDEX \"idx\"\"; DROP TABLE users; --\" ON \"events\" (\"a\"\"; DROP TABLE x; --\")"}
   {:label      "gin renders USING gin"
    :schema     "public" :table "events"
    :structured {:kind :gin :name "events_data" :columns [{:name "data"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"events_data\" ON \"public\".\"events\" USING gin (\"data\")"}
   {:label      "gist renders USING gist"
    :schema     nil :table "shapes"
    :structured {:kind :gist :name "shapes_geom" :columns [{:name "geom"}]}
    :expected   "CREATE INDEX \"shapes_geom\" ON \"shapes\" USING gist (\"geom\")"}
   {:label      "brin renders USING brin"
    :schema     nil :table "events"
    :structured {:kind :brin :name "events_ts" :columns [{:name "ts"}] :if-not-exists true}
    :expected   "CREATE INDEX IF NOT EXISTS \"events_ts\" ON \"events\" USING brin (\"ts\")"}
   {:label      "unique is btree-only; ignored for the other methods"
    :schema     nil :table "events"
    :structured {:kind :gin :name "g" :columns [{:name "data"}] :unique true}
    :expected   "CREATE INDEX \"g\" ON \"events\" USING gin (\"data\")"}
   {:label      "btree renders per-column ASC/DESC direction"
    :schema     nil :table "events"
    :structured {:kind :btree :name "by_ts" :columns [{:name "a" :direction :desc} {:name "b" :direction :asc}]}
    :expected   "CREATE INDEX \"by_ts\" ON \"events\" (\"a\" DESC, \"b\" ASC)"}
   {:label      "direction is btree-only; dropped for the other methods (gin rejects ASC/DESC)"
    :schema     nil :table "events"
    :structured {:kind :gin :name "g" :columns [{:name "data" :direction :desc}]}
    :expected   "CREATE INDEX \"g\" ON \"events\" USING gin (\"data\")"}])

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
  "Each case: a table to materialize (`columns` is the column DDL), the index to apply, and the `index-info` the
  resulting index must report. Add a row to exercise a new kind end-to-end against a real database (e.g. a gin
  index over a jsonb column)."
  [{:label      "single-column btree"
    :table      "perf_idx_btree"
    :columns    "id INT, user_id INT"
    :structured {:kind :btree :name "btree_user_id" :columns [{:name "user_id"}] :if-not-exists true}
    :expected   {:access-method "btree", :unique? false}}
   {:label      "unique single-column btree"
    :table      "perf_idx_unique"
    :columns    "id INT, email TEXT"
    :structured {:kind :btree :name "unique_email" :columns [{:name "email"}] :unique true :if-not-exists true}
    :expected   {:access-method "btree", :unique? true}}
   {:label      "gin over a jsonb column"
    :table      "perf_idx_gin"
    :columns    "id INT, data JSONB"
    :structured {:kind :gin :name "gin_data" :columns [{:name "data"}] :if-not-exists true}
    :expected   {:access-method "gin", :unique? false}}
   {:label      "brin over a timestamp column"
    :table      "perf_idx_brin"
    :columns    "id INT, ts TIMESTAMP"
    :structured {:kind :brin :name "brin_ts" :columns [{:name "ts"}] :if-not-exists true}
    :expected   {:access-method "brin", :unique? false}}
   {:label      "gist over a point column (built-in point_ops opclass, no extension needed)"
    :table      "perf_idx_gist"
    :columns    "id INT, p POINT"
    :structured {:kind :gist :name "gist_p" :columns [{:name "p"}] :if-not-exists true}
    :expected   {:access-method "gist", :unique? false}}])

(deftest standalone-create-path-test
  (testing "the standalone-create path runs the rendered DDL and then ANALYZE against a real table"
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
                      "index absent before the standalone-create step")
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

(deftest create-index!-shared-render-path-test
  (testing "driver/create-index! executes through the same per-driver rendering as compile-create-index"
    (mt/test-driver :postgres
      (mt/with-empty-db
        (let [admin-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              db-id      (:id (mt/db))]
          (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"public\".\"perf_idx_legacy\""])
          (jdbc/execute! admin-spec ["CREATE TABLE \"public\".\"perf_idx_legacy\" (id INT, user_id INT)"])
          (try
            (driver/create-index! :postgres db-id "public" "perf_idx_legacy" "legacy_user_id" ["user_id"])
            (is (= {:access-method "btree", :unique? false} (index-info admin-spec "legacy_user_id")))
            (testing "without :if-not-exists a duplicate create throws"
              (is (thrown? Exception
                           (driver/create-index! :postgres db-id "public" "perf_idx_legacy"
                                                 "legacy_user_id" ["user_id"]))))
            (testing "with :if-not-exists a duplicate create is a no-op"
              (is (nil? (driver/create-index! :postgres db-id "public" "perf_idx_legacy"
                                              "legacy_user_id" ["user_id"] :if-not-exists true))))
            (finally
              (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"public\".\"perf_idx_legacy\""]))))))))
