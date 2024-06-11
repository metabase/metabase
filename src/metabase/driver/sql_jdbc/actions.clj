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
   [metabase.util.malli.registry :as mr])
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
    ;; catch errors in the query
    (qp.preprocess/preprocess query)
    (sql.qp/mbql->honeysql driver query)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Action Execution                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+


(defmulti base-type->sql-type-map
  "Return a map of [[metabase.types]] type to SQL string type name. Used for casting. Looks like we're just copypasting
  this from implementations of [[metabase.test.data.sql/field-base-type->sql-type]] so go find that stuff if you need
  to write more implementations for this."
  {:changelog-test/ignore true, :arglists '([driver]), :added "0.44.0"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(mu/defn ^:private cast-values :- ::lib.schema.actions/row
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
  `action` is a keyword like `:row/create` or `:bulk/create`; `hsql-query` is a generic
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

(defmethod actions/perform-action!* [:sql-jdbc :row/delete]
  [driver action database {database-id :database, :as query}]
  (let [raw-hsql    (mbql-query->raw-hsql driver query)
        delete-hsql (-> raw-hsql
                        (dissoc :select)
                        (assoc :delete [])
                        (prepare-query driver action))
        sql-args    (sql.qp/format-honeysql driver delete-hsql)]
    (with-jdbc-transaction [conn database-id]
      ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
      (let [rows-deleted (with-auto-parse-sql-exception driver database action
                           (first (jdbc/execute! {:connection conn} sql-args {:transaction? false})))]
        (when-not (= rows-deleted 1)
          (throw (ex-info (if (zero? rows-deleted)
                            (tru "Sorry, the row you''re trying to delete doesn''t exist")
                            (tru "Sorry, this would delete {0} rows, but you can only act on 1" rows-deleted))
                          {:staus-code 400})))
        {:rows-deleted [1]}))))

(defmethod actions/perform-action!* [:sql-jdbc :row/update]
  [driver action database {database-id :database :keys [update-row] :as query}]
  (let [raw-hsql     (mbql-query->raw-hsql driver query)
        target-table (first (:from raw-hsql))
        update-hsql  (-> raw-hsql
                         (select-keys [:where])
                         (assoc :update target-table
                                :set (cast-values driver update-row database-id (get-in query [:query :source-table])))
                         (prepare-query driver action))
        sql-args     (sql.qp/format-honeysql driver update-hsql)]
    (with-jdbc-transaction [conn database-id]
      ;; TODO -- this should probably be using [[metabase.driver/execute-write-query!]]
      (let [rows-updated (with-auto-parse-sql-exception driver database action
                           (first (jdbc/execute! {:connection conn} sql-args {:transaction? false})))]
        (when-not (= rows-updated 1)
          (throw (ex-info (if (zero? rows-updated)
                            (tru "Sorry, the row you''re trying to update doesn''t exist")
                            (tru "Sorry, this would update {0} rows, but you can only act on 1" rows-updated))
                          {:staus-code 400})))
        {:rows-updated [1]}))))

(defmulti select-created-row
  "Multimethod for converting the result of an insert into the created row.
  `create-hsql` is the honeysql query used to insert the new row,
  `conn` is the DB connection used to insert the new row and
  `result` is the value returned by the insert command."
  {:changelog-test/ignore true, :arglists '([driver create-hsql conn result]), :added "0.46.0"}
  (fn [driver _ _ _]
    (driver/dispatch-on-initialized-driver driver))
  :hierarchy #'driver/hierarchy)

(mr/def ::created-row
  [:map-of :string :any])

;;; H2 and MySQL are dumb and `RETURN_GENERATED_KEYS` only returns the ID of
;;; the newly created row. This function will `SELECT` the newly created row
;;; assuming that `result` is a map from column names to the generated values.
(mu/defmethod select-created-row :default :- [:maybe ::created-row]
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
    (first (jdbc/query {:connection conn} select-sql-args {:identifiers identity, :transaction? false, :keywordize? false}))))

(mu/defmethod actions/perform-action!* [:sql-jdbc :row/create] :- [:map [:created-row [:maybe ::created-row]]]
  [driver
   action
   database
   {database-id :database :keys [create-row] :as query} :- ::mbql.s/Query]
  (let [raw-hsql    (mbql-query->raw-hsql driver query)
        create-hsql (-> raw-hsql
                        (assoc :insert-into (first (:from raw-hsql)))
                        (assoc :values [(cast-values driver create-row database-id (get-in query [:query :source-table]))])
                        (dissoc :select :from)
                        (prepare-query driver action))
        sql-args    (sql.qp/format-honeysql driver create-hsql)]
    (log/tracef ":row/create HoneySQL:\n\n%s" (u/pprint-to-str create-hsql))
    (log/tracef ":row/create SQL + args:\n\n%s" (u/pprint-to-str sql-args))
    (with-jdbc-transaction [conn database-id]
      (let [result (with-auto-parse-sql-exception driver database action
                     (jdbc/execute! {:connection conn} sql-args {:return-keys  true
                                                                 :identifiers  identity
                                                                 :transaction? false
                                                                 :keywordize?  false}))
            _      (log/tracef ":row/create INSERT returned\n\n%s" (u/pprint-to-str result))
            row    (select-created-row driver create-hsql conn result)]
        (log/tracef ":row/create returned row %s" (pr-str row))
        {:created-row row}))))

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
  {:changelog-test/ignore true :arglists '([driver ^java.sql.Connection connection thunk]), :added "0.44.0"}
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

;;;; `:bulk/create`

(mu/defmethod actions/perform-action!* [:sql-jdbc :bulk/create]
  [driver                  :- :keyword
   _action
   database                :- [:map
                               [:id ::lib.schema.id/database]]
   {:keys [table-id rows]} :- [:map
                               [:table-id ::lib.schema.id/table]
                               [:rows     [:sequential ::lib.schema.actions/row]]]]
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

(mu/defn ^:private table-id->pk-field-name->id :- [:map-of ::lib.schema.common/non-blank-string ::lib.schema.id/field]
  "Given a `table-id` return a map of string Field name -> Field ID for the primary key columns for that Table."
  [database-id :- ::lib.schema.id/database
   table-id    :- ::lib.schema.id/table]
  (into {}
        (comp (filter (fn [{:keys [semantic-type], :as _field}]
                        (isa? semantic-type :type/PK)))
              (map (juxt :name :id)))
        (qp.store/with-metadata-provider database-id
          (lib.metadata.protocols/fields
           (qp.store/metadata-provider)
           table-id))))

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
  (let [pk-name->id (table-id->pk-field-name->id database-id table-id)]
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

(mu/defn ^:private check-row-has-all-pk-columns
  "Return a 400 if `row` doesn't have all the required PK columns."
  [row      :- ::lib.schema.actions/row
   pk-names :- [:set :string]]
  (doseq [pk-key pk-names
          :when  (not (contains? row pk-key))]
    (throw (ex-info (tru "Row is missing required primary key column. Required {0}; got {1}"
                         (pr-str pk-names)
                         (pr-str (set (keys row))))
                    {:row row, :pk-names pk-names, :status-code 400}))))

(mu/defn ^:private check-row-has-some-non-pk-columns
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

(defn- bulk-update-row-xform
  "Create a function to use to transform each row coming in to a `:bulk/update` request into an MBQL query that can be
  passed to `:row/update`."
  [{database-id :id, :as _database} table-id]
  ;; TODO -- make sure all rows specify the PK columns
  (let [pk-name->id (table-id->pk-field-name->id database-id table-id)
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
