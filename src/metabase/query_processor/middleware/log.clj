(ns metabase.query-processor.middleware.log
  "Middleware for logging a query before it is processed.
   (Various other middleware functions log the query as well in different stages.)"
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.query-processor
             [interface :as i]
             [util :as qputil]]
            [metabase.util :as u]))

(defn- log-expanded-query* [query]
  (u/prog1 query
    (when (and (qputil/mbql-query? query)
               (not i/*disable-qp-logging*))
      (log/debug (u/format-color 'magenta "\nPREPROCESSED/EXPANDED: %s\n%s"
                   (u/emoji "😻")
                   (u/pprint-to-str
                    ;; Remove empty kv pairs because otherwise expanded query is HUGE
                    (walk/prewalk
                     (fn [f]
                       (if-not (map? f) f
                               (m/filter-vals identity (into {} f))))
                     ;; obscure DB details when logging. Just log the name of driver because we don't care about its properties
                     (-> query
                         (assoc-in [:database :details] (u/emoji "😋 ")) ; :yum:
                         (update :driver name)))))))))

(defn log-expanded-query
  "Middleware for logging a query after it is expanded, but before it is processed."
  [qp]
  (comp qp log-expanded-query*))


(defn- log-initial-query* [query]
  (u/prog1 query
    (when-not i/*disable-qp-logging*
      (log/debug (u/format-color 'blue "\nQUERY: %s\n%s"  (u/emoji "😎") (u/pprint-to-str query))))))


(defn log-initial-query
  "Middleware for logging a query when it is very first encountered, before it is expanded."
  [qp]
  (comp qp log-initial-query*))
