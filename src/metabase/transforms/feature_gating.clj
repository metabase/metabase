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
  "Map the bucket strings returned by `premium-features/transform-metered-as` to their
   corresponding `:meters` keys in the harbormaster token-check response."
  {"transform-basic"    :transform-basic-runs
   "transform-advanced" :transform-advanced-runs})

(defn- transform-source-type
  "Return the source-type keyword (:python / :native / :mbql) for a transform map.
   Prefers the `:source_type` column (set by the model's before-insert/before-update).
   Falls back to a minimal derivation from `:source` for un-normalized test fixtures —
   we only need to distinguish python from query here, since native and mbql route to
   the same meter bucket via `transform-metered-as`."
  [transform]
  (or (some-> (:source_type transform) keyword)
      (case (some-> (get-in transform [:source :type]) keyword)
        :python :python
        :query  :native
        nil)))

(defn transform-locked?
  "True if the meter that would be charged for running this transform is locked.
   Returns false for non-metered transforms (OSS, self-hosted basic-only) and when
   no `:locked-meters` mirror has been written yet (cold cache, airgap)."
  [transform]
  (boolean
   (when-let [meter-key (some-> (transform-source-type transform)
                                premium-features/transform-metered-as
                                metered-as->meter-key)]
     (true? (get (premium-features/locked-meters) meter-key)))))
