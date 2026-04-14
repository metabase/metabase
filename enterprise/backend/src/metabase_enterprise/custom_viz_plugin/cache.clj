(ns metabase-enterprise.custom-viz-plugin.cache
  "Cache layer for custom visualization plugin bundles and static assets.
   Fetches and reads files from git repos via remote-sync's git infrastructure.
   GitSnapshots are cached per-plugin and only re-fetched when the resolved commit changes."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase-enterprise.remote-sync.source.git :as rs.git]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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

;;; ------------------------------------------------ Paths ------------------------------------------------

(def ^:private ^:const bundle-rel-path "index.js")

(defn- asset-rel-path ^String [^String asset-name] (str "assets/" asset-name))

(defn- git-path
  "Prefix a relative path with dist/ for git repo layout."
  ^String [^String rel-path]
  (str "dist/" rel-path))

;;; ------------------------------------------------ Git Reads ------------------------------------------------

(defn- read-bundle-from-git
  "Read the JS bundle from the local bare git repo at a given commit.
   Returns {:content str :hash str} or nil."
  [plugin]
  (try
    (let [snapshot (plugin-snapshot plugin)
          content  (rs.git/read-file snapshot (git-path bundle-rel-path))]
      (when content
        {:content content :hash (content-hash content)}))
    (catch Exception e
      (log/warnf "Failed to read bundle from git at %s: %s" (:resolved_commit plugin) (ex-message e))
      nil)))

(defn- read-asset-from-git
  "Read a static asset from the local bare git repo at a given commit.
   Returns a byte array or nil."
  ^bytes [snapshot ^String resolved-commit ^String asset-name]
  (try
    (rs.git/read-file-bytes snapshot (git-path (asset-rel-path asset-name)))
    (catch Exception e
      (log/warnf "Failed to read asset %s from git at %s: %s" asset-name resolved-commit (ex-message e))
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
          _content       (or (rs.git/read-file snapshot (git-path bundle-rel-path))
                             (throw (ex-info (str (git-path bundle-rel-path) " not found in repository") {:commit commit-sha})))
          parsed        (or (some-> (rs.git/read-file snapshot (manifest/manifest-path))
                                    manifest/parse-manifest)
                            (throw (ex-info (str (manifest/manifest-path) " not found or invalid in repository")
                                            {:commit commit-sha})))
          version-str   (get-in parsed [:metabase :version])]
      (when (and version-str
                 (not (manifest/compatible? {:metabase_version version-str})))
        (throw (ex-info
                (format "Plugin requires Metabase version %s but current version is %s"
                        version-str (:tag config/mb-version-info))
                {:metabase_version version-str})))
      (t2/update! :model/CustomVizPlugin id
                  {:status            :active
                   :error_message     nil
                   :resolved_commit   commit-sha
                   :manifest          parsed
                   :display_name      (or (:name parsed) identifier)
                   :icon              (:icon parsed)
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
  (when manifest
    (let [allowed (set (manifest/asset-paths manifest))]
      (contains? allowed asset-path))))

(defn get-asset
  "Get a static asset for a plugin. Reads from the local bare git repo at the resolved commit.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-name]
  (when-let [{:keys [resolved_commit] :as plugin} (select-plugin-for-read plugin-id)]
    (when resolved_commit
      (let [snapshot (plugin-snapshot plugin)]
        (read-asset-from-git snapshot resolved_commit asset-name)))))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

(defn- validate-dev-url!
  "Validate that a dev bundle URL uses http or https scheme. Throws on invalid input."
  [^String url]
  (let [scheme (some-> (java.net.URI. url) .getScheme u/lower-case-en)]
    (when-not (#{"http" "https"} scheme)
      (throw (ex-info (str "Dev bundle URL must use http or https, got: " scheme)
                      {:status-code 400 :url url})))))

(defn dev-base-url
  "Validate and normalize the dev base URL. Ensures http/https scheme and trailing slash."
  ^String [^String url]
  (validate-dev-url! url)
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
     :hash    (content-hash content)}))

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
    (some-> url validate-dev-url!)
    (t2/update! :model/CustomVizPlugin id {:dev_bundle_url url})))

(defn resolve-dev-bundle
  "Resolve the dev bundle URL for a plugin from the database. Returns the URL string or nil."
  [id]
  (not-empty (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id)))

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
   Only serves assets whitelisted by the plugin's manifest.
   Returns a byte array or nil."
  ^bytes [plugin-id ^String asset-name]
  (when-let [plugin (select-plugin-for-read plugin-id)]
    (when (asset-whitelisted? plugin asset-name)
      (if-let [dev-url (resolve-dev-bundle plugin-id)]
        (fetch-dev-asset dev-url asset-name)
        (get-asset plugin-id asset-name)))))
