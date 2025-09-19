(ns metabase-enterprise.representations.v0.collection
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'collection' for this schema"}
   :v0/collection])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the collection, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the collection"}
   ::lib.schema.common/non-blank-string])

(mr/def ::description
  [:and
   {:description "Optional documentation explaining the collection's purpose"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::collection
  [:map
   {:description "v0 schema for human-writable collection representation
                  Collections organize cards, dashboards, and other resources.
                  Every representations directory MUST have a collection.yml file."}
   [:type ::type]
   [:ref ::ref]
   [:name {:optional true} [:maybe ::name]]
   [:description {:optional true} [:maybe ::description]]])
