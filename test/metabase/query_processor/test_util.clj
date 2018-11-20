(ns metabase.query-processor.test-util
  "Utilities for writing Query Processor tests that test internal workings of the QP rather than end-to-end results,
  e.g. middleware tests."
  (:require [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.store :as qp.store]
            [toucan.db :as db]))

(defn do-with-everything-store
  "Impl for `with-everything-store`."
  [f]
  (with-redefs [qp.store/table (fn [table-id]
                                 (or (get-in @@#'qp.store/*store* [:tables table-id])
                                     (db/select-one (vec (cons Table qp.store/table-columns-to-fetch)), :id table-id)))
                qp.store/field (fn [field-id]
                                 (or (get-in @@#'qp.store/*store* [:fields field-id])
                                     (db/select-one (vec (cons Field qp.store/field-columns-to-fetch)), :id field-id)))]
    (qp.store/with-store
      (f))))

(defmacro with-everything-store
  "When testing a specific piece of middleware, you often need to load things into the QP store, but doing so can be
  tedious. This macro swaps out the normal QP store backend with one that fetches Tables and Fields from the DB
  on-demand, making tests a lot nicer to write."
  [& body]
  `(do-with-everything-store (fn [] ~@body)))
