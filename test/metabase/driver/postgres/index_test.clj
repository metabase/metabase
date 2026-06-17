(ns ^:mb/driver-tests metabase.driver.postgres.index-test
  "Tests for the Postgres standalone index driver methods (Index Manager, milestone 0):
  `supported-index-methods`, `compile-create-index`, and `refresh-table-stats!`.

  The rendering and execution tests are driven by case tables (`render-cases` / `execute-cases`) so that
  covering a new index kind is a one-line addition rather than another copy-pasted assertion block."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.test :as mt]))

(deftest ^:parallel supports-standalone-create-test
  (testing "Postgres reports support for standalone index creation"
    (is (true? (driver/database-supports? :postgres :index/standalone-create nil)))))

(deftest ^:parallel supported-index-methods-test
  (testing "Postgres advertises single-column btree (which supports unique) as a standalone index method"
    (is (= {:btree {:lifecycle :standalone, :unique true}}
           (driver/supported-index-methods :postgres nil)))))

(deftest default-impls-test
  (testing "a driver without :index/standalone-create inherits safe defaults"
    (is (false? (driver/database-supports? :h2 :index/standalone-create nil)))
    (is (= {} (driver/supported-index-methods :h2 nil)))
    (is (nil? (driver/refresh-table-stats! :h2 nil "public" "t" :table))))
  (testing "fetch-table-indexes has no safe default: a driver that can't introspect indexes throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"fetch-table-indexes is not implemented for driver :h2"
                          (driver/fetch-table-indexes :h2 nil "public" "t")))))

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
    :expected   "CREATE INDEX IF NOT EXISTS \"weird idx\" ON \"events\" (\"a\"\"b\")"}])

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
    :expected   {:access-method "btree", :unique? true}}])

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

;;; ----------------------------------------- fetch-table-indexes ------------------------------------------

(def ^:private fetch-cases
  "Each case is one index: `:ddl` (a `format` template taking the qualified table name) and the `:expected` normalized
  map, sans `:definition`. Add a row to cover a new access method or column shape. The shared table is:

    (id INT PRIMARY KEY, user_id INT, email TEXT, a INT, b INT, data JSONB, created_at TIMESTAMP)"
  [{:label    "single-column btree"
    :ddl      "CREATE INDEX fc_btree ON %s (user_id)"
    :expected {:name "fc_btree" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["user_id"] :include_columns [] :partial_predicate nil}}
   {:label    "unique btree"
    :ddl      "CREATE UNIQUE INDEX fc_unique ON %s (email)"
    :expected {:name "fc_unique" :kind :btree :access_method "btree" :is_unique true :is_primary false :is_valid true
               :key_columns ["email"] :include_columns [] :partial_predicate nil}}
   {:label    "composite btree preserves key column order"
    :ddl      "CREATE INDEX fc_ab ON %s (a, b)"
    :expected {:name "fc_ab" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["a" "b"] :include_columns [] :partial_predicate nil}}
   {:label    "the reverse composite is a distinct index with the reverse order"
    :ddl      "CREATE INDEX fc_ba ON %s (b, a)"
    :expected {:name "fc_ba" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["b" "a"] :include_columns [] :partial_predicate nil}}
   {:label    "covering index splits key columns from INCLUDE columns"
    :ddl      "CREATE INDEX fc_include ON %s (a) INCLUDE (b, email)"
    :expected {:name "fc_include" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["a"] :include_columns ["b" "email"] :partial_predicate nil}}
   {:label    "DESC ordering still reports the bare column name"
    :ddl      "CREATE INDEX fc_desc ON %s (created_at DESC)"
    :expected {:name "fc_desc" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["created_at"] :include_columns [] :partial_predicate nil}}
   {:label    "partial index carries its normalized predicate"
    :ddl      "CREATE INDEX fc_partial ON %s (user_id) WHERE user_id IS NOT NULL"
    :expected {:name "fc_partial" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns ["user_id"] :include_columns [] :partial_predicate "(user_id IS NOT NULL)"}}
   {:label    "gin index over jsonb reports its access method"
    :ddl      "CREATE INDEX fc_gin ON %s USING gin (data)"
    :expected {:name "fc_gin" :kind :gin :access_method "gin" :is_unique false :is_primary false :is_valid true
               :key_columns ["data"] :include_columns [] :partial_predicate nil}}
   {:label    "brin index reports its access method"
    :ddl      "CREATE INDEX fc_brin ON %s USING brin (created_at)"
    :expected {:name "fc_brin" :kind :brin :access_method "brin" :is_unique false :is_primary false :is_valid true
               :key_columns ["created_at"] :include_columns [] :partial_predicate nil}}
   {:label    "hash index reports its access method"
    :ddl      "CREATE INDEX fc_hash ON %s USING hash (email)"
    :expected {:name "fc_hash" :kind :hash :access_method "hash" :is_unique false :is_primary false :is_valid true
               :key_columns ["email"] :include_columns [] :partial_predicate nil}}
   {:label    "expression index has no plain key column (raw-form territory): the expression slot reports as nil"
    :ddl      "CREATE INDEX fc_expr ON %s (lower(email))"
    :expected {:name "fc_expr" :kind :btree :access_method "btree" :is_unique false :is_primary false :is_valid true
               :key_columns [nil] :include_columns [] :partial_predicate nil}}])

