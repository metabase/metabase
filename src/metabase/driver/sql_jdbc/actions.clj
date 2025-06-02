(ns metabase.driver.sql-jdbc.actions
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.set :as ordered-set]
   [medley.core :as m]
   [metabase.actions.core :as actions]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.util :as driver.u]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2])
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
  - errors: a map from field-name => sepcific error message. This is used by UI to display per fields error
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
        (log/errorf new-e "Error parsing SQL error message %s: %s" (pr-str (ex-message e)) (ex-message new-e))
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
                                         (m/update-existing :errors update-keys u/slugify))
                                 (assoc (ex-data e) :message (ex-message e)))
                             {:status-code 400}))))))

(defmacro ^:private with-auto-parse-sql-exception
  "Execute body and if there is an exception, try to parse the error message to search for known sql errors then throw a regular (and easier to understand/process) exception."
  [driver database action-type & body]
  `(do-with-auto-parse-sql-error ~driver ~database ~action-type (fn [] ~@body)))

(defn- mbql-query->raw-hsql
  [driver {database-id :database, :as query}]
  (qp.store/with-metadata-provider database-id
    (sql.qp/mbql->honeysql driver (qp.preprocess/preprocess query))))

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

(mu/defn- cast-values :- ::lib.schema.actions/row
  "Certain value types need to have their honeysql form updated to work properly during update/creation. This function
  uses honeysql casting to wrap values in the map that need to be cast with their column's type, and passes through
  types that do not need casting like integer or string."
  [driver        :- :keyword
   column->value :- ::lib.schema.actions/row
   database-id   :- ::lib.schema.id/database
   table-id      :- ::lib.schema.id/table]
  (let [type->sql-type (base-type->sql-type-map driver)
        column->field  (actions/cached-value
                        [::cast-values table-id]
                        (fn []
                          (into {}
                                #_{:clj-kondo/ignore [:deprecated-var]}
                                (map (juxt :name qp.store/->legacy-metadata))
                                (qp.store/with-metadata-provider database-id
                                  ;; TODO the fields method here only returns visible fields, it might not cast
                                  ;; everything
                                  (lib.metadata.protocols/fields (qp.store/metadata-provider) table-id)))))]
    (m/map-kv-vals (fn [col-name value]
                     (let [col-name                         (u/qualified-name col-name)
                           {base-type :base_type :as field} (get column->field col-name)]
                       (if-let [sql-type (type->sql-type base-type)]
                         (h2x/cast sql-type value)
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

(defmulti prepare-query*
  "Multimethod for preparing a honeysql query `hsql-query` for a given action type `action`.
  `action` is a keyword like `:model.row/create` or `:table.row/create`; `hsql-query` is a generic
  query of the type corresponding to `action`."
  {:changelog-test/ignore true, :arglists '([driver action hsql-query]), :added "0.46.0"}
  (fn [driver action _]
    [(driver/dispatch-on-initialized-driver driver)
     (keyword action)])
  :hierarchy #'driver/hierarchy)

(defmethod prepare-query* :default
  [_driver _action hsql-query]
  hsql-query)

(defn- prepare-query [hsql-query driver action]
  (prepare-query* driver action hsql-query))

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

(defn- run-bulk-transaction!
  "Like [[clojure.core/run!]] but exhaustively executing the procedures within nested transactions.
   Rolls back the outer transaction if there are any failures, and returns [errors success], golang style."
  [{:keys [database proc coll]}]
  (with-jdbc-transaction [conn (:id database)]
    (transduce
     (m/indexed)
     (fn
       ([]
        [[] []])

       ([[errors successes]]
        (when (seq errors)
          (.rollback conn))
        [errors successes])

       ([[errors successes] [row-index arg]]
        (try
          (let [result (do-nested-transaction (:engine database) conn #(proc arg))]
            [errors (conj successes result)])
          (catch Throwable e
            [(conj errors {:index row-index, :error e})
             successes]))))
     coll)))

(defn- inputs->db
  "Given the inputs to a row action, determine the underlying database."
  [inputs]
  (let [db-ids (into #{} (map :database inputs))
        _      (when-not (= 1 (count db-ids))
                 (throw (ex-info (tru "Cannot operate on multiple databases, it would not be atomic.")
                                 {:status-code  400
                                  :database-ids db-ids})))]
    (actions/cached-database (first db-ids))))

(defn- record-mutations
  "Update the context to reflect the modifications made by the action."
  [context diffs]
  (update context :effects (fnil into []) (map #(vector :effect/row.modified %) diffs)))

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- subsume-effects
  "Update the calling context with the effects produced by nested calls."
  [parent-context child-results]
  (update parent-context :effects (fnil into []) (mapcat (comp :effects :context)) child-results))

(defn- result-schema [output-schema]
  [:map {:closed true}
   [:context :map]
   [:outputs [:sequential output-schema]]])

(mu/defn- correct-columns-name :- [:maybe [:sequential ::lib.schema.actions/row]]
  "Ensure each rows have column name match with fields name.
  Some drivers like h2 have weird issue with casing."
  [table-id rows :- [:sequential ::lib.schema.actions/row]]
  (when (seq rows)
    (let [field-names (actions/cached-value
                       [::correct-columns-name table-id]
                       (fn []
                         (t2/select-fn-vec :name [:model/Field :name] :table_id table-id)
                         ;; can't use lib here because fields from lib only return active fields and visible fields
                         ;; :/
                         #_(let [database (actions/cached-database-via-table-id table-id)]
                             #_(qp.store/with-metadata-provider (:id database)
                                 (mapv :name
                                       (lib.metadata.protocols/fields (qp.store/metadata-provider) table-id))))))
          keymap (merge (u/for-map [f field-names]
                          [(u/lower-case-en f) f])
                        (u/for-map [f field-names]
                          [(u/upper-case-en f) f]))
          remap  (fn [k] (get keymap k k))]
      (map #(update-keys % remap) rows))))

(defn- query-rows
  [driver conn table-id query]
  (as-> query res
    (sql.qp/format-honeysql driver res)
    (jdbc/query {:connection conn} res {:transaction? false :keywordize? false})
    (correct-columns-name table-id res)))

(declare count-row-descendants)

(defn- row-delete!* [action database query]
  (let [db-id      (u/the-id database)
        table-id   (-> query :query :source-table)
        row-before (atom nil)]
    (try
      (let [driver               (:engine database)
            {:keys [from where]} (mbql-query->raw-hsql driver query)
            delete-hsql          (-> {:delete-from (first from)
                                      :where       where}
                                     (prepare-query driver action))
            sql-args             (sql.qp/format-honeysql driver delete-hsql)]
        ;; We rely on this per-row transaction for the consistency guarantee of deleting exactly 1 row
        (with-jdbc-transaction [conn db-id]
          (->> (prepare-query {:select [:*] :from from :where where} driver action)
               (query-rows driver conn table-id)
               first
               (reset! row-before))
          (let [; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
                rows-deleted (with-auto-parse-sql-exception driver database action
                               (first (jdbc/execute! {:connection conn} sql-args {:transaction? false})))]
            (when-not (= rows-deleted 1)
              (throw (ex-info (if (zero? rows-deleted)
                                (tru "Sorry, the row you''re trying to delete doesn''t exist")
                                (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted))
                              {:status-code 400})))
            {:table-id (-> query :query :source-table)
             :db-id    (u/the-id database)
             :before   @row-before
             :after    nil})))
      (catch Throwable e
        (if (and (= actions/violate-foreign-key-constraint
                    (:type (ex-data e)))
                 (some? @row-before))
          (binding [*connection* nil] ;; the current connection might be aborted already, so we need to make sure this happens on a different connection
            (throw (ex-info (ex-message e)
                            (assoc (ex-data e) :children (:counts (count-row-descendants db-id table-id @row-before))))))
          (throw e))))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :model.row/delete] :- (result-schema [:map [:rows-deleted :int]])
  [action context inputs]
  (let [database       (inputs->db inputs)
        ;; TODO it would be nice to make this 1 statement per table, instead of N.
        ;;      we can rely on the table lock instead of the nested row transactions.
        [errors diffs] (run-bulk-transaction!
                        {:database database
                         :proc     (partial row-delete!* action database)
                         :coll     inputs})]
    (if (seq errors)
      ;; For backwards compatibility
      (throw (:error (first errors)))
      {:context (record-mutations context diffs)
       :outputs [{:rows-deleted (count diffs)}]})))

(defn- row-update!* [action database {:keys [update-row] :as query}]
  (let [driver       (:engine database)
        source-table (get-in query [:query :source-table])
        {:keys [from where]} (mbql-query->raw-hsql driver query)
        update-hsql  (-> {:update (first from)
                          :set    (cast-values driver update-row (u/the-id database) source-table)
                          :where  where}
                         (prepare-query driver action))
        sql-args     (sql.qp/format-honeysql driver update-hsql)]
    (with-jdbc-transaction [conn (u/the-id database)]
      (let [table-id     (-> query :query :source-table)
            row-before   (->> (prepare-query {:select [:*] :from from :where where} driver action)
                              (query-rows driver conn table-id)
                              first)
            ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
            rows-updated (with-auto-parse-sql-exception driver database action
                           (first (jdbc/execute! {:connection conn} sql-args {:transaction? false})))
            _            (when-not (= rows-updated 1)
                           (throw (ex-info (if (zero? rows-updated)
                                             (tru "Sorry, the row you''re trying to update doesn''t exist")
                                             (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated))
                                           {:status-code 400})))
            row-after    (->> (prepare-query {:select [:*] :from from :where where} driver action)
                              (query-rows driver conn table-id)
                              first)]
        {:table-id (-> query :query :source-table)
         :db-id    (u/the-id database)
         :before   row-before
         :after    row-after}))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :model.row/update]
  [action context inputs]
  (let [database          (inputs->db inputs)
        ;; TODO it would be nice to make this 1 statement per table, instead of N.
        ;;      we can rely on the table lock instead of the nested row transactions.
        [errors diffs]    (run-bulk-transaction!
                           {:database database
                            :proc     (partial row-update!* action database)
                            :coll     inputs})]
    (if (seq errors)
      ;; For backwards compatibility
      (throw (:error (first errors)))
      {:context (record-mutations context diffs)
       :outputs [{:rows-updated (count diffs)}]})))

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
(mu/defmethod select-created-row :default :- [:maybe ::lib.schema.actions/row]
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
    (log/tracef ":model.row/create SELECT HoneySQL:\n\n%s" (u/pprint-to-str select-hsql))
    (first (jdbc/query {:connection conn} select-sql-args {:identifiers identity, :transaction? false, :keywordize? false}))))

(defn- row-create!* [action database {:keys [create-row] :as query}]
  (let [db-id       (u/the-id database)
        driver      (:engine database)
        {:keys [from]} (mbql-query->raw-hsql driver query)
        create-hsql (-> {:insert-into (first from)
                         :values      [(cast-values driver create-row db-id (get-in query [:query :source-table]))]}
                        (prepare-query driver action))
        sql-args    (sql.qp/format-honeysql driver create-hsql)]
    (log/tracef ":model.row/create HoneySQL:\n\n%s" (u/pprint-to-str create-hsql))
    (log/tracef ":model.row/create SQL + args:\n\n%s" (u/pprint-to-str sql-args))
    (with-jdbc-transaction [conn db-id]
      (let [table-id (-> query :query :source-table)
            result (with-auto-parse-sql-exception driver database action
                     (jdbc/execute! {:connection conn} sql-args {:return-keys  true
                                                                 :identifiers  identity
                                                                 :transaction? false
                                                                 :keywordize?  false}))
            _      (log/tracef ":model.row/create INSERT returned\n\n%s" (u/pprint-to-str result))
            row    (first (correct-columns-name table-id [(select-created-row driver create-hsql conn result)]))]
        (log/tracef ":model.row/create returned row %s" (pr-str row))
        {:table-id (-> query :query :source-table)
         :db-id    (u/the-id database)
         :before   nil
         :after    row}))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :model.row/create] :- (result-schema [:map [:created-row ::lib.schema.actions/row]])
  [action context inputs :- [:sequential ::mbql.s/Query]]
  (let [database (inputs->db inputs)
        ;; TODO it would be nice to make this 1 statement per table, instead of N.
        ;;      we can rely on the table lock instead of the nested row transactions.
        [errors diffs]    (run-bulk-transaction!
                           {:database database
                            :proc     (partial row-create!* action database)
                            :coll     inputs})]
    (if (seq errors)
      ;; For backwards compatibility
      (throw (:error (first errors)))
      {:context (record-mutations context diffs)
       :outputs (mapv #(array-map :created-row (:after %)) diffs)})))

;;;; Bulk actions

(defn- perform-bulk-action-with-repeated-single-row-actions!
  [{:keys [database action proc rows xform]
    :or   {xform identity}}]
  (with-jdbc-transaction [conn (u/the-id database)]
    ;; TODO accumulate snapshots from row actions
    (transduce
     (comp xform (m/indexed))
     (fn
       ([]
        [[] []])

       ([[errors results]]
        (when (seq errors)
          (.rollback conn))
        [errors results])

       ([[errors results] [row-index query]]
        (try
          ;; Note that each row action takes care of reverting itself.
          (let [result (do-nested-transaction (:engine database) conn #(proc action database query))]
            [errors (conj results result)])
          (catch Throwable e
            (log/error e)
            [(conj errors (merge {:index row-index, :error (ex-message e)} (ex-data e)))
             results]))))
     rows)))

(defn- batch-execution-by-table-id! [{:keys [inputs row-fn row-action validate-fn input-fn]}]
  (let [databases (into #{} (map (comp actions/cached-database-via-table-id :table-id)) inputs)
        _         (when-not (= 1 (count databases))
                    (throw (ex-info (tru "Cannot operate on multiple databases, it would not be atomic.")
                                    {:status-code  400
                                     :database-ids (map :id databases)})))
        database  (first databases)
        driver    (:engine database)
        x-inputs  (for [[table-id rows] (u/group-by :table-id :row inputs)]
                    {:table-id table-id :rows rows})]
    (when validate-fn
      (doseq [{:keys [table-id rows]} x-inputs]
        (validate-fn database table-id rows)))
    (perform-bulk-action-with-repeated-single-row-actions!
     {:driver   driver
      :database database
      :action   row-action
      :proc     row-fn
      :rows     x-inputs
      ;; We're not yet batching per table, due to the "mapcat". Need to rework the row functions.
      :xform   (mapcat #(map (partial input-fn database (:table-id %)) (:rows %)))})))

(mr/def ::table-row-input
  [:map
   [:table-id ::lib.schema.id/table]
   [:row ::lib.schema.actions/row]])

(mu/defmethod actions/perform-action!* [:sql-jdbc :table.row/create]
  [_action context inputs :- [:sequential ::table-row-input]]
  (let [[errors results]
        (batch-execution-by-table-id!
         {:row-action :model.row/create
          :row-fn     row-create!*
          :inputs     inputs
          :input-fn   (fn [database table-id row]
                        {:database   (u/the-id database)
                         :type       :query
                         :query      {:source-table table-id}
                         :create-row row})})]
    (when (seq errors)
      (throw (ex-info (tru "Error(s) inserting rows.")
                      {:status-code 400
                       :errors      errors
                       :results     results})))
    {:context (record-mutations context results)
     :outputs (mapv (fn [{:keys [table-id after]}]
                      {:table-id table-id
                       :op       :created
                       :row      after})
                    results)}))

;;;; Shared stuff for both `:table.row/delete` and `:table.row/update`

(mu/defn- table-id->pk-field-name->id :- [:map-of ::lib.schema.common/non-blank-string ::lib.schema.id/field]
  "Given a `table-id` return a map of string Field name -> Field ID for the primary key columns for that Table."
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (actions/cached-value
   [::table-id->pk-field-name->id table-id]
   #(into {}
          (comp (filter (fn [{:keys [semantic-type], :as _field}]
                          (isa? semantic-type :type/PK)))
                (map (juxt :name :id)))
          (qp.store/with-metadata-provider database-id
            (lib.metadata.protocols/fields
             (qp.store/metadata-provider)
             table-id)))))

(mu/defn- row->mbql-filter-clause
  "Given [[field-name->id]] as returned by [[table-id->pk-field-name->id]] or similar and a `row` of column name to
  value build an appropriate MBQL filter clause."
  [field-name->id :- [:map-of :string :int]
   row :- ::lib.schema.actions/row]
  (when (empty? row)
    (throw (ex-info (tru "Cannot build filter clause: row cannot be empty.")
                    {:field-name->id field-name->id, :row row, :status-code 400})))
  (into [:and] (for [[field-name value] row
                     :let               [field-id (get field-name->id field-name)
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

;;;; Foreign Key Cascade Deletion

(mu/defn- build-fk-metadata :- [:map-of ::lib.schema.id/table [:sequential :map]]
  "Build foreign key relationship metadata for a database.
  Returns a map of parent-table-id -> [{:table child-table-id, :fk {child-fk-col parent-pk-col}, :pk [child-pk-cols]}]"
  [database-id :- ::lib.schema.id/database]
  ;; TODO this is not ok because we're building metadata for a whole database, which could have a lots of entries
  ;; will need to rework foreign_key to make this work nicely
  (actions/cached-value
   [::build-fk-metadata database-id]
   (fn []
     (qp.store/with-metadata-provider database-id
       (let [all-tables          (lib.metadata.protocols/tables (qp.store/metadata-provider))
             all-fields          (mapcat #(lib.metadata.protocols/fields (qp.store/metadata-provider) (:id %)) all-tables)
             fk-fields           (filter #((every-pred :fk-target-field-id :active) %) all-fields)
             pk-fields           (filter #(isa? (:semantic-type %) :type/PK) all-fields)
             field-id->field     (u/index-by :id all-fields)
             table-id->table     (u/index-by :id all-tables)
             table-id->pk-fields (group-by :table-id pk-fields)]
         (reduce
          (fn [metadata {:keys [table-id fk-target-field-id] field-name :name}]
            (if-let [target-field (field-id->field fk-target-field-id)]
              (let [parent-table-id (:table-id target-field)
                    child-pk-fields (table-id->pk-fields table-id)]
                (update metadata parent-table-id (fnil conj [])
                        {:table-id   table-id
                         :table-name (get-in table-id->table [table-id :name])
                         :fk         {field-name (:name target-field)}
                         :pk         (mapv :name child-pk-fields)}))
              metadata))
          {}
          fk-fields))))))

(defn- build-pk-filter-clause-mbql
  "Build an efficient filter clause for matching rows by primary key.
  Uses IN clause for single PK, OR of AND clauses for composite PK."
  [pk-name->id pk-rows]
  (cond
    (= 1 (count pk-rows))
    (row->mbql-filter-clause pk-name->id (first pk-rows))

    (= 1 (count pk-name->id))
    (let [[pk-name pk-field-id] (first pk-name->id)
          pk-values             (map #(get % pk-name) pk-rows)]
      (into [:in [:field pk-field-id nil]] pk-values))

    :else
    (into [:or]
          (map #(row->mbql-filter-clause pk-name->id %) pk-rows))))

(defn- delete-rows-by-pk!
  "Delete rows from a table by their primary key values"
  [database-id table-id pk-rows]
  (when (seq pk-rows)
    (let [database             (actions/cached-database database-id)
          driver               (:engine database)
          pk-name->id          (table-id->pk-field-name->id database-id table-id)
          ;; TODO optimize to delete by FK instead of PK of the target table
          filter-clause        (build-pk-filter-clause-mbql pk-name->id pk-rows)
          {:keys [from where]} (mbql-query->raw-hsql driver {:database database-id
                                                             :type     :query
                                                             :query    {:source-table table-id
                                                                        :filter       filter-clause}})
          delete-hsql          (-> {:delete-from (first from)
                                    :where       where}
                                   (prepare-query driver :table.row/delete))
          sql-args            (sql.qp/format-honeysql driver delete-hsql)]
      (with-jdbc-transaction [conn database-id]
        (with-auto-parse-sql-exception driver database :table.row/delete
          (first (jdbc/execute! {:connection conn} sql-args {:transaction? false})))))))

(defn- build-fk-filter-clause-hsql
  "Build an efficient filter clause for matching rows by foreign key.
  Uses IN clause for single FK, OR of AND clauses for composite FK."
  [fk parent-rows]
  (if (= 1 (count fk))
    (let [[fk-col pk-col] (first fk)
          parent-values (map #(get % pk-col) parent-rows)]
      [:in (keyword fk-col) parent-values])
    (into [:or]
          (for [parent parent-rows]
            (into [:and]
                  (for [[fk-col pk-col] fk]
                    [:= (keyword fk-col) (get parent pk-col)]))))))

(defn- lookup-children-in-db
  "Find child rows that reference the given parent rows via FK relationships"
  [relationship parent-rows database-id]
  (let [{:keys [table-id table-name fk pk]} relationship]
    (when (seq parent-rows)
      (let [driver       (driver.u/database->driver database-id)
            where-clause (build-fk-filter-clause-hsql fk parent-rows)
            query        {:select (map keyword pk)
                          :from   [(keyword table-name)]
                          :where  where-clause
                          :limit  1000}] ; Safety limit
        (with-jdbc-transaction [conn database-id]
          [table-id
           (query-rows driver conn table-id query)])))))

(defn- delete-row-with-children!
  "Delete rows and all their descendants via FK relationships"
  [database-id table-id row]
  (let [metadata    (build-fk-metadata database-id)
        children-fn (fn [relationship parent-rows]
                      (lookup-children-in-db relationship parent-rows database-id))
        delete-fn   (fn [items-by-table]
                      (doseq [[table-id rows] (reverse items-by-table)]
                        (log/debugf "Cascade deleting %d rows of table %d" (count rows) table-id)
                        (let [rows-deleted (delete-rows-by-pk! database-id table-id rows)]
                          (log/debugf "Deleted %d rows of table %d" rows-deleted table-id))))
        table-pks   (keys (table-id->pk-field-name->id database-id table-id))
        row-pk      (select-keys row table-pks)]
    (actions/delete-recursively table-id [row-pk] metadata children-fn delete-fn :max-queries 50)))

(defn- count-row-descendants
  [database-id table-id row]
  (let [metadata    (build-fk-metadata database-id)
        children-fn (fn [relationship parent-rows]
                      (lookup-children-in-db relationship parent-rows database-id))
        table-pks   (keys (table-id->pk-field-name->id database-id table-id))
        row-pk      (select-keys row table-pks)]
    (actions/count-descendants table-id [row-pk] metadata children-fn :max-queries 50)))

;;;; `:table.row/delete`

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

(defn- row-delete!*-with-children
  [_action database query]
  (let [table-id             (get-in query [:query :source-table])
        database-id          (:id database)
        driver               (:engine database)
        {:keys [from where]} (mbql-query->raw-hsql driver query)]
    (with-jdbc-transaction [conn database-id]
      (let [row-before (->> (prepare-query {:select [:*] :from from :where where} driver _action)
                            (query-rows driver conn table-id)
                            first)]
        (when-not row-before
          (throw (ex-info (tru "Sorry, the row you''re trying to delete doesn''t exist")
                          {:status-code 400})))
        (delete-row-with-children! database-id table-id row-before)
        {:table-id table-id
         :db-id    database-id
         :before   row-before
         :after    nil}))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :table.row/delete]
  [_action context inputs :- [:sequential ::table-row-input]]
  (let [table-id->pk-keys (u/for-map [table-id (distinct (map :table-id inputs))]
                            (let [database       (actions/cached-database-via-table-id table-id)
                                  field-name->id (table-id->pk-field-name->id (:id database) table-id)]
                              [table-id (keys field-name->id)]))
        [errors results] (batch-execution-by-table-id!
                          {:inputs        inputs
                           :row-action    :model.row/delete
                           :row-fn        (if (:delete-children actions/*params*) row-delete!*-with-children row-delete!*)
                           :validate-fn   (fn [database table-id rows]
                                            (let [pk-name->id (table-id->pk-field-name->id (:id database) table-id)]
                                              (check-consistent-row-keys rows)
                                              (check-rows-have-expected-columns-and-no-other-keys rows (keys pk-name->id))
                                              (check-unique-rows rows)))
                           :input-fn      (fn [{db-id :id} table-id row]
                                            {:database db-id
                                             :type     :query
                                             :query    {:source-table table-id
                                                        :filter       (row->mbql-filter-clause
                                                                       (table-id->pk-field-name->id db-id table-id) row)}})})]
    (when (seq errors)
      (throw (ex-info (tru "Error(s) deleting rows.")
                      {:status-code 400
                       :errors      errors
                       :results     results})))
    {:context (record-mutations context results)
     :outputs (for [{:keys [table-id before]} results]
                {:table-id table-id
                 :op       :deleted
                 :row      (select-keys before (table-id->pk-keys table-id))})}))

;;;; `bulk/update`

(mu/defn- check-row-has-all-pk-columns
  "Return a 400 if `row` doesn't have all the required PK columns."
  [row      :- ::lib.schema.actions/row
   pk-names :- [:set :string]]
  (doseq [pk-key pk-names
          :when  (not (contains? row pk-key))]
    (throw (ex-info (tru "Row is missing required primary key column. Required {0}; got {1}"
                         (pr-str (sort pk-names))
                         (pr-str (sort (keys row))))
                    {:row row :pk-names pk-names :status-code 400}))))

(mu/defn- check-row-has-some-non-pk-columns
  "Return a 400 if `row` doesn't have any non-PK columns to update."
  [row      :- ::lib.schema.actions/row
   pk-names :- [:set :string]]
  (let [non-pk-names (set/difference (set (keys row)) pk-names)]
    (when (empty? non-pk-names)
      (throw (ex-info (tru "Invalid update row map: no non-PK columns. Got {0}, all of which are PKs."
                           (pr-str (set (keys row))))
                      {:status-code 400
                       :row         row
                       :all-keys    (set (keys row))
                       :pk-names    pk-names})))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :table.row/update]
  [_action context inputs :- [:sequential ::table-row-input]]
  (let [[errors results]
        (batch-execution-by-table-id!
         {:inputs     inputs
          :row-action :model.row/update
          :row-fn     row-update!*
          :input-fn   (fn [database table-id row]
                        ;; We could optimize the worst case a bit by pre-validating all the rows.
                        ;; But in the happy case, this saves a bit of memory (and some lines of code).
                        (let [db-id            (:id database)
                              pk-name->id      (table-id->pk-field-name->id db-id table-id)
                              pk-names         (set (keys pk-name->id))
                              _                (check-row-has-all-pk-columns row pk-names)
                              _                (check-row-has-some-non-pk-columns row pk-names)
                              pk-column->value (select-keys row pk-names)]
                          {:database   db-id
                           :type       :query
                           :query      {:source-table table-id
                                        :filter       (row->mbql-filter-clause pk-name->id pk-column->value)}
                           :update-row (apply dissoc row pk-names)}))})]
    (when (seq errors)
      (throw (ex-info (tru "Error(s) updating rows.")
                      {:status-code 400
                       :errors      errors
                       :results     results})))
    {:context (record-mutations context results)
     :outputs (mapv (fn [{:keys [table-id after]}]
                      {:table-id table-id
                       :op       :updated
                       :row      after})
                    results)}))
