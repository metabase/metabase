(ns metabase-enterprise.semantic-layer-import.schemas.resolved
  "Schemas for the resolve stage's output: IR content bound to Lib queries, ready for the emit stage."
  (:require
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::unsupported-dimension
  "A dimension of a converted metric's table, or one reached through its joins, that could not become one of its
  curated dimensions, and why."
  [:map {:closed true}
   [:name   :string]
   [:reason :string]])

(mr/def ::metric
  "An IR metric (`ir`) bound to Metabase: the Lib query that computes it and its curated dimensions and mappings, built
  against the [[metabase-enterprise.semantic-layer-import.metadata]] provider for its database, which is what turns
  their ids back into names when they are written out. `table` names the IR table the query is over and
  `time-dimension` its time dimension; for a ratio or derived metric both come from its inputs.
  `unsupported-dimensions` lists the dimensions that could not be curated dimensions. `card-id` is the metric's id in
  that provider, which a ratio or derived metric's `[:metric id]` references use. `notes` is what a user of the metric
  should know that the query does not say (see [[metabase-enterprise.semantic-layer-import.resolve.metrics/notes]]):
  where it agrees with the source only under some conditions."
  [:map {:closed true}
   [:ir                     ::ir/metric]
   [:entity-id              ms/NanoIdString]
   [:card-id                ::lib.schema.id/card]
   [:metadata-provider      ::lib.schema.metadata/metadata-provider]
   [:table                  :string]
   [:time-dimension         [:maybe :string]]
   [:query                  ::lib.schema/query]
   [:notes                  [:sequential :string]]
   [:dimensions             ::lib-metric.schema/persisted-dimensions]
   [:dimension-mappings     [:sequential ::lib-metric.schema/dimension-mapping]]
   [:unsupported-dimensions [:sequential ::unsupported-dimension]]])

(mr/def ::error
  "Something the import failed on: an unexpected exception while parsing or resolving it, which is a bug in the import
  or an input it did not anticipate, not something the source can say that Metabase cannot (that is an
  `::ir/unsupported`). `message` names the exception."
  [:map {:closed true}
   [:kind      ::ir/content-kind]
   [:name      :string]
   [:unique-id :string]
   [:message   :string]])

(mr/def ::collection
  "The collection the content is written into."
  [:map {:closed true}
   [:name        :string]
   [:description :string]
   [:entity-id   ms/NanoIdString]])

(mr/def ::semantic-layer
  "The resolve stage's output: what the emit stage needs, one key per kind of content, plus everything that could not
  be resolved and why. `unsupported` carries over the parse stage's entries too, so it is the complete list for the
  run; `errors` are what the import itself failed on (see `::error`)."
  [:map {:closed true}
   [:collection  ::collection]
   [:metrics     [:sequential ::metric]]
   [:unsupported [:sequential ::ir/unsupported]]
   [:errors      [:sequential ::error]]])
