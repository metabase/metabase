(ns metabase.automagic-dashboards.schema
  (:require [malli.core :as mc]))

;; --
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
     [:dataset_query {:optional true} any?]
     [:dimensions {:optional true} [:sequential string?]]
     [:group {:optional true} string?]
     [:height pos-int?]
     [:metrics {:optional true} any?]
     [:position {:optional true} nat-int?]
     [:score {:optional true} number?]
     [:title {:optional true} string?]
     [:visualization {:optional true} any?]
     [:width pos-int?]
     [:x_label {:optional true} string?]]))

(def dashcards
  "A bunch of dashcards"
  (mc/schema [:maybe [:sequential dashcard]]))

;;
(def dimension-value
  "A specification for the basic keys in the value of a dimension template."
  (mc/schema
    [:map
     [:field_type
      [:or
       [:tuple :keyword]
       [:tuple :keyword :keyword]]]
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
     [:score {:optional true} nat-int?]]))

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

(def affinity
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

(def affinities
  "A sequence of affinity objects."
  (mc/schema
    [:sequential affinity]))

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

(def dimension-bindings
  "A map of named dimensions to a map containing a sequence of matching items satisfying this dimension"
  (mc/schema
    [:map-of
     :string
     [:map [:matches [:sequential item]]]]))

(def dimension-map
  "A map of dimension names to item satisfying that dimensions"
  (mc/schema
    [:map-of :string item]))

(def dimension-maps
  "A sequence of dimension maps"
  (mc/schema
    [:sequential dimension-map]))


(comment
  (require '[malli.generator :as mg])
  (mg/sample dashboard-template)
  (mg/sample affinities)
  (mg/sample affinity-matches))
