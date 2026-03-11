(ns metabase.custom-viz-plugin.git
  "Read-only JGit wrapper for fetching files from custom visualization plugin repositories.
   Clones bare repos, fetches updates, and reads files at specific commits."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git TransportCommand)
   (org.eclipse.jgit.revwalk RevWalk)
   (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Auth & Helpers ------------------------------------------------

(defn- root-cause [^Throwable e]
  (if-let [cause (ex-cause e)]
    (recur cause)
    e))

(defn- credentials-provider ^UsernamePasswordCredentialsProvider [^String token]
  (UsernamePasswordCredentialsProvider. "x-access-token" token))

(defn- call-remote-command [^TransportCommand command token]
  (when token
    (.setCredentialsProvider command (credentials-provider token)))
  (try
    (.call command)
    (catch Exception e
      (throw (ex-info (format "Git operation failed: %s" (ex-message (root-cause e)))
                      {:error (ex-message e)} e)))))

;;; ------------------------------------------------ Repo Path ------------------------------------------------

(defn- repo-cache-path
  "Returns the local cache directory for a given repo URL + token combination."
  ^File [{:keys [^String remote-url ^String token]}]
  (io/file (System/getProperty "java.io.tmpdir")
           "metabase-custom-viz-plugins"
           (-> (str/join ":" [remote-url (or token "")])
               buddy-hash/sha1
               codecs/bytes->hex)))

;;; ------------------------------------------------ Clone / Open ------------------------------------------------

(defn- clone-repository!
  "Bare-clone a repository to the given path."
  ^Git [^File path {:keys [^String remote-url token]}]
  (log/infof "Cloning custom viz plugin repo %s" remote-url)
  (io/make-parents path)
  (try
    (u/prog1 (call-remote-command
              (-> (Git/cloneRepository)
                  (.setDirectory path)
                  (.setURI remote-url)
                  (.setBare true))
              token)
      (log/infof "Successfully cloned to %s" path))
    (catch Exception e
      (throw (ex-info (format "Failed to clone repository: %s" (ex-message e))
                      {:url remote-url :repo-path (str path)} e)))))

(defn- open-or-clone!
  "Open an existing bare repo or clone it fresh."
  ^Git [^File path {:keys [remote-url] :as opts}]
  (if (.exists path)
    (let [git (Git/open path)]
      ;; ensure origin URL matches
      (let [config (.getConfig (.getRepository git))
            current-url (.getString config "remote" "origin" "url")]
        (when (not= remote-url current-url)
          (.setString config "remote" "origin" "url" ^String remote-url)
          (.save config)))
      git)
    (clone-repository! path opts)))

;;; ------------------------------------------------ Fetch ------------------------------------------------

(defn fetch!
  "Fetch latest refs from the remote."
  [{:keys [^Git git token]}]
  (when git
    (log/debug "Fetching custom viz plugin repo")
    (call-remote-command (.fetch git) token)))

;;; ------------------------------------------------ Read Operations ------------------------------------------------

(defn resolve-ref
  "Resolve a branch name, tag, or commit SHA to a full commit SHA string.
   Returns nil if the ref cannot be resolved."
  [{:keys [^Git git]} ^String ref-str]
  (when-let [object-id (.resolve (.getRepository git) ref-str)]
    (.name object-id)))

(defn list-files
  "List all file paths in the repo at a given commit SHA."
  [{:keys [^Git git]} ^String commit-sha]
  (let [repo (.getRepository git)
        rev-walk (RevWalk. repo)
        commit-id (.resolve repo commit-sha)
        commit (.parseCommit rev-walk commit-id)
        tree-walk (TreeWalk. repo)]
    (.addTree tree-walk (.getTree commit))
    (.setRecursive tree-walk true)
    (sort (loop [files []]
            (if (.next tree-walk)
              (recur (conj files (.getPathString tree-walk)))
              files)))))

(defn read-file
  "Read a single file at a given commit SHA. Returns the content as a UTF-8 string, or nil if not found."
  [{:keys [^Git git]} ^String commit-sha ^String path]
  (let [repo (.getRepository git)]
    (when-let [object-id (.resolve repo (str commit-sha ":" path))]
      (let [loader (.open repo object-id)]
        (String. (.getBytes loader) "UTF-8")))))

;;; ------------------------------------------------ Lifecycle ------------------------------------------------

;; open JGit instances keyed by repo cache path
(defonce ^:private git-instances (atom {}))

(defn- get-or-create-git!
  "Get or create a Git instance for the given repo config."
  ^Git [{:keys [remote-url token] :as opts}]
  (let [path (repo-cache-path opts)
        path-key (.getPath path)]
    (or (get @git-instances path-key)
        (let [git (open-or-clone! path opts)]
          (swap! git-instances assoc path-key git)
          git))))

(defn create-repo-connection
  "Create a repo connection map for the given URL and optional token.
   Returns a map with :git, :remote-url, and :token."
  [remote-url token]
  (let [opts {:remote-url remote-url :token token}
        git  (get-or-create-git! opts)]
    (assoc opts :git git)))

(defn clear-repo-cache!
  "Remove a cached repo from memory and disk."
  [remote-url token]
  (let [opts {:remote-url remote-url :token token}
        path (repo-cache-path opts)
        path-key (.getPath path)]
    (log/infof "Clearing cached repo for %s" remote-url)
    (swap! git-instances dissoc path-key)
    (when (.exists path)
      (FileUtils/deleteDirectory path))))

(defn parse-repo-name
  "Extract the repository name from a git URL.
   E.g., 'https://github.com/user/custom-heatmap' -> 'custom-heatmap'
         'https://github.com/user/custom-heatmap.git' -> 'custom-heatmap'"
  [^String url]
  (-> url
      (str/replace #"\.git$" "")
      (str/split #"/")
      last))
