(ns metabase.lib-metric.display-info
  "Display info functions for lib_metric entities. Provides UI-friendly
   information about metrics, measures, dimensions, temporal buckets, and
   binning strategies.

   Follows the same multimethod dispatch pattern as metabase.lib.metadata.calculation/display-info."
  (:refer-clojure :exclude [derive])
  (:require
   #?@(:cljs [[metabase.lib.cache :as lib.cache]])
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

;;; -------------------------------------------------- Hierarchy --------------------------------------------------

(defonce ^{:doc "Hierarchy for lib-metric display-info dispatch."} hierarchy
  (atom (make-hierarchy)))

(defn derive
  "Like [[clojure.core/derive]], but affects the lib-metric [[hierarchy]]."
  [tag parent]
  (swap! hierarchy clojure.core/derive tag parent)
  nil)

;;; -------------------------------------------------- Schema --------------------------------------------------

(mr/def ::display-info
  "Schema for display info returned by [[display-info]]."
  [:map
   [:display-name {:optional true} :string]
   [:name {:optional true} :string]
   [:long-display-name {:optional true} :string]
   [:effective-type {:optional true} :keyword]
   [:semantic-type {:optional true} :keyword]
   [:description {:optional true} [:maybe :string]]
   [:selected {:optional true} :boolean]
   [:default {:optional true} :boolean]
   [:short-name {:optional true} :string]
   ;; Position tracking for dimensions
   [:filter-positions {:optional true} [:sequential :int]]
   [:projection-positions {:optional true} [:sequential :int]]
   ;; Source indicators
   [:is-from-join {:optional true} :boolean]
   [:is-calculated {:optional true} :boolean]
   [:is-implicitly-joinable {:optional true} :boolean]
   ;; Temporal bucket specific
   [:is-temporal-extraction {:optional true} :boolean]])

;;; -------------------------------------------------- Multimethod --------------------------------------------------

(defmulti display-info-method
  "Implementation for [[display-info]]. Returns a map of UI-friendly information
   for the given entity. Dispatches on `:lib/type` of `x`."
  {:arglists '([definition x])}
  (fn [_definition x]
    (lib.dispatch/dispatch-value x))
  :hierarchy hierarchy)

;;; -------------------------------------------------- Default Implementation --------------------------------------------------

(defn default-display-info
  "Default implementation that extracts common fields from an entity.
   Used as the base for type-specific implementations."
  [_definition x]
  (let [display-name (or (:display-name x) (:name x))]
    (cond-> {}
      display-name              (assoc :display-name display-name)
      (:name x)                 (assoc :name (:name x))
      (:effective-type x)       (assoc :effective-type (:effective-type x))
      (:semantic-type x)        (assoc :semantic-type (:semantic-type x))
      (:description x)          (assoc :description (:description x))
      (some? (:selected? x))    (assoc :selected (:selected? x))
      (some? (:selected x))     (assoc :selected (:selected x))
      (some? (:default? x))     (assoc :default (:default? x))
      (some? (:default x))      (assoc :default (:default x)))))

(defmethod display-info-method :default
  [definition x]
  (default-display-info definition x))

;;; -------------------------------------------------- Metric --------------------------------------------------

(defmethod display-info-method :metadata/metric
  [definition metric]
  (merge (default-display-info definition metric)
         {:display-name (or (:display-name metric)
                            (:name metric)
                            (i18n/tru "Metric"))}))

;;; -------------------------------------------------- Measure --------------------------------------------------

(defmethod display-info-method :metadata/measure
  [definition measure]
  (merge (default-display-info definition measure)
         {:display-name (or (:display-name measure)
                            (:name measure)
                            (i18n/tru "Measure"))}))

;;; -------------------------------------------------- Dimension --------------------------------------------------

(defmethod display-info-method :metadata/dimension
  [definition dimension]
  (merge (default-display-info definition dimension)
         {:display-name (or (:display-name dimension)
                            (:name dimension)
                            (i18n/tru "Dimension"))
          :filter-positions (or (:filter-positions dimension) [])
          :projection-positions (or (:projection-positions dimension) [])}
         ;; Add source indicators if present
         (when-let [source (:lib/source dimension)]
           {:is-from-join (= source :source/joins)
            :is-calculated (= source :source/expressions)
            :is-implicitly-joinable (= source :source/implicitly-joinable)})))

;;; -------------------------------------------------- Temporal Bucket --------------------------------------------------

(defmethod display-info-method :temporal-bucket
  [_definition bucket]
  (let [unit (:unit bucket)]
    {:short-name (u/qualified-name unit)
     :display-name (lib.temporal-bucket/describe-temporal-unit unit)
     :default (boolean (:default bucket))
     :selected (boolean (:selected bucket))
     :is-temporal-extraction (and (contains? lib.schema.temporal-bucketing/datetime-extraction-units unit)
                                  (not (contains? lib.schema.temporal-bucketing/datetime-truncation-units unit)))}))

(defmethod display-info-method :option/temporal-bucketing
  [_definition bucket]
  (let [unit (:unit bucket)]
    {:short-name (u/qualified-name unit)
     :display-name (lib.temporal-bucket/describe-temporal-unit unit)
     :default (boolean (:default bucket))
     :selected (boolean (:selected bucket))
     :is-temporal-extraction (and (contains? lib.schema.temporal-bucketing/datetime-extraction-units unit)
                                  (not (contains? lib.schema.temporal-bucketing/datetime-truncation-units unit)))}))

;;; -------------------------------------------------- Binning Strategy --------------------------------------------------

(defmethod display-info-method :binning-strategy
  [_definition strategy]
  {:display-name (lib.binning/binning-display-name strategy nil)
   :default (boolean (:default strategy))
   :selected (boolean (:selected strategy))})

(defmethod display-info-method :option/binning
  [_definition strategy]
  {:display-name (:display-name strategy)
   :default (boolean (:default strategy))
   :selected (boolean (:selected strategy))})

;;; -------------------------------------------------- MBQL Clauses (Filters) --------------------------------------------------

;; Filter clauses are MBQL vectors like [:= {} [:dimension {} "uuid"] "value"].
;; We look up dimension names from the metadata provider to generate readable descriptions.

(defn- dimension-ref?
  "Check if x is a dimension reference [:dimension opts uuid]."
  [x]
  (and (vector? x)
       (= :dimension (first x))
       (string? (nth x 2 nil))))

(defn- dimension-uuid
  "Extract UUID from a dimension reference [:dimension opts uuid]."
  [dim-ref]
  (nth dim-ref 2))

(defn- lookup-dimension
  "Look up a dimension by UUID from the metadata provider in the definition."
  [definition dimension-id]
  (when-let [mp (:metadata-provider definition)]
    (first (lib.metadata.protocols/metadatas
            mp
            {:lib/type :metadata/dimension :id #{dimension-id}}))))

(defn- dimension-display-name
  "Get the display name for a dimension reference, falling back to UUID if not found."
  [definition dim-ref]
  (let [uuid (dimension-uuid dim-ref)]
    (if-let [dim (lookup-dimension definition uuid)]
      (or (:display-name dim) (:name dim) uuid)
      uuid)))

(defn- format-filter-value
  "Format a filter value for display."
  [v]
  (cond
    (string? v) v
    (number? v) (str v)
    (boolean? v) (str v)
    (nil? v) "empty"
    :else (str v)))

(defn- operator-display-name
  "Get a human-readable name for a filter operator."
  [op]
  (case op
    :=                "is"
    :!=               "is not"
    :>                "is greater than"
    :>=               "is greater than or equal to"
    :<                "is less than"
    :<=               "is less than or equal to"
    :between          "is between"
    :contains         "contains"
    :does-not-contain "does not contain"
    :starts-with      "starts with"
    :ends-with        "ends with"
    :is-null          "is empty"
    :not-null         "is not empty"
    :is-empty         "is empty"
    :not-empty        "is not empty"
    :time-interval    "is"
    (name op)))

(defn- filter-clause-display-name
  "Generate a display name for a filter clause."
  [definition [op _opts & args]]
  (let [first-arg (first args)
        dim-name (when (dimension-ref? first-arg)
                   (dimension-display-name definition first-arg))
        op-name (operator-display-name op)]
    (case op
      ;; Unary operators (no value)
      (:is-null :not-null :is-empty :not-empty)
      (if dim-name
        (i18n/tru "{0} {1}" dim-name op-name)
        op-name)

      ;; Between operator (two values)
      :between
      (let [[_ v1 v2] args]
        (if dim-name
          (i18n/tru "{0} {1} {2} and {3}" dim-name op-name (format-filter-value v1) (format-filter-value v2))
          (i18n/tru "{0} {1} and {2}" op-name (format-filter-value v1) (format-filter-value v2))))

      ;; Default: binary/varargs operators
      (let [values (rest args)
            formatted-values (map format-filter-value values)]
        (if dim-name
          (if (= 1 (count values))
            (i18n/tru "{0} {1} {2}" dim-name op-name (first formatted-values))
            (i18n/tru "{0} {1} {2} values" dim-name op-name (count values)))
          (if (= 1 (count values))
            (i18n/tru "{0} {1}" op-name (first formatted-values))
            (i18n/tru "{0} {1} values" op-name (count values))))))))

(defn- filter-clause-display-info
  "Generate display info for an MBQL filter clause."
  [definition clause]
  {:display-name (filter-clause-display-name definition clause)})

;; Derive filter operators into a common parent for dispatch.
(doseq [op [:= :!= :< :<= :> :>= :between
            :contains :does-not-contain :starts-with :ends-with
            :is-null :not-null :is-empty :not-empty
            :and :or :not
            :time-interval :relative-time-interval]]
  (derive op ::filter-clause))

(defmethod display-info-method ::filter-clause
  [definition clause]
  (filter-clause-display-info definition clause))

;;; -------------------------------------------------- Public API --------------------------------------------------

(defn display-info
  "Get display info for a displayable item. Returns a map suitable for UI consumption.

   Dispatches on `:lib/type` of `x` to return appropriate display info structure.
   Results are cached in CLJS for performance."
  [definition x]
  (letfn [(display-info* [x]
            (try
              (display-info-method definition x)
              (catch #?(:clj Throwable :cljs js/Error) e
                (throw (ex-info (i18n/tru "Error calculating display info for {0}: {1}"
                                          (lib.dispatch/dispatch-value x)
                                          (ex-message e))
                                {:definition definition :x x}
                                e)))))]
    #?(:clj
       (display-info* x)
       :cljs
       (lib.cache/side-channel-cache
        :display-info x
        display-info*))))
