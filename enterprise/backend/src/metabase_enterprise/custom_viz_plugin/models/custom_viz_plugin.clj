(ns metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin
  (:require
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.db :as custom-viz-plugin.db]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.log :as log]
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

;; A plugin serializes as `custom_viz_plugins/<slug>/custom_viz_plugin.yaml` with its unpacked bundle beside it.
;; `enabled` is per-instance, so it isn't serialized.

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
  "The bundle files exported beside the YAML, as [[with-bundle-files]] unpacked them."
  [plugin _k bundle]
  (if bundle
    (served-files (or (::bundle-files plugin) (cache/bundle->files bundle)))
    ::serdes/skip))

(defn- with-bundle-files
  "`plugin` with its bundle unpacked for [[export-bundle]], or nil, with a warning, when it can't be. Exported
  without its files, the plugin would get an empty bundle on the next import."
  [{:keys [identifier bundle] :as plugin}]
  (try
    (assoc plugin ::bundle-files (cache/bundle->files bundle))
    (catch Exception e
      (log/warnf "Not exporting custom viz plugin \"%s\": its bundle can't be unpacked: %s" identifier (ex-message e))
      nil)))

(defn- import-bundle
  "The archive of the `files` read from beside a plugin's YAML. A file that isn't there is left out, and
  validation names it."
  [files]
  (cache/files->bundle (into {}
                             (keep (fn [[path content]]
                                     (when content
                                       [path (text->file content)])))
                             files)))

(defmethod serdes/make-spec "CustomVizPlugin"
  [_model-name _opts]
  {:schema    ::custom-viz-plugin.schema/external-custom-viz-plugin
   :copy      [:entity_id :identifier]
   :skip      [;; derived from the bundle at import time (see [[bundle-columns]]), exactly as on upload
               :display_name :icon :manifest :metabase_version :bundle_hash :status :error_message
               ;; admin-owned state of this instance
               :enabled
               ;; dev-only plugins are never served from another instance
               :dev_bundle_url]
   :transform {:bundle {:as                  :serdes/resources
                        :export-with-context export-bundle
                        :import              import-bundle}}
   :post-extract (fn [entity]
                   (assoc entity :files (vec (sort (keys (:serdes/resources entity))))))})

(defn- case-colliding-identifiers
  "The lower-cased identifiers that more than one of `identifiers` share: an import refuses the second of them
  anywhere, so none of them is exported."
  [identifiers]
  (into #{}
        (keep (fn [[lowered group]]
                (when (next group)
                  (log/warnf "Not exporting custom viz plugins %s: their identifiers differ only in case"
                             (str/join ", " (map #(str \" % \") (sort group))))
                  lowered)))
        (group-by u/lower-case-en identifiers)))

(defmethod serdes/extract-query "CustomVizPlugin"
  [model-name {:keys [filter-column filter-ids] :as opts}]
  ;; skip what an import would refuse: dev-only plugins, case-colliding identifiers, identifiers registration no
  ;; longer accepts, and bundles that can't be unpacked. Skipped plugins are named in the log and still served on
  ;; this instance.
  (let [colliding (case-colliding-identifiers
                   (custom-viz-plugin.db/plugin-identifiers-with-bundles filter-column filter-ids))]
    (eduction (comp (remove (fn [{:keys [identifier]}]
                              (or (contains? colliding (u/lower-case-en identifier))
                                  (when-let [error (manifest/directory-name-error identifier)]
                                    (log/warnf "Not exporting custom viz plugin: %s" error)
                                    true))))
                    (keep with-bundle-files))
              (custom-viz-plugin.db/reducible-plugins-with-bundles filter-column filter-ids
                                                                   (serdes/extract-order-columns model-name opts)))))

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

(defn- check-identifier-free!
  "Throws if another plugin than `maybe-local` already holds `identifier`, ignoring case, so case-only variants
  can't become two plugins."
  [identifier maybe-local]
  (when-let [existing (custom-viz-plugin.db/plugin-identifier-ignoring-case identifier (:id maybe-local))]
    (if (= existing identifier)
      ;; the unique index would refuse the write anyway, but with an error that doesn't say what to do
      (throw (ex-info (format (str "A custom viz plugin \"%s\" already exists on this instance. Delete it and pull "
                                   "again: cards reference the plugin by its identifier, so they keep working once "
                                   "it is pulled.")
                              identifier)
                      {:status-code 400}))
      (throw (ex-info (format "Custom viz plugin \"%s\" differs only in case from the existing plugin \"%s\""
                              identifier existing)
                      {:status-code 400})))))

(defmethod serdes/load-one! "CustomVizPlugin"
  [{:keys [identifier] :as ingested} maybe-local]
  ;; a new plugin is a registration, so it is held to the directory-name rule; an existing one may predate it
  (when (nil? maybe-local)
    (when-let [error (manifest/directory-name-error identifier)]
      (throw (ex-info error {:status-code 400}))))
  (check-identifier-free! identifier maybe-local)
  (serdes/default-load-one! ingested maybe-local))

(defmethod serdes/load-insert! "CustomVizPlugin"
  [_model-name ingested]
  (custom-viz-plugin.db/insert-plugin! (merge ingested (bundle-columns ingested))))

(defmethod serdes/load-update! "CustomVizPlugin"
  [_model-name ingested {:keys [id]}]
  (custom-viz-plugin.db/update-plugin! id (merge ingested (bundle-columns ingested)))
  (cache/purge-plugin-cache! {:id id})
  (custom-viz-plugin.db/non-blob-plugin id))

(defmethod serdes/generate-path "CustomVizPlugin" [model-name entity]
  ;; identified by `entity_id` as every entity is; labelled by the identifier, which has no `name` column to come from
  (serdes/maybe-labeled model-name entity :identifier))

(defmethod serdes/storage-path "CustomVizPlugin" [{:keys [identifier entity_id]} _ctx]
  ;; slugified and deduplicated by `entity_id` like a collection's directory, so identifiers that slugify alike
  ;; (`my-viz`, `my_viz`) get distinct directories
  [{:label "custom_viz_plugins"}
   {:label identifier :key entity_id}
   {:label "custom_viz_plugin"}])

(defmethod serdes/resource-paths "CustomVizPlugin" [{:keys [files]}]
  (when-not (or (nil? files) (sequential? files))
    (throw (ex-info (format "CustomVizPlugin files must be a list of paths, got: %s" (pr-str files))
                    {:files files})))
  files)
