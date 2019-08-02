(ns metabase.transforms.specs
  (:require [clojure
             [set :as set]
             [string :as str]]
            [flatland.ordered.map :refer [ordered-map]]
            [medley.core :as m]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [schema :as mbql.schema]
             [util :as mbql.u]]
            [metabase.util :as u]
            [metabase.util
             [files :as files]
             [schema :as su]
             [yaml :as yaml]]
            [schema
             [coerce :as sc]
             [core :as s]]
            [weavejester.dependency :as dep])
  (:import [java.nio.file Files Path]))

(def MBQL
  "MBQL clause (ie. a vector starting with a keyword)"
  (s/pred mbql.u/mbql-clause?))

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

(defn- field-type?
  [t]
  (isa? t :type/*))

(def ^:private FieldType (s/constrained s/Keyword field-type?))

(def ^:private Requires {Source {:dimensions [FieldType]}})

(def ^:private Provides {Source {:dimensions [Dimension]}})

(def TransformSpec
  "Transform spec"
  {(s/required-key :name)        TransformName
   (s/required-key :requires)    Requires
   (s/required-key :provides)    Provides
   (s/required-key :steps)       Steps
   (s/optional-key :description) Description})

(defn- dependencies-sort
  [dependencies-fn g]
  (transduce (map (juxt key (comp dependencies-fn val)))
             (fn
               ([] (dep/graph))
               ([acc [el dependencies]]
                (reduce (fn [acc dependency]
                          (dep/depend acc el dependency))
                        acc
                        dependencies))
               ([acc]
                (let [sorted      (filter g (dep/topo-sort acc))
                      independent (set/difference (set (keys g)) (set sorted))]
                  (not-empty
                   (into (ordered-map)
                         (map (fn [el]
                                [el (g el)]))
                         (concat independent sorted))))))
             g))

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
                                    (dependencies-sort (fn [{:keys [source joins]}]
                                                         (conj (map :source joins) source)))))
    Breakout                 (fn [breakouts]
                               (for [breakout (u/one-or-many breakouts)]
                                 (if (s/check MBQL breakout)
                                   [:dimension breakout]
                                   breakout)))
    FieldType                (partial keyword "type")
    mbql.schema/JoinStrategy keyword
    ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
    {Dimension MBQL}         (comp (partial dependencies-sort extract-dimensions)
                                   stringify-keys)
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    s/Str                    name}))

(def ^:private transforms-dir "transforms/")

(defn- load-transforms-dir
  [dir]
  (files/with-open-path-to-resource [dir dir]
    (with-open [ds (Files/newDirectoryStream dir)]
      (->> ds
           (filter (comp #(str/ends-with? % ".yaml") str/lower-case (memfn ^Path getFileName)))
           (mapv (partial yaml/load (comp transform-spec-parser add-metadata-to-steps)))))))

(def transform-specs
  "List of registered dataset transforms."
  (delay (load-transforms-dir transforms-dir)))
