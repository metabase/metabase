(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/CustomVizPlugin [_model] :custom_viz_plugin)

(t2/deftransforms :model/CustomVizPlugin
  {:status   mi/transform-keyword
   :manifest mi/transform-json})

(doto :model/CustomVizPlugin
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/CustomVizPlugin
  ([_instance]   api/*current-user-id*)
  ([_model _pk]  api/*current-user-id*))

(defmethod mi/can-write? :model/CustomVizPlugin
  ([_instance]   api/*is-superuser?*)
  ([_model _pk]  api/*is-superuser?*))

(defmethod mi/can-create? :model/CustomVizPlugin
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod mi/to-json :model/CustomVizPlugin
  "Never include the raw bundle bytes in JSON."
  [plugin json-generator]
  (next-method (dissoc plugin :bundle) json-generator))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- bundle->b64 ^String [^bytes b]
  (some-> b codecs/bytes->b64-str))

(defn- b64->bundle ^bytes [^String s]
  (some-> s codecs/b64->bytes))

(defmethod serdes/make-spec "CustomVizPlugin"
  [_model-name _opts]
  {:copy      [:display_name :identifier :enabled :icon :manifest :metabase_version :bundle_hash]
   :skip      [:dev_bundle_url :error_message]
   :defaults  {:enabled true}
   :transform {:created_at (serdes/date)
               :status     {:export (constantly ::serdes/skip)
                            :import (constantly "pending")}
               :bundle     {:export bundle->b64
                            :import b64->bundle}}})

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
