(ns metabase.xrays.domain-entities.specs
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   ;; legacy usages, do not use legacy MBQL stuff in new code.
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(mr/def ::xrays-dimension
  "X-rays has its own special `:dimension` psuedo-MBQL clause in templates; it's different from the `:dimension` clause
  we normally see in template tags/parameter targets."
  [:cat
   ;;; TODO (Cam 10/28/25) -- I think we should consider normalizing this key to something like `:xrays/dimension` to
   ;;; make sure it's clear that it's an X-Rays-only thing and that it's different from the standard MBQL `:dimension`
   ;;; clause
   [:= {:decode/normalize keyword} :dimension]
   :string
   [:? [:map
        {:decode/normalize lib.schema.common/normalize-map}
        [:temporal-unit {:optional true} [:keyword {:decode/normalize keyword}]]]]])

;;; it would be cool if there was a way to override `::mbql.s/dimension` and be able to use
;;; `::mbql.normalize/normalize` normally but I can't figure out how to make it work. So we'll have to normalize
;;; things the usual way and then go back and manually normalize our special dimension clauses.

(defn- normalize-xrays-dimension [x]
  (let [schema  ::xrays-dimension
        decoder (mr/cached ::decoder schema #(mc/decoder schema (mtx/transformer {:name :normalize})))]
    (decoder x)))

(defn normalize-mbql-clause
  "Normalize the legacy MBQL fragment saved in X-Rays templates. This handles the special X-Rays version of `:dimension`
  clauses as well."
  [x]
  (walk/postwalk
   (fn [form]
     (if (and (sequential? form)
              (= (first form) "dimension"))
       (normalize-xrays-dimension form)
       form))
   (mbql.normalize/normalize x)))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  [:fn
   {:decode/domain-entity-spec normalize-mbql-clause
    :decode/transform-spec     normalize-mbql-clause
    :error/message             "valid MBQL clause"}
   ;;; TODO (Cam 10/10/25) -- update this to use [[metabase.lib.core/clause?]] once we convert X-Rays to MBQL 5
   #(and (vector? %) (keyword? (first %)))])

;;; TODO (Cam 9/29/25) -- these decoding rules are BUSTED because it ends up creating totally nonsensical types like
;;; `:type/AvgPrice` which is not a real type at all. We should probably just leave the field names as strings.
(def ^:private BrokenFieldNameTypeKeyword
  "Field type designator -- a keyword derived from `type/*`"
  [:keyword
   (letfn [(decoder [k]
             (keyword "type" (name k)))]
     {:decode/domain-entity-spec decoder
      :decode/transform-spec     decoder})])

(def ^:private DomainEntityReference :string)

(def ^:private DomainEntityType
  [:and
   :keyword
   [:fn
    {:error/message "Valid DomainEntity"}
    #(isa? % :DomainEntity/*)]])

(def ^:private Identifier :string)

(def ^:private Description :string)

(mr/def ::attribute
  [:map
   [:field         {:optional true} BrokenFieldNameTypeKeyword]
   [:domain_entity {:optional true} DomainEntityReference]
   [:has_many      {:optional true} [:map
                                     [:domain_entity DomainEntityReference]]]])

(mr/def ::attributes
  "Schema for `required_attributes` and `optional_attributes` in a [[DomainEntitySpec]]."
  [:sequential ::attribute])

(def ^:private BreakoutDimensions
  [:sequential
   {:decode/domain-entity-spec (fn [breakout-dimensions]
                                 (for [dimension breakout-dimensions]
                                   (if (string? dimension)
                                     (do
                                       (mc/assert BrokenFieldNameTypeKeyword (keyword "type" dimension))
                                       [:dimension dimension])
                                     dimension)))}
   MBQL])

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [k v]
                           (assoc v :name k))))

(def ^:private Metrics
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   Identifier
   [:map
    [:aggregation MBQL]
    [:name        Identifier]
    [:breakout    {:optional true} BreakoutDimensions]
    [:filter      {:optional true} MBQL]
    [:description {:optional true} Description]]])

(def ^:private Segments
  [:map-of
   {:decode/domain-entity-spec add-name-from-key}
   Identifier
   [:map
    [:filter MBQL]
    [:name   Identifier]
    [:description {:optional true} Description]]])

(def DomainEntitySpec
  "Domain entity spec"
  [:map
   [:name                DomainEntityReference]
   [:type                DomainEntityType]
   [:required_attributes ::attributes]
   [:description         {:optional true} Description]
   [:optional_attributes {:optional true} ::attributes]
   [:metrics             {:optional true} Metrics]
   [:segments            {:optional true} Segments]
   [:breakout_dimensions {:optional true} BreakoutDimensions]])

(defn- add-to-hiearchy!
  [{:keys [name refines] :as spec}]
  (let [spec-type (keyword "DomainEntity" name)
        refines   (some->> refines (keyword "DomainEntity"))]
    (derive spec-type (or refines :DomainEntity/*))
    (-> spec
        (dissoc :refines)
        (assoc :type spec-type))))

(defn- coerce-to-domain-entity-spec [spec]
  (mc/coerce DomainEntitySpec
             spec
             (mtx/transformer
              mtx/string-transformer
              mtx/json-transformer
              {:name :domain-entity-spec})))

(def ^:private domain-entities-dir "domain_entity_specs/")

(def ^:dynamic *domain-entity-specs*
  "Delay with registered domain entities specs, loaded from YAML and coerced to match the [[DomainEntitySpec]] schema."
  (delay (into {} (for [spec (yaml/load-dir domain-entities-dir (comp coerce-to-domain-entity-spec
                                                                      add-to-hiearchy!))]
                    [(:name spec) spec]))))

(mr/def ::field-name :string)

(mr/def ::instantiated-metric
  [:map
   {:closed true}
   [:name        :string]
   [:aggregation ::mbql.s/Aggregation]
   [:filter      {:optional true} ::mbql.s/Filter]])

(mr/def ::instantiated-metrics
  [:map-of ::field-name ::instantiated-metric])

(mr/def ::instantiated-segment
  [:map
   {:closed true}
   [:name   :string]
   [:filter ::mbql.s/Filter]])

(mr/def ::instantiated-segments
  [:map-of ::field-name ::instantiated-segment])

(mr/def ::instantiated-breakouts
  [:sequential ::mbql.s/field])

(mr/def ::instantiated-domain-entity
  "Schema for a [[DomainEntitySpec]] that has been instantiated
  by [[metabase.xrays.domain-entities.core/instantiate-domain-entity]], i.e. the `[:dimension <field-name>]`
  placeholder clauses have been replaced with real Field refs."
  [:map
   {:closed true}
   [:breakout_dimensions [:maybe ::instantiated-breakouts]]
   [:description         [:maybe Description]]
   [:dimensions          [:map-of ::field-name (ms/InstanceOf :model/Field)]]
   [:metrics             [:maybe ::instantiated-metrics]]
   [:name                DomainEntityReference]
   [:segments            [:maybe ::instantiated-segments]]
   [:source_table        ::lib.schema.id/table]
   [:type                DomainEntityType]])
