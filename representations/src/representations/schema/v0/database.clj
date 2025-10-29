(ns representations.schema.v0.database
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::display-name
  [:and
   {:description "Human-readable name for the database"}
   ::mc/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the database contains"}
   :string])

(mr/def ::engine
  [:and
   {:description "Database engine type (postgres, mysql, h2, etc.)"}
   ::mc/non-blank-string])

(mr/def ::connection-details
  [:map
   {:closed true
    :description "Connection parameters (without secrets)"}
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

(mr/def ::column-type
  [:and
   {:description "Column data type"}
   ::mc/non-blank-string])

(mr/def ::column
  [:map
   {:closed true
    :description "Column definition"}
   [:name ::mc/non-blank-string]
   [:type ::column-type]
   [:description {:optional true} :string]
   [:nullable {:optional true} :boolean]
   [:pk {:optional true} :boolean] ;; Primary key
   [:fk {:optional true} :string] ;; Foreign key reference (table.column)
   ])

(mr/def ::table
  [:map
   {:closed true
    :description "Table definition"}
   [:name ::mc/non-blank-string]
   [:description {:optional true} :string]
   [:columns [:sequential ::column]]])

(mr/def ::schema
  [:map
   {:closed true
    :description "Database schema definition (e.g., PUBLIC, dbo, etc.)"}
   [:name ::mc/non-blank-string]
   [:tables [:sequential ::table]]])

(mr/def ::database
  [:merge
   ::representation/representation
   [:map
    {:closed true
     :description "v0 schema for human-writable database representation"}
    [:display_name ::display-name]
    [:engine ::engine]
    [:description {:optional true} ::description]
    [:connection_details :any]
    [:schemas {:optional true} [:sequential ::schema]]]])

(defmethod read-impl/representation->schema [:v0 :database] [_] ::database)
