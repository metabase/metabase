(ns metabase.transforms.feature-gating
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.transforms.interface :as transforms.i]))

(defn query-transforms-enabled?
  "Query transforms: available in OSS, requires :transforms feature in EE.
  Note: OSS intentionally gets query transforms without a license."
  []
  (or (not (premium-features/is-hosted?))
      (premium-features/has-feature? :transforms)))

(defn python-transforms-enabled?
  "Python transforms: EE only, requires both :transforms and :transforms-python."
  []
  (and (premium-features/has-feature? :transforms)
       (premium-features/has-feature? :transforms-python)))

(defn runner-transforms-enabled?
  "Runner-based transforms (JavaScript, Clojure, etc.): EE only,
  requires both :transforms and :transforms-python.
  All runner languages piggyback on the :transforms-python feature flag because adding
  per-language flags requires coordination with product/token teams. This is intentional."
  []
  (and (premium-features/has-feature? :transforms)
       (premium-features/has-feature? :transforms-python)))

(defn runner-language-types
  "All runner-based language type strings (excluding Python which has its own feature flag).
  Derived dynamically from the transforms hierarchy."
  []
  (into []
        (comp (remove #{:python})
              (map name))
        (transforms.i/runner-languages)))

(defn enabled-source-types
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (query-transforms-enabled?) (into ["native" "mbql"])
    (python-transforms-enabled?) (conj "python")
    (runner-transforms-enabled?) (into (runner-language-types))))

(defn any-transforms-enabled?
  "Whether any transforms are enabled."
  []
  (or (query-transforms-enabled?) (python-transforms-enabled?) (runner-transforms-enabled?)))
