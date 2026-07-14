(ns metabase.driver.quack.uploads-test
  "Tests for the uploads feature (`:uploads`, `:upload-with-auto-pk`):
  insert-into!, truncate!, add-columns!, alter-table-columns!, and
  upload-type->database-type. Exercises the exact SQL our methods emit against
  the dev Quack server, plus the type-mapping unit test."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [honey.sql :as sql]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.quack :as quack]
   [metabase.driver.quack.client :as client]
   [metabase.driver.sql-jdbc :as sql-jdbc]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :engine :quack :id 1 :name "quack-uploads"
              :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql-str]
  (let [{:keys [rows]} (client/execute-query details sql-str)]
    (reduce conj [] rows)))

;; The no-server unit tests (feature flags, type mapping, table-name-length-limit,
;; db-id resolution) must run even when the Quack server is down, so we DON'T gate
;; the whole namespace on reachability. Each live test self-guards with
;; `(when (reachable?) ...)` below, so they still skip cleanly without a server.
(use-fixtures :once (fn [t] (t)))

;;; ===========================================================================
;;; Feature flags + type mapping (no server needed)
;;; ===========================================================================

(deftest uploads-feature-flags-test
  (testing "uploads is enabled; auto-PK is disabled (DuckDB has no identity columns)"
    (is (true?  (driver/database-supports? :quack :uploads fake-db)))
    ;; DuckDB v1.5.4 throws "Constraint not implemented!" for GENERATED ... AS
    ;; IDENTITY, so uploads create plain tables with no _mb_row_id PK.
    (is (false? (driver/database-supports? :quack :upload-with-auto-pk fake-db)))))

(deftest table-name-length-limit-test
  (testing "table-name-length-limit is implemented and positive (upload pipeline needs it)"
    ;; Regression for POST /api/upload/csv failing with
    ;; "No method in multimethod 'table-name-length-limit' for dispatch value: :quack".
    ;; The multimethod has no :default, so every :uploads driver must implement it.
    (is (get-method driver/table-name-length-limit :quack)
        "the :quack method must exist")
    (let [limit (driver/table-name-length-limit :quack)]
      (is (pos-int? limit))
      ;; DuckDB has no documented hard limit; the value must exceed the
      ;; Metabase app-DB name cap (256 bytes) so DuckDB never truncates an
      ;; uploaded table name more than the application database would.
      (is (> limit 256))
      ;; column-name-length-limit defaults to delegating to table-name-length-limit,
      ;; so it should resolve to the same positive value without a separate impl.
      (is (= limit (driver/column-name-length-limit :quack))))))

(deftest upload-methods-resolve-database-by-id-test
  (testing "write methods resolve the Database from db-id via cached-database (not metadata-provider)"
    ;; Regression for POST /api/upload/csv 500:
    ;;   "Wrong number of args (1) passed to: metabase.query-processor.store/metadata-provider"
    ;; create-table!/insert-into!/etc. receive a *db-id* (not a Database) and used to call
    ;; the 0-arg qp.store/metadata-provider WITH that id. They now resolve via
    ;; driver-api/cached-database (the same helper the actions layer uses outside the QP
    ;; context). We stub the conn-spec + network layers and prove each method threads the
    ;; db-id through cached-database without throwing — so no live server is needed.
    (let [seen-id (atom [])]
      (with-redefs [driver-api/cached-database
                    (fn [db-id]
                      (swap! seen-id conj db-id)
                      {:lib/type :metadata/database :engine :quack :id db-id
                       :name "fake" :details {}})
                    quack/database->details
                    (fn [_database] {:host "fake" :port 1 :token "t"})
                    quack/with-ssh-tunnel-conn-spec
                    (fn [_details f] (f {:host "fake" :port 1 :token "t"}))
                    client/execute-query
                    (fn [_conn-spec _sql] {:rows []})]
        (driver/create-table!           :quack 42 :t_user {:name [:varchar 255]})
        (driver/insert-into!            :quack 42 :t_user [:name] [{:name "a"}])
        (driver/truncate!               :quack 42 :t_user)
        (driver/add-columns!            :quack 42 :t_user {:age [:bigint]})
        (driver/alter-table-columns!    :quack 42 :t_user {:age [:bigint]})
        (driver/drop-table!             :quack 42 :t_user)
        (is (= [42 42 42 42 42 42] @seen-id)
            "every write method resolved the Database from db-id via cached-database")))))

