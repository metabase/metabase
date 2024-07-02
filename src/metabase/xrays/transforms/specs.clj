(ns metabase.xrays.transforms.specs
  (:require
   [malli.core :as mc]
   [malli.transform :as mtx]
   [medley.core :as m]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [metabase.xrays.domain-entities.specs :refer [MBQL]]))

(def ^:private DecodableString
  [:string
   {:decode/transform-spec (fn [x]
                             (if (string? x)
                               x
                               (u/qualified-name x)))}])

(def ^:private Source DecodableString)

(def ^:private Dimension DecodableString)

(def ^:private Breakout
  [:sequential
   {:decode/transform-spec (fn [breakouts]
                             (for [breakout (u/one-or-many breakouts)]
                               (if-not (mc/validate MBQL breakout)
                                 [:dimension breakout]
                                 breakout)))}
   MBQL])

(defn- extract-dimensions
  [mbql]
  (lib.util.match/match (mbql.normalize/normalize mbql) [:dimension dimension & _] dimension))

(def ^:private ^{:arglists '([m])} stringify-keys
  (partial m/map-keys name))

(def ^:private Dimension->MBQL
  [:map-of
   ;; Since `Aggregation` and `Expressions` are structurally the same, we can't use them directly
   {:decode/transform-spec
      (comp (partial u/topological-sort extract-dimensions)
            stringify-keys)}
   Dimension
   MBQL])

(def ^:private Aggregation Dimension->MBQL)

(def ^:private Expressions Dimension->MBQL)

(def ^:private Description DecodableString)

(def ^:private Filter MBQL)

(def ^:private Limit pos-int?)

(def ^:private JoinStrategy
  [:schema
   {:decode/transform-spec keyword}
   mbql.s/JoinStrategy])

(def ^:private Joins
  [:sequential
   [:map
    [:source    Source]
    [:condition MBQL]
    [:strategy {:optional true} JoinStrategy]]])

(def ^:private TransformName DecodableString)

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

(def ^:private Steps
  [:map-of
   {:decode/tranform-spec (fn [source->step]
                            (->> source->step
                                 stringify-keys
                                 (u/topological-sort (fn [{:keys [source joins]}]
                                                       (conj (map :source joins) source)))))}
   Source
   Step])

(def ^:private DomainEntity DecodableString)

(def ^:private Requires
  [:sequential
   {:decode/transform-spec u/one-or-many}
   DomainEntity])

(def ^:private Provides
  [:sequential
   {:decode/transform-spec u/one-or-many}
   DomainEntity])

(def TransformSpec
  "Transform spec"
  [:map
   [:name     TransformName]
   [:requires Requires]
   [:provides Provides]
   [:steps    Steps]
   [:description {:optional true} Description]])

(defn- add-metadata-to-steps
  [spec]
  (update spec :steps (partial m/map-kv-vals (fn [step-name step]
                                               (assoc step
                                                 :name      step-name
                                                 :transform (:name spec))))))

(defn- coerce-to-transform-spec [spec]
  (mc/coerce TransformSpec
             spec
             (mtx/transformer
              mtx/string-transformer
              mtx/json-transformer
              (mtx/transformer {:name :transform-spec}))))

(def ^:private transforms-dir "transforms/")

(def transform-specs
  "List of registered dataset transforms."
  (delay (yaml/load-dir transforms-dir (comp coerce-to-transform-spec add-metadata-to-steps))))
