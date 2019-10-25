(ns metabase.domain-entities.specs
  (:require [medley.core :as m]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [util :as mbql.u]]
            [metabase.util.yaml :as yaml]
            [schema
             [coerce :as sc]
             [core :as s]]))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  (s/pred mbql.u/mbql-clause?))

(def FieldType
  "Field type designator -- a keyword derived from `type/*`"
  (s/constrained s/Keyword
                                        ;#(isa? % :type/*)
                 identity))

(def ^:private DomainEntityReference s/Str)

(def ^:private DomainEntityType (s/isa :DomainEntity/*))

(def ^:private Identifier s/Str)

(def ^:private Description s/Str)

(def ^:private Attributes [{(s/optional-key :field)         FieldType
                            (s/optional-key :domain_entity) DomainEntityReference
                            (s/optional-key :has_many)      {:domain_entity DomainEntityReference}}])

(def ^:private BreakoutDimensions [MBQL])

(def ^:private Metrics {Identifier {(s/required-key :aggregation) MBQL
                                    (s/required-key :name)        Identifier
                                    (s/optional-key :breakout)    BreakoutDimensions
                                    (s/optional-key :filter)      MBQL
                                    (s/optional-key :description) Description}})

(def ^:private Segments {Identifier {(s/required-key :filter)      MBQL
                                     (s/required-key :name)        Identifier
                                     (s/optional-key :description) Description}})

(def DomainEntitySpec
  "Domain entity spec"
  {(s/required-key :name)                DomainEntityReference
   (s/required-key :type)                DomainEntityType
   (s/optional-key :description)         Description
   (s/required-key :required_attributes) Attributes
   (s/optional-key :optional_attributes) Attributes
   (s/optional-key :metrics)             Metrics
   (s/optional-key :segments)            Segments
   (s/optional-key :breakout_dimensions) BreakoutDimensions})

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

(def ^:private domain-entity-spec-parser
  (sc/coercer!
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
    s/Str                 name}))

(def ^:private domain-entities-dir "domain_entity_specs/")

(def domain-entity-specs
  "List of registered domain entities."
  (delay (into {} (for [spec (yaml/load-dir domain-entities-dir (comp domain-entity-spec-parser
                                                                      add-to-hiearchy!))]
                    [(:name spec) spec]))))
