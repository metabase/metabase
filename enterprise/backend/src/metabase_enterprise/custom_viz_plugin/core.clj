(ns metabase-enterprise.custom-viz-plugin.core
  "Enterprise implementations of custom viz plugin functions using defenterprise."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise enabled-plugin
  "Enterprise implementation: the enabled plugin with `identifier`, without its bundle blob."
  :feature :custom-viz
  [identifier]
  (custom-viz-plugin.db/enabled-non-blob-plugin-by-identifier identifier))

(defenterprise resolve-bundle
  "Enterprise implementation: resolve the JS bundle for a plugin."
  :feature :custom-viz
  [plugin]
  (cache/resolve-bundle plugin))
