(ns metabase-enterprise.representations.v0.snippet
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'snippet' for this schema"}
   :v0/snippet])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the snippet, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Globally unique name for the snippet, used in {{snippet:name}} references"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the snippet does"}
   ::lib.schema.common/non-blank-string])

(mr/def ::sql
  [:and
   {:description "SQL code that can include {{param}} template tags for parameters"}
   ::lib.schema.common/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the snippet"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::snippet
  [:map
   {:description "v0 schema for human-writable SQL snippet representation"}
   [:type ::type]
   [:ref ::ref]
   [:name ::name]
   [:description ::description]
   [:sql ::sql]
   [:collection {:optional true} ::collection]])
