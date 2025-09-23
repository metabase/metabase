(ns metabase.xrays.automagic-dashboards.schema
  (:require
   [malli.core :as mc]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::field
  [:and
   [:map
    [:table_id          {:optional true} [:maybe ::lib.schema.id/table]]
    ;; "magic" (non-app-DB-based) key added by [[metabase.xrays.automagic-dashboards.util/->field]] and consumed
    ;; by [[metabase.xrays.automagic-dashboards.core/->root]]
    [:xrays/database-id {:optional true} [:maybe ::lib.schema.id/database]]]
   [:fn
    {:error/message "If Field is missing :table_id, it must have :xrays/database-id"}
    (some-fn :table_id :xrays/database-id)]
   (ms/InstanceOf :model/Field)])

(mr/def ::metric.definition
  [:and
   [:map
    [:aggregation [:sequential ::mbql.s/Aggregation]]]
   [:fn
    {:error/message "Metric definition should not include refs with :join-alias unless it also includes :joins"}
    (fn [m]
      (or (seq (:joins m))
          (not (lib.util.match/match-one m
                 (_ :guard :join-alias)
                 (:join-alias &match)))))]])

(mr/def ::metric
  [:and
   [:map
    [:table_id          {:optional true} [:maybe ::lib.schema.id/table]]
    [:definition        {:optional true} [:ref ::metric.definition]]
    [:xrays/database-id {:optional true} [:maybe ::lib.schema.id/database]]]
   [:fn
    {:error/message "If Metric is missing :table_id, it must have :xrays/database-id"}
    (some-fn :table_id :xrays/database-id)]
   (ms/InstanceOf :xrays/Metric)])

(mr/def ::root.entity
  [:multi
   {:dispatch t2/model}
   [:xrays/Metric [:ref ::metric]]
   [::mc/default  :map]])

(mr/def ::root
  [:map
   [:database ::lib.schema.id/database]
   [:entity   {:optional true} [:ref ::root.entity]]])

(mr/def ::context
  "The big ball of mud data object from which we generate x-rays"
  [:map
   [:source       any?]
   [:root         [:ref ::root]]
   [:tables       {:optional true} any?]
   [:query-filter {:optional true} any?]])

(mr/def ::dashcard
  "The base unit thing we are trying to produce in x-rays"
  ;; TODO - Beef these specs up, esp. the any?s
  [:map
   [:card-score       {:optional true} number?]
   [:dataset_query    {:optional true} [:ref ::query]]
   [:dimensions       {:optional true} [:sequential string?]]
   [:group            {:optional true} string?]
   [:height           pos-int?]
   [:metric-score     {:optional true} nat-int?]
   [:metrics          {:optional true} any?]
   [:position         {:optional true} nat-int?]
   [:score-components {:optional true} [:sequential nat-int?]]
   [:title            {:optional true} string?]
   [:total-score      {:optional true} nat-int?]
   [:visualization    {:optional true} any?]
   [:width            pos-int?]
   [:x_label          {:optional true} string?]])

(mr/def ::dashcards
  "A bunch of dashcards"
  [:maybe [:sequential ::dashcard]])

(mr/def ::field-type
  "A dimension reference, as either a semantic type or entity type and semantic type."
  [:or
   [:tuple :keyword]
   [:tuple :keyword :keyword]])

(mr/def ::dimension-value
  "A specification for the basic keys in the value of a dimension template."
  [:map
   [:field_type ::field-type]
   [:score {:optional true} nat-int?]
   [:max_cardinality {:optional true} nat-int?]
   [:named {:optional true} [:string {:min 1}]]])

(mr/def ::dimension-template
  "A specification for the basic keys in a dimension template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::dimension-value])

(mr/def ::metric-value
  "A specification for the basic keys in the value of a metric template."
  [:map
   [:metric [:vector some?]]
   [:score {:optional true} nat-int?]])

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

(mr/def ::card-value
  "A specification for the basic keys in the value of a card template."
  [:map
   [:dimensions {:optional true} [:vector [:map-of
                                           {:min 1 :max 1}
                                           [:string {:min 1}]
                                           [:map
                                            [:aggregation {:optional true} string?]]]]]
   [:metrics {:optional true} [:vector string?]]
   [:filters {:optional true} [:vector string?]]
   [:card-score {:optional true} nat-int?]])

(mr/def ::card-template
  "A specification for the basic keys in a card template."
  [:map-of
   {:min 1 :max 1}
   [:string {:min 1}]
   ::card-value])

(mr/def ::dashboard-template
  "A specification for the basic keys in a dashboard template."
  [:map
   [:dimensions {:optional true} [:vector ::dimension-template]]
   [:metrics {:optional true} [:vector ::metric-template]]
   [:filters {:optional true} [:vector ::filter-template]]
   [:cards {:optional true} [:vector ::card-template]]])

;; Available values schema -- These are items for which fields have been successfully bound

#_(def available-values
    "Specify the shape of things that are available after dimension to field matching for affinity matching"
    [:map
     [:available-dimensions [:map-of [:string {:min 1}] any?]]
     [:available-metrics [:map-of [:string {:min 1}] any?]]
     [:available-filters {:optional true} [:map-of [:string {:min 1}] any?]]])

;; Schemas for "affinity" functions as these can be particularly confusing
;;
;; Commented out because they are not currently used for anything, but keeping them around if they are useful for
;; documentation purposes

#_(def dimension-set
    "A set of dimensions that belong together. This is the basic unity of affinity."
    [:set string?])

