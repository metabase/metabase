(ns metabase.query-processor.middleware.log
  "Middleware for logging a query before it is processed.
   (Various other middleware functions log the query as well in different stages.)"
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u]))

(defn- log-initial-query* [query]
  (u/prog1 query
    (when-not i/*disable-qp-logging*
      (log/debug (u/format-color 'blue "\nQUERY: %s\n%s"  (u/emoji "😎") (u/pprint-to-str query))))))


(defn log-initial-query
  "Middleware for logging a query when it is very first encountered, before it is expanded."
  [qp]
  (comp qp log-initial-query*))


(defn- log-results-metadata* [results]
  (u/prog1 results
    (when-not i/*disable-qp-logging*
      (log/debug "Result Metadata:\n"
                 (u/pprint-to-str 'blue (for [col (get-in <> [:data :cols])]
                                          (m/filter-vals (complement nil?) col)))))))

(defn log-results-metadata
  "Middleware that logs the column metadata that comes back with the results."
  [qp]
  (comp log-results-metadata* qp))
