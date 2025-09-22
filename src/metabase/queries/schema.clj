(ns metabase.queries.schema
  (:require
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(mr/def ::card-type
  [:ref ::lib.schema.metadata/card.type])
