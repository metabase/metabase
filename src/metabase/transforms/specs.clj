(ns metabase.transforms.specs
  (:require [clojure.set :as set]
            [flatland.ordered.map :refer [ordered-map]]
            [medley.core :as m]
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
             [core :as s]]
            [weavejester.dependency :as dep]))

(def ^:private MBQL (s/pred mbql.u/mbql-clause?))

(def ^:private Source s/Str)

(def ^:private Dimension s/Str)

(def ^:private Breakout [(s/cond-pre Dimension MBQL)])

(def ^:private Aggregation {Dimension MBQL})

(def ^:private Expressions {Dimension MBQL})

(def ^:private Description s/Str)

(def ^:private Filter MBQL)

(def ^:private Limit su/IntGreaterThanZero)

(def ^:private Joins [{(s/required-key :source)    Source
                       (s/required-key :condition) MBQL
                       (s/optional-key :strategy)  mbql.schema/JoinStrategy}])

(def ^:private Steps {Source {(s/required-key :source)      Source
                              (s/required-key :name)        Source
                              (s/optional-key :aggregation) Aggregation
                              (s/optional-key :breakout)    Breakout
                              (s/optional-key :expressions) Expressions
                              (s/optional-key :joins)       Joins
                              (s/optional-key :description) Description
                              (s/optional-key :limit)       Limit
                              (s/optional-key :filter)      Filter}})

(defn- field-type?
  [t]
  (isa? t :type/*))

(def ^:private FieldType (s/constrained s/Keyword field-type?))

(def ^:private Requires {Source {(s/optional-key :dimensions) [FieldType]}})

(def ^:private Provides {Source {(s/required-key :dimensions) [Dimension]}})

(def ^:private Name s/Str)

(def ^:private TransformSpec {(s/required-key :name)        Name
                              (s/required-key :requires)    Requires
                              (s/required-key :provides)    Provides
                              (s/required-key :steps)       Steps
                              (s/optional-key :description) Description})

(defn- extract-dimensions
  [mbql]
  (mbql.u/match (mbql.normalize/normalize mbql) [:dimension dimension] dimension))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(def ^:private transform-spec-parser
  (sc/coercer!
   TransformSpec
   {MBQL                     mbql.normalize/normalize
    Steps                    (fn [steps]
                               (->> steps
                                    stringify-keys
                                    (topological-sort (fn [{:keys [source joins]}]
                                                         (conj (map :source joins) source)))
                                    (m/map-kv-vals (fn [step-name step]
                                                     (assoc step :name step-name)))))
    Breakout                 (fn [breakouts]
                               (for [breakout (u/ensure-seq breakouts)]
                                 (if (s/check MBQL breakout)
                                   [:dimension breakout]
                                   breakout)))
    FieldType                (partial keyword "type")
    mbql.schema/JoinStrategy keyword
    ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
    {Dimension MBQL}         (comp (partial topological-sort extract-dimensions)
                                   stringify-keys)
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    s/Str                    name}))

(def ^:private transforms-dir "transforms/")

(def transform-specs
  "List of registered dataset transforms."
  (delay (yaml/load-dir transforms-dir transform-spec-parser)))
