(ns metabase.query-processor.middleware.resolve-source-table
  "TODO - maybe rename this `resolve-source-table` so it matches the other ones"
  (:require [metabase.mbql.util :as mbql.u]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn- resolve-source-table* [query]
  (when-let [source-table-id (mbql.u/query->source-table-id query)]
    (let [source-table (or (db/select-one (vec (cons Table qp.store/table-columns-to-fetch)), :id source-table-id)
                           (throw (Exception. (str (trs "Cannot run query: could not find source table {0}."
                                                        source-table-id)))))]
      (qp.store/store-table! source-table)))
  query)

(defn resolve-source-table
  "Middleware that will take the source-table (an integer) and hydrate that source table from the the database and
  attach it as `:source-table`"
  [qp]
  (comp qp resolve-source-table*))
