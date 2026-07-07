(ns metabase-enterprise.custom-viz-plugin.core
  "Enterprise implementations of custom viz plugin functions using defenterprise."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin :as models.custom-viz-plugin]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise resolve-enabled-plugin
  "Enterprise implementation: look up an enabled plugin by `identifier`, excluding
   the bundle blob (re-fetched lazily from the cache by [[resolve-bundle]])."
  :feature :custom-viz
  [identifier]
  (models.custom-viz-plugin/select-one-non-blob :identifier identifier :enabled true))

(defenterprise resolve-bundle
  "Enterprise implementation: resolve the JS bundle for a plugin."
  :feature :custom-viz
  [plugin]
  (cache/resolve-bundle plugin))

(defenterprise resolve-asset
  "Enterprise implementation: resolve a static asset for a plugin."
  :feature :custom-viz
  [plugin asset-path]
  (cache/resolve-asset plugin asset-path))

(defenterprise asset-paths
  "Enterprise implementation: list static asset names from the manifest."
  :feature :custom-viz
  [parsed-manifest]
  (manifest/asset-paths parsed-manifest))

(defenterprise asset-content-type
  "Enterprise implementation: return the MIME content type for an allowed asset file."
  :feature :custom-viz
  [path]
  (manifest/asset-content-type path))