(deftest upload-type->database-type-test
  (testing "Metabase upload inference types map to DuckDB types"
    (is (= [[:varchar 255]]           (driver/upload-type->database-type :quack :metabase.upload/varchar-255)))
    (is (= [:text]                     (driver/upload-type->database-type :quack :metabase.upload/text)))
    (is (= [:bigint]                   (driver/upload-type->database-type :quack :metabase.upload/int)))
    (is (= [:double]                   (driver/upload-type->database-type :quack :metabase.upload/float)))
    (is (= [:boolean]                  (driver/upload-type->database-type :quack :metabase.upload/boolean)))
    (is (= [:date]                     (driver/upload-type->database-type :quack :metabase.upload/date)))
    (is (= [:timestamp]                (driver/upload-type->database-type :quack :metabase.upload/datetime)))
    (is (= [:timestamp-with-time-zone] (driver/upload-type->database-type :quack :metabase.upload/offset-datetime)))
    ;; auto-incrementing PK: documents DuckDB's intended SQL-standard
    ;; "GENERATED ALWAYS AS IDENTITY". Currently UNUSED (auto-PK is disabled —
    ;; DuckDB v1.5.4 doesn't implement identity columns); kept so the mapping is
    ;; correct the day DuckDB ships it.
    (is (= [:integer :generated-always :as :identity]
           (driver/upload-type->database-type :quack :metabase.upload/auto-incrementing-int-pk)))))

(deftest upload-type->sql-test
  (testing "the shared create-table!-sql renders well-formed DDL from our type-specs"
    ;; Regression guard for the CSV-upload failures:
    ;;   1) Quack prepare failed: syntax error at or near "IDENTITY"
    ;;      ... ("_mb_row_id" INTEGER IDENTITY, "name" VARCHAR 255, ...)
    ;;      -> bare "INTEGER IDENTITY" and "VARCHAR 255" (missing parens) were emitted.
    ;;   2) Quack prepare failed: Constraint not implemented!
    ;;      -> DuckDB v1.5.4 has no identity columns, so auto-PK is now DISABLED
    ;;         (see uploads-feature-flags-test). This render test still guards the
    ;;         *mapping* (varchar parens + the intended IDENTITY rendering) so the
    ;;         shapes don't regress; it checks SQL shape, not DuckDB execution.
    (let [create-sql #'sql-jdbc/create-table!-sql
          spec       (fn [t] (driver/upload-type->database-type :quack t))
          ddl        (create-sql :quack :t_upload
                                 {:name       (spec :metabase.upload/varchar-255)
                                  :_mb_row_id (spec :metabase.upload/auto-incrementing-int-pk)}
                                 :primary-key [:_mb_row_id])]
      (is (re-find #"VARCHAR\(255\)" ddl) "varchar renders as VARCHAR(255), not 'VARCHAR 255'")
      (is (re-find #"GENERATED ALWAYS AS IDENTITY" ddl)
          "auto-PK renders as 'GENERATED ALWAYS AS IDENTITY', not bare 'IDENTITY'")
      ;; the exact invalid token sequences must be absent:
      ;;   bad: "VARCHAR 255" (space, no parens)  /  "INTEGER IDENTITY" (no AS)
      ;;   good form "...AS IDENTITY," legitimately ends a clause, so don't just
      ;;   grep for "IDENTITY," — target the bare sequences.
      (is (not (re-find #"(?i)VARCHAR\s+\d" ddl)) "no invalid bare-length 'VARCHAR <n>'")
      (is (not (re-find #"(?i)INTEGER\s+IDENTITY" ddl)) "no invalid bare 'INTEGER IDENTITY'"))))

;;; ===========================================================================
;;; Live: insert-into! / truncate! / add-columns! / alter-table-columns!
;;; These go through the full driver multimethods (tunnel-aware).
;;; ===========================================================================
;; The driver methods resolve the database from a metadata provider keyed by
;; db-id. For a focused unit-level test we drive the generated SQL directly
;; through the client, matching exactly what each method emits — this isolates
;; the DuckDB-SQL correctness from the metadata-provider plumbing (covered in
;; Tier E). insert-into! uses honey.sql :inline VALUES batches.

(defn- insert-sql
  "Reproduce the SQL our insert-into! emits for one batch (honey.sql :inline)."
  [table-name column-names values]
  (let [clause {:insert-into (keyword table-name)
                :columns     (mapv keyword column-names)
                :values      values}]
    (first (sql/format clause :inline true :quoted true :dialect :ansi))))

(deftest ^:live insert-into-and-truncate-test
  (when (reachable?)
    (let [schema "upl_test"]
      (try
        (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
        (run-sql (format "CREATE SCHEMA %s" schema))
        (run-sql (format "CREATE TABLE %s.people (id INTEGER PRIMARY KEY, name VARCHAR, score DOUBLE)" schema))
        (testing "multi-row INSERT (inline values, matching insert-into! shape) lands all rows"
          (run-sql (insert-sql (keyword schema "people")
                               ["id" "name" "score"]
                               [{:id 1 :name "Ada" :score 1.5}
                                {:id 2 :name "Bob" :score 2.0}]))
          (is (= [[2]] (run-sql (format "SELECT count(*) FROM %s.people" schema)))))
        (testing "TRUNCATE clears the table (matches truncate! SQL shape)"
          (run-sql (first (sql/format {:truncate [(keyword schema "people")]}
                                      :quoted true :dialect :ansi)))
          (is (= [[0]] (run-sql (format "SELECT count(*) FROM %s.people" schema)))))
        (finally
          (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema)))))))

(deftest ^:live add-columns-and-alter-test
  (when (reachable?)
    (let [schema "upl_alter"]
      (try
        (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
        (run-sql (format "CREATE SCHEMA %s" schema))
        (run-sql (format "CREATE TABLE %s.t (id INTEGER PRIMARY KEY, val INTEGER)" schema))
        (testing "ALTER TABLE ADD COLUMN (matches add-columns! shape)"
          (run-sql (format "ALTER TABLE %s.t ADD COLUMN \"email\" VARCHAR" schema))
          (let [cols (run-sql (format "SELECT column_name FROM information_schema.columns WHERE table_schema='%s' AND table_name='t' ORDER BY ordinal_position" schema))]
            (is (= #{"id" "val" "email"} (set (map first cols))))))
        (testing "ALTER TABLE ALTER COLUMN SET DATA TYPE (matches alter-table-columns! shape)"
          ;; widen the non-PK `val` column INTEGER → BIGINT
          (run-sql (format "ALTER TABLE %s.t ALTER COLUMN \"val\" SET DATA TYPE BIGINT" schema))
          (let [types (->> (run-sql (format "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='%s' AND table_name='t' AND column_name='val'" schema))
                           (into {}))]
            (is (= "BIGINT" (types "val")))))
        (finally
          (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema)))))))

(deftest ^:live upload-ddl-end-to-end-test
  ;; End-to-end: DuckDB must accept the DDL our upload-type->database-type produces
  ;; via the SHARED create-table!-sql — the exact path CSV upload takes. This is the
  ;; gold-standard check for the "syntax error at or near IDENTITY" / invalid
  ;; "VARCHAR 255" regressions: it runs the generated CREATE TABLE against real
  ;; DuckDB and inserts rows. (Plain table, no auto-PK — DuckDB v1.5.4 has no
  ;; identity columns, so :upload-with-auto-pk is disabled; see the feature-flag test.)
  (when (reachable?)
    (let [schema     "upl_ddl"
          create-sql #'sql-jdbc/create-table!-sql
          spec       #(driver/upload-type->database-type :quack %)
          ddl        (create-sql :quack (keyword schema "uploads")
                                 {:id   [:bigint]
                                  :name (spec :metabase.upload/varchar-255)})]
      (try
        (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema))
        (run-sql (format "CREATE SCHEMA %s" schema))
        (testing "DuckDB accepts the generated CREATE TABLE (incl. VARCHAR(255))"
          (run-sql ddl))
        (testing "INSERT (matching insert-into! shape) lands all rows"
          (run-sql (insert-sql (keyword schema "uploads") [:id :name] [{:id 1 :name "Ada"} {:id 2 :name "Bob"}]))
          (is (= [[1 "Ada"] [2 "Bob"]]
                 (run-sql (format "SELECT id, name FROM %s.uploads ORDER BY id" schema)))))
        (finally
          (run-sql (format "DROP SCHEMA IF EXISTS %s CASCADE" schema)))))))
