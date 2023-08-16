(ns metabase.query-processor.test-util
  "Utilities for writing Query Processor tests that test internal workings of the QP rather than end-to-end results,
  e.g. middleware tests.

  The various QP Store functions & macros in this namespace are primarily meant to help write QP Middleware tests, so
  you can test a given piece of middleware without having to worry about putting things in the QP Store
  yourself (since this is usually done by other middleware in the first place)."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test.data :as data]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

;; TODO - I don't think we different QP test util namespaces? We should roll this namespace into
;; `metabase.query-processor-test`

(def ^:dynamic ^:private *already-have-everything-store?* false)

(defn ^:deprecated do-with-everything-store
  "Impl for [[with-everything-store]].

  DEPRECATED: use [[qp.store/with-metadata-provider]] instead."
  [thunk]
  (if *already-have-everything-store?*
    (thunk)
    (binding [*already-have-everything-store?* true]
      (qp.store/with-metadata-provider (data/id)
        (thunk)))))

(defmacro ^:deprecated with-everything-store
  "When testing a specific piece of middleware, you often need to load things into the QP Store, but doing so can be
  tedious. This macro swaps out the normal QP Store backend with one that fetches Tables and Fields from the DB
  on-demand, making tests a lot nicer to write.

  When fetching the database, this assumes you're using the 'current' database bound to `(data/db)`, so be sure to use
  `data/with-db` if needed.

  DEPRECATED: use [[qp.store/with-metadata-provider]] instead."
  [& body]
  #_{:clj-kondo/ignore [:deprecated-var]}
  `(do-with-everything-store (^:once fn* [] ~@body)))

(defn store-contents
  "Fetch the names of all the objects currently in the QP Store."
  []
  (let [provider  (qp.store/metadata-provider)
        table-ids (t2/select-pks-set :model/Table :db_id (data/id))]
    {:tables (into #{}
                   (keep (fn [table-id]
                           (:name (lib.metadata.protocols/cached-metadata provider :metadata/table table-id))))
                   table-ids)
     :fields (into #{}
                   (keep (fn [field-id]
                           (when-let [field (lib.metadata.protocols/cached-metadata provider :metadata/column field-id)]
                             (let [table (lib.metadata.protocols/cached-metadata provider :metadata/table (:table-id field))]
                               [(:name table) (:name field)]))))
                   (t2/select-pks-set :model/Field :table_id [:in table-ids]))}))

(defn card-with-source-metadata-for-query
  "Given an MBQL `query`, return the relevant keys for creating a Card with that query and matching `:result_metadata`.

    (t2.with-temp/with-temp [Card card (qp.test-util/card-with-source-metadata-for-query
                                        (data/mbql-query venues {:aggregation [[:count]]}))]
      ...)"
  [query]
  (let [results  (qp/process-userland-query query)
        metadata (or (get-in results [:data :results_metadata :columns])
                     (throw (ex-info "Missing [:data :results_metadata :columns] from query results" results)))]
    {:dataset_query   query
     :result_metadata metadata}))


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
