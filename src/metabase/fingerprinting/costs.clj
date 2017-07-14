(ns metabase.fingerprinting.costs
  "Predicates for limiting resource expanditure during fingerprinting."
  (:require [schema.core :as s]))

(def MaxCost
  "Schema for max-cost parameter."
  {:computation (s/enum :linear :unbounded :yolo)
   :query       (s/enum :cache :sample :full-scan :joins)})

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
