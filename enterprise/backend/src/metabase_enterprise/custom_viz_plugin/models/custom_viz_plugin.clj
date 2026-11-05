(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
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
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :entity_id :identifier :display_name :icon :status :error_message :enabled
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

;; A pull deletes a plugin through the model, not the API, so the on-disk bundle cache is evicted here.
(t2/define-before-delete :model/CustomVizPlugin
  [plugin]
  (cache/purge-plugin-cache! plugin))

;;; ------------------------------------------------- Serialization --------------------------------------------------

;; A plugin serializes as `custom_viz_plugins/<slug>/custom_viz_plugin.yaml` with its unpacked bundle beside it, and
;; is identified by its `entity_id`, which the YAML carries as `data_app.yaml` does. `enabled` is per-instance, so it
;; isn't serialized.

(def ^:private index-file
  "The resource file holding the plugin's built JavaScript, relative to its YAML file."
  "dist/index.js")

(defn- asset-file
  "The resource file holding the asset `asset-name`, relative to the plugin's YAML file."
  [asset-name]
  (str "dist/assets/" asset-name))

(defn- normalize-path
  "`path` without dot segments"
  [^String path]
  (str (.normalize (java.nio.file.Path/of path (into-array String [])))))

(defn- served-paths
  "Archive paths of the manifest, JS, and icon; `read-text` reads an archive path as a string, or nil."
  [read-text]
  (into [(manifest/manifest-path) index-file]
        (map (comp asset-file normalize-path))
        (manifest/asset-paths (some-> (read-text (manifest/manifest-path)) manifest/parse-manifest))))

(defn- file->text
  "The bytes of an archive file as the text of its file."
  ^String [^bytes content]
  (String. content StandardCharsets/UTF_8))

(defn- text->file
  "The `content` of a text file as the bytes an archive holds."
  ^bytes [^String content]
  (.getBytes content StandardCharsets/UTF_8))

(defn- served-files
  "`files` (archive path -> bytes) narrowed to [[served-paths]], as text. Extra files such as source maps are
  dropped, since an import would ignore them."
  [files]
  (let [read-text (fn [path] (some-> ^bytes (get files path) file->text))]
    (into {}
          (keep (fn [path]
                  (when-some [text (read-text path)]
                    [path text])))
          (served-paths read-text))))

(defn- export-bundle
  "The files of `plugin`'s stored `bundle` exported beside its YAML, or nil for a dev-only plugin, which has none. A
  bundle that can't be unpacked fails the export: exported without its files, the plugin would get an empty bundle on
  the next import."
  [{:keys [identifier]} ^bytes bundle]
  (when bundle
    (try
      (served-files (cache/bundle->files bundle))
      (catch Exception e
        (throw (ex-info (format "The bundle of custom viz plugin \"%s\" can't be unpacked: %s Upload it again, or delete the plugin."
                                identifier (ex-message e))
                        {:identifier identifier}
                        e))))))

(defn- import-bundle
  "The archive of the `files` read from beside a plugin's YAML. A file that isn't there is left out, and
  validation names it."
  [files]
  (cache/files->bundle (into {}
                             (keep (fn [[path content]]
                                     (when content
                                       [path (text->file content)])))
                             files)))

(defmethod serialization/spec :model/CustomVizPlugin [_]
  {:schema       ::custom-viz-plugin.schema/external-custom-viz-plugin
   :copy         [:entity_id :identifier]
   :skip         [;; derived from the bundle at import time (see [[bundle-columns]]), exactly as on upload
                  :display_name :icon :manifest :metabase_version :bundle_hash :status :error_message
                  ;; admin-owned state of this instance
                  :enabled
                  ;; dev-only plugins are never served from another instance
                  :dev_bundle_url]
   :transform    {:bundle {:as     :serdes/resources
                           :export (fn [_store plugins bundles _opts] (mapv export-bundle plugins bundles))
                           :import (fn [_store _entities files _opts] (mapv import-bundle files))}}
   ;; the YAML lists the files beside it, so an import knows which to read without opening the manifest
   :after-export (fn [entity]
                   (cond-> entity
                     (:serdes/resources entity) (assoc :files (vec (sort (keys (:serdes/resources entity)))))))})

(defmethod serialization/storage-paths :model/CustomVizPlugin [_ entities _ctx]
  ;; slugified and deduplicated by `entity_id` like a collection's directory, so identifiers that slugify alike
  ;; (`my-viz`, `my_viz`) get distinct directories
  (mapv (fn [{:keys [identifier entity_id]}]
          [{:label "custom_viz_plugins"}
           {:label identifier :key entity_id}
           {:label "custom_viz_plugin"}])
        entities))

(defmethod serialization/resource-paths :model/CustomVizPlugin [{:keys [files]}]
  (when-not (or (nil? files) (sequential? files))
    (throw (ex-info (format "CustomVizPlugin files must be a list of paths, got: %s" (pr-str files))
                    {:files files})))
  files)

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defn- bundle-columns
  "Validates the imported bundle against its identifier using upload checks. Returns `:active` with manifest metadata,
  or `:error` with the reason and identifier as display name. Stores bytes and hash in either case, unless oversized."
  [{:keys [identifier ^bytes bundle]}]
  (try
    (->> (cache/validate-bundle! bundle)
         (cache/check-bundle-identifier! identifier)
         cache/derived-columns)
    (catch Exception e
      (let [storable (when (and bundle (<= (alength bundle) cache/max-bundle-bytes)) bundle)]
        ;; the manifest-derived columns are cleared, not kept from a bundle the row no longer holds
        {:status           :error
         :error_message    (ex-message e)
         :display_name     identifier
         :bundle           storable
         :bundle_hash      (some-> storable cache/bytes-hash)
         :manifest         nil
         :icon             nil
         :metabase_version nil}))))

