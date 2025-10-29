(ns representations.schema.v0.snippet
  (:require
   [representations.read.impl :as read-impl]
   [representations.schema.representation :as representation]
   [representations.util.malli.common :as mc]
   [representations.util.malli.registry :as mr]))

(mr/def ::display-name
  [:and
   {:description "Globally unique name for the snippet, used in {{snippet:name}} references"}
   ::mc/non-blank-string])

(mr/def ::description
  [:and
   {:description "Documentation explaining what the snippet does"}
   ::mc/non-blank-string])

(mr/def ::sql
  [:and
   {:description "SQL code that can include {{param}} template tags for parameters"}
   ::mc/non-blank-string])

(mr/def ::collection
  [:and
   {:description "Optional collection path for organizing the snippet"}
   :string])

(mr/def ::snippet
  [:merge
   ::representation/representation
   [:map
    {:closed true
     :description "v0 schema for human-writable SQL snippet representation"}
    [:display_name ::display-name]
    [:description [:maybe ::description]]
    [:sql ::sql]
    [:collection {:optional true} ::collection]
    [:template_tags :any]]])

(defmethod read-impl/representation->schema [:v0 :snippet] [_] ::snippet)
