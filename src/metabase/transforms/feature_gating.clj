(ns metabase.transforms.feature-gating
  (:require
   [metabase.premium-features.core :as premium-features]))

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
  "Runner-based transforms (JavaScript, Clojure, R, Julia, etc.): EE only,
  requires both :transforms and :transforms-python (shared runner infrastructure)."
  []
  (and (premium-features/has-feature? :transforms)
       (premium-features/has-feature? :transforms-python)))

(def ^{:doc "All runner-based language type strings (excluding Python which has its own feature flag)."}
  runner-language-types
  ["javascript" "clojure" "r" "julia"])

(defn enabled-source-types
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (query-transforms-enabled?) (into ["native" "mbql"])
    (python-transforms-enabled?) (conj "python")
    (runner-transforms-enabled?) (into runner-language-types)))

(defn any-transforms-enabled?
  "Whether any transforms are enabled."
  []
  (or (query-transforms-enabled?) (python-transforms-enabled?) (runner-transforms-enabled?)))
