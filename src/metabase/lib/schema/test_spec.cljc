(ns metabase.lib.schema.test-spec
  "Schemas for creating a query for testing purposes."
  (:require
   [malli.core :as mc]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
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
   [:source-name {:optional true} [:maybe string?]]
   [:display-name {:optional true} [:maybe string?]]])

(mr/def ::test-temporal-bucket-spec
  [:map
   [:unit {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit]]])

(mr/def ::test-bin-count-bucket-spec
  [:map
   [:bins {:optional true} [:maybe ::lib.schema.binning/num-bins]]])

(mr/def ::test-bin-width-bucket-spec
  [:map
   [:bin-width {:optional true} [:maybe ::lib.schema.binning/bin-width]]])

(mr/def ::test-column-with-binning-spec
  [:merge
   ::test-column-spec
   ::test-temporal-bucket-spec
   ::test-bin-count-bucket-spec
   ::test-bin-width-bucket-spec])

(mr/def ::test-breakout-spec
  [:ref ::test-column-with-binning-spec])

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
  keyword?)

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
   [:source     [:ref ::test-source-spec]]
   [:strategy   ::lib.schema.join/strategy]
   [:conditions {:optional true} [:maybe [:sequential ::test-join-condition-spec]]]])

(mr/def ::test-join-source-spec
  [:multi {:dispatch (comp keyword :type)}
   [:column [:ref ::test-column-with-binning-spec]]
   [:literal [:ref ::test-literal-expression-spec]]
   [:operator [:ref ::test-operator-expression-spec]]])

(mr/def ::test-join-condition-spec
  [:map
   [:operator {:decode/normalize lib.schema.common/normalize-keyword} ::test-operator-spec]
   [:left [:ref ::test-join-source-spec]]
   [:right [:ref ::test-join-source-spec]]])

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

(mr/def ::test-common-spec
  [:map
   [:name         {:optional true} [:ref ::lib.schema.template-tag/name]]
   [:display-name {:optional true} [:ref ::lib.schema.common/non-blank-string]]])

(mr/def ::test-field-filter-spec
  [:merge
   [:ref ::lib.schema.template-tag/field-filter]
   [:ref ::test-common-spec]
   [:map
    [:dimension   [:or ::lib.schema.id/field string?]]
    [:widget-type {:default :text} [:ref ::lib.schema.template-tag/widget-type]]]])

(mr/def ::test-temporal-unit-spec
  [:merge
   [:ref ::lib.schema.template-tag/temporal-unit]
   [:ref ::test-common-spec]
   [:map
    [:dimension   [:or ::lib.schema.id/field string?]]]])

(mr/def ::test-snippet-spec
  [:merge
   [:ref ::lib.schema.template-tag/snippet]
   [:ref ::test-common-spec]
   [:map
    [:snippet-name {:optional true} ::lib.schema.common/non-blank-string]]])

(mr/def ::test-source-query-spec
  [:merge
   [:ref ::lib.schema.template-tag/source-query]
   [:ref ::test-common-spec]
   [:map
    [:card-id {:optional true} ::lib.schema.id/card]]])

(mr/def ::test-raw-value-spec
  [:merge
   [:ref ::lib.schema.template-tag/raw-value]
   [:ref ::test-common-spec]])

(mr/def ::test-template-tag-spec
  [:map
   [:type ::lib.schema.template-tag/type]]
  [:multi {:dispatch (comp keyword :type)}
   [:temporal-unit [:ref ::test-temporal-unit-spec]]
   [:dimension     [:ref ::test-field-filter-spec]]
   [:snippet       [:ref ::test-snippet-spec]]
   [:card          [:ref ::test-source-query-spec]]
    ;; :number, :text, :date, :boolean
   [::mc/default   [:ref ::test-raw-value-spec]]])

(mr/def ::test-template-tags-spec
  [:map-of
   ::lib.schema.template-tag/name
   ::test-template-tag-spec])

(mr/def ::test-native-query-spec
  [:map
   [:query         string?]
   [:template-tags {:optional true :default {}} [:maybe [:ref ::test-template-tags-spec]]]])
