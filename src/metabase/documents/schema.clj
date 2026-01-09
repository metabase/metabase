(ns metabase.documents.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::document.id
  "Valid Document ID"
  pos-int?)

(mr/def ::document
  "Schema for an instance of a `:model/Document`."
  [:map
   [:id ::document.id]])
