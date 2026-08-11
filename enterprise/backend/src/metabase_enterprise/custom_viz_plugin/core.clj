(ns metabase-enterprise.custom-viz-plugin.core
  "Enterprise implementations of custom viz plugin functions using defenterprise."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise resolve-bundle
  "Enterprise implementation: resolve the JS bundle for a plugin."
  :feature :custom-viz
  [plugin]
  (cache/resolve-bundle plugin))
