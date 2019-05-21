(ns metabase.query-processor.test-util
  "Utilities for writing Query Processor tests that test internal workings of the QP rather than end-to-end results,
  e.g. middleware tests."
  (:require [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private everything-store-database []
  (or (:database @@#'qp.store/*store*)
      (db/select-one (into [Database] qp.store/database-columns-to-fetch), :id (data/id))))

(s/defn ^:private everything-store-table [table-id :- (s/maybe su/IntGreaterThanZero)]
  (or (get-in @@#'qp.store/*store* [:tables table-id])
      (db/select-one (into [Table] qp.store/table-columns-to-fetch), :id table-id)))

(s/defn ^:private everything-store-field [field-id :- (s/maybe su/IntGreaterThanZero)]
  (or (get-in @@#'qp.store/*store* [:fields field-id])
      (db/select-one (into [Field] qp.store/field-columns-to-fetch), :id field-id)))

(defn do-with-everything-store
  "Impl for `with-everything-store`."
  [f]
  (with-redefs [qp.store/database everything-store-database
                qp.store/table    everything-store-table
                qp.store/field    everything-store-field]
    (qp.store/with-store
      (f))))

(defmacro with-everything-store
  "When testing a specific piece of middleware, you often need to load things into the QP store, but doing so can be
  tedious. This macro swaps out the normal QP store backend with one that fetches Tables and Fields from the DB
  on-demand, making tests a lot nicer to write.

  You still need to store the Database yourself, because the getter function takes no args; we don't know which DB
  you'd want to fetch."
  [& body]
  `(do-with-everything-store (fn [] ~@body)))

(defn store-contents []
  (let [store @@#'qp.store/*store*]
    (-> store
        (update :database :name)
        (update :tables (comp set (partial map :name) vals))
        (update :fields (fn [fields]
                          (set
                           (for [[_ {table-id :table_id, field-name :name}] fields]
                             [(get-in store [:tables table-id :name]) field-name])))))))
