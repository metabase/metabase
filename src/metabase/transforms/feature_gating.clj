(ns metabase.transforms.feature-gating
  (:require
   [metabase.premium-features.core :as premium-features]))

(defn query-transforms-enabled?
  "Query transforms: available in OSS, requires :transforms-basic feature in EE.
  Note: OSS intentionally gets query transforms without a license."
  []
  (or (not (premium-features/is-hosted?))
      (premium-features/has-feature? :transforms-basic)))

(defn python-transforms-enabled?
  "Python transforms: EE only, requires both :transforms-basic and :transforms-python."
  []
  (and (premium-features/has-feature? :transforms-basic)
       (premium-features/has-feature? :transforms-python)))

(defn enabled-source-types
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (query-transforms-enabled?) (into ["native" "mbql"])
    (python-transforms-enabled?) (conj "python")))

(defn any-transforms-enabled?
  "Whether any transforms are enabled."
  []
  (or (query-transforms-enabled?) (python-transforms-enabled?)))

(def ^:private metered-as->meter-key
  "Map the bucket strings returned by [[premium-features/transform-metered-as]] to their
   corresponding `:meters` keys in the harbormaster token-check response."
  {"transform-basic"    :transform-basic-runs
   "transform-advanced" :transform-advanced-runs})

(defn transform-locked?
  "True if the meter that would be charged for running this transform is locked.
   Returns false for non-metered transforms (OSS, self-hosted basic-only) and when
   no `:locked-meters` mirror has been written yet (cold cache, airgap)."
  [transform]
  (boolean
   (when-let [meter-key (some-> ((requiring-resolve 'metabase.transforms-base.util/transform-source-type)
                                 (:source transform))
                                premium-features/transform-metered-as
                                metered-as->meter-key)]
     (get (premium-features/locked-meters) meter-key))))

(defn transforms-meter-locked?
  "True if either of the two transforms meters (`:transform-basic-runs` or
   `:transform-advanced-runs`) is currently locked. Per harbormaster's
   mutual-exclusivity constraint, at most one of these is populated for a
   given customer, so this aggregate reduces to 'is the customer's active
   transforms meter, if any, locked?'. Backs the [[metabase.transforms.settings/transforms-meter-locked]]
   setting, which the frontend reads via `useSetting`."
  []
  (let [meters (premium-features/locked-meters)]
    (boolean (or (:transform-basic-runs meters)
                 (:transform-advanced-runs meters)))))
