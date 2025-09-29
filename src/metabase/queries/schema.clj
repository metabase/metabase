(ns metabase.queries.schema
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(p/import-vars
 [lib.schema.metadata
  card-types])

(mr/def ::card-type
  ::lib.schema.metadata/card.type)

(mr/def ::empty-map
  "An empty map, allowed for Card.dataset_query for historic purposes."
  [:= {} {}])

(mr/def ::query
  "Schema for Card.dataset_query."
  [:multi {:dispatch (comp boolean empty?)}
   [true  ::empty-map]
   [false [:ref ::lib.schema/query]]])

;;; TODO (Cam 9/29/25) -- fill this out more, `:metabase.lib.schema.metadata/card` has a lot of stuff and there's also
;;; stuff sprinkled thruout this module
(mr/def ::card
  "Schema for an instance of a `:model/Card` (everything is optional to support updates)."
  [:map
   [:id            {:optional true} [:maybe ::lib.schema.id/card]]
   [:dataset_query {:optional true} [:maybe ::query]]
   [:type          {:optional true} [:maybe ::lib.schema.metadata/card.type]]])
