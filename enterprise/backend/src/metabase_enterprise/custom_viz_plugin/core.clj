(ns metabase-enterprise.custom-viz-plugin.core
  "Enterprise implementations of custom viz plugin functions using defenterprise."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise resolve-bundle
  "Enterprise implementation: resolve the JS bundle for a plugin."
  :feature :custom-viz
  [plugin]
  (cache/resolve-bundle plugin))

(defenterprise get-bundle
  "Enterprise implementation: get the cached JS bundle for a plugin."
  :feature :custom-viz
  [plugin-id]
  (cache/get-bundle plugin-id))

(defenterprise get-asset
  "Enterprise implementation: get a cached static asset for a plugin."
  :feature :custom-viz
  [plugin-id asset-path]
  (cache/get-asset plugin-id asset-path))

(defenterprise resolve-asset
  "Enterprise implementation: resolve a static asset, respecting dev bundle URL."
  :feature :custom-viz
  [plugin-id asset-path]
  (cache/resolve-asset plugin-id asset-path))

(defenterprise parse-manifest
  "Enterprise implementation: parse a manifest JSON string."
  :feature :custom-viz
  [json-str]
  (manifest/parse-manifest json-str))

(defenterprise asset-paths
  "Enterprise implementation: list static asset names from the manifest."
  :feature :custom-viz
  [parsed-manifest]
  (manifest/asset-paths parsed-manifest))