#_(def semantic-affinity-set
    "A set of sematic types that belong together. This is the basic unity of semantic affinity."
    [:set :keyword])

#_(def affinity
    "A collection of things that go together. In this case, we're a bit specialized on
  card affinity, but the key element in the structure is `:base-dims`, which are a
   set of dimensions which, when satisfied, enable this affinity object."
    [:map
     [:affinity-name            :string]
     [:affinity-set             [:set :keyword]]
     [:card-template            card-value]
     [:metric-constituent-names [:sequential :string]]
     [:metric-field-types       [:set :keyword]]
     [:named-dimensions         [:sequential :string]]
     [:score                    {:optional true} nat-int?]])

#_(def affinities
    "A sequence of affinity objects."
    [:sequential affinity])

#_(def affinity-old
    "A collection of things that go together. In this case, we're a bit specialized on
  card affinity, but the key element in the structure is `:base-dims`, which are a
   set of dimensions which, when satisfied, enable this affinity object."
    [:map
     [:affinity-name string?]
     [:base-dims     dimension-set]
     [:dimensions    {:optional true} [:vector string?]]
     [:filters       {:optional true} [:vector string?]]
     [:metrics       {:optional true} [:vector string?]]
     [:score         {:optional true} nat-int?]])

#_(def affinities-old
    "A sequence of affinity objects."
    [:sequential affinity-old])

#_(def affinity-matches
    "A map of named affinities to all dimension sets that are associated with this name."
    [:map-of
     :string
     [:vector dimension-set]])

(mr/def ::item
  "A \"thing\" that we bind to, consisting, generally, of at least a name and id"
  [:map
   [:id   {:optional true} nat-int?]
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

#_(def dimension-map
    "A map of dimension names to item satisfying that dimensions"
    [:map-of :string ::item])

#_(def dimension-maps
    "A sequence of dimension maps"
    [:sequential dimension-map])

(mr/def ::normalized-metric-template
  "A \"normalized\" metric template is a map containing the metric name as a key
   rather than a map of metric name to the map."
  [:map
   [:metric-name :string]
   [:score nat-int?]
   [:metric vector?]])

(mr/def ::grounded-metric
  "A metric containing a definition with actual field references/ids rather than dimension references."
  [:map
   [:metric-name       :string]
   [:metric-title      :string]
   [:metric-score      nat-int?]
   [:metric-definition [:ref ::metric.definition]]])

(mr/def ::combined-metric
  "A grounded metric in which the metric has been augmented with breakouts."
  [:merge
   ::grounded-metric
   [:map
    [:metric-definition
     [:map
      [:aggregation [:sequential any?]]
      [:breakout [:sequential any?]]]]]])

(mr/def ::query
  [:and
   [:map
    [:database ::lib.schema.id/database]]
   [:multi
    {:dispatch lib/normalized-mbql-version}
    [:mbql-version/mbql5 [:ref ::lib.schema/query]]
    [::mc/default        [:ref ::mbql.s/Query]
     ;; NOCOMMIT
     #_(->
        [:and
         [:ref ::mbql.s/Query]
         ;; NOCOMMIT
         [:fn
          {:error/message "Convertable to MBQL 5"}
          lib-be/normalize-query]])]]])

(mr/def ::card
  [:map
   [:dataset_query {:optional true} [:maybe [:ref ::query]]]])

(mr/def ::dashboard
  [:map
   [:cards {:optional true} [:maybe [:sequential [:ref ::card]]]]])

(comment
  (require '[malli.generator :as mg])
  (mg/sample ::dashboard-template)
  (mg/sample affinities)
  (mg/sample affinity-matches)
  (mg/sample ::grounded-metric))
