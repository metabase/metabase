(ns metabase.db.metadata-queries
  "Predefined QP queries for getting metadata about an external database."
  (:require [metabase.driver :as driver]
            [metabase.driver.sync :as sync]
            [metabase.util :as u]))

(defn- field-query [field query]
  (-> (driver/process-query
       {:type     :query
        :database ((u/deref-> field :table :db) :id)
        :query    (assoc query
                         :source_table ((u/deref-> field :table) :id))})
      :data
      :rows))

(defn field-distinct-values
  "Return the distinct values of FIELD.
   This is used to create a `FieldValues` object for `:category` Fields."
  [{field-id :id :as field}]
  (mapv first (field-query field {:breakout [field-id]
                                  :limit    sync/low-cardinality-threshold})))

(defn field-distinct-count
  "Return the distinct count of FIELD."
  [{field-id :id :as field}]
  (-> (field-query field {:aggregation ["distinct" field-id]})
      first
      first))

(defn field-count
  "Return the count of FIELD."
  [{field-id :id :as field}]
  (-> (field-query field {:aggregation ["count" field-id]})
      first
      first))
