(ns representations.schema.v0.document
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::display-name
  [:and
   {:description "Human-readable name for the document"}
   ::mc/non-blank-string])

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

(mr/def ::document
  [:merge
   ::representation/representation
   [:map
    {:closed true
     :description "v0 schema for human-writable document representation"}
    [:display_name ::display-name]
    [:content_type ::content-type]
    [:content ::content]
    [:collection {:optional true} ::collection]]])

(defmethod read-impl/representation->schema [:v0 :document] [_] ::document)
