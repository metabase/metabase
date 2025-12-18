(ns metabase.documents.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::document
  "Schema for an instance of a `:model/Document`."
  [:map
   [:id ::lib.schema.id/document]])
