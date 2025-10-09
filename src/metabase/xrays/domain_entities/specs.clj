(ns metabase.xrays.domain-entities.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  [:fn
   {:decode/domain-entity-spec mbql.normalize/normalize
    :decode/transform-spec     mbql.normalize/normalize
    :error/message             "valid MBQL clause"}
   mbql.u/mbql-clause?])

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
              (mtx/transformer {:name :domain-entity-spec}))))

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
