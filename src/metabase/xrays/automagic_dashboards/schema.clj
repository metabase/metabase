(ns metabase.xrays.automagic-dashboards.schema
  (:require
   [malli.core :as mc]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::string-or-18n-string
  [:or :string [:fn {:error/message "localized string"} i18n/localized-string?]])

(mr/def ::root.entity
  [:multi
   {:dispatch t2/model}
   [:xrays/Metric [:ref ::metric]]
   [::mc/default  [:map
                   [:name {:optional true} :string]]]])

(mr/def ::filter-clause
  [:and
   {:decode/normalize (fn [x]
                        (when (sequential? x)
                          (if (map? (second x))
                            x
                            (lib/->pMBQL x))))}
   [:ref ::lib.schema.mbql-clause/clause]
   [:ref ::lib.schema.expression/boolean]])

(mr/def ::root.cell-query
  ::filter-clause)

(mr/def ::root
  [:map
   [:database     ::lib.schema.id/database]
   [:entity       {:optional true} [:ref ::root.entity]]
   [:query-filter {:optional true} [:maybe [:sequential ::filter-clause]]]
   [:cell-query   {:optional true} [:maybe [:ref ::root.cell-query]]]])

(mr/def ::source
  [:or
   (ms/InstanceOf #{:model/Table :model/Card})
   [:map
    [:entity_type [:and
                   qualified-keyword?
                   [:fn
                    {:error/message ":entity/ keyword"}
                    #(= (namespace %) "entity")]]]]])

(mr/def ::context
  "The big ball of mud data object from which we generate x-rays"
  [:map
   [:source       {:optional true} ::source]
   [:root         {:optional true} [:ref ::root]]
   [:tables       {:optional true} any?]
   [:query-filter {:optional true} [:maybe [:sequential ::filter-clause]]]])

(mr/def ::query
  "Schema for the type of MBQL queries handled by X-Rays."
  [:ref ::lib.schema/query])

(mr/def ::external-op
  [:merge
   ::lib.schema.common/external-op
   [:map
    [:args [:sequential [:multi
                         {:dispatch coll?, :error/message "Should be a literal or column metadata"}
                         [false :any]
                         [true  ::lib.schema.metadata/column]]]]]])

(mr/def ::aggregation
  [:or ::lib.schema.aggregation/aggregation ::external-op])

(mr/def ::metric
  "Schema for an `:xrays/Metric`."
  [:and
   [:map
    {:closed true}
    [:name              :string]
    [:xrays/aggregation ::aggregation]
    [:table-id          {:optional true} [:maybe ::lib.schema.id/table]]
    [:xrays/database-id {:optional true} [:maybe ::lib.schema.id/database]]]
   [:fn
    {:error/message "If instance does not have :table-id, it must have :xrays/database-id"}
    (some-fn :table-id :xrays/database-id)]])

(mr/def ::field-type
  "A dimension reference, as either a semantic type or entity type and semantic type."
  [:or
   [:tuple :keyword]
   [:tuple :keyword :keyword]])

(mr/def ::dimension-value
  "A specification for the basic keys in the value of a dimension template."
  [:map
   [:field_type      ::field-type]
   [:score           {:optional true} nat-int?]
   [:max_cardinality {:optional true} nat-int?]
   [:named           {:optional true} [:string {:min 1}]]])

(mr/def ::dimension-template
  "A specification for the basic keys in a dimension template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::dimension-value])

(mr/def ::metric-value
  "A specification for the basic keys in the value of a metric template."
  [:map
   {:closed true}
   [:metric [:vector some?]]
   [:score  {:optional true} nat-int?]
   [:name   {:optional true} ::string-or-18n-string]])

(mr/def ::metric-template
  "A specification for the basic keys in a metric template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::metric-value])

(mr/def ::filter-value
  "A specification for the basic keys in the value of a filter template."
  [:map
   [:filter [:vector some?]]
   [:score nat-int?]])

(mr/def ::filter-template
  "A specification for the basic keys in a filter template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::filter-value])

(mr/def ::item
  "A \"thing\" that we bind to, consisting, generally, of at least a name and id"
  [:map
   [:id {:optional true} nat-int?]
   [:name {:optional true} string?]])

(mr/def ::dim-name->dim-def
  "A map of dimension name to dimension definition."
  [:map-of :string ::dimension-value])

(mr/def ::dim-name->matching-fields
  "A map of named dimensions to a map containing the dimension data
   and a sequence of matching items satisfying this dimension"
  [:map-of
   :string
   [:map
    [:matches [:sequential ::item]]]])

(mr/def ::dim-name->dim-defs+matches
  "The \"full\" grounded dimensions which matches dimension names
  to the dimension definition combined with matching fields."
  [:merge
   ::dim-name->dim-def
   ::dim-name->matching-fields])

(mr/def ::normalized-metric-template
  "A \"normalized\" metric template is a map containing the metric name as a key
   rather than a map of metric name to the map."
  [:map
   {:closed true}
   [:name        {:optional true} ::string-or-18n-string]
   [:metric-name :string]
   [:score       nat-int?]
   [:metric      vector?]])

(mr/def ::grounded-metric.definition
  [:map
   {:closed true}
   [:xrays/aggregations {:optional true} [:maybe [:sequential ::aggregation]]]
   [:xrays/breakouts    {:optional true} [:maybe [:sequential ::lib.schema.metadata/column]]]
   [:xrays/filters      {:optional true} [:maybe [:sequential ::external-op]]]])

(mr/def ::grounded-metric
  "A metric containing a definition with actual field references/ids rather than dimension references."
  [:map
   {:closed true}
   [:metric-name           :string]
   [:metric-title          :string]
   [:metric-score          nat-int?]
   [:metric-definition     ::grounded-metric.definition]
   [:id                    {:optional true} symbol?]
   [:position              {:optional true} nat-int?]
   [:dimension-name->field {:optional true} [:map-of :string ::field]]
   [:card-score            {:optional true} number?]
   [:score-components      {:optional true} [:sequential number?]]
   [:affinity-name         {:optional true} :string]
   [:total-score           {:optional true} number?]])

(mr/def ::combined-metric
  "A grounded metric in which the metric has been augmented with breakouts."
  [:merge
   ::grounded-metric
   [:map
    {:closed true}
    [:group         {:optional true} :string]
    [:card-name     {:optional true} :string]
    [:height        {:optional true} number?]
    [:width         {:optional true} number?]
    [:title         {:optional true} :string]
    [:visualization {:optional true} [:tuple :string :map]]
    [:metrics       {:optional true} [:sequential :string]]
    [:filters       {:optional true} [:sequential :string]]
    [:description   {:optional true} :string]
    [:dimensions    {:optional true} [:sequential [:map-of :string :map]]]
    ;; HUH??
    [:order_by      {:optional true} [:sequential [:map-of :string [:enum "ascending" "descending"]]]]
    [:limit         {:optional true} pos-int?]
    [:x_label       {:optional true} :string]
    [:metric-definition
     [:merge
      ::grounded-metric.definition
      [:map
       [:xrays/breakouts [:sequential ::lib.schema.metadata/column]]]]]]])

(mr/def ::grounded-filter
  [:map
   {:closed true}
   [:score       number?]
   [:filter      ::external-op]
   [:filter-name :string]])

(mr/def ::field
  [:and
   [:map
    ;; as mentioned elsewhere X-Rays does some kind of insane nonsense and creates fields with types like
    ;; `:type/GenericNumber` when instantiating templates
    [:base_type {:optional true} ::lib.schema.common/base-type]]
   [:fn
    {:error/message "Should be a field with snake_case keys"}
    (complement :base-type)]])

(mr/def ::card
  [:map
   [:id            {:optional true} [:or symbol? ::lib.schema.id/card]]
   [:dataset_query {:optional true} ::query]])

(mr/def ::dashcard
  [:map
   [:id                     {:optional true} [:or symbol? ::lib.schema.id/dashcard]]
   [:card                   {:optional true} ::card]
   [:card_id                {:optional true} [:or symbol? ::lib.schema.id/card]]
   [:col                    {:optional true} nat-int?]
   [:row                    {:optional true} nat-int?]
   [:size_x                 {:optional true} pos-int?]
   [:size_y                 {:optional true} pos-int?]
   [:visualization_settings {:optional true} map?]
   [:title                  {:optional true} string?]
   [:card-score             {:optional true} number?]])

(mr/def ::dashboard
  [:map
   [:dashcards {:optional true} [:sequential ::dashcard]]
   [:filters   {:optional true} [:sequential :any]]])

(mr/def ::card-template
  :map)

(mr/def ::dashboard-template
  "This is somewhat different [[metabase.xrays.automagic-dashboards.schema/DashboardTemplate]], I haven't exactly worked
  out what the schema is supposed to be yet."
  [:map
   [:cards {:optional true} [:maybe [:sequential ::card-template]]]])

(mr/def ::grounded-values
  [:map
   {:closed true}
   [:dimensions {:optional true} ::dim-name->matching-fields]
   [:metrics    {:optional true} [:sequential ::grounded-metric]]
   [:filters    {:optional true} [:sequential ::grounded-filter]]])
