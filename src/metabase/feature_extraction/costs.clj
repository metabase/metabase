(ns metabase.feature-extraction.costs
  "Predicates for limiting resource expanditure during feature extraction."
  (:require [metabase.models.setting :refer [defsetting] :as setting]
            [puppetlabs.i18n.core :refer [tru]]
            [schema.core :as s]))

(def ^:private query-costs {:cache     1
                            :sample    2
                            :full-scan 3
                            :joins     4
                            nil        3})

(def ^:private computation-costs {:linear    1
                                  :unbounded 2
                                  :yolo      3
                                  nil        2})

(def MaxCost
  "Schema for `max-cost` parameter."
  {:computation (apply s/enum (keys computation-costs))
   :query       (s/enum (keys query-costs))})

(def MaxCostBundles
  "Predefined `max-cost` bundles."
  (s/maybe (s/enum "exact" "approximate" "extended")))

(defsetting xray-max-cost
  (tru "Cap resorce expanditure for all x-rays. (exact, approximate, or extended)")
  :type    :string
  :default "extended"
  :setter  (fn [new-value]
             (s/validate MaxCostBundles new-value)
             (setting/set-string! :xray-max-cost new-value)))

(def ^:private max-cost-bundles {"exact"       {:query       :full-scan
                                                :computation :unbounded}
                                 "approximate" {:query       :sample
                                                :computation :linear}
                                 "extended"    {:query       :joins
                                                :computation :unbounded}})

(defn apply-global-cost-cap
  "Cap given cost specification with `xray-max-cost`."
  [max-cost]
  (let [max-cost-cap (max-cost-bundles (xray-max-cost))]
    {:query       (:query
                   (if (> (-> max-cost :query query-costs)
                          (-> max-cost-cap :query query-costs ))
                     max-cost-cap
                     max-cost))
     :computation (:computation
                   (if (> (-> max-cost :computation computation-costs)
                          (-> max-cost-cap :computation computation-costs ))
                     max-cost-cap
                     max-cost))}))

(defsetting enable-xrays
  (tru "Should x-raying be available at all?")
  :type    :boolean
  :default true)

(defn- min-cost
  [costs min-cost]
  (fn [cost]
    (<= (costs min-cost) (costs cost))))

(def ^{:arglists '([max-cost])} linear-computation?
  "Limit computation to O(n) or better."
  (comp (min-cost computation-costs :linear) :computation))

(def ^{:arglists '([max-cost])} unbounded-computation?
  "Allow unbounded but always convergent computation.
   Default if no cost limit is specified."
  (comp (min-cost computation-costs :unbounded) :computation))

(def ^{:arglists '([max-cost])} yolo-computation?
  "Allow any computation including full blown machine learning."
  (comp (min-cost computation-costs :yolo) :computation))

(def ^{:arglists '([max-cost])} cache-only?
  "Use cached data only."
  (comp (min-cost query-costs :cache) :query))

(def ^{:arglists '([max-cost])} sample-only?
  "Only sample data."
  (comp (min-cost query-costs :sample) :query))

(def ^{:arglists '([max-cost])} full-scan?
  "Allow full table scans.
   Default if no cost limit is specified."
  (comp (min-cost query-costs :full-scan) :query))

(def ^{:arglists '([max-cost])} allow-joins?
  "Allow bringing in data from other tables if needed."
  (comp (min-cost query-costs :joins) :query))
