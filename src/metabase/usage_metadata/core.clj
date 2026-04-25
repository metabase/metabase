(ns metabase.usage-metadata.core
  "Public API for usage-metadata rollups. Internal consumers should call the fns here rather than reaching into
  `metabase.usage-metadata.insights`; this boundary pins the opts shape and return shape for future consumers."
  (:require
   [metabase.usage-metadata.insights :as insights]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::source-type [:enum :table :card])

(mr/def ::opts
  [:map {:closed true}
   [:source-type  {:optional true} [:maybe ::source-type]]
   [:source-id    {:optional true} [:maybe pos-int?]]
   [:bucket-start {:optional true} [:maybe :time/local-date]]
   [:bucket-end   {:optional true} [:maybe :time/local-date]]
   [:limit        {:optional true} [:maybe pos-int?]]])

(mu/defn implicit-segments :- [:sequential :map]
  "Top implicit (ad-hoc, not-saved-as-a-Segment) filter patterns, ranked by usage count across the window.

  Each result is `{:predicate <mbql-clause>, :source {:type :id :name :display-name}, :fields [<field-map>...], :count <long>}`."
  [opts :- ::opts]
  (insights/implicit-segments opts))

(mu/defn implicit-metrics :- [:sequential :map]
  "Top implicit (ad-hoc, not-saved-as-a-Metric-card) aggregation patterns, ranked by usage count.

  Each result is `{:source <source-map>, :aggregation {:type :field :temporal-field :temporal-unit}, :count <long>}`."
  [opts :- ::opts]
  (insights/implicit-metrics opts))

(mu/defn implicit-dimensions :- [:sequential :map]
  "Top dimensions used in breakouts across the window, ranked by usage count.

  Each result is `{:source <source-map>, :dimension {:field :temporal-unit :binning}, :count <long>}`."
  [opts :- ::opts]
  (insights/implicit-dimensions opts))

(mu/defn profile-observations :- [:sequential :map]
  "Top profile observations (e.g. `:single-value`, `:all-null`, `:low-cardinality`) recorded for dimensions surfaced by
  usage-metadata, ranked by usage count.

  Each result is `{:source <source-map>, :field <field-map>, :basis <keyword>, :observation {:type :value}, :count <long>}`."
  [opts :- ::opts]
  (insights/profile-observations opts))
