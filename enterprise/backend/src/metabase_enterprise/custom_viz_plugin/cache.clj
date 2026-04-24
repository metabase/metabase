(ns metabase-enterprise.custom-viz-plugin.cache
  "Storage layer for custom visualization plugin bundles.

   Plugins are uploaded as tar+gzip archives. The raw archive bytes (and their
   SHA-256 hash) are stored in `custom_viz_plugin.bundle` / `bundle_hash`. On the
   first read of a bundle file or static asset, the archive is lazily extracted to
   a per-instance scratch directory under the OS temp dir and files are then
   served straight from the local filesystem. When a plugin's bundle is replaced
   or the plugin is deleted, the on-disk directory is evicted.

   Dev-only plugins (no uploaded bundle) live entirely off `dev_bundle_url` and
   bypass this storage; only the dev http fetch helpers below are used for them."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files Path LinkOption FileVisitOption CopyOption FileAlreadyExistsException)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- bytes-hash [^bytes b]
  (-> b buddy-hash/sha256 codecs/bytes->hex))

(defn- string-hash [^String s]
  (bytes-hash (.getBytes s "UTF-8")))

;;; ------------------------------------------------ Layout ------------------------------------------------

;; The uploaded archive has the same layout as the previous git-sourced plugins:
;;   metabase-plugin.json  (manifest, at the archive root)
;;   dist/index.js         (the JS bundle)
;;   dist/assets/*         (static assets)

(def ^:private ^:const bundle-rel-path "index.js")

(defn- asset-rel-path ^String [^String asset-name] (str "assets/" asset-name))

(defn- dist-path
  "Prefix a relative path with `dist/` to match the bundle layout."
  ^String [^String rel-path]
  (str "dist/" rel-path))

;;; ------------------------------------------------ Size Limits ------------------------------------------------

(def ^:const max-bundle-mib
  "Maximum size of an uploaded plugin bundle, in MiB."
  5)

(def ^:const max-bundle-bytes
  "Maximum size of an uploaded plugin bundle, in bytes. See [[max-bundle-mib]]."
  (* max-bundle-mib 1024 1024))

;;; ------------------------------------------------ Validate Bundle ------------------------------------------------

(defn- delete-recursive! [^Path path]
  (when (Files/exists path (into-array LinkOption []))
    (with-open [stream (Files/walk path (into-array FileVisitOption []))]
      (doseq [^Path p (reverse (vec (.iterator stream)))]
        (try (Files/delete p)
             (catch Exception e
               (log/warnf "Failed to delete %s: %s" p (ex-message e))))))))

(defn- regular-file? [^Path path]
  (Files/isRegularFile path (into-array LinkOption [])))

(defn validate-bundle!
  "Extract an uploaded tar+gzip `bundle-bytes` into a scratch directory and
   validate its contents against the expected layout. Returns
   `{:bytes bundle-bytes :hash sha :manifest m :version-str v}` on success.
   Throws ex-info with `:status-code 400` for any user-facing failure."
  [^bytes bundle-bytes]
  (when (or (nil? bundle-bytes) (zero? (alength bundle-bytes)))
    (throw (ex-info "Bundle is empty" {:status-code 400})))
  (let [scratch (Files/createTempDirectory "custom-viz-validate-"
                                           (into-array FileAttribute []))]
    (try
      (try
        (u.compress/untgz bundle-bytes (.toFile scratch))
        (catch Exception e
          (throw (ex-info (str "Bundle is not a valid tar.gz archive: " (ex-message e))
                          {:status-code 400}
                          e))))
      (let [manifest-file (.resolve scratch (manifest/manifest-path))
            bundle-file   (.resolve scratch (dist-path bundle-rel-path))
            _             (when-not (regular-file? manifest-file)
                            (throw (ex-info (str (manifest/manifest-path) " not found in bundle")
                                            {:status-code 400})))
            parsed        (or (manifest/parse-manifest (String. (Files/readAllBytes manifest-file) "UTF-8"))
                              (throw (ex-info (str (manifest/manifest-path) " is not valid JSON")
                                              {:status-code 400})))
            _             (when-not (regular-file? bundle-file)
                            (throw (ex-info (str (dist-path bundle-rel-path) " not found in bundle")
                                            {:status-code 400})))
            version-str   (get-in parsed [:metabase :version])]
        (when (str/blank? (:name parsed))
          (throw (ex-info (str (manifest/manifest-path) " is missing a \"name\" field")
                          {:status-code 400})))
        (when (and version-str
                   (not (manifest/compatible? {:metabase_version version-str})))
          (throw (ex-info
                  (format "Plugin requires Metabase version %s but current version is %s"
                          version-str (:tag config/mb-version-info))
                  {:status-code 400 :metabase_version version-str})))
        {:bytes       bundle-bytes
         :hash        (bytes-hash bundle-bytes)
         :manifest    parsed
         :version-str version-str})
      (finally
        (delete-recursive! scratch)))))

;;; ------------------------------------------------ FS Cache ------------------------------------------------

(defn- custom-viz-cache-root
  "The on-disk cache root for extracted plugin bundles. Placed under the OS
   temp dir so it's per-instance and naturally reclaimed when the host is
   rebooted; [[ensure-unpacked!]] will lazily re-extract from the DB on the
   next serve after a wipe."
  ^Path []
  (let [root (.resolve (.toPath (io/file (System/getProperty "java.io.tmpdir"))) "metabase-custom-viz")]
    (Files/createDirectories root (into-array FileAttribute []))
    root))

(defn- plugin-cache-dir ^Path [id ^String bundle-hash]
  (.resolve (custom-viz-cache-root) (str id "-" bundle-hash)))

(defn- safe-resolve
  "Resolve `rel-path` under `base`, refusing to escape it. Used on the serve
   side to guard against caller-supplied asset paths that attempt traversal —
   the archive extraction itself is already zip-slip-safe via
   [[u.compress/untgz]]."
  ^Path [^Path base ^String rel-path]
  (let [resolved (.normalize (.resolve base rel-path))]
    (when (.startsWith resolved base)
      resolved)))

(defn- evict-other-cache-dirs!
  "Delete cache dirs for `id` that don't match `keep-hash`."
  [id ^String keep-hash]
  (let [root  (custom-viz-cache-root)
        keep  (str id "-" keep-hash)
        prefix (str id "-")]
    (with-open [stream (Files/list root)]
      (doseq [^Path child (vec (.iterator stream))]
        (let [name (str (.getFileName child))]
          (when (and (str/starts-with? name prefix)
                     (not= name keep))
            (delete-recursive! child)))))))

(defn- unpack-bundle!
  "Extract `bundle-bytes` into `dir`, creating it. Atomic-ish: unpacks into a
   sibling temp directory and renames into place so other threads never observe
   a half-written cache dir. Zip-slip is handled by `u.compress/untgz`, which
   resolves each entry under the temp dir via `TarArchiveEntry.resolveIn`."
  [^Path dir ^bytes bundle-bytes]
  (let [parent (.getParent dir)
        _      (Files/createDirectories parent (into-array FileAttribute []))
        tmp    (Files/createTempDirectory parent (str (.getFileName dir) ".tmp.")
                                          (into-array FileAttribute []))]
    (try
      (u.compress/untgz bundle-bytes (.toFile tmp))
      (Files/move tmp dir (into-array CopyOption []))
      (catch FileAlreadyExistsException _
        ;; Another thread won the race; keep their copy and discard ours.
        (delete-recursive! tmp))
      (catch Throwable t
        (delete-recursive! tmp)
        (throw t)))))

(defn- ensure-unpacked!
  "Guarantee that the cache dir for `plugin` is on disk. If `bundle` is null in the
   row (dev-only plugin) this returns nil. Returns the directory `Path` on success."
  ^Path [{:keys [id bundle_hash]}]
  (when bundle_hash
    (let [dir (plugin-cache-dir id bundle_hash)]
      (when-not (Files/isDirectory dir (into-array java.nio.file.LinkOption []))
        (let [bundle-bytes (t2/select-one-fn :bundle :model/CustomVizPlugin :id id)]
          (when (and bundle-bytes (not (Files/isDirectory dir (into-array java.nio.file.LinkOption []))))
            (unpack-bundle! dir bundle-bytes)
            (evict-other-cache-dirs! id bundle_hash))))
      dir)))

(defn purge-plugin-cache!
  "Remove on-disk cache dirs for `plugin` (typically because it's being deleted or
   updated). Safe to call even if no dir exists."
  [{:keys [id]}]
  (let [root   (custom-viz-cache-root)
        prefix (str id "-")]
    (with-open [stream (Files/list root)]
      (doseq [^Path child (vec (.iterator stream))]
        (when (str/starts-with? (str (.getFileName child)) prefix)
          (delete-recursive! child))))))

;;; ------------------------------------------------ Save Bundle ------------------------------------------------

(defn- derived-columns
  "DB columns derived from a validated bundle."
  [{:keys [bytes hash manifest version-str]}]
  {:status           :active
   :error_message    nil
   :bundle           bytes
   :bundle_hash      hash
   :manifest         manifest
   :display_name     (or (:name manifest) (:identifier manifest))
   :icon             (:icon manifest)
   :metabase_version version-str})

(defn save-bundle!
  "Persist a validated bundle for an existing plugin row, evict stale on-disk
   caches, and return the refreshed row."
  [{:keys [id]} validated]
  (t2/update! :model/CustomVizPlugin id (derived-columns validated))
  (purge-plugin-cache! {:id id})
  (t2/select-one :model/CustomVizPlugin :id id))

(defn insert-bundle!
  "Insert a new plugin row from a validated bundle and an `:identifier`. Returns
   the inserted row."
  [identifier validated]
  (t2/insert-returning-instance!
   :model/CustomVizPlugin
   (merge {:identifier identifier
           :enabled    true}
          (derived-columns validated))))

;;; ------------------------------------------------ Read From Cache ------------------------------------------------

(defn- read-cached-bytes
  "Read the bytes of `dist-rel-path` from the on-disk cache for `plugin`. Returns
   nil if the plugin has no bundle or the file is missing."
  ^bytes [plugin ^String dist-rel-path]
  (when-let [dir (try (ensure-unpacked! plugin)
                      (catch Exception e
                        (log/warnf "Failed to unpack plugin %d bundle: %s"
                                   (:id plugin) (ex-message e))
                        nil))]
    (when-let [^Path file (safe-resolve dir dist-rel-path)]
      (when (Files/isRegularFile file (into-array java.nio.file.LinkOption []))
        (Files/readAllBytes file)))))

(defn get-bundle
  "Get the JS bundle for an upload-backed plugin. Returns
   `{:content str :hash str}` or nil."
  [plugin]
  (when-let [bytes (read-cached-bytes plugin (dist-path bundle-rel-path))]
    {:content (String. bytes "UTF-8")
     :hash    (or (:bundle_hash plugin) (bytes-hash bytes))}))

(defn- asset-whitelisted?
  "Check whether an asset path is explicitly listed in the plugin's manifest."
  [{:keys [manifest]} ^String asset-path]
  (when manifest
    (let [allowed (set (manifest/asset-paths manifest))]
      (contains? allowed asset-path))))

(defn get-asset
  "Get a static asset for an upload-backed plugin. Returns a byte array or nil."
  ^bytes [plugin ^String asset-name]
  (read-cached-bytes plugin (dist-path (asset-rel-path asset-name))))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

(defn- allowed-schemes
  "Set of URL schemes allowed for dev bundle URLs. "
  []
  #{"http" "https"})

(defn- validate-url!
  "Validate that a URL uses an allowed scheme. Throws on invalid input."
  [^String url ^String label]
  (let [scheme (some-> (java.net.URI. url) .getScheme u/lower-case-en)]
    (when-not (contains? (allowed-schemes) scheme)
      (throw (ex-info (str label " must use http or https, got: " scheme)
                      {:status-code 400 :url url})))))

(defn dev-base-url
  "Validate and normalize the dev base URL. Ensures http/https scheme and trailing slash."
  ^String [^String url]
  (validate-url! url "Dev bundle URL")
  (if (str/ends-with? url "/") url (str url "/")))

(defn- dev-url
  "Build a full dev URL by joining the base URL with a relative path."
  ^String [^String base-url ^String relative-path]
  (str (dev-base-url base-url) relative-path))

(def ^:private http-opts
  {:socket-timeout 5000 :connection-timeout 5000})

(defn fetch-dev-bundle
  "Fetch a JS bundle from a dev base URL.
   Returns {:content str :hash str} or nil."
  [^String base-url]
  (let [content (:body (http/get (dev-url base-url bundle-rel-path)
                                 (assoc http-opts :as :string)))]
    {:content content
     :hash    (string-hash content)}))

(defn fetch-dev-manifest
  "Fetch and parse the manifest from a dev base URL.
   Returns the parsed manifest map or nil on failure."
  [^String base-url]
  (try
    (let [content (:body (http/get (dev-url base-url (manifest/manifest-path))
                                   (assoc http-opts :as :string)))]
      (manifest/parse-manifest content))
    (catch Exception e
      (log/debugf "No manifest at %s: %s" base-url (ex-message e))
      nil)))

(defn fetch-dev-asset
  "Fetch a static asset from a dev base URL.
   Returns the bytes or nil on failure."
  ^bytes [^String base-url ^String asset-name]
  (:body (http/get (dev-url base-url (asset-rel-path asset-name))
                   (assoc http-opts :as :byte-array))))

(defn set-or-clear-dev-bundle!
  "Set or clear the dev base URL for a plugin. Persists to the database."
  [id dev-bundle-url]
  (let [url (not-empty dev-bundle-url)]
    (some-> url (validate-url! "Dev bundle URL"))
    (t2/update! :model/CustomVizPlugin id {:dev_bundle_url url})))

(defn resolve-dev-bundle
  "Resolve the dev bundle URL for a plugin from the database. Returns the URL string or nil.
   Always returns nil when dev mode is disabled."
  [id]
  (when (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
    (not-empty (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))

;;; ------------------------------------------------ Resolve ------------------------------------------------

(defn resolve-bundle
  "Resolve the JS bundle for a plugin, respecting dev bundle URL if set.
   Returns {:content str :hash str} or nil."
  [plugin]
  (let [id      (:id plugin)
        dev-url (resolve-dev-bundle id)]
    (if dev-url
      (fetch-dev-bundle dev-url)
      (get-bundle plugin))))

(defn resolve-asset
  "Resolve a static asset for a plugin, respecting dev base URL if set.
   Only serves assets whitelisted by the plugin's manifest.
   Returns a byte array or nil."
  ^bytes [plugin ^String asset-name]
  (when (asset-whitelisted? plugin asset-name)
    (if-let [dev-url (resolve-dev-bundle (:id plugin))]
      (fetch-dev-asset dev-url asset-name)
      (get-asset plugin asset-name))))
