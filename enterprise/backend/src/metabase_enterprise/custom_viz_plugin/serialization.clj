(ns metabase-enterprise.custom-viz-plugin.serialization
  "The SerDes of CustomVizPlugins. A plugin serializes as `custom_viz_plugins/<slug>/custom_viz_plugin.yaml` with its
  unpacked bundle beside it, and is identified by its `entity_id`, which the YAML carries as `data_app.yaml` does.
  `enabled` is per-instance, so it isn't serialized."
  (:require
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase.util :as u])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(def ^:private index-file
  "The resource file holding the plugin's built JavaScript, relative to its YAML file."
  "dist/index.js")

(defn- asset-file
  "The resource file holding the asset `asset-name`, relative to the plugin's YAML file."
  [asset-name]
  (str "dist/assets/" asset-name))

(defn- served-paths
  "Archive paths of the manifest, JS, and icon; `read-text` reads an archive path as a string, or nil."
  [read-text]
  (into [(manifest/manifest-path) index-file]
        (map (comp asset-file manifest/normalize-path))
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
  (cache/files->bundle (update-vals (u/remove-nils files) text->file)))

(def bundle-transform
  "The transform of the `bundle` of CustomVizPlugins, exported as the files beside their YAML."
  {:as     :serdes/resources
   :export (fn [_store plugins bundles _opts] (mapv export-bundle plugins bundles))
   :import (fn [_store _entities files _opts] (mapv import-bundle files))})

(defn after-export
  "The exported `entity` listing the files beside it, so an import knows which to read without opening the manifest."
  [entity]
  (cond-> entity
    (:serdes/resources entity) (assoc :files (vec (sort (keys (:serdes/resources entity)))))))

(defn storage-paths
  "The storage path of each of the CustomVizPlugin `entities`, slugified and deduplicated by `entity_id` like a
  collection's directory, so identifiers that slugify alike (`my-viz`, `my_viz`) get distinct directories."
  [entities _ctx]
  (mapv (fn [{:keys [identifier entity_id]}]
          [{:label "custom_viz_plugins"}
           {:label identifier :key entity_id}
           {:label "custom_viz_plugin"}])
        entities))

(defn resource-paths
  "The paths of the bundle files beside the CustomVizPlugin `entity`'s YAML."
  [{:keys [files]}]
  (when-not (or (nil? files) (sequential? files))
    (throw (ex-info (format "CustomVizPlugin files must be a list of paths, got: %s" (pr-str files))
                    {:files files})))
  files)

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defn- bundle-columns
  "Validates the imported bundle against its identifier using upload checks. Returns `:active` with manifest metadata,
  or `:error` with the reason and identifier as display name. Stores bytes and hash in either case."
  [{:keys [identifier ^bytes bundle]}]
  (try
    (->> (cache/validate-bundle! bundle)
         (cache/check-bundle-identifier! identifier)
         cache/derived-columns)
    (catch Exception e
      ;; the manifest-derived columns are cleared, not kept from a bundle the row no longer holds
      {:status           :error
       :error_message    (ex-message e)
       :display_name     identifier
       :bundle           bundle
       :bundle_hash      (some-> bundle cache/bytes-hash)
       :manifest         nil
       :icon             nil
       :metabase_version nil})))

(defn- check-bundle-size!
  "Throws if the imported `row`'s bundle is over the upload limit."
  [{:keys [identifier ^bytes bundle]}]
  ;; aborts the import instead of loading as :error like other bad bundles: an :error row still stores its bundle,
  ;; so the oversized bytes would land in the app DB, bypassing the upload limit
  (when (and bundle (> (alength bundle) cache/max-bundle-bytes))
    (throw (ex-info (format "The bundle of custom viz plugin \"%s\" is larger than %dMB. Shrink its files and import again."
                            identifier cache/max-bundle-mib)
                    {:identifier identifier :status-code 413}))))

(defn- check-registration!
  "Throws unless the imported plugin `row`, loaded over its `local` row or as new when nil, may hold its identifier."
  [{:keys [identifier]} local]
  ;; a `:` identifier never gets here: the spec's `:schema` refuses it, aborting the import
  ;; the unique index would refuse the write anyway, but with an error that doesn't say what to do
  (cache/check-identifier-free! identifier (:id local)
                                (format (str "A custom viz plugin \"%s\" already exists on this instance. Delete it and pull "
                                             "again: cards reference the plugin by its identifier, so they keep working "
                                             "once it is pulled.")
                                        identifier)))

(defn before-load
  "The CustomVizPlugin load `items`, refusing ones that can't be registered, without the bundles their local rows
  already hold, the others with the columns their bundles derive."
  [items]
  (mapv (fn [{:keys [row local] :as item}]
          (check-registration! row local)
          (check-bundle-size! row)
          (if (and local (some-> ^bytes (:bundle row) cache/bytes-hash (= (:bundle_hash local))))
            (update item :row dissoc :bundle)
            (update item :row #(merge % (bundle-columns %)))))
        items))

(defn after-load
  "Purges the cache of the CustomVizPlugins the `items` update."
  [items]
  (doseq [{:keys [local]} items
          :when local]
    (cache/purge-plugin-cache! {:id (:id local)})))
