(ns metabase-enterprise.custom-viz-plugin.cache
  "Fetches custom visualization plugin bundles and assets from git repos and stores
   them in PostgreSQL. Serves via a local disk cache to avoid repeated DB reads.
   Git is only accessed on register/refresh."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.custom-viz-plugin.models.custom-viz-plugin-asset]
   [metabase-enterprise.remote-sync.source.git :as rs.git]
   [metabase.config.core :as config]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- Disk Cache -----------------------------------------

;; Read-through disk cache backed by the database. Each pod lazily populates its
;; local disk from the DB on first access. Invalidated on fetch-and-update!.

(defn- cache-dir ^File []
  (io/file (System/getProperty "java.io.tmpdir") "metabase-custom-viz-plugins"))

(defn- asset-cache-file ^File [plugin-id ^String commit ^String asset-path]
  (io/file (cache-dir) (str plugin-id) commit asset-path))

(defn- write-disk-cache-bytes! [^File f ^bytes content]
  (io/make-parents f)
  (with-open [out (io/output-stream f)]
    (.write out content)))

(defn invalidate-disk-cache!
  "Remove all cached files for a plugin."
  [plugin-id]
  (let [plugin-dir (io/file (cache-dir) (str plugin-id))]
    (when (.exists plugin-dir)
      (org.apache.commons.io.FileUtils/deleteDirectory plugin-dir))))

;;; ---------------------------------------- Dev bundle URLs -----------------------------------------

;; In-memory cache for dev_bundle_url values persisted in the database.
;; Acts as a read-through cache: populated lazily from the DB on first access.
(defonce ^:private dev-bundle-urls
  (atom {})) ;; {plugin-id -> url-string | ::none}

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- content-hash [^String content]
  (-> content .getBytes buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Fetch & Store ------------------------------------------------

(def ^:private ^:const max-single-asset-bytes
  "Maximum size for a single asset file (2 MB)."
  (* 2 1024 1024))

(def ^:private ^:const max-total-plugin-bytes
  "Maximum total size of all assets for a single plugin (20 MB)."
  (* 20 1024 1024))

(defn- repo-asset-paths
  "List all file paths under `dist/assets/` in the repo, returned relative to that prefix."
  [snapshot]
  (let [prefix "dist/assets/"]
    (->> (rs.git/list-files snapshot)
         (filter #(str/starts-with? % prefix))
         (map #(subs % (count prefix))))))

(def ^:private ^:const bundle-asset-path
  "Well-known asset path used to store the JS bundle."
  "__bundle__/index.js")

(defn- store-asset!
  "Store a single asset, enforcing per-file and running total size limits.
   Returns the new running total, or throws if a limit is exceeded."
  [plugin-id ^String path ^bytes bytes total-bytes]
  (let [size      (alength bytes)
        new-total (+ total-bytes size)]
    (when (> size max-single-asset-bytes)
      (throw (ex-info (format "Asset %s exceeds maximum size of %d bytes (%d bytes)"
                              path max-single-asset-bytes size)
                      {:path path :size size})))
    (when (> new-total max-total-plugin-bytes)
      (throw (ex-info (format "Plugin exceeds maximum total asset size of %d bytes"
                              max-total-plugin-bytes)
                      {:total new-total})))
    (t2/insert! :model/CustomVizPluginAsset
                {:plugin_id plugin-id
                 :path      path
                 :content   bytes})
    new-total))

(defn- store-assets!
  "Fetch the bundle and whitelisted assets from the git snapshot and store them
   in the database. Replaces all existing assets for the plugin.
   Enforces per-file (2 MB) and per-plugin (20 MB) size limits."
  [snapshot plugin-id parsed-manifest]
  (t2/delete! :model/CustomVizPluginAsset :plugin_id plugin-id)
  (let [total (long 0)
        ;; store the JS bundle
        total (if-let [bytes (rs.git/read-file-bytes snapshot "dist/index.js")]
                (store-asset! plugin-id bundle-asset-path bytes total)
                total)]
    ;; store manifest-whitelisted assets
    (when parsed-manifest
      (let [declared    (manifest/asset-paths parsed-manifest)
            available   (repo-asset-paths snapshot)
            asset-names (manifest/expand-globs declared available)]
        (reduce (fn [total asset-name]
                  (if-let [bytes (rs.git/read-file-bytes snapshot (str "dist/assets/" asset-name))]
                    (store-asset! plugin-id asset-name bytes total)
                    total))
                total
                asset-names)))))

(defn fetch-and-update!
  "Fetch index.js, manifest, and assets from the plugin's git repo, store everything
   in the database. Returns the commit SHA or nil on failure."
  ([plugin]
   (fetch-and-update! plugin nil))
  ([{:keys [id repo_url access_token pinned_version identifier]} _opts]
   (try
     (let [source        (rs.git/git-source repo_url nil access_token)
           ref-to-use    (or pinned_version "HEAD")
           snapshot      (rs.git/snapshot-at-ref source ref-to-use)
           commit-sha    (rs.git/commit-sha source ref-to-use)
           _             (when-not (rs.git/read-file snapshot "dist/index.js")
                           (throw (ex-info "dist/index.js not found in repository" {:commit commit-sha})))
           manifest-str  (rs.git/read-file snapshot (manifest/manifest-path))
           parsed        (when manifest-str (manifest/parse-manifest manifest-str))
           version-str   (get-in parsed [:metabase :version])
           _             (when (and version-str
                                    (not (manifest/compatible? {:metabase_version version-str})))
                           (throw (ex-info
                                   (format "Plugin requires Metabase version %s but current version is %s"
                                           version-str
                                           (str "v" (config/current-major-version)))
                                   {:metabase_version version-str})))]
       ;; store assets + metadata atomically
       (t2/with-transaction [_conn]
         (store-assets! snapshot id parsed)
         (t2/update! :model/CustomVizPlugin id
                     {:status            :active
                      :error_message     nil
                      :resolved_commit   commit-sha
                      :manifest          manifest-str
                      :display_name      (or (:name parsed) identifier)
                      :icon              (:icon parsed)
                      :metabase_version  version-str}))
       ;; invalidate local disk cache so next read picks up new content
       (invalidate-disk-cache! id)
       commit-sha)
     (catch Exception e
       (t2/update! :model/CustomVizPlugin id
                   {:status        :error
                    :error_message (ex-message e)})
       nil))))

;;; ------------------------------------------------ Get ------------------------------------------------

(defn get-asset
  "Get a whitelisted static asset for a plugin. Checks disk cache first, falls back to DB.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-path]
  (when-let [{:keys [resolved_commit]}
             (t2/select-one [:model/CustomVizPlugin :resolved_commit]
                            :id plugin-id)]
    (when resolved_commit
      (let [f (asset-cache-file plugin-id resolved_commit asset-path)]
        (if (.exists f)
          (let [ba (byte-array (.length f))]
            (with-open [in (io/input-stream f)]
              (.read in ba))
            ba)
          (when-let [{:keys [content]}
                     (t2/select-one [:model/CustomVizPluginAsset :content]
                                    :plugin_id plugin-id
                                    :path      asset-path)]
            (write-disk-cache-bytes! f content)
            content))))))

(defn get-bundle
  "Get the JS bundle for a plugin. Checks disk cache first, falls back to DB."
  [plugin-id]
  (when-let [bytes (get-asset plugin-id bundle-asset-path)]
    (let [content (String. ^bytes bytes "UTF-8")]
      {:content content :hash (content-hash content)})))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

(defn- dev-base-url
  "Ensure the base URL ends with a slash for proper path joining."
  ^String [^String url]
  (if (str/ends-with? url "/") url (str url "/")))

(defn fetch-dev-bundle
  "Fetch a JS bundle from a dev base URL (appends /index.js).
   Returns {:content str :hash str} or nil."
  [^String base-url]
  (let [url (str (dev-base-url base-url) "index.js")]
    (try
      (let [content (slurp (java.net.URI. url))]
        {:content content
         :hash    (str (hash content))})
      (catch Exception e
        (throw (ex-info (str "Failed to fetch dev bundle from " url ": " (.getMessage e))
                        {:status-code 502}))))))

(defn fetch-dev-asset
  "Fetch a static asset from a dev base URL (appends /assets/<path>).
   Returns the bytes or nil on failure."
  ^bytes [^String base-url ^String asset-path]
  (let [url (str (dev-base-url base-url) "assets/" asset-path)]
    (try
      (with-open [in (.openStream (.toURL (java.net.URI. url)))]
        (.readAllBytes in))
      (catch Exception e
        (throw (ex-info (str "Failed to fetch dev asset from " url ": " (.getMessage e))
                        {:status-code 502}))))))

(defn set-or-clear-dev-bundle!
  "Set or clear the dev base URL for a plugin. Persists to the database and updates the in-memory cache."
  [id dev-bundle-url]
  (let [url (when (seq dev-bundle-url) dev-bundle-url)]
    (t2/update! :model/CustomVizPlugin id {:dev_bundle_url url})
    (if url
      (swap! dev-bundle-urls assoc id url)
      (swap! dev-bundle-urls assoc id ::none))))

(defn resolve-dev-bundle
  "Resolve the dev bundle URL for a plugin. Checks in-memory cache first, falls back to DB."
  [id]
  (let [cached (get @dev-bundle-urls id)]
    (if (some? cached)
      (when-not (= cached ::none) cached)
      (let [url (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id)]
        (if (seq url)
          (do (swap! dev-bundle-urls assoc id url)
              url)
          (do (swap! dev-bundle-urls assoc id ::none)
              nil))))))

;;; ------------------------------------------------ Resolve ------------------------------------------------

(defn resolve-bundle
  "Resolve the JS bundle for a plugin, respecting dev bundle URL if set.
   Returns {:content str :hash str} or nil."
  [plugin]
  (let [id      (:id plugin)
        dev-url (resolve-dev-bundle id)]
    (if dev-url
      (fetch-dev-bundle dev-url)
      (or (get-bundle id)
          ;; no bundle yet — fetch from remote and try again
          (do (fetch-and-update! plugin)
              (get-bundle id))))))

(defn resolve-asset
  "Resolve a static asset for a plugin, respecting dev base URL if set.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-path]
  (if-let [dev-url (resolve-dev-bundle plugin-id)]
    (fetch-dev-asset dev-url asset-path)
    (get-asset plugin-id asset-path)))
