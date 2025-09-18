(ns metabase-enterprise.representations.schema.v0.question
  "Schema for v0 of the human-writable question representation format.

   Note: v0 is a theoretical work-in-progress and subject to change."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Type must be 'question'"}
   :v0/question])

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
   [:or
    :nil
    :string]])

(mr/def ::query
  [:and
   {:description "Native SQL query to execute"}
   ::lib.schema.common/non-blank-string])

(mr/def ::mbql-query
  [:and
   {:description "MBQL (Metabase Query Language) query to execute"}
   any?])

(mr/def ::database
  [:and
   {:description "Name of the database to run the query against"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the card"}
   any?])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::question
  [:and
   [:map
    {:description "v0 schema for human-writable question representation"}
    [:type ::type]
    [:ref ::ref]
    [:name {:optional true} ::name]
    [:description {:optional true} ::description]
    [:database ::database]
    [:query {:optional true} ::query]
    [:mbql_query {:optional true} ::mbql-query]
    [:collection {:optional true} ::collection]]
   [:fn {:error/message "Must have exactly one of :query or :mbql_query"}
    (fn [{:keys [query mbql_query]}]
      (= 1 (count (filter some? [query mbql_query]))))]])
