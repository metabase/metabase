(ns metabase.transforms.specs
  (:require [medley.core :as m]
            [metabase.domain-entities.specs :refer [FieldType MBQL]]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [schema :as mbql.schema]
             [util :as mbql.u]]
            [metabase.util :as u]
            [metabase.util
             [schema :as su]
             [yaml :as yaml]]
            [schema
             [coerce :as sc]
             [core :as s]]))

(def ^:private Source s/Str)

(def ^:private Dimension s/Str)

(def ^:private Breakout [MBQL])

(def ^:private Aggregation {Dimension MBQL})

(def ^:private Expressions {Dimension MBQL})

(def ^:private Description s/Str)

(def ^:private Filter MBQL)

(def ^:private Limit su/IntGreaterThanZero)

(def ^:private Joins [{(s/required-key :source)    Source
                       (s/required-key :condition) MBQL
                       (s/optional-key :strategy)  mbql.schema/JoinStrategy}])

(def ^:private TransformName s/Str)

(def Step
  "Transform step"
  {(s/required-key :source)      Source
   (s/required-key :name)        Source
   (s/required-key :transform)   TransformName
   (s/optional-key :aggregation) Aggregation
   (s/optional-key :breakout)    Breakout
   (s/optional-key :expressions) Expressions
   (s/optional-key :joins)       Joins
   (s/optional-key :description) Description
   (s/optional-key :limit)       Limit
   (s/optional-key :filter)      Filter})

(def ^:private Steps {Source Step})

(def ^:private DomainEntity s/Str)

(def ^:private Requires [DomainEntity])

(def ^:private Provides [DomainEntity])

(def TransformSpec
  "Transform spec"
  {(s/required-key :name)        TransformName
   (s/required-key :requires)    Requires
   (s/required-key :provides)    Provides
   (s/required-key :steps)       Steps
   (s/optional-key :description) Description})

(defn- extract-dimensions
  [mbql]
  (mbql.u/match (mbql.normalize/normalize mbql) [:dimension dimension] dimension))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(defn- add-metadata-to-steps
  [spec]
  (update spec :steps (partial m/map-kv-vals (fn [step-name step]
                                               (assoc step
                                                 :name      step-name
                                                 :transform (:name spec))))))

(def ^:private transform-spec-parser
  (sc/coercer!
   TransformSpec
   {MBQL                     mbql.normalize/normalize
    Steps                    (fn [steps]
                               (->> steps
                                    stringify-keys
                                    (u/topological-sort (fn [{:keys [source joins]}]
                                                          (conj (map :source joins) source)))))
    Breakout                 (fn [breakouts]
                               (for [breakout (u/one-or-many breakouts)]
                                 (if (s/check MBQL breakout)
                                   [:dimension breakout]
                                   breakout)))
    FieldType                (partial keyword "type")
    [DomainEntity]           u/one-or-many
    mbql.schema/JoinStrategy keyword
    ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
    {Dimension MBQL}         (comp (partial u/topological-sort extract-dimensions)
                                   stringify-keys)
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    s/Str                    name}))

(def ^:private transforms-dir "transforms/")

(def transform-specs
  "List of registered dataset transforms."
  (delay (yaml/load-dir transforms-dir (comp transform-spec-parser add-metadata-to-steps))))
