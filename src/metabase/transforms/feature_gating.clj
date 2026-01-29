(ns metabase.transforms.feature-gating
  (:require
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]))

(defn query-transforms-enabled?
  "Query transforms: available in OSS, requires :transforms feature in EE.
  Note: OSS intentionally gets query transforms without a license."
  []
  (or (not config/ee-available?)
      (premium-features/has-feature? :transforms)))

(defn python-transforms-enabled?
  "Python transforms: EE only, requires both :transforms and :transforms-python."
  []
  (and (premium-features/has-feature? :transforms)
       (premium-features/has-feature? :transforms-python)))

(defn enabled-source-types
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (query-transforms-enabled?) (into ["native" "mbql"])
    (python-transforms-enabled?) (conj "python")))
