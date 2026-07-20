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
