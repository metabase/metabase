(ns metabase-enterprise.representations.schema.v0.document
  "Schema for v0 of the human-writable document representation format.
   
   Note: v0 is a theoretical work-in-progress and subject to change."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

;;; ------------------------------------ Schema Definitions ------------------------------------

(mr/def ::type
  [:enum {:decode/json keyword
          :description "Entity type, must be 'document' for this schema"}
   :v0/document])

(mr/def ::ref
  [:and
   {:description "Unique reference identifier for the document, used for cross-references"}
   ::lib.schema.common/non-blank-string
   [:re #"^[a-z0-9][a-z0-9-_]*$"]])

(mr/def ::name
  [:and
   {:description "Human-readable name for the document"}
   ::lib.schema.common/non-blank-string])

(mr/def ::content-type
  [:enum {:decode/json keyword
          :description "Format of the document content"}
   :markdown :html :text])

(mr/def ::content
  [:and
   {:description "The document content with optional embedded cards and links
                  Markdown format supports:
                  - {{card:card-ref}} for embedding cards
                  - [link text](card:card-ref) for linking to cards"}
   :string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the document"}
   :string])

;;; ------------------------------------ Main Schema ------------------------------------

(mr/def ::document
  [:map
   {:description "v0 schema for human-writable document representation"}
   [:type ::type]
   [:ref ::ref]
   [:name ::name]
   [:content_type ::content-type]
   [:content ::content]
   [:collection {:optional true} ::collection]])
