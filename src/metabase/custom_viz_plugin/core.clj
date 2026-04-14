(ns metabase.custom-viz-plugin.core
  "OSS stubs for custom visualization plugin functions.
   Enterprise implementations are in metabase-enterprise.custom-viz-plugin.core."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise resolve-bundle
  "Resolve the JS bundle for a plugin. Returns {:content str :hash str} or nil.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_plugin]
  nil)

(defenterprise resolve-asset
  "Resolve a static asset for a plugin. Returns a byte array or nil.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_plugin _asset-path]
  nil)

(defenterprise asset-paths
  "List the static asset names from the manifest.
   OSS: always returns empty vector."
  metabase-enterprise.custom-viz-plugin.core
  [_parsed-manifest]
  [])

(defenterprise asset-content-type
  "Return the MIME content type for an allowed asset file, or nil if not recognized.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_path]
  nil)
