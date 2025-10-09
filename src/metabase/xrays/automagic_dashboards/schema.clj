(ns metabase.xrays.automagic-dashboards.schema
  (:require
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.lib.dispatch :as lib.dispatch]))

(mr/def ::root
  [:map
   [:database ::lib.schema.id/database]])

(mr/def ::source
  [:and
   [:or
    (ms/InstanceOf #{:model/Table :model/Card})
    [:map
     [:entity_type [:and
                    qualified-keyword?
                    [:fn
                     {:error/message ":entity/ keyword"}
                     #(= (namespace %) "entity")]]]]]
   [:map
    [:fields {:optional true} [:sequential ::lib.schema.metadata/column]]]])

(mr/def ::context
  "The big ball of mud data object from which we generate x-rays"
  [:map
   [:source       {:optional true} ::source]
   [:root         {:optional true} [:ref ::root]]
   [:tables       {:optional true} any?]
   [:query-filter {:optional true} any?]])

(mr/def ::query
  "Schema for the type of MBQL queries handled by X-Rays. Currently, X-Rays support MBQL 5."
  [:ref ::lib.schema/query])

(mr/def ::table-id-or-database-id
  [:and
   [:map
    [:table_id          {:optional true} [:maybe ::lib.schema.id/table]]
    [:xrays/database-id {:optional true} [:maybe ::lib.schema.id/database]]]
   [:fn
    {:error/message "If instance does not have :table_id, it must have :xrays/database-id"}
    (some-fn :table_id :xrays/database-id)]])

(mr/def ::metric
  [:ref ::table-id-or-database-id])

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
   [:named           {:optional true} [:string {:min 1}]]
   [:matches         {:optional true} [:sequential ::lib.schema.metadata/column]]])

(mr/def ::dimension-template
  "A specification for the basic keys in a dimension template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   [:ref ::dimension-value]])

(def metric-value
  "A specification for the basic keys in the value of a metric template."
  [:map
   [:metric [:vector some?]]
   [:score {:optional true} nat-int?]
   #_[:name some?]])

(def metric-template
  "A specification for the basic keys in a metric template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   metric-value])

(def filter-value
  "A specification for the basic keys in the value of a filter template."
  [:map
   [:filter [:vector some?]]
   [:score nat-int?]])

(def filter-template
  "A specification for the basic keys in a filter template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   filter-value])

(def item
  "A \"thing\" that we bind to, consisting, generally, of at least a name and id"
  [:map
   [:id {:optional true} nat-int?]
   [:name {:optional true} string?]])

(mr/def ::dim-name->dim-def
  "A map of dimension name to dimension definition."
  [:map-of :string ::dimension-value])

(def dim-name->matching-fields
  "A map of named dimensions to a map containing the dimension data
   and a sequence of matching items satisfying this dimension"
  [:map-of :string
   [:map
    [:matches [:sequential item]]]])

(def dim-name->dim-defs+matches
  "The \"full\" grounded dimensions which matches dimension names
  to the dimension definition combined with matching fields."
  [:merge
   ::dim-name->dim-def
   dim-name->matching-fields])

(mr/def ::normalized-metric-template
  "A \"normalized\" metric template is a map containing the metric name as a key
   rather than a map of metric name to the map."
  [:map
   [:metric-name :string]
   [:score nat-int?]
   [:metric vector?]])

(mr/def ::external-op
  [:merge
   ::lib.schema.common/external-op
   [:map
    [:args {:optional true} [:maybe
                             [:sequential
                              [:multi {:dispatch (fn [x]
                                                   (cond
                                                     (map? x)    ::map
                                                     (vector? x) ::vector
                                                     :else       ::other))}
                               [::map    ::lib.schema.metadata/column]
                               [::vector :mbql.clause/field]
                               [::other  [:or
                                          number?
                                          string?
                                          keyword?]]]]]]]])

(mr/def ::grounded-metric.aggregation
  ::external-op)

(mr/def ::grounded-metric
  "A metric containing a definition with actual field references/ids rather than dimension references."
  [:map
   [:metric-name       :string]
   [:metric-title      :string]
   [:metric-score      nat-int?]
   [:xrays/aggregation ::grounded-metric.aggregation]])

(mr/def ::grounded-metric-with-query
  "A grounded metric in which the metric has been augmented with a query."
  [:merge
   [:ref ::grounded-metric]
   [:map
    [:dataset_query ::query]
    [:title         :string]]])

(mr/def ::column
  [:ref ::lib.schema.metadata/column])

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
   [:title                  {:optional true} :string]
   [:card-score             {:optional true} number?]])

(mr/def ::dashboard
  [:map
   [:dashcards {:optional true} [:sequential ::dashcard]]
   [:filters   {:optional true} [:sequential :any]]])

(mr/def ::card-template
  [:map
   [:title {:optional true} :string]])

(mr/def ::dashboard-template
  "This is somewhat different [[metabase.xrays.automagic-dashboards.schema/DashboardTemplate]], I haven't exactly worked
  out what the schema is supposed to be yet."
  [:map
   [:cards {:optional true} [:maybe [:sequential ::card-template]]]])

(mr/def ::grounded-filters
  [:sequential
   [:map
    [:score  number?]
    [:filter ::external-op]]])

(mr/def ::grounded-values
  [:map
   {:closed true}
   [:dimensions dim-name->matching-fields]
   [:metrics    [:sequential [:ref ::grounded-metric]]]
   [:filters    ::grounded-filters]])
