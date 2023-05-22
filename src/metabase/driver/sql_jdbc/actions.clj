(ns metabase.driver.sql-jdbc.actions
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :as ordered-set]
   [medley.core :as m]
   [metabase.actions :as actions]
   [metabase.db.util :as mdb.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.honeysql-extensions :as hx]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection PreparedStatement)))

(set! *warn-on-reflection* true)

(defmulti parse-sql-error
  "Parses the raw error message returned after an error in the driver database occurs, and converts it into a sequence
  of maps with a :column and :message key indicating what went wrong."
  {:arglists '([driver database e]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- parse-error
  "Returns errors in a way that indicates which column had the problem. Can be used to highlight errors in forms."
  [driver database e]
  (let [default-method? (= (get-method parse-sql-error driver)
                           (get-method parse-sql-error :default))]
    (if default-method?
      (ex-data e)
      (let [message (ex-message e)]
        (if-let [parsed-errors (when message
                                 (try
                                   (parse-sql-error driver database message)
                                   (catch Throwable e
                                     (log/error e (trs "Error parsing SQL error message {0}: {1}" (pr-str message) (ex-message e)))
                                     nil)))]
          {:errors (into {} (map (juxt :column :message)) parsed-errors)}
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
        column->field  (actions/cached-value
                        [::cast-values table-id]
                        (fn []
                          (m/index-by :name (t2/select Field :table_id table-id))))]
    (m/map-kv-vals (fn [col-name value]
                     (let [col-name                         (u/qualified-name col-name)
                           {base-type :base_type :as field} (get column->field col-name)]
                       (if-let [sql-type (type->sql-type base-type)]
                         (sql.qp/with-driver-honey-sql-version driver
                           (hx/cast sql-type value))
                         (try
                           (sql.qp/->honeysql driver [:value value field])
                           (catch Exception e
                             (throw (ex-info (str "column cast failed: " (pr-str col-name))
                                             {:column      col-name
                                              :status-code 400}
                                             e)))))))
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
;;;    any more code and lets us have complete control over what happens and lets us see at a glance exactly what's
;;;    happening without having to keep [[clojure.java.jdbc]] magic in mind or work around it.
(defn do-with-jdbc-transaction
  "Impl function for [[with-jdbc-transaction]]."
  [database-id f]
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

(defmacro with-jdbc-transaction
  "Execute `f` with a JDBC Connection for the Database with `database-id`. Uses [[*connection*]] if already bound,
  otherwise fetches a new Connection from the Database's Connection pool and executes `f` inside of a transaction."
  {:style/indent 1}
  [[connection-binding database-id] & body]
  `(do-with-jdbc-transaction ~database-id (fn [~(vary-meta connection-binding assoc :tag 'Connection)] ~@body)))


(defmulti prepare-query*
  "Multimethod for preparing a honeysql query `hsql-query` for a given action type `action`.
  `action` is a keyword like `:row/create` or `:bulk/create`; `hsql-query` is a generic
  query of the type corresponding to `action`."
  {:arglists '([driver action hsql-query]), :added "0.46.0"}
  (fn [driver action _]
    [(driver/dispatch-on-initialized-driver driver)
     (keyword action)])
  :hierarchy #'driver/hierarchy)

(defmethod prepare-query* :default
  [_driver _action hsql-query]
  hsql-query)

(defn- prepare-query [hsql-query driver action]
  (prepare-query* driver action hsql-query))

(defmethod actions/perform-action!* [:sql-jdbc :row/delete]
  [driver action database {database-id :database, :as query}]
  (let [raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        delete-hsql (-> raw-hsql
                        (dissoc :select)
                        (assoc :delete [])
                        (prepare-query driver action))
        sql-args    (sql.qp/format-honeysql driver delete-hsql)]
    (with-jdbc-transaction [conn database-id]
      (try
        ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
        (let [rows-deleted (first (jdbc/execute! {:connection conn} sql-args {:transaction? false}))]
          (when-not (= rows-deleted 1)
            (throw (ex-info (if (zero? rows-deleted)
                              (tru "Sorry, the row you''re trying to delete doesn''t exist")
                              (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted))
                            {::incorrect-number-deleted true
                             :number-deleted            rows-deleted
                             :query                     query
                             :sql                       (sql.qp/format-honeysql driver delete-hsql)
                             :status-code               400})))
          {:rows-deleted [1]})
        (catch Exception e
          (let [e-data (if (::incorrect-number-deleted (ex-data e))
                         (ex-data e)
                         (parse-error driver database e))]
            (throw
             (ex-info (or (ex-message e) "Delete action error.")
                      (assoc e-data :status-code 400)))))))))

(defmethod actions/perform-action!* [:sql-jdbc :row/update]
  [driver action database {database-id :database :keys [update-row] :as query}]
  (let [update-row   (update-keys update-row keyword)
        raw-hsql     (qp.store/with-store
                       (try
                         (qp/preprocess query) ; seeds qp store as a side-effect so we can generate honeysql
                         (sql.qp/mbql->honeysql driver query)
                         (catch Exception e
                           (catch-throw e 404))))
        target-table (first (:from raw-hsql))
        update-hsql  (-> raw-hsql
                         (select-keys [:where])
                         (assoc :update target-table
                                :set (cast-values driver update-row (get-in query [:query :source-table])))
                         (prepare-query driver action))
        sql-args     (sql.qp/format-honeysql driver update-hsql)]
    (with-jdbc-transaction [conn database-id]
      (try
        ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
        (let [rows-updated (first (jdbc/execute! {:connection conn} sql-args {:transaction? false}))]
          (when-not (= rows-updated 1)
            (throw (ex-info (if (zero? rows-updated)
                              (tru "Sorry, the row you''re trying to update doesn''t exist")
                              (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated))
                            {::incorrect-number-updated true
                             :number-updated            rows-updated
                             :query                     query
                             :sql                       (sql.qp/format-honeysql driver update-hsql)
                             :status-code               400})))
          {:rows-updated [1]})
        (catch Exception e
          (let [e-data (if (::incorrect-number-updated (ex-data e))
                         (ex-data e)
                         (parse-error driver database e))]
            (throw
             (ex-info (or (ex-message e) "Update action error.")
                      (assoc e-data :status-code 400)))))))))

(defmulti select-created-row
  "Multimethod for converting the result of an insert into the created row.
  `create-hsql` is the honeysql query used to insert the new row,
  `conn` is the DB connection used to insert the new row and
  `result` is the value returned by the insert command."
  {:arglists '([driver create-hsql conn result]), :added "0.46.0"}
  (fn [driver _ _ _]
    (driver/dispatch-on-initialized-driver driver))
  :hierarchy #'driver/hierarchy)

;;; H2 and MySQL are dumb and `RETURN_GENERATED_KEYS` only returns the ID of
;;; the newly created row. This function will `SELECT` the newly created row
;;; assuming that `result` is a map from column names to the generated values.
(defmethod select-created-row :default
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
    (log/tracef ":row/create SELECT HoneySQL:\n\n%s" (u/pprint-to-str select-hsql))
    (log/tracef ":row/create SELECT SQL + args:\n\n%s" (u/pprint-to-str select-sql-args))
    (first (jdbc/query {:connection conn} select-sql-args {:identifiers identity, :transaction? false}))))

(defmethod actions/perform-action!* [:sql-jdbc :row/create]
  [driver action database {database-id :database :keys [create-row] :as query}]
  (let [create-row  (update-keys create-row keyword)
        raw-hsql    (qp.store/with-store
                      (try
                        (qp/preprocess query) ; seeds qp store as a side effect so we can generate honeysql
                        (sql.qp/mbql->honeysql driver query)
                        (catch Exception e
                          (catch-throw e 404))))
        create-hsql (-> raw-hsql
                        (assoc :insert-into (first (:from raw-hsql)))
                        (assoc :values [(cast-values driver create-row (get-in query [:query :source-table]))])
                        (dissoc :select :from)
                        (prepare-query driver action))
        sql-args    (sql.qp/format-honeysql driver create-hsql)]
    (log/tracef ":row/create HoneySQL:\n\n%s" (u/pprint-to-str create-hsql))
    (log/tracef ":row/create SQL + args:\n\n%s" (u/pprint-to-str sql-args))
    (with-jdbc-transaction [conn database-id]
      (try
        (let [result (jdbc/execute! {:connection conn} sql-args {:return-keys true, :identifiers identity, :transaction? false})
              _      (log/tracef ":row/create INSERT returned\n\n%s" (u/pprint-to-str result))
              row    (select-created-row driver create-hsql conn result)]
          (log/tracef ":row/create returned row %s" (pr-str row))
          {:created-row row})
        (catch Exception e
          (let [e-data (parse-error driver database e)]
            (throw (ex-info (or (ex-message e) "Create action error.")
                            (assoc e-data :status-code 400)
                            e))))))))

;;;; Bulk actions

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

(defn- perform-bulk-action-with-repeated-single-row-actions!
  [{:keys [driver database action rows xform]
    :or   {xform identity}}]
  (assert (seq rows))
  (with-jdbc-transaction [conn (u/the-id database)]
    (transduce
     (comp xform (m/indexed))
     (fn
       ([]
        [[] []])

       ([[errors successes]]
        (when (seq errors)
          (.rollback conn))
        [errors successes])

       ([[errors successes] [row-index arg-map]]
        (try
          (let [result (do-nested-transaction
                        driver
                        conn
                        (fn []
                          (actions/perform-action!* driver action database arg-map)))]
            [errors
             (conj successes result)])
          (catch Throwable e
            [(conj errors {:index row-index, :error (ex-message e)})
             successes]))))
     rows)))

(defmethod driver/execute-write-query! :sql-jdbc
  [driver {{sql :query, :keys [params]} :native}]
  {:pre [(string? sql)]}
  (try
    (let [{db-id :id} (qp.store/database)]
      (with-jdbc-transaction [conn db-id]
        (with-open [stmt (sql-jdbc.execute/statement-or-prepared-statement driver conn sql params nil)]
          {:rows-affected (if (instance? PreparedStatement stmt)
                            (.executeUpdate ^PreparedStatement stmt)
                            (.executeUpdate stmt sql))})))
    (catch Throwable e
      (throw (ex-info (tru "Error executing write query: {0}" (ex-message e))
                      {:sql sql, :params params, :type qp.error-type/invalid-query}
                      e)))))

;;;; `:bulk/create`

(defmethod actions/perform-action!* [:sql-jdbc :bulk/create]
  [driver _action database {:keys [table-id rows]}]
  (log/tracef "Inserting %d rows" (count rows))
  (perform-bulk-action-with-repeated-single-row-actions!
   {:driver   driver
    :database database
    :action   :row/create
    :rows     rows
    :xform    (comp (map (fn [row]
                           {:database   (u/the-id database)
                            :type       :query
                            :query      {:source-table table-id}
                            :create-row row}))
                    #(completing % (fn [[errors successes]]
                                     (when (seq errors)
                                       (throw (ex-info (tru "Error(s) inserting rows.")
                                                       {:status-code 400, :errors errors})))
                                     {:created-rows (map :created-row successes)})))}))

;;;; Shared stuff for both `:bulk/delete` and `:bulk/update`

(defn- table-id->pk-field-name->id
  "Given a `table-id` return a map of string Field name -> Field ID for the primary key columns for that Table."
  [table-id]
  (t2/select-fn->pk :name Field
    {:where [:and
             [:= :table_id table-id]
             (mdb.u/isa :semantic_type :type/PK)]}))

(defn- row->mbql-filter-clause
  "Given [[field-name->id]] as returned by [[table-id->pk-field-name->id]] or similar and a `row` of column name to
  value build an appropriate MBQL filter clause."
  [field-name->id row]
  (when (empty? row)
    (throw (ex-info (tru "Cannot build filter clause: row cannot be empty.")
                    {:field-name->id field-name->id, :row row, :status-code 400})))
  (into [:and] (for [[field-name value] row
                     :let               [field-id (get field-name->id (u/qualified-name field-name))
                                         ;; if the field isn't in `field-name->id` then it's an error in our code. Not
                                         ;; i18n'ed because this is not something that should be User facing unless our
                                         ;; backend code is broken.
                                         ;;
                                         ;; Unknown column names in user input WILL NOT trigger this error.
                                         ;; [[row->mbql-filter-clause]] is only used for *known* PK columns that are
                                         ;; used for the MBQL `:filter` clause. Unknown columns will trigger an error in
                                         ;; the DW but not here.
                                         _ (assert field-id
                                                   (format "Field %s is not present in field-name->id map"
                                                           (pr-str field-name)))]]
                 [:= [:field field-id nil] value])))

;;;; `:bulk/delete`

(defn- check-rows-have-expected-columns-and-no-other-keys
  "Make sure all `rows` have all the keys in `expected-columns` *and no other keys*, or return a 400."
  [rows expected-columns]
  ;; we only actually need to check the first map since [[check-consistent-row-keys]] should have checked that
  ;; they all have the same keys.
  (let [expected-columns (set expected-columns)
        actual-columns   (set (keys (first rows)))]
    (when-not (= actual-columns expected-columns)
      (throw (ex-info (tru "Rows have the wrong columns: expected {0}, but got {1}" expected-columns actual-columns)
                      {:status-code 400, :expected-columns expected-columns, :actual-columns actual-columns})))))

(defn- check-consistent-row-keys
  "Make sure all `rows` have the same keys, or return a 400 response."
  [rows]
  (let [all-row-column-sets (reduce
                             (fn [seen-set row]
                               (conj seen-set (set (keys row))))
                             #{}
                             rows)]
    (when (> (count all-row-column-sets) 1)
      (throw (ex-info (tru "Some rows have different sets of columns: {0}"
                           (str/join ", " (map pr-str all-row-column-sets)))
                      {:status-code 400, :column-sets all-row-column-sets})))))

(defn- check-unique-rows
  "Make sure all `rows` are unique, or return a 400 response. It makes no sense to try to delete the same row twice. It
  would fail anyway because the first call would delete it while the second would fail because it deletes zero rows."
  [rows]
  (when-let [repeats (not-empty
                      (into
                       ;; ordered set so the results are deterministic for test purposes
                       (ordered-set/ordered-set)
                       (filter (fn [[_row repeat-count]]
                                 (> repeat-count 1)))
                       (frequencies rows)))]
    (throw (ex-info (tru "Rows need to be unique: repeated rows {0}"
                         (str/join ", " (for [[row repeat-count] repeats]
                                          (format "%s × %d" (pr-str row) repeat-count))))
                    {:status-code 400, :repeated-rows repeats}))))

(defmethod actions/perform-action!* [:sql-jdbc :bulk/delete]
  [driver _action {database-id :id, :as database} {:keys [table-id rows]}]
  (log/tracef "Deleting %d rows" (count rows))
  (let [pk-name->id (table-id->pk-field-name->id table-id)]
    ;; validate the keys in `rows`
    (check-consistent-row-keys rows)
    (check-rows-have-expected-columns-and-no-other-keys rows (keys pk-name->id))
    (check-unique-rows rows)
    ;; now do one `:row/delete` for each row
    (perform-bulk-action-with-repeated-single-row-actions!
     {:driver   driver
      :database database
      :action   :row/delete
      :rows     rows
      :xform    (comp (map (fn [row]
                             {:database database-id
                              :type     :query
                              :query    {:source-table table-id
                                         :filter       (row->mbql-filter-clause pk-name->id row)}}))
                      #(completing % (fn [[errors _successes]]
                                       (when (seq errors)
                                         (throw (ex-info (tru "Error(s) deleting rows.")
                                                         {:status-code 400, :errors errors})))
                                       ;; `:bulk/delete` just returns a simple status message on success.
                                       {:success true})))})))

;;;; `bulk/update`

(s/defn ^:private check-row-has-all-pk-columns
  "Return a 400 if `row` doesn't have all the required PK columns."
  [row :- {s/Str s/Any} pk-names :- #{s/Str}]
  (doseq [pk-key pk-names
          :when  (not (contains? row pk-key))]
    (throw (ex-info (tru "Row is missing required primary key column. Required {0}; got {1}"
                         (pr-str pk-names)
                         (pr-str (set (keys row))))
                    {:row row, :pk-names pk-names, :status-code 400}))))

(s/defn ^:private check-row-has-some-non-pk-columns
  "Return a 400 if `row` doesn't have any non-PK columns to update."
  [row :- {s/Str s/Any} pk-names :- #{s/Str}]
  (let [non-pk-names (set/difference (set (keys row)) pk-names)]
    (when (empty? non-pk-names)
      (throw (ex-info (tru "Invalid update row map: no non-PK columns. Got {0}, all of which are PKs."
                           (pr-str (set (keys row))))
                      {:status-code 400
                       :row         row
                       :all-keys    (set (keys row))
                       :pk-names    pk-names})))))

(defn- bulk-update-row-xform
  "Create a function to use to transform each row coming in to a `:bulk/update` request into an MBQL query that can be
  passed to `:row/update`."
  [{database-id :id, :as _database} table-id]
  ;; TODO -- make sure all rows specify the PK columns
  (let [pk-name->id (table-id->pk-field-name->id table-id)
        pk-names    (set (keys pk-name->id))]
    (fn [row]
      (check-row-has-all-pk-columns row pk-names)
      (let [pk-column->value (select-keys row pk-names)]
        (check-row-has-some-non-pk-columns row pk-names)
        {:database   database-id
         :type       :query
         :query      {:source-table table-id
                      :filter       (row->mbql-filter-clause pk-name->id pk-column->value)}
         :update-row (apply dissoc row pk-names)}))))

(defmethod actions/perform-action!* [:sql-jdbc :bulk/update]
  [driver _action database {:keys [table-id rows]}]
  (log/tracef "Updating %d rows" (count rows))
  (perform-bulk-action-with-repeated-single-row-actions!
   {:driver   driver
    :database database
    :action   :row/update
    :rows     rows
    :xform    (comp (map (bulk-update-row-xform database table-id))
                    #(completing % (fn [[errors successes]]
                                     (when (seq errors)
                                       (throw (ex-info (tru "Error(s) updating rows.")
                                                       {:status-code 400, :errors errors})))
                                     ;; `:bulk/update` returns {:rows-updated <number-of-rows-updated>} on success.
                                     (transduce
                                      (map (comp first :rows-updated))
                                      (completing +
                                                  (fn [num-rows-updated]
                                                    {:rows-updated num-rows-updated}))
                                      0
                                      successes))))}))
