(ns metabase.domain-entities.specs
  (:require [medley.core :as m]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [util :as mbql.u]]
            [metabase.util.yaml :as yaml]
            [schema
             [coerce :as sc]
             [core :as s]]))

(def ^:private MBQL (s/pred mbql.u/mbql-clause?))

(def ^:private DomainEntityReference s/Str)

(def ^:private Identifier s/Str)

(def ^:private Description s/Str)

(defn- field-type?
  [t]
  (isa? t :type/*))

(def ^:private FieldType (s/constrained s/Keyword field-type?))

(def ^:private Attributes [{(s/optional-key :field)         FieldType
                            (s/optional-key :domain_entity) DomainEntityReference
                            (s/optional-key :has_many)      {:domain_entity DomainEntityReference}}])

(def ^:private BreakoutDimensions [(s/cond-pre FieldType MBQL)])

(def ^:private Metrics {Identifier {(s/required-key :aggregation) MBQL
                                    (s/required-key :name)        Identifier
                                    (s/optional-key :breakout)    BreakoutDimensions
                                    (s/optional-key :filter)      MBQL
                                    (s/optional-key :description) Description}})

(def ^:private Segments {Identifier {(s/required-key :filter)      MBQL
                                     (s/required-key :name)        Identifier
                                     (s/optional-key :description) Description}})

(def ^:private DomainEntitySpec {(s/required-key :name)                DomainEntityReference
                                 (s/optional-key :description)         Description
                                 (s/optional-key :refines)             DomainEntityReference
                                 (s/required-key :required_attributes) Attributes
                                 (s/optional-key :optional_attributes) Attributes
                                 (s/optional-key :metrics)             Metrics
                                 (s/optional-key :segments)            Segments
                                 (s/optional-key :breakout_dimensions) BreakoutDimensions})

(def ^:private ^{:arglists '([m])} add-name-from-key
  (partial m/map-kv-vals (fn [identifier m]
                           (assoc m :name identifier))))

(def ^:private domain-entity-spec-parser
  (sc/coercer!
   DomainEntitySpec
   {MBQL               mbql.normalize/normalize
    Metrics            add-name-from-key
    Segments           add-name-from-key
    BreakoutDimensions (fn [breakout-dimensions]
                         (for [dimension breakout-dimensions]
                           (if (s/check MBQL dimension)
                             [:dimension dimension]
                             dimension)))
    FieldType          (partial keyword "type")
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    s/Str              name}))

(def ^:private domain-entities-dir "domain_entities/")

(def domain-entity-specs
  "List of registered domain entities."
  (delay (yaml/load-dir domain-entities-dir domain-entity-spec-parser)))
