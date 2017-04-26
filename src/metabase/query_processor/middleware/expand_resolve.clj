(ns metabase.query-processor.middleware.expand-resolve
  "Middleware for converting a MBQL query into an 'expanded' form that contains additional information needed by drivers for running queries,
   and resolving various referenced Fields and Tables."
  (:require [metabase.models.database :refer [Database]]
            [metabase.query-processor
             [expand :as expand]
             [resolve :as resolve]
             [util :as qputil]]
            [toucan.db :as db]))

(def ^{:arglists '([query])} expand-and-resolve
  "Expand and resolve a QUERY.
   (This function is *not* middleware; use `expand-resolve` for that purpose. This is provided for cases where we want to return the expanded/resolved
   query in error messages)."
  (comp resolve/resolve expand/expand))

(defn- expand-resolve*
  [{database-id :database, :as query}]
  (let [resolved-db (db/select-one [Database :name :id :engine :details], :id database-id)
        query       (if-not (qputil/mbql-query? query)
                      query
                      (expand-and-resolve query))]
    (assoc query :database resolved-db)))

(defn expand-resolve
  "Middleware that transforms an MBQL into an expanded form with more information and structure. Also resolves references to fields, tables,
   etc, into their concrete details which are necessary for query formation by the executing driver."
  [qp]
  (comp qp expand-resolve*))
