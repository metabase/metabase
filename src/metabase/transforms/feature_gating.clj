(ns metabase.transforms.feature-gating
  (:require
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.malli :as mu]))

(mu/defn enabled-source-types :- [:set :string]
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (cond-> #{}
    (premium-features/query-transforms-enabled?) (into ["native" "mbql"])
    (premium-features/python-transforms-enabled?) (conj "python")))

(mu/defn enabled-source-types-for-user :- [:maybe [:set :string]]
  "Returns set of enabled source types for WHERE clause filtering."
  []
  (when (api/entitled-data-analyst?)
    (enabled-source-types)))
