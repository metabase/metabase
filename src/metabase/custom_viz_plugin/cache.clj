(ns metabase.custom-viz-plugin.cache
  "Cache layer for custom visualization plugin bundles.
   Fetches files from git repos, caches in memory and on disk."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.custom-viz-plugin.git :as git]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ In-Memory Cache ------------------------------------------------

;; plugin-id -> {:content str, :hash str, :commit str}
(defonce ^:private bundle-cache (atom {}))

;;; ------------------------------------------------ Disk Cache ------------------------------------------------

(defn- disk-cache-dir ^File []
  (io/file (System/getProperty "java.io.tmpdir") "metabase-custom-viz-plugins" "bundles"))

(defn- disk-cache-file ^File [plugin-id]
  (io/file (disk-cache-dir) (str plugin-id ".js")))

(defn- write-to-disk! [plugin-id ^String content]
  (let [f (disk-cache-file plugin-id)]
    (io/make-parents f)
    (spit f content)))

(defn- read-from-disk [plugin-id]
  (let [f (disk-cache-file plugin-id)]
    (when (.exists f)
      (slurp f))))

(defn- delete-from-disk! [plugin-id]
  (let [f (disk-cache-file plugin-id)]
    (when (.exists f)
      (.delete f))))

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- content-hash [^String content]
  (-> content .getBytes buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Fetch & Cache ------------------------------------------------

(defn fetch-and-cache!
  "Fetch index.js from the plugin's git repo, update both caches and DB record.
   Returns the cached entry or nil on failure."
  [{:keys [id repo_url access_token pinned_version]}]
  (try
    (let [conn          (git/create-repo-connection repo_url access_token)
          _             (git/fetch! conn)
          ref-to-use    (or pinned_version "HEAD")
          commit-sha    (git/resolve-ref conn ref-to-use)
          _             (when-not commit-sha
                          (throw (ex-info (str "Cannot resolve ref: " ref-to-use) {:ref ref-to-use})))
          content       (git/read-file conn commit-sha "index.js")
          _             (when-not content
                          (throw (ex-info "index.js not found in repository" {:commit commit-sha})))
          hash          (content-hash content)
          cache-entry   {:content content :hash hash :commit commit-sha}]
      ;; update caches
      (swap! bundle-cache assoc id cache-entry)
      (write-to-disk! id content)
      ;; update DB
      (t2/update! :model/CustomVizPlugin id
                  {:status           :active
                   :error_message    nil
                   :resolved_commit  commit-sha})
      (log/infof "Cached custom viz plugin %d (commit %s)" id commit-sha)
      cache-entry)
    (catch Exception e
      (log/errorf e "Failed to fetch custom viz plugin %d from %s" id repo_url)
      (t2/update! :model/CustomVizPlugin id
                  {:status        :error
                   :error_message (ex-message e)})
      nil)))

;;; ------------------------------------------------ Get / Evict ------------------------------------------------

(defn get-bundle
  "Get the JS bundle for a plugin. Checks in-memory first, then disk."
  [plugin-id]
  (or (get @bundle-cache plugin-id)
      (when-let [content (read-from-disk plugin-id)]
        (let [entry {:content content :hash (content-hash content)}]
          (swap! bundle-cache assoc plugin-id entry)
          entry))))

(defn evict!
  "Remove a plugin from both caches."
  [plugin-id]
  (swap! bundle-cache dissoc plugin-id)
  (delete-from-disk! plugin-id))
