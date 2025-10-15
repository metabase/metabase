(ns metabase.images.schema
  (:require
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.util.malli.registry :as mr]))

(mr/def ::id
  pos-int?)

(mr/def ::image
  [:map
   [:id         ::id]
   [:url        :string]
   [:title      [:maybe :string]]
   [:created_at {:optional true} ::lib.schema.literal/datetime]])
