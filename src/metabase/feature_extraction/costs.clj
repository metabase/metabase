(ns metabase.feature-extraction.costs
  "Predicates for limiting resource expanditure during feature extraction."
  (:require [metabase.models
             [setting :refer [defsetting] :as setting]]
            [schema.core :as s]))

(def MaxCost
  "Schema for max-cost parameter."
  {:computation (s/enum :linear :unbounded :yolo)
   :query       (s/enum :cache :sample :full-scan :joins)})

(defsetting xray-max-cost
  "Cap resorce expanditure for all x-rays. (exact, approximate, or extended)"
  :type    :string
  :default "extended"
  :setter  (fn [new-value]
             (when-not (nil? new-value)
               (assert (contains? #{"exact" "approximate" "extended"} new-value)))
             (setting/set-string! :max-cost new-value)))

(defsetting enable-xrays
  "Should x-raying be available at all?"
  :type    :boolean
  :default true)

(def ^{:arglists '([max-cost])} linear-computation?
  "Limit computation to O(n) or better."
  (comp #{:linear} :computation))

(def ^{:arglists '([max-cost])} unbounded-computation?
  "Alow unbounded but always convergent computation.
   Default if no cost limit is specified."
  (comp (partial contains? #{:unbounded :yolo nil}) :computation))

(def ^{:arglists '([max-cost])} yolo-computation?
  "Alow any computation including full blown machine learning."
  (comp #{:yolo} :computation))

(def ^{:arglists '([max-cost])} cache-only?
  "Use cached data only."
  (comp #{:cache} :query))

(def ^{:arglists '([max-cost])} sample-only?
  "Only sample data."
  (comp #{:sample} :query))

(def ^{:arglists '([max-cost])} full-scan?
  "Alow full table scans.
   Default if no cost limit is specified."
  (comp (partial contains? #{:full-scan :joins nil}) :query))

(def ^{:arglists '([max-cost])} alow-joins?
  "Alow bringing in data from other tables if needed."
  (comp #{:joins} :query))
