(ns metabase.xrays.automagic-dashboards.schema
  (:require
   [malli.core :as mc]
   [malli.util :as mut]))

(def context
  "The big ball of mud data object from which we generate x-rays"
  (mc/schema
    [:map
     [:source any?]
     [:root any?]
     [:tables {:optional true} any?]
     [:query-filter {:optional true} any?]]))

(def dashcard
  "The base unit thing we are trying to produce in x-rays"
  ;; TODO - Beef these specs up, esp. the any?s
  (mc/schema
    [:map
     [:dataset_query {:optional true}
      [:map
       [:database {:optional true} [:maybe nat-int?]]
       [:type :keyword]
       [:query [:map
                [:aggregation [:sequential any?]]
                [:breakout {:optional true} [:sequential any?]]
                [:source-table [:or :int :string]]]]]]
     [:dimensions {:optional true} [:sequential string?]]
     [:group {:optional true} string?]
     [:height pos-int?]
     [:metrics {:optional true} any?]
     [:position {:optional true} nat-int?]
     [:card-score {:optional true} number?]
     [:total-score {:optional true} nat-int?]
     [:metric-score {:optional true} nat-int?]
     [:score-components {:optional true} [:sequential nat-int?]]
     [:title {:optional true} string?]
     [:visualization {:optional true} any?]
     [:width pos-int?]
     [:x_label {:optional true} string?]]))

(def dashcards
  "A bunch of dashcards"
  (mc/schema [:maybe [:sequential dashcard]]))

(def field-type
  "A dimension reference, as either a semantic type or entity type and semantic type."
  (mc/schema
    [:or
     [:tuple :keyword]
     [:tuple :keyword :keyword]]))

;;
(def dimension-value
  "A specification for the basic keys in the value of a dimension template."
  (mc/schema
    [:map
     [:field_type field-type]
     [:score {:optional true} nat-int?]
     [:max_cardinality {:optional true} nat-int?]
     [:named {:optional true} [:string {:min 1}]]]))

(def dimension-template
  "A specification for the basic keys in a dimension template."
  (mc/schema
    [:map-of
     {:min 1 :max 1}
     [:string {:min 1}]
     dimension-value]))

(def metric-value
  "A specification for the basic keys in the value of a metric template."
  (mc/schema
    [:map
     [:metric [:vector some?]]
     [:score {:optional true} nat-int?]
     ;[:name some?]
     ]))

(def metric-template
  "A specification for the basic keys in a metric template."
  (mc/schema
    [:map-of
     {:min 1 :max 1}
     [:string {:min 1}]
     metric-value]))

(def filter-value
  "A specification for the basic keys in the value of a filter template."
  (mc/schema
    [:map
     [:filter [:vector some?]]
     [:score nat-int?]]))

(def filter-template
  "A specification for the basic keys in a filter template."
  (mc/schema
    [:map-of
     {:min 1 :max 1}
     [:string {:min 1}]
     filter-value]))

(def card-value
  "A specification for the basic keys in the value of a card template."
  (mc/schema
    [:map
     [:dimensions {:optional true} [:vector (mc/schema
                                              [:map-of
                                               {:min 1 :max 1}
                                               [:string {:min 1}]
                                               [:map
                                                [:aggregation {:optional true} string?]]])]]
     [:metrics {:optional true} [:vector string?]]
     [:filters {:optional true} [:vector string?]]
     [:card-score {:optional true} nat-int?]]))

(def card-template
  "A specification for the basic keys in a card template."
  (mc/schema
    [:map-of
     {:min 1 :max 1}
     [:string {:min 1}]
     card-value]))

(def dashboard-template
  "A specification for the basic keys in a dashboard template."
  (mc/schema
    [:map
     [:dimensions {:optional true} [:vector dimension-template]]
     [:metrics {:optional true} [:vector metric-template]]
     [:filters {:optional true} [:vector filter-template]]
     [:cards {:optional true} [:vector card-template]]]))

;; Available values schema -- These are items for which fields have been successfully bound

