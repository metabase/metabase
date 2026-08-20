(ns metabase-enterprise.custom-viz-plugin.cache
  "Storage layer for custom visualization plugin bundles.

   Plugins are uploaded as tar+gzip archives. The raw archive bytes (and their
   SHA-256 hash) are stored in `custom_viz_plugin.bundle` / `bundle_hash`. On the
   first read of a bundle file or static asset, the archive is lazily extracted to
   a per-instance scratch directory under the OS temp dir and files are then
   served straight from the local filesystem. When a plugin's bundle is replaced
   or the plugin is deleted, the on-disk directory is evicted.

   Dev-only plugins (no uploaded bundle) live entirely off `dev_bundle_url` and bypass this storage
   altogether: the browser fetches them straight from the dev server, so the only dev concern here is
   validating and normalizing that URL before it reaches the CSP."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin :as custom-viz-plugin]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase.util :as u]
   [metabase.util.compress :as u.compress]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.net InetAddress URI)
   (java.nio.file CopyOption FileAlreadyExistsException Files FileVisitOption Path)
   (java.nio.file.attribute FileAttribute)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- bytes-hash [^bytes b]
  (-> b buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Layout ------------------------------------------------

;; The uploaded archive has the same layout as the previous git-sourced plugins:
;;   metabase-plugin.json  (manifest, at the archive root)
;;   dist/index.js         (the JS bundle)
;;   dist/assets/<icon>    (the manifest icon — the only servable asset)

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

(def ^:const ^:private max-uncompressed-bytes
  "Cap on total uncompressed bytes from a bundle archive. Set to 5x the
   compressed cap, which comfortably fits a real JS bundle + image assets but
   refuses tar bombs (which need 1000x+ ratios to be interesting)."
  (* 5 max-bundle-bytes))

(def ^:const ^:private max-entries
  "Cap on entry count in a bundle archive. A real plugin is just the manifest, the
   JS bundle, and the icon (plus a couple of directory entries); 16 leaves slack
   without inviting denial-of-service via metadata-only entries."
  16)

(def ^:private untgz-opts
  {:max-uncompressed-bytes max-uncompressed-bytes
   :max-entries            max-entries})

;;; ------------------------------------------------ Validate Bundle ------------------------------------------------

(defn- delete-recursive! [^Path path]
  (when (u.files/exists? path)
    (with-open [stream (Files/walk path (into-array FileVisitOption []))]
      (doseq [^Path p (rseq (vec (iterator-seq (.iterator stream))))]
        (try (Files/delete p)
             (catch Exception e
               (log/warnf "Failed to delete %s: %s" p (ex-message e))))))))

(defn validate-bundle!
  "Extract an uploaded tar+gzip `bundle-bytes` into a scratch directory and
   validate its contents against the expected layout. Returns
   `{:bytes bundle-bytes :hash sha :manifest m :version-str v}` on success.
   Throws ex-info with `:status-code 400` for any user-facing failure. Version
   mismatches don't fail validation; they surface as soft warnings at read time
   (see `manifest/warnings`)."
  [^bytes bundle-bytes]
  (when (or (nil? bundle-bytes) (zero? (alength bundle-bytes)))
    (throw (ex-info "Bundle is empty" {:status-code 400})))
  (let [scratch (Files/createTempDirectory "custom-viz-validate-"
                                           (into-array FileAttribute []))]
    (try
      (try
        (u.compress/untgz bundle-bytes (.toFile scratch) untgz-opts)
        (catch Exception e
          (if (:status-code (ex-data e))
            ;; tar-bomb / oversize / entry-count failures carry their own clear message — re-raise.
            (throw e)
            (throw (ex-info (str "Bundle is not a valid tar.gz archive: " (ex-message e))
                            {:status-code 400}
                            e)))))
      (let [manifest-file (.resolve scratch ^String (manifest/manifest-path))
            bundle-file   (.resolve scratch ^String (dist-path bundle-rel-path))
            _             (when-not (u.files/regular-file? manifest-file)
                            (throw (ex-info (str (manifest/manifest-path) " not found in bundle")
                                            {:status-code 400})))
            parsed        (or (manifest/parse-manifest (String. (Files/readAllBytes manifest-file) "UTF-8"))
                              (throw (ex-info (str (manifest/manifest-path) " is not valid JSON")
                                              {:status-code 400})))
            _             (when-not (u.files/regular-file? bundle-file)
                            (throw (ex-info (str (dist-path bundle-rel-path) " not found in bundle")
                                            {:status-code 400})))
            version-str   (get-in parsed [:metabase :version])]
        (when-let [error (manifest/validation-error parsed)]
          (throw (ex-info (format "%s is invalid: %s" (manifest/manifest-path) (pr-str error))
                          {:status-code 400})))
        (when (str/blank? (:name parsed))
          (throw (ex-info (str (manifest/manifest-path) " is missing a \"name\" field")
                          {:status-code 400})))
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
  (doto (u.files/get-path (System/getProperty "java.io.tmpdir") "metabase-custom-viz")
    u.files/create-dir-if-not-exists!))

(defn- plugin-cache-dir ^Path [id ^String bundle-hash]
  (u.files/append-to-path (custom-viz-cache-root) (str id "-" bundle-hash)))

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
  (let [keep   (str id "-" keep-hash)
        prefix (str id "-")]
    (doseq [^Path child (u.files/files-seq (custom-viz-cache-root))
            :let [name (str (.getFileName child))]
            :when (and (str/starts-with? name prefix) (not= name keep))]
      (delete-recursive! child))))

(defn- unpack-bundle!
  "Extract `bundle-bytes` into `dir`, creating it. Atomic-ish: unpacks into a
   sibling temp directory and renames into place so other threads never observe
   a half-written cache dir. Zip-slip is handled by `u.compress/untgz`, which
   resolves each entry under the temp dir via `TarArchiveEntry.resolveIn`."
  [^Path dir ^bytes bundle-bytes]
  (let [parent (.getParent dir)
        _      (u.files/create-dir-if-not-exists! parent)
        tmp    (Files/createTempDirectory parent (str (.getFileName dir) ".tmp.")
                                          (into-array FileAttribute []))]
    (try
      (u.compress/untgz bundle-bytes (.toFile tmp) untgz-opts)
      (Files/move tmp dir (into-array CopyOption []))
      (catch FileAlreadyExistsException _
        ;; Another thread won the race; keep their copy and discard ours.
        (delete-recursive! tmp))
      (catch Throwable t
        (delete-recursive! tmp)
        (throw t)))))

(defn- ensure-unpacked!
  "Guarantee that the cache dir for `plugin` is on disk. If `bundle` is null in the
   row (dev-only plugin) this returns nil. Returns the directory `Path` on success.

   Recomputes the SHA-256 of the stored bytes against `bundle_hash` before unpacking
   so a mismatch (DB corruption or tampering with one column but not the other) is
   refused rather than served."
  ^Path [{:keys [id bundle_hash]}]
  (when bundle_hash
    (let [dir (plugin-cache-dir id bundle_hash)]
      (when-not (u.files/exists? dir)
        (when-let [bundle-bytes (t2/select-one-fn :bundle :model/CustomVizPlugin :id id)]
          (let [actual-hash (bytes-hash bundle-bytes)]
            (when-not (= actual-hash bundle_hash)
              (throw (ex-info "Bundle integrity check failed: stored bytes do not match bundle_hash"
                              {:plugin-id id :expected bundle_hash :actual actual-hash}))))
          (unpack-bundle! dir bundle-bytes)
          (evict-other-cache-dirs! id bundle_hash)))
      dir)))

(defn purge-plugin-cache!
  "Remove on-disk cache dirs for `plugin` (typically because it's being deleted or
   updated). Safe to call even if no dir exists."
  [{:keys [id]}]
  (let [prefix (str id "-")]
    (doseq [^Path child (u.files/files-seq (custom-viz-cache-root))
            :when (str/starts-with? (str (.getFileName child)) prefix)]
      (delete-recursive! child))))

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
  (custom-viz-plugin/select-one-non-blob :id id))

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
      (when (u.files/regular-file? file)
        (Files/readAllBytes file)))))

