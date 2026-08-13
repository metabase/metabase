(ns metabase.transforms.usage
  "Meter-related limit checking for transforms"
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.transforms-base.util :as transforms-base.u]))

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
   (when-let [meter-key (some-> (:source transform)
                                transforms-base.u/transform-source-type
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
