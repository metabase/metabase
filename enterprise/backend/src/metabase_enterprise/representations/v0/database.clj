(ns metabase-enterprise.representations.v0.database
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'database' for this schema"}
   :v0/database])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the database, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the database"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the database contains"}
   :string])

(mr/def ::engine
  [:and
   {:description "Database engine type (postgres, mysql, h2, etc.)"}
   ::lib.schema.common/non-blank-string])

;;; ------------------------------------ Connection Details ------------------------------------

(mr/def ::connection-details
  [:map
   {:description "Connection parameters (without secrets)"}
   [:host {:optional true} :string]
   [:port {:optional true} :int]
   [:dbname {:optional true} :string]
   [:user {:optional true} :string]
   [:ssl {:optional true} :boolean]
   [:tunnel {:optional true} :boolean]
   [:warehouse {:optional true} :string] ;; For Snowflake/BigQuery
   [:project-id {:optional true} :string] ;; For BigQuery
   [:dataset-id {:optional true} :string] ;; For BigQuery
   [:region {:optional true} :string] ;; For cloud databases
   [:schema {:optional true} :string] ;; Default schema
   [:options {:optional true} :string] ;; Additional connection options
   ;; Note: passwords, keys, and other secrets should be provided separately
   ])

;;; ------------------------------------ Column Schema ------------------------------------

(mr/def ::column-type
  [:and
   {:description "Column data type"}
   ::lib.schema.common/non-blank-string])

(mr/def ::column
  [:map
   {:description "Column definition"}
   [:name ::lib.schema.common/non-blank-string]
   [:type ::column-type]
   [:description {:optional true} :string]
   [:nullable {:optional true} :boolean]
   [:pk {:optional true} :boolean] ;; Primary key
   [:fk {:optional true} :string] ;; Foreign key reference (table.column)
   ])

;;; ------------------------------------ Table Schema ------------------------------------

(mr/def ::table
  [:map
   {:description "Table definition"}
   [:name ::lib.schema.common/non-blank-string]
   [:description {:optional true} :string]
   [:columns [:sequential ::column]]])

;;; ------------------------------------ Schema (database schema, not Malli) ------------------------------------

(mr/def ::schema
  [:map
   {:description "Database schema definition (e.g., PUBLIC, dbo, etc.)"}
   [:name ::lib.schema.common/non-blank-string]
   [:tables [:sequential ::table]]])

;;; ------------------------------------ Main Database Schema ------------------------------------

(mr/def ::database
  [:map
   {:description "v0 schema for human-writable database representation"}
   [:type ::type]
   [:ref ::ref]
   [:name ::name]
   [:engine ::engine]
   [:description {:optional true} ::description]
   [:connection_details {:optional true} ::connection-details]
   [:schemas {:optional true} [:sequential ::schema]]])
