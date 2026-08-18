(ns metabase.driver.quack.actions
  "Writeback actions (implicit row CRUD + bulk) for the Quack driver.

  The upstream impl lives in `metabase.driver.sql-jdbc.actions` and funnels
  every statement through a pooled JDBC connection inside a transaction, with
  read-before / write / read-after steps. This driver speaks HTTP to a Quack
  server (no JDBC, one fresh connection per request), so we reimplement the
  six `perform-action!*` dispatch values for `:quack`, executing DML over the
  Quack client.

  Atomicity is provided by `quack.conn/with-db-transaction` (a held Quack connection
  wrapped in `BEGIN`/`COMMIT`); DuckDB's `RETURNING *` clause gives us the
  affected row(s) back in the same atomic step, which the JDBC impl achieves
  via separate SELECTs. Bulk actions (`:table.row/*`) loop the single-row ops
  inside one shared transaction so the whole batch commits atomically.

  Why RETURNING * (and the federation caveat):
  Every statement here is a full HTTP round trip to the Quack server, so we
  use `INSERT/UPDATE/DELETE ... RETURNING *` to collapse read-before / DML /
  read-after into the fewest statements (the JDBC driver, with a pooled
  connection and cheap local statements, instead does explicit SELECTs around
  the DML — see `row-create!*`/`row-update!*`/`row-delete!*` there).
  RETURNING * is an *optimization*, not a correctness requirement: the action
  contract (`:before`/`:after`) can always be satisfied with the JDBC-style
  SELECT-before / DML / SELECT-after pattern instead.

  ⚠ FEDERATION INCOMPATIBILITY — DuckDB's storage scanners do not uniformly
  support `RETURNING` on DML against *attached* (federated) tables:
    - postgres: https://github.com/duckdb/duckdb-postgres/issues/175
  (and analogous limitations have been reported for the other scanners).
  Against a federated table the `RETURNING` clause may be rejected even when
  the underlying DML would succeed, so writeback actions on models backed by
  an attached catalog may fail here today. If/when this surfaces in practice,
  the fix is to fall back from `exec-returning` to the JDBC-style explicit
  SELECTs (SELECT-before for `:before`, then the bare DML, then a SELECT-after
  for `:after`). That path works on federated tables because it issues only
  plain SELECT/DML, which the scanners do support. See `exec-returning` and
  docs/FEDERATION-FINDINGS.md §8."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.quack.client :as quack.client]
   [metabase.driver.quack.conn :as quack.conn]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [get-in mapv some select-keys]]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; base-type → DuckDB SQL type (used by cast-values for typed inserts/updates)
;;; ---------------------------------------------------------------------------

(defmethod sql-jdbc.actions/base-type->sql-type-map :quack
  [_driver]
  {:type/Integer              "INTEGER"
   :type/BigInteger           "BIGINT"
   :type/Boolean              "BOOLEAN"
   :type/Text                 "VARCHAR"
   :type/Float                "DOUBLE"
   :type/Decimal              "DECIMAL"
   :type/Date                 "DATE"
   :type/DateTime             "TIMESTAMP"
   :type/DateTimeWithTZ       "TIMESTAMPTZ"
   :type/Time                 "TIME"
   :type/UUID                 "UUID"})

;;; ---------------------------------------------------------------------------
;;; Helpers
;;; ---------------------------------------------------------------------------

(defn- table-fields
  "Realize the legacy field metadata for `table-id` from the current metadata
  provider (set up by the action caller). Returns a seq of field maps with at
  least :name, :base-type, :semantic-type."
  [database table-id]
  (driver-api/with-metadata-provider (:id database)
    (driver-api/active-fields (driver-api/metadata-provider) table-id)))

