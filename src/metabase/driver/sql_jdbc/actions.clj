(ns metabase.driver.sql-jdbc.actions
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.actions :as actions]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.util :as driver.u]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.store :as qp.store]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.i18n :refer [tru trs]]
            [toucan.db :as db])
  (:import java.sql.Connection))

(defmulti parse-sql-error
  "Parses the raw error message returned after an error in the driver database occurs, and converts it into a sequence
  of maps with a :column and :message key indicating what went wrong."
  {:arglists '([driver ^java.sql.Connection connection e]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- parse-error
  "Returns errors in a way that indicates which column had the problem. Can be used to highlight errors in forms."
  [driver conn e]
  (let [default-method? (= (get-method parse-sql-error driver)
                           (get-method parse-sql-error :default))]
    (if default-method?
      (ex-data e)
      (let [message (ex-message e)]
        (if-let [errors (and message
                             (parse-sql-error driver conn message))]

          {:errors (->> errors
                        (m/index-by :column)
                        (m/map-vals :message))}
          {:message (or message (pr-str e))})))))

(defn- catch-throw [e status-code & [more-info]]
  (throw
   (ex-info (ex-message e)
            (merge {:exception-data (ex-data e)
                    :status-code status-code}
                   more-info)
            e)))

(defmulti base-type->sql-type-map
  "Return a map of [[metabase.types]] type to SQL string type name. Used for casting. Looks like we're just copypasting
  this from implementations of [[metabase.test.data.sql/field-base-type->sql-type]] so go find that stuff if you need
  to write more implementations for this."
  {:arglists '([driver]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- cast-values
  "Certain value types need to have their honeysql form updated to work properly during update/creation. This function
  uses honeysql casting to wrap values in the map that need to be cast with their column's type, and passes through
  types that do not need casting like integer or string."
  [driver column->value table-id]
  (let [type->sql-type (base-type->sql-type-map driver)
        column->field  (m/index-by (comp keyword #(str/replace % "_" "-") :name)
                                   (:fields (first (table/with-fields (db/select Table :id table-id)))))]
    (m/map-kv-vals (fn [col value]
                     (let [{base-type :base_type :as field} (get column->field col)]
                       (if-let [sql-type (type->sql-type base-type)]
                         (hx/cast sql-type value)
                         (try
                           (sql.qp/->honeysql driver [:value value field])
                           (catch Exception e
                             (throw (ex-info (str "column cast failed: " col)
                                             {:column      col
                                              :original-ex (ex-message e)
                                              :status-code 400})))))))
                   column->value)))

(def ^:private ^:dynamic ^Connection *connection*
  "Data warehouse JDBC Connection to use for doing CRUD Actions. Bind this to reuse the same Connection/transaction
  throughout a single bulk Action."
  nil)

;;; Why not just use [[jdbc/with-db-transaction]] to do this stuff? Why reinvent the wheel?
;;;
;;; There are a few reasons:
;;;
;;; 1. [[jdbc/with-db-transaction]] "absorbs" nested transactions, but this only works if you take the transaction
;;;    connection spec bound there and pass it around explicitly to subsequent calls to [[jdbc/with-db-transaction]].
;;;    This makes it hard to write bulk Actions as loops with repeated calls to single-row Actions. Of course, we could
;;;    just tweak the Actions so there was some way you could pass in an existing Connection or Connection spec for it
;;;    to use. But that would be a little more ugly and complicated than having a dynamic var. So we'd likely end up
;;;    with some sort of dynamic var and `with-` macro anyway to avoid repeated boilerplate. And it would likely make
;;;    [[do-nested-transaction]] harder to use or implement.
;;;
;;; 2. [[jdbc/with-db-transaction]] does a lot of magic that we don't necessarily want. Writing raw JDBC code is barely
;;;    any more cde and lets us have complete control over what happens and lets us see at a glance exactly what's
;;;    happening without having to keep [[clojure.java.jdbc]] magic in mind or work around it.
(defn- do-with-jdbc-transaction [database-id f]
  (if *connection*
    (f *connection*)
    (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec database-id)]
      (with-open [conn (jdbc/get-connection jdbc-spec)]
        ;; execute inside of a transaction.
        (.setAutoCommit conn false)
        (log/tracef "BEGIN transaction on conn %s@0x%s" (.getCanonicalName (class conn)) (System/identityHashCode conn))
        ;; use the strictest transaction isolation level possible to avoid dirty, non-repeatable, and phantom reads
        (sql-jdbc.execute/set-best-transaction-level! (driver.u/database->driver database-id) conn)
        (try
          (let [result (binding [*connection* conn]
                         (f conn))]
            (log/debug "f completed successfully; committing transaction.")
            (log/tracef "COMMIT transaction on conn %s@0x%s" (.getCanonicalName (class conn)) (System/identityHashCode conn))
            (.commit conn)
            result)
          (catch Throwable e
            (log/debugf "f threw Exception; rolling back transaction. Error: %s" (ex-message e))
            (log/tracef "ROLLBACK transaction on conn %s@0x%s" (.getCanonicalName (class conn)) (System/identityHashCode conn))
            (.rollback conn)
            (throw e)))))))

(defmacro ^:private with-jdbc-transaction
  "Execute `f` with a JDBC Connection for the Database with `database-id`. Uses [[*connection*]] if already bound,
  otherwise fetches a new Connection from the Database's Connection pool and executes `f` inside of a transaction."
  {:style/indent 1}
  [[connection-binding database-id] & body]
  `(do-with-jdbc-transaction ~database-id (fn [~(vary-meta connection-binding assoc :tag 'Connection)] ~@body)))

(defmethod actions/perform-action!* [:sql-jdbc :row/delete]
  [driver _action _database {database-id :database, :as query}]
  (let [raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        delete-hsql (-> raw-hsql
                        (dissoc :select)
                        (assoc :delete []))
        sql-args    (sql.qp/format-honeysql driver delete-hsql)]
    (with-jdbc-transaction [conn database-id]
      (try
        ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
        (let [rows-deleted (first (jdbc/execute! {:connection conn} sql-args {:transaction? false}))]
          (when-not (= rows-deleted 1)
            (throw (ex-info (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted)
                            {::incorrect-number-deleted true
                             :number-deleted            rows-deleted
                             :query                     query
                             :sql                       (sql.qp/format-honeysql driver delete-hsql)
                             :status-code               400})))
          {:rows-deleted [1]})
        (catch Exception e
          (let [e-data (if (::incorrect-number-deleted (ex-data e))
                         (ex-data e)
                         (parse-error driver conn e))]
            (throw
             (ex-info (or (ex-message e) "Delete action error.")
                      (assoc e-data :status-code 400)))))))))

(defmethod actions/perform-action!* [:sql-jdbc :row/update]
  [driver _action _database {database-id :database :keys [update-row] :as query}]
  (let [raw-hsql     (qp.store/with-store
                       (try
                         (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                         (sql.qp/mbql->honeysql driver query)
                         (catch Exception e
                           (catch-throw e 404))))
        target-table (first (:from raw-hsql))
        update-hsql  (-> raw-hsql
                         (select-keys [:where])
                         (assoc :update target-table
                                :set (cast-values driver update-row (get-in query [:query :source-table]))))
        sql-args     (sql.qp/format-honeysql driver update-hsql)]
    (with-jdbc-transaction [conn database-id]
      (try
        ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
        (let [rows-updated (first (jdbc/execute! {:connection conn} sql-args {:transaction? false}))]
          (when-not (= rows-updated 1)
            (throw (ex-info (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated)
                            {::incorrect-number-updated true
                             :number-updated            rows-updated
                             :query                     query
                             :sql                       (sql.qp/format-honeysql driver update-hsql)
                             :status-code               400})))
          {:rows-updated [1]})
        (catch Exception e
          (let [e-data (if (::incorrect-number-updated (ex-data e))
                         (ex-data e)
                         (parse-error driver conn e))]
            (throw
             (ex-info (or (ex-message e) "Update action error.")
                      (assoc e-data :status-code 400)))))))))

(defn- select-created-row
  "H2 and MySQL are dumb and `RETURN_GENERATED_KEYS` only returns the ID of the newly created row. This function will
  `SELECT` the newly created row."
  [driver raw-hsql conn result]
  (let [select-hsql     (assoc raw-hsql
                               :select [:*]
                               ;; :and with a single clause will be optimized in HoneySQL
                               :where (into [:and]
                                            (for [[col val] result]
                                              [:= (keyword col) val])))
        select-sql-args (sql.qp/format-honeysql driver select-hsql)]
    (log/tracef ":row/create SELECT HoneySQL:\n\n%s" (u/pprint-to-str select-hsql))
    (log/tracef ":row/create SELECT SQL + args:\n\n%s" (u/pprint-to-str select-sql-args))
    (first (jdbc/query {:connection conn} select-sql-args {:identifiers identity, :transaction? false}))))

(defmethod actions/perform-action!* [:sql-jdbc :row/create]
  [driver _action _database {database-id :database :keys [create-row] :as query}]
  (let [raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        create-hsql (-> raw-hsql
                        (assoc :insert-into (first (:from raw-hsql)))
                        (assoc :values [(cast-values driver create-row (get-in query [:query :source-table]))])
                        (dissoc :select :from))
        ;; postgres is happy with "returning *", but mysql and h2 aren't so just use select *.
        ;;
        ;; TODO -- driver-specific code doesn't belong here, it belongs in something like
        ;; [[metabase.driver.postgres.actions]]
        create-hsql (cond-> create-hsql
                      (= driver :postgres) (assoc :returning [:*]))
        sql-args    (sql.qp/format-honeysql driver create-hsql)]
    (log/tracef ":row/create HoneySQL:\n\n%s" (u/pprint-to-str create-hsql))
    (log/tracef ":row/create SQL + args:\n\n%s" (u/pprint-to-str sql-args))
    (with-jdbc-transaction [conn database-id]
      (try
        (let [result (jdbc/execute! {:connection conn} sql-args {:return-keys true, :identifiers identity, :transaction? false})
              _      (log/tracef ":row/create INSERT returned\n\n%s" (u/pprint-to-str result))
              row    (if (= driver :postgres)
                       result
                       (select-created-row driver raw-hsql conn result))]
          (log/tracef ":row/create returned row %s" (pr-str row))
          {:created-row row})
        (catch Exception e
          (catch-throw e 400 {:query      query
                              :driver     driver
                              :raw-hsql   raw-hsql
                              :create-sql create-hsql
                              :sql-args   sql-args}))))))

(defmulti do-nested-transaction
  "Execute `thunk` inside a nested transaction inside `connection`, which is currently in a transaction. If `thunk`
  throws an Exception, the nested transaction should be rolled back, but the parent transaction should be able to
  proceed.

  Why do we need this?

  With things like bulk insert, we want to collect all the errors for all the rows in one go. Say you have 4 rows, 1 2
  3 and 4. If 1 errors then depending on the DBMS, the transaction enters an error state that disallows doing anything
  else. 2, 3, and 4 will error with a \"transaction has been aborted\" error that you can't clear (AFAIK). This
  affects Postgres but not H2. Not sure about other DBs yet.

  Without using nested transactions, if you have errors in rows 2 and 4 you'd only see the error in row 2 since 3 and
  4 would fail with \"transaction has been aborted\" or whatever.

  So the point of using nested transactions is that if 2 is done inside a nested transaction we can rollback the
  nested transaction which allows the top-level transaction to proceed even tho part of it errored."
  {:arglists '([driver ^java.sql.Connection connection thunk]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod actions/perform-action!* [:sql-jdbc :bulk/create]
  [driver _action {database-id :id, :as database} {:keys [table-id rows]}]
  (log/tracef "Inserting %d rows" (count rows))
  (with-jdbc-transaction [conn database-id]
    (transduce
     (map-indexed (fn [i row] [i row]))
     (fn
       ([]
        [[] []])
       ([[errors created-rows]]
        ;; if there were any errors throw an Exception with all the error messages.
        (when (seq errors)
          (.rollback conn)
          (throw (ex-info (tru "Error(s) inserting rows.")
                          {:status-code 400, :errors errors})))
        ;; if there we no errors then return the created rows.
        {:created-rows created-rows})
       ([[errors created-rows] [row-index row]]
        (try
          (let [result (do-nested-transaction
                        driver
                        conn
                        (fn []
                          (actions/perform-action!*
                           driver
                           :row/create
                           database
                           {:database   database-id
                            :type       :query
                            :query      {:source-table table-id}
                            :create-row row})))]
            [errors (conj created-rows (:created-row result))])
          (catch Throwable e
            [(conj errors {:index row-index, :error (ex-message e)})
             created-rows]))))
     rows)))

(defn- pk-values->filters [table-id pk-values]
  ;; check that all pk-values have the same shape
  (when-not (apply = (map (comp set keys) pk-values))
    (throw (ex-info (trs "Inconsistent row selection.")
                    {:status-code 400, :pk-values pk-values})))
  (let [given-pks (set (keys (first pk-values)))
        table-pks (into {} (map (juxt :name :id) (filter #(= (:semantic_type %) :type/PK) (:fields (first (table/with-fields [(Table table-id)]))))))]
    (when-not (= given-pks (set (keys table-pks)))
      (throw (ex-info (trs "Must select with all PKs.")
                      {:status-code 400, :given-pks (sort given-pks) :table-pks (sort (keys table-pks))})))
    (map
      (fn [pk-value]
        (into [:and]
              (mapv (fn [[pk-name value]]
                      [:= [:field (get table-pks pk-name) nil] value])
                    pk-value)))
      pk-values)))

(defmethod actions/perform-action!* [:sql-jdbc :bulk/delete]
  [driver _action {database-id :id, :as database} {:keys [table-id pk-values]}]
  (log/tracef "Deleting %d rows" (count pk-values))
  (with-jdbc-transaction [conn database-id]
    (transduce
      (m/indexed)
      (fn
        ([]
         [[] []])
        ([[errors]]
         ;; if there were any errors throw an Exception with all the error messages.
         (when (seq errors)
           (.rollback conn)
           (throw (ex-info (tru "Error(s) deleting rows.")
                           {:status-code 400, :errors errors})))
         ;; if there we no errors then return the created rows.
         {:success true})
        ([[errors] [row-index delete-filter]]
         (try
           (do-nested-transaction
             driver
             conn
             (fn []
               (actions/perform-action!*
                 driver
                 :row/delete
                 database
                 {:database   database-id
                  :type       :query
                  :query      {:source-table table-id
                               :filter delete-filter}})))
           [errors]
           (catch Throwable e
             [(conj errors {:index row-index, :error (ex-message e)})]))))
      (pk-values->filters table-id pk-values))))