(defn check-identifier-free!
  "Throws a 400 if a plugin other than `except-id` (nil for none) already holds `identifier`, ignoring case, so
  case-only variants can't become two plugins. `exists-message` is the error when it holds exactly `identifier`."
  [identifier except-id exists-message]
  (when-let [existing (custom-viz-plugin.db/plugin-identifier-ignoring-case identifier except-id)]
    (throw (ex-info (if (= existing identifier)
                      exists-message
                      (format "Custom viz plugin \"%s\" differs only in case from the existing plugin \"%s\""
                              identifier existing))
                    {:status-code 400}))))

(defn- check-registration!
  "Throws unless the imported plugin `row`, loaded over its `local` row or as new when nil, may hold its identifier."
  [{:keys [identifier]} local]
  ;; a new plugin is a registration, so it is held to the directory-name rule; an existing one may predate it
  (when (nil? local)
    (when-let [error (manifest/directory-name-error identifier)]
      (throw (ex-info error {:status-code 400}))))
  ;; the unique index would refuse the write anyway, but with an error that doesn't say what to do
  (check-identifier-free! identifier (:id local)
                          (format (str "A custom viz plugin \"%s\" already exists on this instance. Delete it and pull "
                                       "again: cards reference the plugin by its identifier, so they keep working "
                                       "once it is pulled.")
                                  identifier)))

(defmethod serialization/before-load :model/CustomVizPlugin [_ items]
  (mapv (fn [{:keys [row local] :as item}]
          (check-registration! row local)
          (if (and local (some-> ^bytes (:bundle row) cache/bytes-hash (= (:bundle_hash local))))
            (update item :row dissoc :bundle)
            (update item :row #(merge % (bundle-columns %)))))
        items))

(defmethod serialization/after-load :model/CustomVizPlugin [_ items]
  (doseq [{:keys [local]} items
          :when local]
    (cache/purge-plugin-cache! {:id (:id local)})))

;;; -------------------------------------------------- Remote sync ----------------------------------------------------

(defmethod remote-sync/spec :model/CustomVizPlugin
  [_model]
  ;; a dev-only plugin has no stored bundle: it is this instance's alone, a push has nothing to write for it, and a
  ;; pull must not remove it
  {:label                :identifier
   :synced-filter-clause (fn [alias _opts] [:not= (u/qualified-key alias :bundle_hash) nil])})
