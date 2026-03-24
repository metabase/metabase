(ns metabase.custom-viz-plugin.cache
  "Cache layer for custom visualization plugin bundles and static assets.
   Fetches files from git repos, caches in memory and on disk."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.custom-viz-plugin.git :as git]
   [metabase.custom-viz-plugin.manifest :as manifest]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ In-Memory Cache ------------------------------------------------

;; plugin-id -> {:content str, :hash str, :commit str}
(defonce ^:private bundle-cache (atom {}))
;; plugin-id -> monotonic nano-time timestamp of last failed fetch
(defonce ^:private last-fetch-failure-ns (atom {}))

;;; ---------------------------------------- In-memory dev bundle URLs -----------------------------------------

;; dev_bundle_url is transient (only useful while a dev server is running),
;; so we store it in memory rather than the database. Cleared on restart.
(defonce dev-bundle-urls
  (atom {})) ;; {plugin-id -> url-string}

(def ^:private ^:const fetch-failure-cooldown-ms (* 5 60 1000))

;;; ------------------------------------------------ Disk Cache ------------------------------------------------

(defn- disk-cache-dir ^File []
  (io/file (System/getProperty "java.io.tmpdir") "metabase-custom-viz-plugins" "bundles"))

(defn- disk-cache-file ^File [plugin-id]
  (io/file (disk-cache-dir) (str plugin-id ".js")))

(defn- asset-cache-dir ^File [plugin-id]
  (io/file (System/getProperty "java.io.tmpdir") "metabase-custom-viz-plugins" "assets" (str plugin-id)))

(defn- asset-cache-file ^File [plugin-id ^String asset-path]
  (io/file (asset-cache-dir plugin-id) asset-path))

(defn- write-to-disk! [plugin-id ^String content]
  (let [f (disk-cache-file plugin-id)]
    (io/make-parents f)
    (spit f content)))

(defn- read-from-disk [plugin-id]
  (let [f (disk-cache-file plugin-id)]
    (when (.exists f)
      {:content (slurp f)})))

(defn- delete-from-disk! [plugin-id]
  (let [f (disk-cache-file plugin-id)]
    (when (.exists f)
      (.delete f))))

(defn- write-asset-to-disk! [plugin-id ^String asset-path ^bytes content]
  (let [f (asset-cache-file plugin-id asset-path)]
    (io/make-parents f)
    (with-open [out (io/output-stream f)]
      (.write out content))))

(defn- read-asset-from-disk ^bytes [plugin-id ^String asset-path]
  (let [f (asset-cache-file plugin-id asset-path)]
    (when (.exists f)
      (let [ba (byte-array (.length f))]
        (with-open [in (io/input-stream f)]
          (.read in ba))
        ba))))

(defn- delete-assets-from-disk! [plugin-id]
  (let [d (asset-cache-dir plugin-id)]
    (when (.exists d)
      (org.apache.commons.io.FileUtils/deleteDirectory d))))

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- content-hash [^String content]
  (-> content .getBytes buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Asset Cache ------------------------------------------------

;; plugin-id -> {asset-path -> byte-array}
(defonce ^:private asset-cache (atom {}))

(defn get-asset
  "Get a cached static asset for a plugin. Checks in-memory first, then disk.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-path]
  (or (get-in @asset-cache [plugin-id asset-path])
      (when-let [bytes (read-asset-from-disk plugin-id asset-path)]
        (swap! asset-cache assoc-in [plugin-id asset-path] bytes)
        bytes)))

;;; ------------------------------------------------ Fetch & Cache ------------------------------------------------

(defn- in-failure-cooldown?
  [plugin-id]
  (when-let [last-failure-ns (get @last-fetch-failure-ns plugin-id)]
    (< (/ (- (System/nanoTime) last-failure-ns) 1e6)
       fetch-failure-cooldown-ms)))

(defn- fetch-and-cache-assets!
  "Fetch and cache static assets from the plugin repo based on the manifest whitelist."
  [conn commit-sha plugin-id parsed-manifest]
  (when parsed-manifest
    (doseq [path (manifest/asset-paths parsed-manifest)]
      (when-let [bytes (git/read-file-bytes conn commit-sha path)]
        (swap! asset-cache assoc-in [plugin-id path] bytes)
        (write-asset-to-disk! plugin-id path bytes)))))

(defn fetch-and-cache!
  "Fetch index.js and manifest from the plugin's git repo, update both caches and DB record.
   Returns the cached entry or nil on failure."
  ([plugin]
   (fetch-and-cache! plugin nil))
  ([{:keys [id repo_url access_token pinned_version identifier]}
    {:keys [force?] :or {force? false}}]
   (if (and (not force?) (in-failure-cooldown? id))
     nil
     (try
       (let [conn          (git/create-repo-connection repo_url access_token)
             _             (git/fetch! conn)
             ref-to-use    (or pinned_version "HEAD")
             commit-sha    (git/resolve-ref conn ref-to-use)
             _             (when-not commit-sha
                             (throw (ex-info (str "Cannot resolve ref: " ref-to-use) {:ref ref-to-use})))
             content       (git/read-file conn commit-sha "dist/index.js")
             _             (when-not content
                             (throw (ex-info "dist/index.js not found in repository" {:commit commit-sha})))
             ;; read manifest (optional)
             manifest-str  (git/read-file conn commit-sha (manifest/manifest-path))
             parsed        (when manifest-str (manifest/parse-manifest manifest-str))
             version-str   (get-in parsed [:metabase :version])
             ;; check version compatibility
             _             (when (and version-str
                                      (not (manifest/compatible? {:metabase_version version-str})))
                             (throw (ex-info
                                     (format "Plugin requires Metabase version %s but current version is %s"
                                             version-str
                                             (str "v" (config/current-major-version)))
                                     {:metabase_version version-str})))
             hash          (content-hash content)
             cache-entry   {:content content :hash hash :commit commit-sha}]
         ;; update caches
         (swap! bundle-cache assoc id cache-entry)
         (swap! last-fetch-failure-ns dissoc id)
         (write-to-disk! id content)
         ;; cache static assets
         (fetch-and-cache-assets! conn commit-sha id parsed)
         ;; update DB — display_name and icon always come from manifest
         (t2/update! :model/CustomVizPlugin id
                     {:status            :active
                      :error_message     nil
                      :resolved_commit   commit-sha
                      :manifest          manifest-str
                      :display_name      (or (:name parsed) identifier)
                      :icon              (:icon parsed)
                      :metabase_version  version-str})
         cache-entry)
       (catch Exception e
         (swap! last-fetch-failure-ns assoc id (System/nanoTime))
         (t2/update! :model/CustomVizPlugin id
                     {:status        :error
                      :error_message (ex-message e)})
         nil)))))

;;; ------------------------------------------------ Get / Evict ------------------------------------------------

(defn get-bundle
  "Get the JS bundle for a plugin. Checks in-memory first, then disk."
  [plugin-id]
  (or (get @bundle-cache plugin-id)
      (when-let [{:keys [content]} (read-from-disk plugin-id)]
        (let [entry {:content content :hash (content-hash content)}]
          (swap! bundle-cache assoc plugin-id entry)
          entry))))

(defn evict!
  "Remove a plugin from both caches (bundle and assets)."
  [plugin-id]
  (swap! bundle-cache dissoc plugin-id)
  (swap! asset-cache dissoc plugin-id)
  (swap! last-fetch-failure-ns dissoc plugin-id)
  (delete-from-disk! plugin-id)
  (delete-assets-from-disk! plugin-id))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

(defn fetch-dev-bundle
  "Fetch a JS bundle from a dev URL. Returns {:content str :hash str} or nil."
  [^String url]
  (try
    (let [content (slurp (java.net.URI. url))]
      {:content content
       :hash    (str (hash content))})
    (catch Exception e
      (throw (ex-info (str "Failed to fetch dev bundle from " url ": " (.getMessage e))
                      {:status-code 502})))))

(defn resolve-bundle
  "Resolve the JS bundle for a plugin, respecting dev bundle URL if set.
   Returns {:content str :hash str} or nil."
  [plugin]
  (let [id      (:id plugin)
        dev-url (get @dev-bundle-urls id)]
    (if dev-url
      (fetch-dev-bundle dev-url)
      (or (get-bundle id)
          (fetch-and-cache! plugin)))))
