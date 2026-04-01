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

(defenterprise get-bundle
  "Get the cached JS bundle for a plugin. Returns {:content str :hash str} or nil.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_plugin-id]
  nil)

(defenterprise get-asset
  "Get a cached static asset for a plugin. Returns a byte array or nil.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_plugin-id _asset-path]
  nil)

(defenterprise parse-manifest
  "Parse a manifest JSON string. Returns the parsed map or nil.
   OSS: always returns nil."
  metabase-enterprise.custom-viz-plugin.core
  [_json-str]
  nil)

(defenterprise asset-paths
  "List the static asset names from the manifest.
   OSS: always returns empty vector."
  metabase-enterprise.custom-viz-plugin.core
  [_parsed-manifest]
  [])
