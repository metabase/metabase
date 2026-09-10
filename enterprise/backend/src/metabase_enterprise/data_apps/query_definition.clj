(ns metabase-enterprise.data-apps.query-definition
  "Closed schemas for the data apps subset of `metabase.lib.schema.test-spec`.

  Data apps queries support a single table-sourced stage without explicit joins or expressions."
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.literal :as literal]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(defn- normalize-query-map [value]
  (when (map? value)
    (update-keys value (comp keyword u/->kebab-case-en))))

(mr/def ::table-source
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :table]]
   [:id [:ref ::lib.schema.id/table]]])

(mr/def ::column
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :column]]
   [:name string?]
   [:table-id {:optional true} [:maybe ::lib.schema.id/table]]
   [:source-name {:optional true} [:maybe string?]]
   [:source-field-id {:optional true} [:maybe ::lib.schema.id/field]]
   [:display-name {:optional true} [:maybe string?]]
   [:index {:optional true} [:maybe pos-int?]]])

(mr/def ::temporal-bucket
  [:map {:closed true :decode/normalize normalize-query-map}
   [:unit {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit]]])

(mr/def ::auto-bin
  [:= {:decode/normalize lib.schema.common/normalize-keyword} :auto])

(mr/def ::bin-count-bucket
  [:map {:closed true :decode/normalize normalize-query-map}
   [:bins {:optional true} [:maybe [:or pos-int? ::auto-bin]]]])

(mr/def ::bin-width-bucket
  [:map {:closed true :decode/normalize normalize-query-map}
   [:bin-width {:optional true} [:maybe [:or ::lib.schema.common/positive-number ::auto-bin]]]])

(mr/def ::column-with-binning
  [:merge
   ::column
   ::temporal-bucket
   ::bin-count-bucket
   ::bin-width-bucket])

(mr/def ::breakout
  [:ref ::column-with-binning])

(mr/def ::order-by
  [:merge
   ::column-with-binning
   [:map {:closed true :decode/normalize normalize-query-map}
    [:direction {:optional true} [:maybe [:enum {:decode/normalize lib.schema.common/normalize-keyword} :asc :desc]]]]])

(mr/def ::literal-expression
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :literal]]
   [:value [:ref ::literal/literal]]])

(mr/def ::operator
  keyword?)

(mr/def ::operator-expression
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :operator]]
   [:operator ::operator]
   [:args {:default []} [:sequential [:ref ::expression]]]])

(mr/def ::expression
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)}
   [:column [:ref ::column]]
   [:literal [:ref ::literal-expression]]
   [:operator [:ref ::operator-expression]]])

(mr/def ::segment
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :segment]]
   [:id [:ref ::lib.schema.id/segment]]])

(mr/def ::measure
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :measure]]
   [:id [:ref ::lib.schema.id/measure]]])

(mr/def ::metric
  [:map {:closed true :decode/normalize normalize-query-map}
   [:type [:= {:decode/normalize lib.schema.common/normalize-keyword} :metric]]
   [:id [:ref ::lib.schema.id/metric]]])

(mr/def ::aggregation
  [:or
   [:ref ::expression]
   [:ref ::measure]
   [:ref ::metric]])

(mr/def ::stage
  [:map {:closed true :decode/normalize normalize-query-map}
   [:source       ::table-source]
   [:fields       {:optional true} [:maybe [:sequential ::column]]]
   [:filters      {:optional true} [:maybe [:sequential [:or ::expression ::segment]]]]
   [:aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
   [:breakouts    {:optional true} [:maybe [:sequential ::breakout]]]
   [:order-bys    {:optional true} [:maybe [:sequential ::order-by]]]
   [:limit        {:optional true} [:maybe number?]]])

(mr/def ::query-definition
  [:map {:closed true :decode/normalize normalize-query-map}
   [:stages [:sequential {:min 1 :max 1} ::stage]]])
