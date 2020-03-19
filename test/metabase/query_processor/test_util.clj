(ns metabase.query-processor.test-util
  "Utilities for writing Query Processor tests that test internal workings of the QP rather than end-to-end results,
  e.g. middleware tests.

  The various QP Store functions & macros in this namespace are primarily meant to help write QP Middleware tests, so
  you can test a given piece of middleware without having to worry about putting things in the QP Store
  yourself (since this is usually done by other middleware in the first place)."
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [util :as u]]
            [metabase.mbql.util :as mbql.u]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [metabase.query-processor.middleware.add-implicit-joins :as add-implicit-joins]
            [metabase.test.data :as data]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

;; TODO - I don't think we different QP test util namespaces? We should roll this namespace into
;; `metabase.query-processor-test`

(s/defn ^:private everything-store-table [table-id :- (s/maybe su/IntGreaterThanZero)]
  (assert (= (:id (qp.store/database)) (data/id))
    "with-everything-store currently does not support switching drivers. Make sure you call with-driver *before* with-everything-store.")
  (or (get-in @@#'qp.store/*store* [:tables table-id])
      (do
        (qp.store/fetch-and-store-tables! [table-id])
        (qp.store/table table-id))))

(s/defn ^:private everything-store-field [field-id :- (s/maybe su/IntGreaterThanZero)]
  (assert (= (:id (qp.store/database)) (data/id))
    "with-everything-store currently does not support switching drivers. Make sure you call with-driver *before* with-everything-store.")
  (or (get-in @@#'qp.store/*store* [:fields field-id])
      (do
        (qp.store/fetch-and-store-fields! [field-id])
        (qp.store/field field-id))))

(defn do-with-everything-store
  "Impl for `with-everything-store`."
  [f]
  (with-redefs [qp.store/table everything-store-table
                qp.store/field everything-store-field]
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (data/id))
      (f))))

(defmacro with-everything-store
  "When testing a specific piece of middleware, you often need to load things into the QP Store, but doing so can be
  tedious. This macro swaps out the normal QP Store backend with one that fetches Tables and Fields from the DB
  on-demand, making tests a lot nicer to write.

  When fetching the database, this assumes you're using the 'current' database bound to `(data/db)`, so be sure to use
  `data/with-db` if needed."
  [& body]
  `(do-with-everything-store (fn [] ~@body)))

(defn store-referenced-database!
  "Store the Database for a `query` in the QP Store."
  [{:keys [database]}]
  (qp.store/fetch-and-store-database! database))

(defn store-referenced-tables!
  "Store any Tables referenced in `query` in the QP Store."
  [query]
  (when-let [table-ids (seq
                        (flatten
                         (mbql.u/match query
                           (m :guard (every-pred map? (comp integer? :source-table)))
                           (cons (:source-table m)  (recur (dissoc m :source-table))))))]
    (qp.store/fetch-and-store-tables! table-ids)))

(defn store-referenced-fields!
  "Store any Fields referenced (by ID) in `query` in the QP Store."
  [query]
  (when-let [field-ids (seq (mbql.u/match query [:field-id id] id))]
    (qp.store/fetch-and-store-fields! field-ids)))

(defn store-contents
  "Fetch the names of all the objects currently in the QP Store."
  []
  (let [store @@#'qp.store/*store*]
    (-> store
        (update :database :name)
        (update :tables (comp set (partial map :name) vals))
        (update :fields (fn [fields]
                          (set
                           (for [[_ {table-id :table_id, field-name :name}] fields]
                             [(get-in store [:tables table-id :name]) field-name])))))))

(defn card-with-source-metadata-for-query
  "Given an MBQL `query`, return the relevant keys for creating a Card with that query and matching `:result_metadata`.

    (tt/with-temp Card [card (qp.test-util/card-with-source-metadata-for-query
                              (data/mbql-query venues {:aggregation [[:count]]}))]
      ...)"
  [query]
  (let [results  (qp/process-userland-query query)
        metadata (or (get-in results [:data :results_metadata :columns])
                     (throw (ex-info "Missing [:data :results_metadata :columns] from query results" results)))]
    {:dataset_query   query
     :result_metadata metadata}))

(defn fk-table-alias-name
  "Get the name that will be used for the alias for an implicit join (i.e., a join added as a result of using an `:fk->`
  clause somewhere in the query.)

    (fk-table-alias-name (data/id :categories) (data/id :venues :category_id)) ;; -> \"CATEGORIES__via__CATEGORY_ID\""
  [table-or-id field-or-id]
  (#'add-implicit-joins/join-alias
   (db/select-one-field :name Table :id (u/get-id table-or-id))
   (db/select-one-field :name Field :id (u/get-id field-or-id))))


;;; ------------------------------------------------- Timezone Stuff -------------------------------------------------

(defn do-with-report-timezone-id
  "Impl for `with-report-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  ;; This will fail if the app DB isn't initialized yet. That's fine — there's no DBs to notify if the app DB isn't
  ;; set up.
  (try
    (#'driver/notify-all-databases-updated)
    (catch Throwable _))
  (binding [qp.timezone/*report-timezone-id-override* (or timezone-id ::nil)]
    (testing (format "\nreport timezone id = %s" timezone-id)
      (thunk))))

(defmacro with-report-timezone-id
  "Override the `report-timezone` Setting and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-report-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-database-timezone-id
  "Impl for `with-database-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  (binding [qp.timezone/*database-timezone-id-override* (or timezone-id ::nil)]
    (testing (format "\ndatabase timezone id = %s" timezone-id)
      (thunk))))

(defmacro with-database-timezone-id
  "Override the database timezone ID and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-database-timezone-id ~timezone-id (fn [] ~@body)))

(defn do-with-results-timezone-id
  "Impl for `with-results-timezone-id`."
  [timezone-id thunk]
  {:pre [((some-fn nil? string?) timezone-id)]}
  (binding [qp.timezone/*results-timezone-id-override* (or timezone-id ::nil)]
    (testing (format "\nresults timezone id = %s" timezone-id)
      (thunk))))

(defmacro with-results-timezone-id
  "Override the determined results timezone ID and execute `body`. Intended primarily for REPL and test usage."
  [timezone-id & body]
  `(do-with-results-timezone-id ~timezone-id (fn [] ~@body)))
