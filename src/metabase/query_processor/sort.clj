(ns metabase.query-processor.sort
  "Code for determining the order columns should be returned in from query results."
  (:require [clojure.tools.logging :as log]
            [metabase.query-processor.interface :as i]
            [metabase.util :as u]))

;; Fields should be returned in the following order:
;; 1.  Breakout Fields
;;
;; 2.  Aggregation Fields (e.g. sum, count)
;;
;; 3.  Fields clause Fields, if they were added explicitly
;;
;; 4.  All other Fields, sorted by:
;;     A.  :position (ascending)
;;         Users can manually specify default Field ordering for a Table in the Metadata admin. In that case, return Fields in the specified
;;         order; most of the time they'll have the default value of 0, in which case we'll compare...
;;
;;     B.  :special_type "group" -- :id Fields, then :name Fields, then everyting else
;;         Attempt to put the most relevant Fields first. Order the Fields as follows:
;;         1.  :id Fields
;;         2.  :name Fields
;;         3.  all other Fields
;;
;;     C.  Field Name
;;         When two Fields have the same :position and :special_type "group", fall back to sorting Fields alphabetically by name.
;;         This is arbitrary, but it makes the QP deterministic by keeping the results in a consistent order, which makes it testable.

;;; ## Field Sorting

;; We sort Fields with a "importance" vector like [source-importance position special-type-importance name]

(defn- source-importance-fn
  "Create a function to return a importance for FIELD based on its source clause in the query.
   e.g. if a Field comes from a `:breakout` clause, we should return that column first in the results."
  [{:keys [fields-is-implicit]}]
  (fn [{:keys [source]}]
    (cond
      (= source :breakout)          :0-breakout
      (= source :aggregation)       :1-aggregation
      (and (not fields-is-implicit)
           (= source :fields))      :2-fields
      :else                         :3-other)))

(defn- special-type-importance
  "Return a importance for FIELD based on the relative importance of its `:special-type`.
   i.e. a Field with special type `:id` should be sorted ahead of all other Fields in the results."
  [{:keys [special-type]}]
  (cond
    (isa? special-type :type/PK)   :0-id
    (isa? special-type :type/Name) :1-name
    :else                          :2-other))

(defn- field-importance-fn
  "Create a function to return an \"importance\" vector for use in sorting FIELD."
  [query]
  (let [source-importance (source-importance-fn query)]
    (fn [{:keys [position clause-position field-name source], :as field}]
      [(source-importance field)
       (or position
           (when (contains? #{:fields :breakout} source)
             clause-position)
           Integer/MAX_VALUE)
       (special-type-importance field)
       field-name])))

(defn sort-fields
  "Sort FIELDS by their \"importance\" vectors."
  [query fields]
  (let [field-importance (field-importance-fn query)]
    (when-not i/*disable-qp-logging*
      (log/debug (u/format-color 'yellow "Sorted fields:\n%s" (u/pprint-to-str (sort (map field-importance fields))))))
    (sort-by field-importance fields)))
