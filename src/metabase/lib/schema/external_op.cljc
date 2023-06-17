(ns metabase.lib.schema.external-op
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::external-op
  [:map
   [:lib/type [:= :lib/external-op]]
   [:operator :keyword]
   [:args {:optional true} [:sequential :any]]])