(defn get-bundle
  "Get the JS bundle for an upload-backed plugin. Returns
   `{:content str :hash str}` or nil."
  [plugin]
  (when-let [bytes (read-cached-bytes plugin (dist-path bundle-rel-path))]
    {:content (String. bytes "UTF-8")
     :hash    (or (:bundle_hash plugin) (bytes-hash bytes))}))

(defn- asset-whitelisted?
  "Check whether an asset path is servable for the plugin. Only the manifest `icon`
   is servable — see [[metabase-enterprise.custom-viz-plugin.manifest/asset-paths]]."
  [{:keys [manifest]} ^String asset-path]
  (when manifest
    (let [allowed (set (manifest/asset-paths manifest))]
      (contains? allowed asset-path))))

(defn get-asset
  "Get a static asset for an upload-backed plugin. Returns a byte array or nil."
  ^bytes [plugin ^String asset-name]
  (read-cached-bytes plugin (dist-path (asset-rel-path asset-name))))

;;; ------------------------------------------------ Dev Server URL ------------------------------------------------

;; Dev plugins are loaded by the browser, straight from the developer's dev server.

(defn loopback-host?
  "Whether `host` names the machine the browser runs on: the name `localhost`"
  [^String host]
  (boolean
   (when-not (str/blank? host)
     (or (= "localhost" host)
         (try
           (.isLoopbackAddress (InetAddress/ofLiteral host))
           (catch Exception _ false))))))

