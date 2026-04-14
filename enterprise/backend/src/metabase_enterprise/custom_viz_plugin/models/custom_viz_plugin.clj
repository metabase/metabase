(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CustomVizPlugin [_model] :custom_viz_plugin)

(t2/deftransforms :model/CustomVizPlugin
  {:access_token mi/transform-encrypted-json
   :status       mi/transform-keyword
   :manifest     mi/transform-json})

(doto :model/CustomVizPlugin
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/CustomVizPlugin
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-write? :model/CustomVizPlugin
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-create? :model/CustomVizPlugin
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod mi/to-json :model/CustomVizPlugin
  "Never include the access token in JSON."
  [plugin json-generator]
  (next-method (dissoc plugin :access_token) json-generator))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/make-spec "CustomVizPlugin"
  [_model-name {:keys [include-custom-viz-token]}]
  {:copy      [:repo_url :display_name :identifier
               :pinned_version :resolved_commit :enabled :icon
               :manifest :metabase_version]
   :skip      [:dev_bundle_url :error_message]
   :defaults  {:enabled true}
   :transform {:created_at   (serdes/date)
               :status       {:export (constantly ::serdes/skip)
                              :import (constantly "pending")}
               :access_token {:export (if include-custom-viz-token
                                        identity
                                        (constantly ::serdes/skip))
                              :import identity}}})

(defmethod serdes/entity-id "CustomVizPlugin" [_ {:keys [identifier]}]
  identifier)

(defmethod serdes/generate-path "CustomVizPlugin" [_ entity]
  [{:model "CustomVizPlugin"
    :id    (:identifier entity)
    :label (:identifier entity)}])

(defmethod serdes/hash-fields :model/CustomVizPlugin
  [_model]
  [:identifier])

(defmethod serdes/load-find-local "CustomVizPlugin" [path]
  (let [{:keys [id]} (last path)]
    (t2/select-one :model/CustomVizPlugin :identifier id)))

(defmethod serdes/storage-path "CustomVizPlugin" [entity _ctx]
  [{:label "custom_viz_plugins"} {:label (:identifier entity)}])
