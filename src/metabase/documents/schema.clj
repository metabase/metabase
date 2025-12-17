(ns metabase.documents.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.util.malli.registry :as mr]))

(mr/def ::document
  "Schema for an instance of a `:model/Document`."
  [:map
   [:id ::lib.schema.id/document]])