(defn- pk-fields
  "The subset of `fields` whose semantic type isa? :type/PK (the entity key(s))."
  [fields]
  (filter #(isa? (:semantic-type %) :type/PK) fields))

(defn- assert-single-pk!
  "Require that `fields` has exactly one PK field, else throw a 400 data-editing
  error. Returns `fields` on success so it threads into a `let` cleanly."
  [table-id fields]
  (let [pks (pk-fields fields)]
    (when (not= 1 (count pks))
      (throw (ex-info (tru "Cannot edit a table without exactly one entity key configured.")
                      {:type :data-editing/no-pk :status-code 400 :table-id table-id}))))
  fields)

(defn- table-id->database
  "Resolve the Database (lib metadata) for a table id."
  [table-id]
  (driver-api/cached-database-via-table-id table-id))

(defn- quote-name
  "ANSI-quote a single DuckDB identifier (double quotes, embedded quotes doubled)."
  [s]
  (format "\"%s\"" (str/replace (name s) "\"" "\"\"")))

(defn- qualify-table-identifier
  "Build a DuckDB table reference from a (possibly :schema/name) keyword,
  splitting compound `catalog.schema` exactly like quack/qualified-table-name."
  [table-kw]
  (let [schema (namespace table-kw)
        nm     (name table-kw)]
    (cond
      (and schema (str/includes? schema "."))
      (let [[cat sch] (str/split schema #"\.")]
        (str/join "." (map quote-name [cat sch nm])))
      schema (str (quote-name schema) "." (quote-name nm))
      :else  (quote-name nm))))

(defn- honeysql-table-name
  "The MBQL source-table is an integer id; resolve it to the table's
  schema/name keyword (the same shape transforms use)."
  [database table-id]
  (let [table (driver-api/with-metadata-provider (:id database)
                (some #(when (= (:id %) table-id) %)
                      (driver-api/tables (driver-api/metadata-provider))))]
    (if-let [s (:schema table)]
      (keyword s (:name table))
      (keyword (:name table)))))

(defn- mbql-query->raw-hsql
  "Compile a legacy MBQL row-action query to its honeysql form, the same way the
  JDBC actions do (preprocess + mbql->honeysql)."
  [driver {database-id :database :as query}]
  (driver-api/with-metadata-provider database-id
    (sql.qp/mbql->honeysql driver (driver-api/preprocess query))))

(defn- inline-value
  "Render a Clojure value as a SQL literal for inlining into generated DML
  (the Quack protocol has no parameter channel). Delegates to honey.sql inline
  formatting by formatting a single-value honeysql form."
  [driver v]
  (cond
    (nil? v) "NULL"
    (number? v) (str v)
    (boolean? v) (if v "TRUE" "FALSE")
    (string? v) (str "'" (str/replace v "'" "''") "'")
    :else
    (second (sql.qp/format-honeysql driver {:select [[[:inline v]]]}))))

(defn- set-clause
  "Build a `col = literal` fragment for an UPDATE, inlining the value."
  [driver col val]
  (str (quote-name col) " = " (inline-value driver val)))

(defn- where-clause
  "Format the honeysql `:where` from mbql->honeysql into a SQL string fragment."
  [driver hsql]
  (let [full (first (sql.qp/format-honeysql driver hsql))]
    ;; the formatted SQL is `WHERE <pred> ...` — strip the leading keyword if present
    (str/replace-first full #"^\s*WHERE\s+" "")))

(defn- realize-row
  "Given a result {:cols :rows} from exec-on-connection, return the single row
  as a {col-name value} map, or nil if no rows."
  [{:keys [cols rows]}]
  (when-let [row (first rows)]
    (zipmap (map :name cols) row)))

(defn- exec-returning
  "Run DML `sql` (with a trailing ` RETURNING *`) on a held connection and return
  the realized rows + cols. `cs`/`conn-id` come from quack.conn/with-db-transaction.

  RETURNING * is an optimization that collapses DML + read-after into one
  statement (one HTTP round trip instead of two). It is NOT supported on all
  attached/federated tables — see the namespace docstring's FEDERATION
  INCOMPATIBILITY note and docs/FEDERATION-FINDINGS.md §8. The action contract
  (`:before`/`:after`) can be satisfied without it via explicit SELECTs (the
  pattern upstream `sql-jdbc.actions` uses); fall back to that if RETURNING is
  ever rejected by a scanner."
  [cs conn-id sql]
  (let [sql (str sql " RETURNING *")]
    (quack.client/exec-on-connection cs conn-id sql)))

;;; ---------------------------------------------------------------------------
;;; :model.row/* — single-row CRUD on a model's underlying table
;;; ---------------------------------------------------------------------------

(defn- do-row-create!
  [_action database {:keys [create-row] :as query}]
  (let [driver   (:engine database)
        table-id (get-in query [:query :source-table])
        _        (assert-single-pk! table-id (table-fields database table-id))
        {from :from} (mbql-query->raw-hsql driver query)
        table    (or (some #(when (or (keyword? %) (map? %)) %) from)
                     (honeysql-table-name database table-id))
        cols     (keys create-row)
        target   (qualify-table-identifier table)
        col-list (str/join ", " (map (comp quote-name name) cols))
        val-list (str/join ", " (map #(inline-value driver (get create-row %)) cols))
        sql      (if (seq cols)
                   (format "INSERT INTO %s (%s) VALUES (%s)" target col-list val-list)
                   (format "INSERT INTO %s DEFAULT VALUES" target))]
    (log/tracef "quack row-create: %s" sql)
    ;; Run INSERT ... RETURNING * inside a held transaction so the read-back
    ;;        of the created row is atomic with the insert.
    (let [after (quack.conn/with-db-transaction
                  database
                  (fn [cs conn-id] (realize-row (exec-returning cs conn-id sql))))]
      {:table-id table-id
       :db-id    (:id database)
       :before   nil
       :after    after})))

(defn- do-row-update!
  [_action database {:keys [update-row] :as query}]
  (let [driver       (:engine database)
        table-id     (get-in query [:query :source-table])
        _            (assert-single-pk! table-id (table-fields database table-id))
        {:keys [from where]} (mbql-query->raw-hsql driver query)
        table        (or (some #(when (or (keyword? %) (map? %)) %) from)
                         (honeysql-table-name database table-id))
        target       (qualify-table-identifier table)
        where-sql    (where-clause driver {:where where})
        set-sql      (str/join ", " (map #(set-clause driver % (get update-row %)) (keys update-row)))]
    (when (str/blank? set-sql)
      (throw (ex-info (tru "Update row has no columns to set.") {:status-code 400})))
    (log/tracef "quack row-update: UPDATE %s SET %s WHERE %s" target set-sql where-sql)
    (quack.conn/with-db-transaction
      database
      (fn [cs conn-id]
        (let [before (realize-row
                      (quack.client/exec-on-connection
                       cs conn-id
                       (format "SELECT * FROM %s WHERE %s" target where-sql)))
              _ (when-not before
                  (throw (ex-info (tru "Sorry, the row you''re trying to update doesn''t exist")
                                  {:status-code 400})))
              affected (exec-returning
                        cs conn-id
                        (format "UPDATE %s SET %s WHERE %s" target set-sql where-sql))
              after (first (:rows affected))]
          {:table-id table-id
           :db-id    (:id database)
           :before   before
           :after    (when after (zipmap (map :name (:cols affected)) after))})))))

(defn- do-row-delete!
  [_action database query]
  (let [driver   (:engine database)
        table-id (get-in query [:query :source-table])
        _        (assert-single-pk! table-id (table-fields database table-id))
        {:keys [from where]} (mbql-query->raw-hsql driver query)
        table    (or (some #(when (or (keyword? %) (map? %)) %) from)
                     (honeysql-table-name database table-id))
        target   (qualify-table-identifier table)
        where-sql (where-clause driver {:where where})]
    (log/tracef "quack row-delete: DELETE FROM %s WHERE %s" target where-sql)
    (let [result (quack.conn/with-db-transaction
                   database
                   (fn [cs conn-id]
                     (exec-returning cs conn-id
                                     (format "DELETE FROM %s WHERE %s" target where-sql))))
          rows (:rows result)
          n    (count rows)]
      (when (zero? n)
        (throw (ex-info (tru "Sorry, the row you''re trying to delete doesn''t exist")
                        {:status-code 400})))
      (when (> n 1)
        (throw (ex-info (tru "Sorry, this would delete {0} rows, but you can only act on 1" n)
                        {:status-code 400})))
      {:table-id table-id
       :db-id    (:id database)
       :before   (when-let [r (first rows)] (zipmap (map :name (:cols result)) r))
       :after    nil})))

(defn- inputs->db
  "All inputs share one database (validated); return it."
  [inputs]
  (let [db-ids (into #{} (map :database) inputs)]
    (when-not (= 1 (count db-ids))
      (throw (ex-info (tru "Cannot operate on multiple databases, it would not be atomic.")
                      {:status-code 400 :database-ids db-ids})))
    (driver-api/cached-database (first db-ids))))

(defn- record-mutations
  "Append `diffs` to `context`'s :effects as :effect/row.modified entries, so the
  action framework records what each row action changed."
  [context diffs]
  (update context :effects (fnil into []) (map #(vector :effect/row.modified %) diffs)))

(methodical/defmethod driver-api/perform-action!* [:quack :model.row/create]
  [action context inputs]
  (let [database (inputs->db inputs)
        diffs    (mapv #(do-row-create! action database %) inputs)]
    {:context (record-mutations context diffs)
     :outputs (mapv #(array-map :created-row (:after %)) diffs)}))

(methodical/defmethod driver-api/perform-action!* [:quack :model.row/update]
  [action context inputs]
  (let [database (inputs->db inputs)
        diffs    (mapv #(do-row-update! action database %) inputs)]
    {:context (record-mutations context diffs)
     :outputs [{:rows-updated (count diffs)}]}))

(methodical/defmethod driver-api/perform-action!* [:quack :model.row/delete]
  [action context inputs]
  (let [database (inputs->db inputs)
        diffs    (mapv #(do-row-delete! action database %) inputs)]
    {:context (record-mutations context diffs)
     :outputs [{:rows-deleted (count diffs)}]}))

;;; ---------------------------------------------------------------------------
;;; :table.row/* — bulk CRUD keyed by {:table-id :row}
;;; ---------------------------------------------------------------------------

(methodical/defmethod driver-api/perform-action!* [:quack :table.row/create]
  [action context inputs]
  (let [database (inputs->db (map #(assoc {} :database (:id (table-id->database (:table-id %)))) inputs))
        results  (doall
                  (for [[table-id rows] (u/group-by :table-id :row inputs)
                        :let [q {:database (:id database) :type :query
                                 :query {:source-table table-id}}]
                        r rows]
                    (do-row-create! action database (assoc q :create-row r))))]
    (when (some nil? results)
      (throw (ex-info (tru "Error(s) inserting rows.") {:status-code 400})))
    {:context (record-mutations context results)
     :outputs (mapv (fn [{:keys [table-id after]}]
                      {:table-id table-id :op :created :row after})
                    results)}))

(defn- row->mbql-filter-clause
  "Build a `[:and [:= [:field id nil] val]…]` filter from a PK name->id map + row."
  [pk-name->id row]
  (into [:and]
        (for [[col val] row
              :let [fid (get pk-name->id col)]
              :when fid]
          [:= [:field fid nil] val])))

(defn- table-id->pk-name->id
  [table-id]
  (let [database (table-id->database table-id)]
    (into {}
          (comp (filter #(isa? (:semantic-type %) :type/PK))
                (map (juxt :name :id)))
          (driver-api/with-metadata-provider (:id database)
            (driver-api/active-fields (driver-api/metadata-provider) table-id)))))

(methodical/defmethod driver-api/perform-action!* [:quack :table.row/delete]
  [action context inputs]
  (let [database (inputs->db (map #(assoc {} :database (:id (table-id->database (:table-id %)))) inputs))
        results  (doall
                  (for [{:keys [table-id row]} inputs
                        :let [pk-name->id (table-id->pk-name->id table-id)
                              missing-pk (seq (set/difference (set (keys pk-name->id)) (set (keys row))))]
                        :when (nil? missing-pk)
                        :let [q {:database (:id database) :type :query
                                 :query {:source-table table-id
                                         :filter (row->mbql-filter-clause pk-name->id row)}}]]
                    (do-row-delete! action database q)))]
    {:context (record-mutations context results)
     :outputs (mapv (fn [{:keys [table-id before]}]
                      {:table-id table-id :op :deleted
                       :row (select-keys before (set (keys (table-id->pk-name->id table-id))))})
                    results)}))

(methodical/defmethod driver-api/perform-action!* [:quack :table.row/update]
  [action context inputs]
  (let [database (inputs->db (map #(assoc {} :database (:id (table-id->database (:table-id %)))) inputs))
        results  (doall
                  (for [{:keys [table-id row]} inputs
                        :let [pk-name->id (table-id->pk-name->id table-id)
                              pk-names    (set (keys pk-name->id))
                              pk-cols     (select-keys row pk-names)
                              update-row  (apply dissoc row pk-names)]
                        :when (seq update-row)
                        :let [q {:database  (:id database)
                                 :type      :query
                                 :query     {:source-table table-id
                                             :filter       (row->mbql-filter-clause pk-name->id pk-cols)}
                                 :update-row update-row}]]
                    (do-row-update! action database q)))]
    {:context (record-mutations context results)
     :outputs (mapv (fn [{:keys [table-id after]}]
                      {:table-id table-id :op :updated :row after})
                    results)}))
