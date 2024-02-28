(ns metabase.transforms.specs
  (:require
   [medley.core :as m]
   [metabase.domain-entities.specs :refer [FieldType MBQL]]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]))

(def ^:private Source :string)

(def ^:private Dimension :string)

(def ^:private Breakout [:sequential MBQL])

(def ^:private Aggregation [:map-of Dimension MBQL])

(def ^:private Expressions [:map-of Dimension MBQL])

(def ^:private Description :string)

(def ^:private Filter MBQL)

(def ^:private Limit pos-int?)

(def ^:private Joins
  [:sequential
   [:map
    [:source    Source]
    [:condition MBQL]
    [:strategy {:optional true} mbql.s/JoinStrategy]]])

(def ^:private TransformName :string)

(def Step
  "Transform step"
  [:map
   [:source    Source]
   [:name      Source]
   [:transform TransformName]
   [:aggregation {:optional true} Aggregation]
   [:breakout    {:optional true} Breakout]
   [:expressions {:optional true} Expressions]
   [:joins       {:optional true} Joins]
   [:description {:optional true} Description]
   [:limit       {:optional true} Limit]
   [:filter      {:optional true} Filter]])

(def ^:private Steps [:map-of Source Step])

(def ^:private DomainEntity :string)

(def ^:private Requires [:sequential DomainEntity])

(def ^:private Provides [:sequential DomainEntity])

(def TransformSpec
  "Transform spec"
  [:map
   [:name     TransformName]
   [:requires Requires]
   [:provides Provides]
   [:steps    Steps]
   [:description {:optional true} Description]])

(defn- extract-dimensions
  [mbql]
  (mbql.u/match (mbql.normalize/normalize mbql) [:dimension dimension & _] dimension))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(defn- add-metadata-to-steps
  [spec]
  (update spec :steps (partial m/map-kv-vals (fn [step-name step]
                                               (assoc step
                                                 :name      step-name
                                                 :transform (:name spec))))))

;; NOCOMMIT
(def ^:private transform-spec-parser
  identity
  #_(sc/coercer!
   TransformSpec
   {MBQL             mbql.normalize/normalize
    Steps            (fn [steps]
                       (->> steps
                            stringify-keys
                            (u/topological-sort (fn [{:keys [source joins]}]
                                                  (conj (map :source joins) source)))))
    Breakout         (fn [breakouts]
                       (for [breakout (u/one-or-many breakouts)]
                         (if (s/check MBQL breakout)
                           [:dimension breakout]
                           breakout)))
    FieldType        (partial keyword "type")
    [DomainEntity]   u/one-or-many
    mbql.s/JoinStrategy     keyword
    ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
    {Dimension MBQL} (comp (partial u/topological-sort extract-dimensions)
                           stringify-keys)
    ;; Some map keys are names (ie. strings) while the rest are keywords, a distinction lost in YAML
    :string            name}))

(def ^:private transforms-dir "transforms/")

(def transform-specs
  "List of registered dataset transforms."
  (delay (yaml/load-dir transforms-dir (comp transform-spec-parser add-metadata-to-steps))))
