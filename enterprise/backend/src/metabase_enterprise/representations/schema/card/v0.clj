(ns metabase-enterprise.representations.schema.card.v0
  "Schema for v0 of the human-writable card representation format.
   
   Note: v0 is a theoretical work-in-progress and subject to change."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'card' for this schema"}
   :card])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the card, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the card"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the card does"}
   ::lib.schema.common/non-blank-string])

(mr/def ::sql-query
  [:and
   {:description "Native SQL query to execute"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query to execute"}
   ::lib.schema.common/non-blank-string])

(mr/def ::database
  [:and
   {:description "Name of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the card"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::card-v0
  [:and
   [:map
    {:description "v0 schema for human-writable card representation"}
    [:type ::type]
    [:ref ::ref]
    [:name ::name]
    [:description ::description]
    [:database ::database]
    [:sql_query {:optional true} ::sql-query]
    [:mbql_query {:optional true} ::mbql-query]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :sql_query or :mbql_query"}
    (fn [{:keys [sql_query mbql_query]}]
      (= 1 (count (filter some? [sql_query mbql_query]))))]])