(ns metabase.queries.schema
  (:require
   [metabase.documents.schema :as documents.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [potemkin :as p]))

(p/import-vars
 [lib.schema.metadata
  card-types])

(mr/def ::card-type
  ::lib.schema.metadata/card.type)

(mr/def ::card.result-metadata
  [:and
   [:sequential ::lib.schema.metadata/lib-or-legacy-column]
   ;; if the metadata could not be normalized into something valid, then just set it to `nil`. Ideally we shouldn't
   ;; have to do this -- we should try to fix flaws in metadata thru normalization if at all possible.
   [:schema
    {:decode/normalize (fn [xs]
                         (if (or
                              (nil? xs)
                              (mr/validate [:sequential ::lib.schema.metadata/lib-or-legacy-column] xs))
                           xs
                           (do
                             (log/warn "Ignoring invalid Card result_metadata")
                             nil)))}
    :any]])

;;; TODO (Cam 9/29/25) -- fill this out more, `:metabase.lib.schema.metadata/card` has a lot of stuff and there's also
;;; stuff sprinkled throughout this module. For example [[metabase.queries-rest.api.card/CardUpdateSchema]] should get merged
;;; into this
;;;
;;; TODO (Cam 9/30/25) -- consider renaming this to `:model/Card` so it can serve as the "official" schema of a Card
;;; instance
(mr/def ::card
  "Schema for an instance of a `:model/Card` (everything is optional to support updates)."
  [:map
   [:id                 {:optional true} [:maybe ::lib.schema.id/card]]
   [:collection_id      {:optional true} [:maybe ::lib.schema.id/collection]]
   [:dashboard_id       {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:database_id        {:optional true} [:maybe ::lib.schema.id/database]]
   [:document_id        {:optional true} [:maybe ::documents.schema/document.id]]
   [:dataset_query      {:optional true} [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
   [:description        {:optional true} [:maybe :string]]
   [:name               {:optional true} [:maybe :string]]
   [:parameters         {:optional true} [:maybe [:ref ::parameters.schema/parameters]]]
   [:parameter_mappings {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:type               {:optional true} [:maybe ::lib.schema.metadata/card.type]]
   [:result_metadata    {:optional true} [:maybe [:ref ::card.result-metadata]]]])

(mu/defn normalize-card :- [:maybe ::card]
  "Normalize a `card` so it satisfies the `::card` schema."
  [card :- [:maybe :map]]
  (lib/normalize ::card card))
