(ns metabase.db.metadata-queries
  "Predefined QP queries for getting metadata about an external database."
  (:require [metabase.driver :as driver]
            [metabase.util :as u]))

;; TODO - These queries have to be evaluated by the query processor and macroexpanded at runtime every time they're ran.
;; It would be more efficient if we could let the QP could macroexpand normally for predefined queries like these

(defn- field-query [field query]
  (->> (driver/driver-process-query
        {:type :query
         :database ((u/deref-> field :table :db) :id)
         :query (assoc query
                       :source_table ((u/deref-> field :table) :id))})
       :data
       :rows))

(defn field-distinct-values
  "Return the distinct values of FIELD."
  [{field-id :id :as field}]
  (->> (field-query field {:aggregation ["rows"]  ; should we add a limit here? In case someone is dumb and tries to get millions of distinct values?
                           :breakout [field-id]}) ; or should we let them do it
       (map first)))

(defn field-distinct-count
  "Return the distinct count of FIELD."
  [{field-id :id :as field}]
  (->> (field-query field {:aggregation ["distinct" field-id]})
       first
       first))

(defn field-count
  "Return the count of FIELD."
  [{field-id :id :as field}]
  (->> (field-query field {:aggregation ["count" field-id]})
       first
       first))
