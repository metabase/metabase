(ns metabase.lib.schema.aggregation
  (:require [metabase.util.malli.registry :as mr]))

(mr/def ::aggregation
  [:fn any?])
