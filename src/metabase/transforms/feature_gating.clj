(ns metabase.transforms.feature-gating
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.util.malli :as mu]))

(mu/defn enabled-source-types :- [:set :string]
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (premium-features/query-transforms-enabled?) (into ["native" "mbql"])
    (premium-features/python-transforms-enabled?) (conj "python")))
