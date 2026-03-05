(ns metabase.lib-be.schema.source-swap
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::source-type
  [:enum :table :card])

(mr/def ::source-id
  [:or ::lib.schema.id/table ::lib.schema.id/card])

(mr/def ::source
  [:tuple ::source-type ::source-id])

(mr/def ::source-error
  [:enum :database-mismatch
   :cycle-detected])

(mr/def ::column-error
  [:enum :column-type-mismatch
   :missing-primary-key
   :extra-primary-key
   :missing-foreign-key
   :foreign-key-mismatch])

(mr/def ::column-mapping
  [:map
   [:source {:optional true} ::lib.schema.metadata/column]
   [:target {:optional true} ::lib.schema.metadata/column]
   [:errors {:optional true} [:sequential ::column-error]]])
