(ns metabase.images.schema
  (:require [metabase.util.malli.registry :as mr]
            [metabase.util.malli.schema :as ms]
            [metabase.lib.schema.common :as lib.schema.common]
            [metabase.lib.schema.literal :as lib.schema.literal]))

(mr/def ::id
  pos-int?)

(mr/def ::image
  [:map
   [:id         ::id]
   [:url        :string]
   [:title      :string]
   [:created-at {:optional true} ::lib.schema.literal/datetime]])
