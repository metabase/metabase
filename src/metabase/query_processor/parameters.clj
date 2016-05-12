(ns metabase.query-processor.parameters
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]))

(defn- merge-filter-clauses [base addtl]
  (cond
    (and (seq base)
         (seq addtl)) ["AND" base addtl]
    (seq base)        base
    (seq addtl)       addtl
    :else             []))

(defn- expand-params [query-dict [{:keys [field value], :as param} & rest]]
  (if param
    ;; NOTE: we always use a simple equals filter for parameters
    (if (and param field value)
      (let [filter-subclause ["=" field value]
            _                (log/info "adding parameter clause: " filter-subclause)
            query            (assoc-in query-dict [:query :filter] (merge-filter-clauses (get-in query-dict [:query :filter]) filter-subclause))]
        (expand-params query rest))
      (expand-params query-dict rest))
    query-dict))

(defn expand-parameters
  "Expand any :parameters set on the QUERY-DICT."
  [{:keys [parameters], :as query-dict}]
  (let [query (dissoc query-dict :parameters)]
    (if-not parameters
      query
      (expand-params query parameters))))