(defn- parse-dev-url
  "Parse `url` into `{:origin \"scheme://host[:port]\"}` when it is usable as a dev server URL, or
   `{:problem \"...\"}` saying why not.

   One definition of the rule, shared by the write path ([[validate-dev-url!]], which throws the problem at
   the admin) and the read path ([[loopback-origin]], which just drops the row). Keeping them together is
   the point: if they could drift, a URL could be storable but never reach the CSP, or the reverse."
  [^String url]
  (if-let [uri (try (URI. url) (catch Exception _ nil))]
    (let [scheme (some-> (.getScheme uri) u/lower-case-en)
          host   (some-> (.getHost uri) u/lower-case-en)
          port   (.getPort uri)]
      (cond
        (not (contains? #{"http" "https"} scheme))
        {:problem (str "must use http or https, got: " (or scheme url))}

        (not (loopback-host? host))
        {:problem (str "must point at localhost, got: " (or host url))}

        (not (and (contains? #{nil "" "/"} (.getPath uri))
                  (nil? (.getQuery uri))
                  (nil? (.getFragment uri))))
        {:problem "must be a bare origin like http://localhost:5174, with no path or query."}

        :else
        {:origin (str scheme "://" host (when (pos? port) (str ":" port)))}))
    {:problem "is not a valid URL."}))

(defn validate-dev-url!
  "Validate a dev server URL, returning it normalized to a bare `scheme://host[:port]` origin, or throwing a
   400 naming what is wrong with it.

   The host must be loopback. The browser doing the fetching always runs on the developer's own machine, so
   every legitimate dev server is local, and holding the value to loopback is what makes widening
   `connect-src` to it harmless -- you cannot exfiltrate to another machine's loopback."
  ^String [^String url ^String label]
  (let [{:keys [origin problem]} (parse-dev-url url)]
    (when problem
      (throw (ex-info (str label " " problem) {:status-code 400 :url url})))
    origin))

(defn loopback-origin
  "The normalized origin of `url`, or nil unless [[validate-dev-url!]] would accept it.

   The read-path counterpart, used to build the CSP `connect-src` entry. Re-checking here rather than
   trusting what is stored keeps a row written before these rules existed from reaching the header; such a
   row simply contributes nothing instead of throwing."
  ^String [^String url]
  (:origin (parse-dev-url url)))

(defn set-or-clear-dev-bundle!
  "Set or clear the dev server URL for a plugin, normalized to an origin. Persists to the database."
  [id dev-bundle-url]
  (let [url (some-> (not-empty dev-bundle-url) (validate-dev-url! "Dev server URL"))]
    (t2/update! :model/CustomVizPlugin id {:dev_bundle_url url})))

(defn resolve-dev-bundle
  "Resolve the dev server URL for a plugin from the database. Returns the URL string or nil.
   Always returns nil when dev mode is disabled."
  [id]
  (when (custom-viz.settings/custom-viz-plugin-dev-mode-enabled)
    (not-empty (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))

;;; ------------------------------------------------ Resolve ------------------------------------------------

(defn resolve-asset
  "Resolve a static asset for an upload-backed plugin. Only serves assets whitelisted by the plugin's
   manifest. Returns a byte array or nil."
  ^bytes [plugin ^String asset-name]
  (when (asset-whitelisted? plugin asset-name)
    (get-asset plugin asset-name)))
