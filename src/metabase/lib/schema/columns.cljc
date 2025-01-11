(ns metabase.lib.schema.columns
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(mr/def ::columns-map
  [:map-of
   [:string {:decode/normalize lib.schema.common/normalize-string-key}]
   [:ref ::lib.schema.metadata/column]])

(mr/def ::nested-columns-maps
  [:map-of
   [:string {:decode/normalize lib.schema.common/normalize-string-key}]
   ::columns-map])
