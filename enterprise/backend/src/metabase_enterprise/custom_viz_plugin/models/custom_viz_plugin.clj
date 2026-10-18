(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.schema]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util.log :as log]
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

;; A plugin serializes as `custom_viz_plugins/<identifier>/custom_viz_plugin.yaml` with its bundle unpacked beside it,
;; laid out as `npx @metabase/custom-viz pack` archives it: `metabase-plugin.json` at the root, `dist/index.js`, and
;; the icon the manifest names under `dist/assets/`. The YAML holds only what the bundle can't derive. An import
;; packs those files back into an archive, so a plugin's files are what a repository reviews and what an instance
;; stores.

(def ^:private index-file
  "The resource file holding the plugin's built JavaScript, relative to its YAML file."
  "dist/index.js")

(defn- asset-file
  "The resource file holding the asset `asset-name`, relative to the plugin's YAML file."
  [asset-name]
  (str "dist/assets/" asset-name))

(defmethod serdes/make-spec "CustomVizPlugin"
  [_model-name _opts]
  {:copy      [:identifier :enabled]
   :skip      [;; derived from the bundle at import time (see [[bundle-columns]]), exactly as on upload
               :display_name :icon :manifest :metabase_version :bundle_hash :status :error_message
               ;; dev-only plugins are never served from another instance
               :dev_bundle_url]
   :defaults  {:enabled true}
   :transform {:bundle     {:as     :serdes/resources
                            :export (fn [bundle]
                                      (if bundle
                                        (try
                                          (cache/bundle->files bundle)
                                          (catch Exception e
                                            ;; a stored archive that can't be read exports as the YAML alone, so one
                                            ;; broken plugin doesn't fail the export; it imports as an error plugin
                                            (log/warnf "Not exporting custom viz plugin bundle: %s" (ex-message e))
                                            ::serdes/skip))
                                        ::serdes/skip))
                            ;; a file that isn't there is left out, and validation names it
                            :import (fn [files]
                                      (cache/files->bundle (into {} (filter val) files)))}}})

(defmethod serdes/extract-query "CustomVizPlugin"
  [model-name {:keys [filter-column filter-ids] :as opts}]
  ;; a dev-only plugin has no bundle to export; an identifier that can't name a directory is skipped as the runtime
  ;; `/list` skips it
  (eduction (remove (fn [{:keys [identifier]}]
                      (when-let [error (manifest/identifier-error identifier)]
                        (log/warnf "Not exporting custom viz plugin: %s" error)
                        true)))
            (custom-viz-plugin.db/reducible-plugins-with-bundles filter-column filter-ids
                                                                 (serdes/extract-order-columns model-name opts))))

(defn- bundle-columns
  "Columns derived from validating the imported `bundle` bytes against the imported `identifier`: the `:active` state
  plus manifest-derived metadata when the bundle is valid and named for this plugin, or the `:error` state with the
  reason when it is not. The bytes and their hash are stored either way, so an error row is consistent, and an error
  row is named by its identifier. The same checks guard a bundle upload."
  [{:keys [identifier ^bytes bundle]}]
  (try
    (->> (cache/validate-bundle! bundle)
         (cache/check-bundle-identifier! identifier)
         cache/derived-columns)
    (catch Exception e
      {:status        :error
       :error_message (ex-message e)
       :display_name  identifier
       :bundle        bundle
       :bundle_hash   (some-> bundle cache/bytes-hash)})))

(defn- check-directory!
  "Throws unless the directory an ingested plugin was read from, when known, is named by its identifier."
  [{:keys [identifier] :as ingested}]
  (when-let [directory (:serdes/directory ingested)]
    (when-not (= directory identifier)
      (throw (ex-info (format "custom_viz_plugins/%s: the directory must be named by the plugin's identifier, \"%s\""
                              directory identifier)
                      {:status-code 400})))))

(defn- check-identifier-case!
  "Throws when a plugin exists whose identifier equals `identifier` except for case: it would be a second plugin
  wherever identifiers are case-sensitive, and an unexplained unique-index failure wherever they are not."
  [identifier]
  (when-let [existing (custom-viz-plugin.db/plugin-identifier-ignoring-case identifier)]
    (throw (ex-info (format "Custom viz plugin \"%s\" differs only in case from the existing plugin \"%s\""
                            identifier existing)
                    {:status-code 400}))))

(defmethod serdes/load-one! "CustomVizPlugin"
  [{:keys [identifier] :as ingested} maybe-local]
  (check-directory! ingested)
  (when (nil? maybe-local)
    (check-identifier-case! identifier))
  (serdes/default-load-one! ingested maybe-local))

(defmethod serdes/load-insert! "CustomVizPlugin"
  [_model-name ingested]
  ;; `enabled` absent from the file means disabled, whatever the column's default
  (custom-viz-plugin.db/insert-plugin! (merge {:enabled false} ingested (bundle-columns ingested))))

(defmethod serdes/load-update! "CustomVizPlugin"
  [_model-name ingested {:keys [id]}]
  (custom-viz-plugin.db/update-plugin! id (merge {:enabled false} ingested (bundle-columns ingested)))
  (cache/purge-plugin-cache! {:id id})
  (custom-viz-plugin.db/non-blob-plugin id))

(defmethod serdes/entity-id "CustomVizPlugin" [_ {:keys [identifier]}]
  identifier)

(defmethod serdes/generate-path "CustomVizPlugin" [_ entity]
  [{:model "CustomVizPlugin"
    :id    (:identifier entity)
    :label (:identifier entity)}])

(defmethod serdes/load-find-local "CustomVizPlugin" [path]
  (let [{:keys [id]} (last path)]
    (custom-viz-plugin.db/plugin-by-identifier id)))

(defmethod serdes/storage-path "CustomVizPlugin" [{:keys [identifier]} _ctx]
  ;; the directory is the identifier verbatim: it is checked against the identifier on import
  [{:label "custom_viz_plugins"}
   {:label identifier :key identifier :style :slug}
   {:label "custom_viz_plugin"}])

(defmethod serdes/resource-paths "CustomVizPlugin" [_ingested read-text]
  ;; the files an instance serves: the manifest, the JavaScript, and the icon the manifest names
  (into [(manifest/manifest-path) index-file]
        (map asset-file)
        (manifest/asset-paths (some-> (read-text (manifest/manifest-path)) manifest/parse-manifest))))

(defmethod serdes/binary-resources? "CustomVizPlugin" [_ingested]
  true)
