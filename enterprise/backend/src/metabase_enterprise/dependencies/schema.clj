(ns metabase-enterprise.dependencies.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]))

(mr/def ::upstream-deps
  [:map
   [:card      {:optional true} [:set ::lib.schema.id/card]]
   [:table     {:optional true} [:set ::lib.schema.id/table]]
   [:snippet   {:optional true} [:set ::lib.schema.id/snippet]]
   [:transform {:optional true} [:set ::lib.schema.id/transform]]])
