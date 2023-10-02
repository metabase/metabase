(ns metabase.transforms.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.domain-entities.specs :refer [MBQL]]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

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


(def ^:private Source :string)

(def ^:private Dimension :string)

(def ^:private Breakout
  [:sequential {:decode/spec-transformer (fn [breakouts]
                                          (for [breakout (u/one-or-many breakouts)]
                                            (if-not (mc/validate MBQL breakout)
                                              [:dimension breakout]
                                              breakout)))}
   MBQL])

(mc/validate MBQL ["Month"])

(def ^:private Aggregation
  [:map-of {:decode/spec-transformer (comp (partial u/topological-sort extract-dimensions)
                                           stringify-keys)}
   Dimension MBQL])

(def ^:private Expressions
  [:map-of {:decode/spec-transformer (comp (partial u/topological-sort extract-dimensions)
                                      stringify-keys)}
   Dimension MBQL])

(def ^:private Description :string)

(def ^:private Filter MBQL)

(def ^:private Limit ms/PositiveInt)

(def ^:private JoinStrategy
  (into [:enum {:decode/spec-transformer keyword}] mbql.s/join-strategies))

(def ^:private Joins [:sequential [:map {:closed true}
                                   [:source Source]
                                   [:condition MBQL]
                                   [:strategy {:optional true} JoinStrategy]]])

(def ^:private TransformName :string)

(def Step
  "Transform step"
  [:map {:closed true}
   [:source                       Source]
   [:name                         Source]
   [:transform                    TransformName]
   [:aggregation {:optional true} Aggregation]
   [:breakout    {:optional true} Breakout]
   [:expressions {:optional true} Expressions]
   [:joins       {:optional true} Joins]
   [:description {:optional true} Description]
   [:limit       {:optional true} Limit]
   [:filter      {:optional true} Filter]])

(def ^:private Steps
  [:map-of
   {:decode/spec-transformer (fn [steps]
                              (->> steps
                                   stringify-keys
                                   (u/topological-sort (fn [{:keys [source joins]}]
                                                         (conj (map :source joins) source)))))}
   Source Step])

(def ^:private DomainEntity :string)

(def ^:private Requires
  [:sequential {:decode/spec-transformer u/one-or-many}
   DomainEntity])

(def ^:private Provides
  [:sequential {:decode/spec-transformer u/one-or-many} DomainEntity])

(def TransformSpec
  "Transform spec"
  [:map {:closed true}
   [:name                         TransformName]
   [:requires                     Requires]
   [:provides                     Provides]
   [:steps                        Steps]
   [:description {:optional true} Description]])

(def ^:private transform-spec-parser
  (mc/coercer
   TransformSpec
   (mtx/transformer {:name :spec-transformer
                     :decoders {:string name}})))

(def ^:private transforms-dir "transforms/")

(def transform-specs
  "List of registered dataset transforms."
  (delay (yaml/load-dir transforms-dir (comp transform-spec-parser add-metadata-to-steps))))
