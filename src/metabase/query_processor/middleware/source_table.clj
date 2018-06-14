(ns metabase.query-processor.middleware.source-table
  (:require [metabase.models.table :refer [Table]]
            [metabase.query-processor.util :as qputil]
            [toucan.db :as db]))

(defn- resolve-source-table
  [expanded-query-dict]
  (let [source-table-id (qputil/get-in-normalized expanded-query-dict [:query :source-table])]
    (cond
      (not (qputil/mbql-query? expanded-query-dict))
      expanded-query-dict

      (nil? source-table-id)
      (update-in expanded-query-dict [:query :source-query] (fn [source-query]
                                                              (if (:native source-query)
                                                                source-query
                                                                (:query (resolve-source-table (assoc expanded-query-dict :query source-query))))))

      :else
      (let [source-table (or (db/select-one [Table :schema :name :id], :id source-table-id)
                             (throw (Exception. (format "Query expansion failed: could not find source table %d." source-table-id))))]
        (assoc-in expanded-query-dict [:query :source-table] source-table)))))

(defn resolve-source-table-middleware
  "Middleware that will take the source-table (an integer) and hydrate
  that source table from the the database and attach it as
  `:source-table`"
  [qp]
  (comp qp resolve-source-table))
