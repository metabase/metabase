(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.api.common :as api]
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
  (derive :hook/timestamped?))

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(defmethod mi/can-read? :model/CustomVizPlugin
  ([_instance]   (some? api/*current-user-id*))
  ([_model _pk]  (some? api/*current-user-id*)))

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

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema    ::custom-viz-plugin.schema/external-custom-viz-plugin
   :identity  [:identifier]
   :copy      [:display_name :identifier :enabled :icon :manifest :metabase_version]
   :skip      [:status :error_message :dev_bundle_url :bundle_hash]
   :defaults  {:enabled true}
   :transform {:bundle {:export (fn [_store _batch bundles _opts] (mapv bundle->b64 bundles))
                        :import (fn [_store _batch encoded _opts] (mapv b64->bundle encoded))}}})

(defmethod serialization/rows-by-refs :model/CustomVizPlugin [_ identifiers columns]
  (let [identifiers (filterv some? identifiers)
        rows        (when (seq identifiers)
                      (custom-viz-plugin.db/plugins-by-identifiers
                       identifiers
                       (some->> columns (concat [:id :identifier]) distinct vec)))]
    (reduce (fn [found {:keys [identifier] :as row}]
              (cond-> found
                (not (contains? found identifier)) (assoc identifier row)))
            {}
            rows)))

(defn- bundle-columns
  "Columns derived from validating the imported `bundle` bytes against the imported `identifier`: the `:active` state
  plus manifest-derived metadata when the bundle is valid and named for this plugin, or the `:error` state with the
  reason when it is not. The same checks guard a bundle upload."
  [{:keys [identifier bundle]}]
  (try
    (->> (cache/validate-bundle! bundle)
         (cache/check-bundle-identifier! identifier)
         cache/derived-columns)
    (catch Exception e
      {:status        :error
       :error_message (ex-message e)})))

(defmethod serialization/storage-paths :model/CustomVizPlugin [_ entities _ctx]
  (mapv (fn [entity]
          [{:label "custom_viz_plugins"} {:label (:identifier entity)}])
        entities))

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defmethod serialization/before-load :model/CustomVizPlugin [_ items]
  (mapv (fn [{:keys [row local] :as item}]
          (if (and local (some-> ^bytes (:bundle row) cache/bytes-hash (= (:bundle_hash local))))
            (update item :row dissoc :bundle)
            (update item :row #(merge % (bundle-columns %)))))
        items))

(defmethod serialization/after-load :model/CustomVizPlugin [_ items]
  (doseq [{:keys [local]} items
          :when local]
    (cache/purge-plugin-cache! {:id (:id local)})))
