(ns metabase-enterprise.custom-viz-plugin.cache
  "Cache layer for custom visualization plugin bundles and static assets.
   Fetches and reads files from git repos via remote-sync's git infrastructure.
   GitSnapshots are cached per-plugin and only re-fetched when the resolved commit changes."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.remote-sync.source.git :as rs.git]
   [metabase.config.core :as config]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- In-memory dev bundle URLs -----------------------------------------

;; In-memory cache for dev_bundle_url values persisted in the database.
;; Acts as a read-through cache: populated lazily from the DB on first access.
(defonce ^:private dev-bundle-urls
  (atom {})) ;; {plugin-id -> url-string | ::none}

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- content-hash [^String content]
  (-> content .getBytes buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Git Helpers ------------------------------------------------

;; Per-plugin snapshot cache. Only fetches from remote on first access or when resolved_commit changes.
;; {plugin-id -> GitSnapshot}
(defonce ^:private local-snapshots (atom {}))

(defn- plugin-snapshot
  "Return a GitSnapshot for a plugin at its resolved commit.
   Caches the snapshot per plugin; only fetches from remote on first access
   or when the resolved commit has changed."
  [{:keys [id repo_url access_token pinned_version resolved_commit]}]
  (let [cached (get @local-snapshots id)]
    (if (and cached (= (:version cached) resolved_commit))
      cached
      (let [source   (rs.git/git-source repo_url nil access_token nil)
            snapshot (rs.git/snapshot-at-ref source (or pinned_version "HEAD"))
            snapshot (assoc snapshot :version resolved_commit)]
        (swap! local-snapshots assoc id snapshot)
        snapshot))))

;;; ------------------------------------------------ Git Reads ------------------------------------------------

(defn- read-bundle-from-git
  "Read the JS bundle from the local bare git repo at a given commit.
   Returns {:content str :hash str} or nil."
  [plugin]
  (try
    (let [snapshot (plugin-snapshot plugin)
          content  (rs.git/read-file snapshot "dist/index.js")]
      (when content
        {:content content :hash (content-hash content)}))
    (catch Exception e
      (log/warnf "Failed to read bundle from git at %s: %s" (:resolved_commit plugin) (ex-message e))
      nil)))

(defn- read-asset-from-git
  "Read a static asset from the local bare git repo at a given commit.
   Returns a byte array or nil."
  ^bytes [snapshot ^String resolved-commit ^String asset-path]
  (try
    (rs.git/read-file-bytes snapshot (str "dist/assets/" asset-path))
    (catch Exception e
      (log/warnf "Failed to read asset %s from git at %s: %s" asset-path resolved-commit (ex-message e))
      nil)))

;;; ------------------------------------------------ Fetch & Update ------------------------------------------------

(defn fetch-and-update!
  "Fetch index.js and manifest from the plugin's git repo and update the DB record.
   Returns the commit SHA or nil on failure."
  [{:keys [id repo_url access_token pinned_version identifier]}]
  (try
    (let [source        (rs.git/git-source repo_url nil access_token nil)
          snapshot      (rs.git/snapshot-at-ref source (or pinned_version "HEAD"))
          commit-sha    (:version snapshot)
          content       (rs.git/read-file snapshot "dist/index.js")
          _             (when-not content
                          (throw (ex-info "dist/index.js not found in repository" {:commit commit-sha})))
          ;; read manifest (optional)
          manifest-str  (rs.git/read-file snapshot (manifest/manifest-path))
          parsed        (when manifest-str (manifest/parse-manifest manifest-str))
          version-str   (get-in parsed [:metabase :version])
          ;; check version compatibility
          _             (when (and version-str
                                   (not (manifest/compatible? {:metabase_version version-str})))
                          (throw (ex-info
                                  (format "Plugin requires Metabase version %s but current version is %s"
                                          version-str
                                          (str "v" (config/current-major-version)))
                                  {:metabase_version version-str})))]
      ;; update DB — display_name and icon always come from manifest
      (t2/update! :model/CustomVizPlugin id
                  {:status            :active
                   :error_message     nil
                   :resolved_commit   commit-sha
                   :manifest          manifest-str
                   :display_name      (or (:name parsed) identifier)
                   :icon              (:icon parsed)
                   :icon_dark         (:icon_dark parsed)
                   :metabase_version  version-str})
      (swap! local-snapshots assoc id snapshot)
      commit-sha)
    (catch Exception e
      (t2/update! :model/CustomVizPlugin id
                  {:status        :error
                   :error_message (ex-message e)})
      nil)))

;;; ------------------------------------------------ Get ------------------------------------------------

(defn- select-plugin-for-read
  "Select the fields needed for git read operations."
  [plugin-id]
  (t2/select-one [:model/CustomVizPlugin :id :repo_url :access_token :pinned_version :resolved_commit :manifest]
                 :id plugin-id))

(defn get-bundle
  "Get the JS bundle for a plugin. Reads from the local bare git repo at the resolved commit."
  [plugin-id]
  (when-let [{:keys [resolved_commit] :as plugin} (select-plugin-for-read plugin-id)]
    (when resolved_commit
      (read-bundle-from-git plugin))))

(defn- asset-whitelisted?
  "Check whether an asset path is explicitly listed in the plugin's manifest."
  [{:keys [manifest]} ^String asset-path]
  (try
    (when-let [parsed (some-> manifest manifest/parse-manifest)]
      (let [allowed (set (manifest/asset-paths parsed))]
        (contains? allowed asset-path)))
    (catch Exception e
      (log/warnf "Failed to check asset whitelist for %s: %s" asset-path (ex-message e))
      false)))

(defn get-asset
  "Get a static asset for a plugin. Reads from the local bare git repo at the resolved commit.
   Only serves assets whitelisted by the plugin's manifest.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-path]
  (when-let [{:keys [resolved_commit] :as plugin} (select-plugin-for-read plugin-id)]
    (when (and resolved_commit
               (asset-whitelisted? plugin asset-path))
      (let [snapshot (plugin-snapshot plugin)]
        (read-asset-from-git snapshot resolved_commit asset-path)))))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

(defn dev-base-url
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
         :hash    (content-hash content)})
      (catch Exception e
        (throw (ex-info (str "Failed to fetch dev bundle from " url ": " (.getMessage e))
                        {:status-code 502}))))))

(defn fetch-dev-manifest
  "Fetch and parse the manifest (metabase-plugin.json) from a dev base URL.
   Returns the parsed manifest map or nil on failure."
  [^String base-url]
  (let [url (str (dev-base-url base-url) (manifest/manifest-path))]
    (try
      (let [content (slurp (java.net.URI. url))]
        (manifest/parse-manifest content))
      (catch Exception e
        (log/debugf "No manifest at %s: %s" url (ex-message e))
        nil))))

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
    (swap! dev-bundle-urls assoc id (or url ::none))))

(defn resolve-dev-bundle
  "Resolve the dev bundle URL for a plugin. Checks in-memory cache first, falls back to DB."
  [id]
  (let [cached (get @dev-bundle-urls id)]
    (if (some? cached)
      (when-not (= cached ::none) cached)
      (let [url (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id)]
        (swap! dev-bundle-urls assoc id (if (seq url) url ::none))
        (when (seq url) url)))))

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
          ;; no resolved_commit yet — fetch from remote and try again
          (do (fetch-and-update! plugin)
              (get-bundle id))))))

(defn resolve-asset
  "Resolve a static asset for a plugin, respecting dev base URL if set.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-path]
  (if-let [dev-url (resolve-dev-bundle plugin-id)]
    (fetch-dev-asset dev-url asset-path)
    (get-asset plugin-id asset-path)))
