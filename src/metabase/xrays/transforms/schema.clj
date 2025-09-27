(ns metabase.xrays.transforms.schema
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.domain-entities.schema :as domain-entities.schema]))

;;; TODO -- is source name always a domain entity name?
(mr/def ::source-name :string #_::domain-entities.schema/domain-entity.name)

(mr/def ::breakouts
  [:sequential
   {:decode/transform-spec (fn [breakouts]
                             (for [breakout (u/one-or-many breakouts)]
                               (if (string? breakout)
                                 {:lib/type             :xrays/unresolved-dimension
                                  :xrays/dimension-name breakout}
                                 breakout)))}
   ::domain-entities.schema/mbql-placeholder])

(defn- ^:deprecated extract-dimensions
  [mbql]
  (lib.util.match/match (mbql.normalize/normalize mbql) [:dimension dimension & _] dimension))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(mr/def ::dimension-name->mbql-placeholder
  [:map-of
   ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
   {:decode/transform-spec
    (comp (partial u/topological-sort extract-dimensions)
          stringify-keys)}
   ::domain-entities.schema/dimension-name
   ::domain-entities.schema/mbql-placeholder])

(mr/def ::aggregations ::dimension-name->mbql-placeholder)

(mr/def ::expressions ::dimension-name->mbql-placeholder)

(mr/def ::description :string)

(mr/def ::filter ::domain-entities.schema/mbql-placeholder)

(mr/def ::limit pos-int?)

(mr/def ::joins
  [:sequential
   [:map
    {:closed true
     :decode/transform-spec (fn [m]
                              (update-keys m #(keyword "transform.join" (name %))))}
    [:transform.join/source    ::source-name]
    [:transform.join/condition ::domain-entities.schema/mbql-placeholder]
    [:transform.join/strategy {:optional true} ::lib.schema.join/strategy]]])

(mr/def ::transform-name :string)

(mr/def ::step.name :string)

(mr/def ::step
  "Transform step"
  [:map
   {:closed                true
    :decode/transform-spec (fn [m]
                             (update-keys m #(keyword "transform.step"
                                                      (name (case (keyword %)
                                                              :aggregation :aggregations
                                                              :breakout    :breakouts
                                                              :transform   :transform-name
                                                              %)))))}
   [:transform.step/source         ::source-name]
   [:transform.step/name           ::step.name]
   [:transform.step/transform-name ::transform-name]
   [:transform.step/aggregations   {:optional true} ::aggregations]
   [:transform.step/breakouts      {:optional true} ::breakouts]
   [:transform.step/expressions    {:optional true} ::expressions]
   [:transform.step/joins          {:optional true} ::joins]
   [:transform.step/description    {:optional true} ::description]
   [:transform.step/limit          {:optional true} ::limit]
   [:transform.step/filter         {:optional true} ::filter]])

(mr/def ::steps
  [:map-of
   {:decode/transform-spec (fn [source->step]
                             (->> source->step
                                  stringify-keys
                                  (u/topological-sort (fn [{:transform.step/keys [source joins]}]
                                                        (conj (map :transform.join/source joins) source)))))}
   ::source-name
   ::step])

(def ^:private DomainEntity :string)

(mr/def ::requires
  [:sequential
   {:decode/transform-spec u/one-or-many}
   DomainEntity])

(mr/def ::provides
  [:sequential
   {:decode/transform-spec u/one-or-many}
   DomainEntity])

(mr/def ::transform-spec
  "Transform spec"
  [:map
   {:closed                true
    :decode/transform-spec (fn [m]
                             {:pre [(map? m)]}
                             (update-keys m #(keyword "transform" (name %))))}
   [:transform/name        ::transform-name]
   [:transform/requires    ::requires]
   [:transform/provides    ::provides]
   [:transform/steps       ::steps]
   [:transform/description {:optional true} ::description]])

(mr/def ::source-entity
  "Future source of the Card we are instantiating."
  [:or
   ::lib.schema.metadata/table
   ::lib.schema.metadata/card])

(mr/def :transform.binding/dimensions ::domain-entities.schema/reified-dimensions)
(mr/def :transform.binding/entity     ::source-entity)

(mr/def ::binding
  [:map
   {:closed true}
   [:transform.binding/dimensions :transform.binding/dimensions]
   [:transform.binding/entity     {:optional true} :transform.binding/entity]])

(mr/def ::bindings
  "Top-level lexical context mapping source names to their corresponding entity and constituent dimensions."
  [:map-of ::domain-entities.schema/domain-entity.name ::binding])
