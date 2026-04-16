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
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
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

;;; ------------------------------------------------ URL Validation ------------------------------------------------

(defn- allowed-schemes
  "Set of URL schemes allowed for repo and dev bundle URLs.
   In dev/test/e2e mode, `file://` and `git://` are also permitted."
  []
  (cond-> #{"http" "https"}
    (or config/is-dev? config/is-test? config/is-e2e?) (conj "file" "git")))

(defn- validate-url!
  "Validate that a URL uses an allowed scheme. Throws on invalid input."
  [^String url ^String label]
  (let [scheme (some-> (java.net.URI. url) .getScheme u/lower-case-en)]
    (when-not (contains? (allowed-schemes) scheme)
      (throw (ex-info (str label " must use http or https, got: " scheme)
                      {:status-code 400 :url url})))))

(defn validate-repo-url!
  "Validate that a repo URL uses an allowed scheme (http/https, plus file:// in dev/test/e2e).
   Throws on invalid input."
  [^String url]
  (validate-url! url "Repo URL"))

(defn- plugin-snapshot
  "Return a GitSnapshot for a plugin at its resolved commit.
   Caches the snapshot per plugin; only fetches from remote on first access
   or when the resolved commit has changed.
   Always fetches at the exact `resolved_commit` SHA so that multi-server
   deployments serve the same bundle regardless of what HEAD points to."
  [{:keys [id repo_url access_token resolved_commit]}]
  (validate-repo-url! repo_url)
  (let [cached (get @local-snapshots id)]
    (if (and cached (= (:version cached) resolved_commit))
      cached
      (let [source   (rs.git/git-source repo_url nil access_token nil)
            snapshot (rs.git/snapshot-at-ref source resolved_commit)]
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

(defn- read-from-git
  "Read a file from the plugin's git snapshot. Obtains the snapshot internally.
   Returns the raw result of `read-fn` (string or byte array) or nil on error."
  [plugin ^String rel-path read-fn]
  (try
    (let [snapshot (plugin-snapshot plugin)]
      (read-fn snapshot (git-path rel-path)))
    (catch Exception e
      (log/warnf "Failed to read %s from git at %s: %s" rel-path (:resolved_commit plugin) (ex-message e))
      nil)))

;;; ------------------------------------------------ Fetch & Update ------------------------------------------------

(defn- fetch-plugin-data!
  "Fetch and validate index.js and manifest from a plugin's git repo.
   Returns `{:commit-sha :parsed :version-str :snapshot}` on success.
   Throws ex-info with `:status-code 400` on any failure."
  [{:keys [repo_url access_token pinned_version]}]
  (validate-repo-url! repo_url)
  (try
    (let [source      (rs.git/git-source repo_url nil access_token nil)
          snapshot    (rs.git/snapshot-at-ref source (or pinned_version "HEAD"))
          commit-sha  (:version snapshot)
          _content    (or (rs.git/read-file snapshot (git-path bundle-rel-path))
                          (throw (ex-info (str (git-path bundle-rel-path) " not found in repository")
                                          {:status-code 400 :commit commit-sha})))
          parsed      (or (some-> (rs.git/read-file snapshot (manifest/manifest-path))
                                  manifest/parse-manifest)
                          (throw (ex-info (str (manifest/manifest-path) " not found or invalid in repository")
                                          {:status-code 400 :commit commit-sha})))
          version-str (get-in parsed [:metabase :version])]
      (when (and version-str
                 (not (manifest/compatible? {:metabase_version version-str})))
        (throw (ex-info
                (format "Plugin requires Metabase version %s but current version is %s"
                        version-str (:tag config/mb-version-info))
                {:status-code 400 :metabase_version version-str})))
      {:commit-sha  commit-sha
       :parsed      parsed
       :version-str version-str
       :snapshot    snapshot})
    (catch Exception e
      (if (:status-code (ex-data e))
        (throw e)
        (throw (ex-info (str "Failed to fetch plugin from repository: " (ex-message e))
                        {:status-code 400}
                        e))))))

(defn fetch-and-save!
  "Fetch plugin data from git, validate, and save to DB.
   For new plugins (no `:id` in the plugin map), inserts a new row using fields
   from the plugin map plus the derived manifest fields.
   For existing plugins, updates the existing row.
   `extra-columns` are merged into the DB write (e.g. `:enabled` changes from a
   PUT that coincide with a pinned_version change).
   Seeds the snapshot cache so the first bundle serve avoids a redundant git fetch.
   Returns the saved plugin row.
   Throws on fetch/validation failure."
  ([plugin]
   (fetch-and-save! plugin nil))
  ([{:keys [id identifier] :as plugin} extra-columns]
   (let [{:keys [commit-sha parsed version-str snapshot]} (fetch-plugin-data! plugin)
         derived {:status           :active
                  :error_message    nil
                  :resolved_commit  commit-sha
                  :manifest         parsed
                  :display_name     (or (:name parsed) identifier)
                  :icon             (:icon parsed)
                  :metabase_version version-str}
         columns (merge derived extra-columns)]
     (if id
       (do (t2/update! :model/CustomVizPlugin id columns)
           (swap! local-snapshots assoc id snapshot)
           (t2/select-one :model/CustomVizPlugin :id id))
       (let [row (first (t2/insert-returning-instances!
                         :model/CustomVizPlugin
                         (merge (select-keys plugin [:repo_url :access_token :identifier :pinned_version])
                                columns)))]
         (swap! local-snapshots assoc (:id row) snapshot)
         row)))))

;;; ------------------------------------------------ Get ------------------------------------------------

(defn get-bundle
  "Get the JS bundle for a plugin. Reads from the local bare git repo at the resolved commit.
   Returns {:content str :hash str} or nil."
  [{:keys [resolved_commit] :as plugin}]
  (when resolved_commit
    (when-let [content (read-from-git plugin bundle-rel-path rs.git/read-file)]
      {:content content :hash (content-hash content)})))

(defn- asset-whitelisted?
  "Check whether an asset path is explicitly listed in the plugin's manifest."
  [{:keys [manifest]} ^String asset-path]
  (when manifest
    (let [allowed (set (manifest/asset-paths manifest))]
      (contains? allowed asset-path))))

(defn get-asset
  "Get a static asset for a plugin. Reads from the local bare git repo at the resolved commit.
   Returns a byte array or nil."
  ^bytes [{:keys [resolved_commit] :as plugin} ^String asset-name]
  (when resolved_commit
    (read-from-git plugin (asset-rel-path asset-name) rs.git/read-file-bytes)))

;;; ------------------------------------------------ Dev Bundle ------------------------------------------------

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