(deftest fetch-table-indexes-test
  (mt/test-driver :postgres
    (mt/with-empty-db
      (let [admin-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
            conn-spec  (driver/connection-spec :postgres (mt/db))
            schema     "public"
            table      "fetch_target"
            qtable     (str (sql.u/quote-name :postgres :schema schema) "."
                            (sql.u/quote-name :postgres :table table))
            by-name    #(into {} (map (juxt :name identity)) (driver/fetch-table-indexes :postgres (mt/db) schema %))]
        (jdbc/execute! admin-spec [(format "DROP TABLE IF EXISTS %s" qtable)])
        (jdbc/execute! admin-spec [(format (str "CREATE TABLE %s (id INT PRIMARY KEY, user_id INT, email TEXT, "
                                                "a INT, b INT, data JSONB, created_at TIMESTAMP)")
                                           qtable)])
        (try
          ;; one "managed" index via Metabase's own standalone-create path; the rest are hand-created below to stand
          ;; in for DBA indexes.
          (driver/execute-raw-queries! :postgres conn-spec
                                       (driver/compile-create-index
                                        :postgres schema table
                                        {:kind :btree :name "mb_managed_user_id"
                                         :columns [{:name "user_id"}] :if-not-exists true}))
          (doseq [{:keys [ddl]} fetch-cases]
            (jdbc/execute! admin-spec [(format ddl qtable)]))
          (let [indexes (by-name table)]
            (testing "every fetched index normalizes to the shared response shape"
              (doseq [{:keys [label expected]} fetch-cases]
                (testing label
                  (is (= expected (dissoc (get indexes (:name expected)) :definition))))))
            (testing "managed and unmanaged indexes are both returned, keyed by the name callers join on"
              (testing "the Metabase-managed index (created via compile-create-index) is present"
                (is (= {:name "mb_managed_user_id" :kind :btree :access_method "btree"
                        :is_unique false :is_primary false :is_valid true
                        :key_columns ["user_id"] :include_columns [] :partial_predicate nil}
                       (dissoc (get indexes "mb_managed_user_id") :definition))))
              (testing "a hand-created (unmanaged) index sits alongside it"
                (is (contains? indexes "fc_unique"))))
            (testing "the primary-key index reports :is_primary and :is_unique"
              (let [pk (first (filter :is_primary (vals indexes)))]
                (is (some? pk) "a primary-key index is present")
                (is (true? (:is_unique pk)))
                (is (true? (:is_valid pk)))
                (is (= ["id"] (:key_columns pk)))))
            (testing "each index carries the catalog's own DDL verbatim as :definition"
              (is (str/starts-with? (:definition (get indexes "mb_managed_user_id"))
                                    "CREATE INDEX mb_managed_user_id"))
              (is (str/starts-with? (:definition (get indexes "fc_gin")) "CREATE INDEX fc_gin")))
            (testing "the full index count matches what we created (cases + managed + the PK)"
              (is (= (+ (count fetch-cases) 2) (count indexes)))))
          (testing "a table with no indexes returns an empty vector, not nil"
            (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"public\".\"fetch_empty\""])
            (jdbc/execute! admin-spec ["CREATE TABLE \"public\".\"fetch_empty\" (a INT, b INT)"])
            (is (= [] (driver/fetch-table-indexes :postgres (mt/db) schema "fetch_empty")))
            (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"public\".\"fetch_empty\""]))
          (testing "a table that does not exist returns an empty vector, not an error"
            (is (= [] (driver/fetch-table-indexes :postgres (mt/db) schema "does_not_exist"))))
          (finally
            (jdbc/execute! admin-spec [(format "DROP TABLE IF EXISTS %s" qtable)])))))))

(deftest fetch-table-indexes-schema-scoping-test
  (testing "fetch-table-indexes is scoped to one schema, and a blank schema falls back to current_schema()"
    (mt/test-driver :postgres
      (mt/with-empty-db
        (let [admin-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
              names      #(set (map :name (driver/fetch-table-indexes :postgres (mt/db) %1 %2)))]
          (try
            ;; same table name in two schemas, each with a distinctly-named index
            (jdbc/execute! admin-spec ["CREATE SCHEMA IF NOT EXISTS fetch_other"])
            (jdbc/execute! admin-spec ["CREATE TABLE \"public\".\"scoped\" (id INT)"])
            (jdbc/execute! admin-spec ["CREATE TABLE \"fetch_other\".\"scoped\" (id INT)"])
            (jdbc/execute! admin-spec ["CREATE INDEX scoped_public_idx ON \"public\".\"scoped\" (id)"])
            (jdbc/execute! admin-spec ["CREATE INDEX scoped_other_idx ON \"fetch_other\".\"scoped\" (id)"])
            (testing "an explicit schema returns only that schema's index"
              (is (= #{"scoped_public_idx"} (names "public" "scoped")))
              (is (= #{"scoped_other_idx"} (names "fetch_other" "scoped"))))
            (testing "a nil schema resolves through current_schema() (public on the test connection)"
              (is (= #{"scoped_public_idx"} (names nil "scoped"))))
            (finally
              (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"public\".\"scoped\""])
              (jdbc/execute! admin-spec ["DROP TABLE IF EXISTS \"fetch_other\".\"scoped\""])
              (jdbc/execute! admin-spec ["DROP SCHEMA IF EXISTS fetch_other CASCADE"]))))))))
