(ns metabase.lib.schema.query
  "Schemas for creating a query for testing purposes."
  (:require
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util.malli.registry :as mr]))

(mr/def ::test-table-source-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :table]]
   [:id [:ref ::lib.schema.id/table]]])

(mr/def ::test-card-source-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :card]]
   [:id [:ref ::lib.schema.id/card]]])

(mr/def ::test-source-spec
  [:multi {:dispatch (comp keyword :type)}
   [:table ::test-table-source-spec]
   [:card ::test-card-source-spec]])

(mr/def ::test-column-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :column]]
   [:name string?]
   [:source-name {:optional true} [:maybe string?]]])

(mr/def ::test-temporal-bucket-spec
  [:map
   [:unit {:optional true} [:maybe [:ref ::lib.schema.temporal-bucketing/unit]]]])

(mr/def ::test-bin-count-bucket-spec
  [:map
   [:bins {:optional true} [:maybe [:ref ::lib.schema.binning/num-bins]]]])

(mr/def ::test-bin-width-bucket-spec
  [:map
   [:bin-width {:optional true} [:maybe [:ref ::lib.schema.binning/bin-width]]]])

(mr/def ::test-binning-spec
  [:merge
   ::test-temporal-bucket-spec
   ::test-bin-count-bucket-spec
   ::test-bin-width-bucket-spec])

(mr/def ::test-breakout-spec
  [:merge
   ::test-column-spec
   ::test-binning-spec])

(mr/def ::test-order-by-spec
  [:merge
   ::test-column-spec
   [:map
    [:direction {:optional true} [:maybe [:ref ::lib.schema.order-by/direction]]]]])

(mr/def ::test-literal-expression-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :literal]]
   [:value [:ref ::literal/literal]]])

(mr/def ::test-operator-spec
  ;; TODO(@romeovs): be more specific here and limit to all valid operators?
  string?)

(mr/def ::test-operator-expression-spec
  [:map
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :operator]]
   [:operator ::test-operator-spec]
   [:args [:sequential [:ref ::test-expression-spec]]]])

(mr/def ::test-expression-spec
  [:multi {:dispatch (comp keyword :type)}
   [:column [:ref ::test-column-spec]]
   [:literal [:ref ::test-literal-expression-spec]]
   [:operator [:ref ::test-operator-expression-spec]]])

(mr/def ::test-named-expression-spec
  [:map
   [:name string?]
   [:value [:ref ::test-expression-spec]]])

(mr/def ::test-join-spec
  [:map
   [:source [:ref ::test-source-spec]]
   [:strategy ::lib.schema.join/strategy]
   [:conditions {:optional true} [:maybe [:sequential ::test-join-condition-spec]]]])

(mr/def ::test-join-condition-spec
  [:map
   [:operator ::test-operator-spec]
   [:left [:ref ::test-expression-spec]]
   [:right [:ref ::test-expression-spec]]])

(mr/def ::test-aggregation-spec
  [:or
   [:ref ::test-expression-spec]
   [:ref ::test-named-expression-spec]])

(mr/def ::test-stage-spec
  [:map
   [:source       {:optional true} [:maybe ::test-source-spec]]
   [:fields       {:optional true} [:maybe [:sequential ::test-column-spec]]]
   [:expressions  {:optional true} [:maybe [:sequential ::test-named-expression-spec]]]
   [:joins        {:optional true} [:maybe [:sequential ::test-join-spec]]]
   [:filters      {:optional true} [:maybe [:sequential ::test-expression-spec]]]
   [:aggregations {:optional true} [:maybe [:sequential ::test-aggregation-spec]]]
   [:breakouts    {:optional true} [:maybe [:sequential ::test-breakout-spec]]]
   [:order-bys    {:optional true} [:maybe [:sequential ::test-order-by-spec]]]
   [:limit        {:optional true} [:maybe number?]]])

(mr/def ::test-query-spec
  [:map
   [:stages [:sequential ::test-stage-spec]]])