(def available-values
  "Specify the shape of things that are available after dimension to field matching for affinity matching"
  (mc/schema
    [:map
     [:available-dimensions [:map-of [:string {:min 1}] any?]]
     [:available-metrics [:map-of [:string {:min 1}] any?]]
     [:available-filters {:optional true} [:map-of [:string {:min 1}] any?]]]))

;; Schemas for "affinity" functions as these can be particularly confusing

(def dimension-set
  "A set of dimensions that belong together. This is the basic unity of affinity."
  [:set string?])

(def semantic-affinity-set
  "A set of sematic types that belong together. This is the basic unity of semantic affinity."
  [:set :keyword])

(def affinity
  "A collection of things that go together. In this case, we're a bit specialized on
  card affinity, but the key element in the structure is `:base-dims`, which are a
   set of dimensions which, when satisfied, enable this affinity object."
  (mc/schema
    [:map
     [:affinity-name :string]
     [:affinity-set [:set :keyword]]
     [:card-template card-value]
     [:metric-constituent-names [:sequential :string]]
     [:metric-field-types [:set :keyword]]
     [:named-dimensions [:sequential :string]]
     [:score {:optional true} nat-int?]]))

(def affinities
  "A sequence of affinity objects."
  (mc/schema
    [:sequential affinity]))

(def affinity-old
  "A collection of things that go together. In this case, we're a bit specialized on
  card affinity, but the key element in the structure is `:base-dims`, which are a
   set of dimensions which, when satisfied, enable this affinity object."
  (mc/schema
    [:map
     [:dimensions {:optional true} [:vector string?]]
     [:metrics {:optional true} [:vector string?]]
     [:filters {:optional true} [:vector string?]]
     [:score {:optional true} nat-int?]
     [:affinity-name string?]
     [:base-dims dimension-set]]))

(def affinities-old
  "A sequence of affinity objects."
  (mc/schema
    [:sequential affinity-old]))


(def affinity-matches
  "A map of named affinities to all dimension sets that are associated with this name."
  (mc/schema
    [:map-of
     :string
     [:vector dimension-set]]))

(def item
  "A \"thing\" that we bind to, consisting, generally, of at least a name and id"
  (mc/schema
    [:map
     [:id {:optional true} nat-int?]
     [:name {:optional true} string?]]))

(def dim-name->dim-def
  "A map of dimension name to dimension definition."
  (mc/schema
    [:map-of :string dimension-value]))

(def dim-name->matching-fields
  "A map of named dimensions to a map containing the dimension data
   and a sequence of matching items satisfying this dimension"
  (mc/schema
    [:map-of :string
     [:map
      [:matches [:sequential item]]]]))

(def dim-name->dim-defs+matches
  "The \"full\" grounded dimensions which matches dimension names
  to the dimension definition combined with matching fields."
  (mut/merge
    dim-name->dim-def
    dim-name->matching-fields))

(def dimension-map
  "A map of dimension names to item satisfying that dimensions"
  (mc/schema
    [:map-of :string item]))

(def dimension-maps
  "A sequence of dimension maps"
  (mc/schema
    [:sequential dimension-map]))

(def normalized-metric-template
  "A \"normalized\" metric template is a map containing the metric name as a key
   rather than a map of metric name to the map."
  (mc/schema
    [:map
     [:metric-name :string]
     [:score nat-int?]
     [:metric vector?]]))

(def grounded-metric
  "A metric containing a definition with actual field references/ids rather than dimension references."
  (mc/schema
    [:map
     [:metric-name :string]
     [:metric-title :string]
     [:metric-score nat-int?]
     [:metric-definition
      [:map
       [:aggregation [:sequential any?]]]]]))

(def combined-metric
  "A grounded metric in which the metric has been augmented with breakouts."
  (mut/merge
    grounded-metric
    (mc/schema
      [:map
       [:metric-definition
        [:map
         [:aggregation [:sequential any?]]
         [:breakout [:sequential any?]]]]])))

(comment
  (require '[malli.generator :as mg])
  (mg/sample dashboard-template)
  (mg/sample affinities)
  (mg/sample affinity-matches)
  (mg/sample grounded-metric))
