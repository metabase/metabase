(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase-enterprise.custom-viz-plugin.serialization :as custom-viz-plugin.serialization]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.serialization.core :as serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.sql Blob)))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/CustomVizPlugin [_model] :custom_viz_plugin)

(defn- blob->bytes ^bytes [v]
  (cond
    (nil? v)           nil
    (instance? Blob v) (let [^Blob b v] (.getBytes b 1 (int (.length b))))
    :else              v))

(def ^:private transform-bundle
  "Coerce JDBC `Blob` values into plain byte arrays on read."
  {:in  identity
   :out blob->bytes})

(t2/deftransforms :model/CustomVizPlugin
  {:status   mi/transform-keyword
   :manifest mi/transform-json
   :bundle   transform-bundle})

(defn- with-bundle-hash
  "The `row` with `bundle_hash` matching the `bundle` it sets."
  [row]
  (cond-> row
    (contains? row :bundle) (assoc :bundle_hash (some-> ^bytes (:bundle row) cache/bytes-hash))))

(t2/define-before-insert :model/CustomVizPlugin
  [plugin]
  (with-bundle-hash plugin))

(t2/define-before-update :model/CustomVizPlugin
  [plugin]
  (merge plugin (some-> (t2/changes plugin) with-bundle-hash)))

(doto :model/CustomVizPlugin
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/timestamped?))

(defmethod events/spec :model/CustomVizPlugin
  [_model]
  {:create :event/custom-viz-plugin-create
   :update :event/custom-viz-plugin-update
   :delete :event/custom-viz-plugin-delete})

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some? api/*current-user-id*))))

(methodical/defmethod t2/simple-hydrate [:model/CustomVizPlugin :can_write]
  [_model k instance]
  (assoc instance k (boolean api/*is-superuser?*)))

(defmethod mi/can-create? :model/CustomVizPlugin
  [_model _instance]
  api/*is-superuser?*)

(methodical/defmethod mi/to-json :model/CustomVizPlugin
  "Never include the raw bundle bytes in JSON."
  [plugin json-generator]
  (next-method (dissoc plugin :bundle) json-generator))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema        ::custom-viz-plugin.schema/external-custom-viz-plugin
   :identity      [:identifier]
   :copy          [:display_name :identifier :enabled :icon :manifest :metabase_version]
   :skip          [:status :error_message :dev_bundle_url :bundle_hash]
   :defaults      {:enabled true}
   :transform     {:bundle custom-viz-plugin.serialization/bundle-transform}
   :rows-by-refs  custom-viz-plugin.serialization/rows-by-refs
   :storage-paths custom-viz-plugin.serialization/storage-paths
   :before-load   custom-viz-plugin.serialization/before-load
   :after-load    custom-viz-plugin.serialization/after-load})
