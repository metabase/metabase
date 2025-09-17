(ns metabase-enterprise.representations.schema.v0.transform
  "Schema for v0 of the human-writable transform representation format.
   
   Note: v0 is a theoretical work-in-progress and subject to change."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'transform' for this schema"}
   :v0/transform])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the transform, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the transform"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining the transform's purpose"}
   ::lib.schema.common/non-blank-string])

(mr/def ::query
  [:and
   {:description "SQL query that performs the transformation"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query that performs the transformation"}
   ::lib.schema.common/non-blank-string])

(mr/def ::database
  [:and
   {:description "Name of the source/target database"}
   ::lib.schema.common/non-blank-string])

(mr/def ::target-table
  [:and
   {:description "Name of the destination table"}
   ::lib.schema.common/non-blank-string])

(mr/def ::target-schema
  [:and
   {:description "Database schema for the target table (e.g., 'public', 'reporting')"}
   ::lib.schema.common/non-blank-string])

(mr/def ::run-trigger
  [:enum {:decode/json keyword
          :description "Optional trigger for when to run the transform"}
   :manual :scheduled :on-change])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::transform
  [:and
   [:map
    {:description "v0 schema for human-writable transform representation"}
    [:type ::type]
    [:ref ::ref]
    [:name ::name]
    [:description ::description]
    [:database ::database]
    [:target_table ::target-table]
    [:target_schema ::target-schema]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:run_trigger {:optional true} ::run-trigger]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])
