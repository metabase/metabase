(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-asset
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CustomVizPluginAsset [_model] :custom_viz_plugin_asset)

(doto :model/CustomVizPluginAsset
  (derive :metabase/model))
