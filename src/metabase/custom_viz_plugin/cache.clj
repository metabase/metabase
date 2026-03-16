(ns metabase.custom-viz-plugin.cache
  "Cache layer for custom visualization plugin bundles.
   Fetches files from git repos, caches in memory and on disk."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.custom-viz-plugin.git :as git]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ In-Memory Cache ------------------------------------------------

;; plugin-id -> {:content str, :iife-content str-or-nil, :hash str, :commit str}
(defonce ^:private bundle-cache (atom {}))
;; plugin-id -> monotonic nano-time timestamp of last failed fetch
(defonce ^:private last-fetch-failure-ns (atom {}))

(def ^:private ^:const fetch-failure-cooldown-ms (* 5 60 1000))

;;; ------------------------------------------------ Disk Cache ------------------------------------------------

(defn- disk-cache-dir ^File []
  (io/file (System/getProperty "java.io.tmpdir") "metabase-custom-viz-plugins" "bundles"))

(defn- disk-cache-file ^File [plugin-id]
  (io/file (disk-cache-dir) (str plugin-id ".js")))

(defn- disk-cache-iife-file ^File [plugin-id]
  (io/file (disk-cache-dir) (str plugin-id ".iife.js")))

(defn- write-to-disk! [plugin-id ^String content ^String iife-content]
  (let [f (disk-cache-file plugin-id)]
    (io/make-parents f)
    (spit f content))
  (when iife-content
    (spit (disk-cache-iife-file plugin-id) iife-content)))

(defn- read-from-disk [plugin-id]
  (let [f      (disk-cache-file plugin-id)
        iife-f (disk-cache-iife-file plugin-id)]
    (when (.exists f)
      {:content      (slurp f)
       :iife-content (when (.exists iife-f) (slurp iife-f))})))

(defn- delete-from-disk! [plugin-id]
  (let [f      (disk-cache-file plugin-id)
        iife-f (disk-cache-iife-file plugin-id)]
    (when (.exists f)
      (.delete f))
    (when (.exists iife-f)
      (.delete iife-f))))

;;; ------------------------------------------------ Hash ------------------------------------------------

(defn- content-hash [^String content]
  (-> content .getBytes buddy-hash/sha256 codecs/bytes->hex))

;;; ------------------------------------------------ Fetch & Cache ------------------------------------------------

(defn- in-failure-cooldown?
  [plugin-id]
  (when-let [last-failure-ns (get @last-fetch-failure-ns plugin-id)]
    (< (/ (- (System/nanoTime) last-failure-ns) 1e6)
       fetch-failure-cooldown-ms)))

(defn fetch-and-cache!
  "Fetch index.js from the plugin's git repo, update both caches and DB record.
   Returns the cached entry or nil on failure."
  ([plugin]
   (fetch-and-cache! plugin nil))
  ([{:keys [id repo_url access_token pinned_version]}
    {:keys [force?]
     :or   {force? false}}]
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
             iife-content  (git/read-file conn commit-sha "dist/index.iife.js")
             hash          (content-hash content)
             cache-entry   {:content content :iife-content iife-content :hash hash :commit commit-sha}]
         ;; update caches
         (swap! bundle-cache assoc id cache-entry)
         (swap! last-fetch-failure-ns dissoc id)
         (write-to-disk! id content iife-content)
         ;; update DB
         (t2/update! :model/CustomVizPlugin id
                     {:status           :active
                      :error_message    nil
                      :resolved_commit  commit-sha})
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
      (when-let [{:keys [content iife-content]} (read-from-disk plugin-id)]
        (let [entry {:content content :iife-content iife-content :hash (content-hash content)}]
          (swap! bundle-cache assoc plugin-id entry)
          entry))))

(defn evict!
  "Remove a plugin from both caches."
  [plugin-id]
  (swap! bundle-cache dissoc plugin-id)
  (swap! last-fetch-failure-ns dissoc plugin-id)
  (delete-from-disk! plugin-id))
