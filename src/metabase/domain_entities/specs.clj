(ns metabase.domain-entities.specs
  (:require
   [medley.core :as m]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.util.yaml :as yaml]))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  [:fn {:error/message "valid MBQL clause"} mbql.u/mbql-clause?])

(def FieldType
  "Field type designator -- a keyword derived from `type/*`"
  :keyword)

(def ^:private DomainEntityReference :string)

(def ^:private DomainEntityType
  [:fn
   {:error/message "Valid DomainEntity"}
   #(isa? % :DomainEntity/*)])

(def ^:private Identifier :string)

(def ^:private Description :string)

(def ^:private Attributes
  [:sequential
   [:map
    [:field         {:optional true} FieldType]
    [:domain_entity {:optional true} DomainEntityReference]
    [:has_many      {:optional true} [:map
                                      [:domain_entity DomainEntityReference]]]]])

(def ^:private BreakoutDimensions
  [:sequential MBQL])

(def ^:private Metrics
  [:map-of
   Identifier
   [:map
    [:aggregation MBQL]
    [:name        Identifier]
    [:breakout    {:optional true} BreakoutDimensions]
    [:filter      {:optional true} MBQL]
    [:description {:optional true} Description]]])

(def ^:private Segments
  [:map-of
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
   [:required_attributes Attributes]
   [:description         {:optional true} Description]
   [:optional_attributes {:optional true} Attributes]
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

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [k v]
                           (assoc v :name k))))

;; NOCOMMIT
(def ^:private domain-entity-spec-parser
  identity
  #_(sc/coercer!
   DomainEntitySpec
   {MBQL                  mbql.normalize/normalize
    Segments              add-name-from-key
    Metrics               add-name-from-key
    BreakoutDimensions    (fn [breakout-dimensions]
                            (for [dimension breakout-dimensions]
                              (if (string? dimension)
                                (do
                                  (s/validate FieldType (keyword "type" dimension))
                                  [:dimension dimension])
                                dimension)))
    FieldType             (partial keyword "type")
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    :string                 name}))

(def ^:private domain-entities-dir "domain_entity_specs/")

(def domain-entity-specs
  "List of registered domain entities."
  (delay (into {} (for [spec (yaml/load-dir domain-entities-dir (comp domain-entity-spec-parser
                                                                      add-to-hiearchy!))]
                    [(:name spec) spec]))))
