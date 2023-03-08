(ns metabase.query-processor.test-util
  "Utilities for writing Query Processor tests that test internal workings of the QP rather than end-to-end results,
  e.g. middleware tests.

  The various QP Store functions & macros in this namespace are primarily meant to help write QP Middleware tests, so
  you can test a given piece of middleware without having to worry about putting things in the QP Store
  yourself (since this is usually done by other middleware in the first place).

  TODO - I don't think we different QP test util namespaces? We should roll this namespace
  into [[metabase.query-processor-test]]."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-implicit-joins
    :as qp.add-implicit-joins]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.store.interface :as qp.store.interface]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan.db :as db]
   [toucan2.core :as t2]))

(defn- everything-store-database [parent-store]
  (or (qp.store.interface/database parent-store)
      (let [db (data/db)]
        (qp.store.interface/store-database! parent-store db)
        db)))

(defn- check-everything-store-database [store]
  (assert (= (:id (qp.store.interface/database store)) (data/id))
          (str "with-everything-store currently does not support switching drivers."
               \newline
               "Make sure you call with-driver *before* with-everything-store.")))

(defn- everything-store-table [parent-store table-id]
  (check-everything-store-database parent-store)
  (or (qp.store.interface/table parent-store table-id)
      (let [table (t2/select-one Table table-id)]
        (qp.store.interface/store-table! parent-store table)
        table)))

(defn- everything-store-tables [cache]
  (or (:tables @cache)
      (let [tables (db/select Table :db_id (data/id))]
        (swap! cache assoc :tables tables)
        tables)))

(defn- everything-store-field [parent-store field-id]
  (check-everything-store-database parent-store)
  (or (qp.store.interface/field parent-store field-id)
      (let [field (t2/select-one Field field-id)]
        (qp.store.interface/store-field! parent-store field-id)
        field)))

(defn- everything-store-fields [cache]
  (or (:fields @cache)
      (let [fields (t2/select
                    Field
                    {:select    (for [column-kw qp.store.interface/field-columns-to-fetch]
                                  [(keyword (str "field." (name column-kw)))
                                   column-kw])
                     :from      [[:metabase_field :field]]
                     :left-join [[:metabase_table :table] [:= :field.table_id :table.id]]
                     :where     [:= :table.db_id (data/id)]})]
        (swap! cache assoc :fields fields)
        fields)))

;;; The EverythingStore just wraps a different store and ensures methods like `table`, `field`, and `database` always
;;; return something, even if it wasn't stored in the store, to prevent the QP store from throwing errors to facilitate
;;; testing.
(p/defrecord+ EverythingStore [parent-store cache]
  qp.store.interface/QPStore
  (database [_this]
    (everything-store-database parent-store))
  (store-database! [_this database]
    (qp.store.interface/store-database! parent-store database))
  (tables [_this]
    (everything-store-tables cache))
  (table [_this table-id]
    (everything-store-table parent-store table-id))
  (store-table! [_this table]
    (qp.store.interface/store-table! parent-store table))
  (fields [_this]
    (everything-store-fields cache))
  (field [_this field-id]
    (everything-store-field parent-store field-id))
  (store-field! [_this field]
    (qp.store.interface/store-field! parent-store field))
  (misc-value [_this ks not-found]
    (qp.store.interface/misc-value parent-store ks not-found))
  (store-misc-value! [_this ks new-value]
    (qp.store.interface/store-misc-value! parent-store ks new-value))

  pretty/PrettyPrintable
  (pretty [_this]
    (list `->EverythingStore parent-store)))

(def ^:dynamic ^:private *already-have-everything-store?* false)

(defn do-with-everything-store
  "Impl for [[with-everything-store]]."
  [thunk]
  (if *already-have-everything-store?*
    (thunk)
    (binding [*already-have-everything-store?* true]
      (qp.store/with-store
        (binding [qp.store/*store* (->EverythingStore qp.store/*store* (atom {}))]
          (qp.store.interface/store-database! qp.store/*store* (data/db))
          (thunk))))))

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
                             [(get-in store [:tables table-id :name]) field-name]))))
        (dissoc :misc))))

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
  (#'qp.add-implicit-joins/join-alias
   (db/select-one-field :name Table :id (u/the-id table-or-id))
   (db/select-one-field :name Field :id (u/the-id field-or-id))))


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
