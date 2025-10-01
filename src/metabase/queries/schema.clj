(ns metabase.queries.schema
  (:require
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli :as mu]
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
  "Schema for Card.dataset_query. Cards are for some wacko reason allowed to be saved with empty queries (`{}`), but not
  `NULL` ones, because the column is non-null. This sorta seems like an oversight but fixing all the tests that save
  Cards with empty queries is too much to attempt at this point. So a Card either has an empty query or a valid MBQL 5
  query."
  [:multi {:dispatch (comp boolean empty?)}
   [true  ::empty-map]
   [false [:schema
           {:decode/normalize lib-be/normalize-query}
           [:ref ::lib.schema/query]]]])

;;; TODO (Cam 9/29/25) -- fill this out more, `:metabase.lib.schema.metadata/card` has a lot of stuff and there's also
;;; stuff sprinkled thruout this module. For example [[metabase.queries.api.card/CardUpdateSchema]] should get merged
;;; into this
;;;
;;; TODO (Cam 9/30/25) -- consider renaming this to `:model/Card` so it can serve as the "official" schema of a Card
;;; instance
(mr/def ::card
  "Schema for an instance of a `:model/Card` (everything is optional to support updates)."
  [:map
   [:id                 {:optional true} [:maybe ::lib.schema.id/card]]
   [:dataset_query      {:optional true} [:maybe ::query]]
   [:parameters         {:optional true} [:maybe [:ref ::parameters.schema/parameters]]]
   [:parameter_mappings {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:type               {:optional true} [:maybe ::lib.schema.metadata/card.type]]])

(mu/defn normalize-card :- [:maybe ::card]
  "Normalize a `card` so it satisfies the `::card` schema."
  [card :- [:maybe :map]]
  (lib/normalize ::card card))
