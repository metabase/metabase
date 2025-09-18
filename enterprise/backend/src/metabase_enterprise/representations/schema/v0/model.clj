(ns metabase-enterprise.representations.schema.v0.model
  "Schema for v0 of the human-writable model representation format.

   Models are reusable 'virtual tables' that serve as curated data sources
   for other questions. Unlike regular questions, models can define custom
   column metadata including display names, descriptions, and semantic types.

   Note: v0 is a theoretical work-in-progress and subject to change."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Column Schema Definitions ------------------------------------

(mr/def ::column-name
  [:and
   {:description "Column name as returned by the query"}
   ::lib.schema.common/non-blank-string])

(mr/def ::display-name
  [:and
   {:description "Human-friendly display name for the column"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column-description
  [:and
   {:description "Documentation explaining the column's meaning"}
   [:or
    :nil
    :string]])

(mr/def ::base-type
  [:and
   {:description "The actual data type of the column (e.g., Text, Integer, DateTime)"}
   ::lib.schema.common/non-blank-string])

(mr/def ::effective-type
  [:and
   {:description "How Metabase should treat this column (can override base_type)"}
   ::lib.schema.common/non-blank-string])

(mr/def ::semantic-type
  [:and
   {:description "Semantic meaning of the column (e.g., Email, Currency, Entity Key)"}
   ::lib.schema.common/non-blank-string])

(mr/def ::visibility
  [:enum
   {:description "Column visibility setting"}
   "normal" "sensitive" "retired" "hidden"])

(mr/def ::currency
  [:and
   {:description "Currency code for financial columns (e.g., USD, EUR)"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column
  [:map
   {:description "Column metadata definition"}
   [:name ::column-name]
   [:display_name {:optional true} ::display-name]
   [:description {:optional true} ::column-description]
   [:base_type {:optional true} ::base-type]
   [:effective_type {:optional true} ::effective-type]
   [:semantic_type {:optional true} ::semantic-type]
   [:visibility {:optional true} ::visibility]
   [:currency {:optional true} ::currency]])

(mr/def ::columns
  [:sequential
   {:description "Array of column metadata definitions"}
   ::column])

;;; ------------------------------------ Main Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'model' or 'vX/model'"}
   :model :v0/model])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the model, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the model"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the model represents"}
   [:or :nil :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query that defines the model's data"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query that defines the model's data"}
   any?])

(mr/def ::database
  [:and
   {:description "Name or ref of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the model"}
   any?])

;;; ------------------------------------ Main Model Schema ------------------------------------

(mr/def ::model
  [:and
   [:map
    {:description "v0 schema for human-writable model representation"}
    [:type ::type]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:columns {:optional true} ::columns]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])
