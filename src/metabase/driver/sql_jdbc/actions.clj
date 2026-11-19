(ns metabase.driver.sql-jdbc.actions
  (:refer-clojure :exclude [some])
  (:require
   [clojure.java.jdbc :as jdbc]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.db :as driver.db]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf :refer [some]]
   [methodical.core :as methodical])
  (:import
   (java.sql Connection SQLException)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Error handling                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti maybe-parse-sql-error
  "Try to parse the SQL error message returned by JDBC driver.

  The methods should returns a map of:
  - type: the error type. Check [[metabase.actions.error]] for the full list
  - message: a nice message summarized of what went wrong
  - errors: a map from field-name => specific error message. This is used by UI to display per fields error
    If non per-column error is available, returns an empty map.

  Or return `nil` if the parser doesn't match."
  {:changelog-test/ignore true, :arglists '([driver error-type database action-type error-message]), :added "0.48.0"}
  (fn [driver error-type _database _action-type _error-message]
    [(driver/dispatch-on-initialized-driver driver) error-type])
  :hierarchy #'driver/hierarchy)

(defmethod maybe-parse-sql-error :default
  [_driver _error-type _database _e]
  nil)

(defn- parse-sql-error
  [driver database action-type e]
  (let [parsers-for-driver (keep (fn [[[method-driver error-type] method]]
                                   (when (= method-driver driver)
                                     (partial method driver error-type)))
                                 (dissoc (methods maybe-parse-sql-error) :default))]
    (try
      (some #(% database action-type (ex-message e)) parsers-for-driver)
      ;; Catch errors in parse-sql-error and log them so more errors in the future don't break the entire action.
      ;; We'll still get the original unparsed error message.
      (catch Throwable new-e
        (log/errorf "Error parsing SQL error message %s: %s" (pr-str (ex-message e)) (ex-message new-e))
        nil))))

(defn- do-with-auto-parse-sql-error
  [driver database action thunk]
  (try
    (thunk)
    (catch SQLException e
      (throw (ex-info (or (ex-message e) "Error executing action.")
                      (merge (or (some-> (parse-sql-error driver database action e)
                                         ;; the columns in error message should match with columns
                                         ;; in the parameter. It's usually got from calling
                                         ;; GET /api/action/:id/execute, and in there all column names are slugified
                                         (m/update-existing :errors perf/update-keys u/slugify))
                                 (assoc (ex-data e) :message (ex-message e)))
                             {:status-code 400}))))))

(defmacro ^:private with-auto-parse-sql-exception
  "Execute body and if there is an exception, try to parse the error message to search for known sql errors then throw a regular (and easier to understand/process) exception."
  [driver database action-type & body]
  `(do-with-auto-parse-sql-error ~driver ~database ~action-type (fn [] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Action Execution                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti base-type->sql-type-map
  "Return a map of [[metabase.types.core]] type to SQL string type name. Used for casting. Looks like we're just
  copypasting this from implementations of [[metabase.test.data.sql/field-base-type->sql-type]] so go find that stuff
  if you need to write more implementations for this."
  {:changelog-test/ignore true, :arglists '([driver]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(mu/defn- cast-values :- [:map-of :string :any]
  "Certain value types need to have their honeysql form updated to work properly during update/creation. This function
  uses honeysql casting to wrap values in the map that need to be cast with their column's type, and passes through
  types that do not need casting like integer or string."
  [driver        :- :keyword
   column->value :- driver-api/schema.actions.row
   database-id   :- driver-api/schema.id.database
   table-id      :- driver-api/schema.id.table]
  (let [type->sql-type (base-type->sql-type-map driver)
        column->field  (driver-api/cached-value
                        [::cast-values table-id]
                        (fn []
                          (into {}
                                (map (juxt :name identity))
                                (driver-api/with-metadata-provider database-id
                                  ;; TODO the fields method here only returns visible fields, it might not cast
                                  ;; everything
                                  (driver-api/fields (driver-api/metadata-provider) table-id)))))]
    (m/map-kv-vals (fn [col-name value]
                     (let [col-name                        (u/qualified-name col-name)
                           {base-type :base-type :as opts} (get column->field col-name)]
                       (if-let [sql-type (type->sql-type base-type)]
                         (h2x/cast sql-type value)
                         (try
                           (sql.qp/->honeysql driver [:value opts value])
                           (catch Exception e
                             (throw (ex-info (str "column cast failed: " (pr-str col-name))
                                             {:column      col-name
                                              :status-code 400}
                                             e)))))))
                   column->value)))

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
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
;;;    any more code and lets us have complete control over what happens and lets us see at a glance exactly what's
;;;    happening without having to keep [[clojure.java.jdbc]] magic in mind or work around it.
(defn do-with-jdbc-transaction
  "Impl function for [[with-jdbc-transaction]]."
  [database-id f]
  (if *connection*
    (f *connection*)
    (let [driver (driver.u/database->driver database-id)]
      (sql-jdbc.execute/do-with-connection-with-options
       driver
       database-id
       {:write? true}
       (fn [^Connection conn]
         ;; execute inside of a transaction.
         (.setAutoCommit conn false)
         (log/tracef "BEGIN transaction on conn %s@0x%s" (.getCanonicalName (class conn)) (System/identityHashCode conn))
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
             (throw e))))))))

(defmacro with-jdbc-transaction
  "Execute `f` with a JDBC Connection for the Database with `database-id`. Uses [[*connection*]] if already bound,
  otherwise fetches a new Connection from the Database's Connection pool and executes `f` inside of a transaction."
  {:style/indent 1}
  [[connection-binding database-id] & body]
  `(do-with-jdbc-transaction ~database-id (fn [~(vary-meta connection-binding assoc :tag 'Connection)] ~@body)))

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
  {:changelog-test/ignore true :arglists '([driver ^java.sql.Connection connection thunk]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- do-with-row-transaction
  "Call `(f connection)` in a transaction of its own, or, inside the transaction of a bulk action, in a nested one.

  The nested transaction lets the other rows of a bulk action go ahead when this one fails, so that its errors can all
  be reported; the bulk action's own transaction then rolls them all back."
  [driver database-id f]
  (if *connection*
    (do-nested-transaction driver *connection* #(f *connection*))
    (do-with-jdbc-transaction database-id f)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Rows                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn- correct-columns-name :- [:maybe [:sequential driver-api/schema.actions.args.row]]
  "Ensure each rows have column name match with fields name.
  Some drivers like h2 have weird issue with casing."
  [table-id :- driver-api/schema.id.table
   rows     :- [:sequential driver-api/schema.actions.args.row]]
  (when (seq rows)
    (let [field-names (driver-api/cached-value
                       [::correct-columns-name table-id]
                       (fn []
                         (driver.db/table-field-names table-id)))
          keymap (merge (u/for-map [f field-names]
                          [(u/lower-case-en f) f])
                        (u/for-map [f field-names]
                          [(u/upper-case-en f) f]))
          remap  (fn [k] (get keymap k k))]
      (map #(perf/update-keys % remap) rows))))

(defn- query-rows
  [driver conn query]
  (as-> query res
    (sql.qp/format-honeysql driver res)
    (jdbc/query {:connection conn} res {:transaction? false :keywordize? false})))

(defn- query-rows-correct-name
  [driver conn table-id query]
  (correct-columns-name table-id (query-rows driver conn query)))

(defn- execute-update!
  "Run the `UPDATE` or `DELETE` statement `sql-args` on `conn`, and return how many rows it changed.

  `jdbc/execute!` runs a statement with parameters as a batch of one, so Postgres would report its error as \"Batch
  entry 0 ... was aborted: ...\"; this runs it as a plain update, so the error is the database's own."
  [driver ^Connection conn [sql & params]]
  (with-open [stmt (.prepareStatement conn ^String sql)]
    (sql-jdbc.execute/set-parameters! driver stmt params)
    (.executeUpdate stmt)))

(defn- table-hsql
  "The Table with `table-id` as a HoneySQL table item, for an `:insert-into`, `:update`, `:delete-from` or `:from`. It
  is `[identifier]`, since HoneySQL reads a bare identifier, which is a vector, as a table and its alias."
  [driver database-id table-id]
  [(sql.qp/->honeysql driver (driver-api/with-metadata-provider database-id
                               (driver-api/table (driver-api/metadata-provider) table-id)))])

(defn- pk-where
  "A HoneySQL WHERE clause for the row of the Table with `table-id` whose primary key is `pk`. Its values are typed by
  [[cast-values]], as the values of an INSERT or UPDATE are."
  [driver database-id table-id pk]
  (let [clauses (for [[column value] (cast-values driver pk database-id table-id)]
                  [:= (sql.qp/->honeysql driver (h2x/identifier :field column)) value])]
    (if (next clauses)
      (into [:and] clauses)
      (first clauses))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Create                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmulti select-created-row
  "Multimethod for converting the result of an insert into the created row.
  `create-hsql` is the honeysql query used to insert the new row,
  `conn` is the DB connection used to insert the new row and
  `result` is the value returned by the insert command."
  {:changelog-test/ignore true, :arglists '([driver create-hsql conn result]), :added "0.46.0"}
  (fn [driver _ _ _]
    (driver/dispatch-on-initialized-driver driver))
  :hierarchy #'driver/hierarchy)

;;; H2 and MySQL are dumb and `RETURN_GENERATED_KEYS` only returns the ID of
;;; the newly created row. This function will `SELECT` the newly created row
;;; assuming that `result` is a map from column names to the generated values.
(mu/defmethod select-created-row :default :- [:maybe driver-api/schema.actions.args.row]
  [driver create-hsql conn result]
  (let [select-hsql     (-> create-hsql
                            (dissoc :insert-into :values)
                            (assoc :select [:*]
                                   :from [(:insert-into create-hsql)]
                                   ;; :and with a single clause will be optimized in HoneySQL
                                   :where (into [:and]
                                                (for [[col val] result]
                                                  [:= (keyword col) val]))))
        select-sql-args (sql.qp/format-honeysql driver select-hsql)]
    (first (jdbc/query {:connection conn} select-sql-args {:identifiers identity, :transaction? false, :keywordize? false}))))

(defn create-row!
  "The `:sql-jdbc` implementation of [[driver/action-create-row!]].

  With `:returning?` the INSERT ends in `RETURNING *`, and its result is the created row; otherwise
  [[select-created-row]] finds the row from the generated keys."
  [driver database {:keys [table-id row]} {:keys [returning?]}]
  (let [database-id    (u/the-id database)
        create-hsql    (cond-> {:insert-into (table-hsql driver database-id table-id)
                                :values      (if-not (seq row)
                                               :default
                                               [(cast-values driver row database-id table-id)])}
                         returning? (assoc :returning [:*]))
        sql-args       (sql.qp/format-honeysql driver create-hsql)]
    (do-with-row-transaction
     driver
     database-id
     (fn [^Connection conn]
       (let [result (with-auto-parse-sql-exception driver database :model.row/create
                      (jdbc/execute! {:connection conn} sql-args {:return-keys  true
                                                                  :identifiers  identity
                                                                  :transaction? false
                                                                  :keywordize?  false}))]
         (first (correct-columns-name table-id [(if returning?
                                                  result
                                                  (select-created-row driver create-hsql conn result))])))))))

(defmethod driver/action-create-row! :sql-jdbc
  [driver database args]
  (create-row! driver database args nil))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Update                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/action-update-row! :sql-jdbc
  [driver database {:keys [table-id pk row]}]
  (let [database-id (u/the-id database)
        table       (table-hsql driver database-id table-id)
        where       (pk-where driver database-id table-id pk)
        select-hsql {:select [:*] :from [table] :where where}
        update-hsql {:update table
                     :set    (cast-values driver row database-id table-id)
                     :where  where}
        sql-args    (sql.qp/format-honeysql driver update-hsql)]
    (do-with-row-transaction
     driver
     database-id
     (fn [^Connection conn]
       (let [;; a key that the database cannot compare with its column fails here, so this is a 400 too
             before       (with-auto-parse-sql-exception driver database :model.row/update
                            (first (query-rows-correct-name driver conn table-id select-hsql)))
             ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
             rows-updated (with-auto-parse-sql-exception driver database :model.row/update
                            (execute-update! driver conn sql-args))]
         ;; the transaction rolls back an update of more than one row
         (when-not (= rows-updated 1)
           (throw (ex-info (if (zero? rows-updated)
                             (tru "Sorry, the row you''re trying to update doesn''t exist")
                             (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated))
                           {:status-code 400})))
         {:before before
          :after  (first (query-rows-correct-name driver conn table-id select-hsql))})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Delete                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod driver/action-delete-row! :sql-jdbc
  [driver database {:keys [table-id pk]}]
  (let [database-id (u/the-id database)
        table       (table-hsql driver database-id table-id)
        where       (pk-where driver database-id table-id pk)
        delete-hsql {:delete-from table
                     :where       where}
        sql-args    (sql.qp/format-honeysql driver delete-hsql)]
    (do-with-row-transaction
     driver
     database-id
     (fn [^Connection conn]
       (let [;; a key that the database cannot compare with its column fails here, so this is a 400 too
             before       (with-auto-parse-sql-exception driver database :model.row/delete
                            (first (query-rows-correct-name driver conn table-id {:select [:*] :from [table] :where where})))
             ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
             rows-deleted (with-auto-parse-sql-exception driver database :model.row/delete
                            (execute-update! driver conn sql-args))]
         (log/tracef "deleted %s rows" rows-deleted)
         ;; the transaction rolls back a delete of more than one row
         (when-not (= rows-deleted 1)
           (throw (ex-info (if (zero? rows-deleted)
                             (tru "Sorry, the row you''re trying to delete doesn''t exist")
                             (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted))
                           {:status-code 400})))
         {:before before})))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    Bulk                                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- inputs-database-id
  "The ID of the Database the row action `inputs` act on. Core checks that they all act on the same one."
  [inputs]
  (let [{database-id :database, :keys [table-id]} (first inputs)]
    (or database-id
        (u/the-id (driver-api/cached-database-via-table-id table-id)))))

;;; Several rows at once go in one transaction, so that the action changes all of them or none. Each row runs in a
;;; nested transaction of it (see [[do-with-row-transaction]]).
(doseq [action [:model.row/create :model.row/update :model.row/delete
                :table.row/create :table.row/update :table.row/delete]]
  (methodical/defmethod driver-api/perform-action!* [:sql-jdbc action]
    [action context inputs]
    (if (next inputs)
      (with-jdbc-transaction [_conn (inputs-database-id inputs)]
        (next-method action context inputs))
      (next-method action context inputs))))
