(ns metabase-enterprise.remote-sync.test-util
  "Local git repositories and remote sync settings for remote sync tests."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.content :as content]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.protocol.git :as git]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase.test :as mt])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.eclipse.jgit.api Git)))

(set! *warn-on-reflection* true)

(defn do-with-repository!
  "Calls `f` with the `file://` URL of a new bare repository whose `main` branch has one commit."
  [f]
  (let [dir ^File (.toFile (Files/createTempDirectory "remote-sync-test" (make-array FileAttribute 0)))
        url (str "file://" (.getAbsolutePath dir))]
    (.close ^Git (.call (doto (Git/init) (.setBare true) (.setDirectory dir) (.setInitialBranch "main"))))
    (try
      (protocol/commit! (git/repository url nil) "main" nil {"README.md" "# Remote sync test\n"} "Initial commit")
      (f url)
      (finally
        (run! #(io/delete-file % true) (reverse (file-seq dir)))))))

(defmacro with-repository
  "Runs `body` with `url-binding` bound to the `file://` URL of a new bare repository (see [[do-with-repository!]])."
  [[url-binding] & body]
  `(do-with-repository! (fn [~url-binding] ~@body)))

(defn repository!
  "The repository of `url`, fetched."
  [url]
  (doto (git/repository url nil) protocol/fetch!))

(defn tip!
  "The version at the tip of `branch` of the repository of `url`."
  [url branch]
  (protocol/version (repository! url) branch))

(defn read-file!
  "The content of the file at `path` at the tip of `branch` of the repository of `url`."
  [url branch path]
  (let [repo (repository! url)]
    (protocol/read-file repo (protocol/version repo branch) path)))

(defn files!
  "The paths of the files at the tip of `branch` of the repository of `url`."
  [url branch]
  (let [repo (repository! url)]
    (set (protocol/list-files repo (protocol/version repo branch)))))

(defn entity-path!
  "The path of the YAML file of `entity` at the tip of `branch` of the repository of `url`, or nil."
  [url branch entity]
  (some #(when (str/includes? (read-file! url branch %) (str "entity_id: " (:entity_id entity))) %)
        (files! url branch)))

(defn commit!
  "Commits `changes`, a map from path to content (nil to delete), on top of the tip of `branch` of the repository of
  `url`, as another instance would, returning the new version."
  [url branch changes]
  (let [repo (repository! url)]
    (protocol/commit! repo branch (protocol/version repo branch) changes "Changed elsewhere")))

(defmacro with-remote-sync
  "Runs `body` with remote sync on, syncing with `main` of the repository of `url` in `sync-type` mode."
  [[url sync-type] & body]
  `(mt/with-additional-premium-features #{:remote-sync}
     (mt/with-temporary-setting-values [~'remote-sync-url    ~url
                                        ~'remote-sync-branch "main"
                                        ~'remote-sync-type   ~sync-type]
       ~@body)))

(defn wait-for-task!
  "Waits until the RemoteSyncTask with `task-id` ends, returning it as the API shows it."
  [task-id]
  (loop [attempts 300]
    (let [task (mt/user-http-request :crowberto :get 200 "ee/remote-sync/current-task")]
      (cond
        (or (not= task-id (:id task)) (not= "running" (:status task))) task
        (pos? attempts) (do (Thread/sleep 100) (recur (dec attempts)))
        :else (throw (ex-info "The remote sync task did not end" {:task task}))))))

(defn push!
  "Pushes the synced content to `main` of the repository of `url`, since `base-version`."
  ([url base-version]
   (push! url base-version {}))
  ([url base-version opts]
   (sync/push! (repository! url) "main" base-version (merge {:message "Push"} opts))))

(defn pull!
  "Pulls `main` of the repository of `url` into the app DB, since `base-version`."
  ([url base-version]
   (pull! url base-version {}))
  ([url base-version opts]
   (sync/pull! (repository! url) "main" base-version opts)))

(defn local-changes!
  "The `{:key :status :doc}` of each change to the synced content of the app DB since the tree of `version` of the
  repository of `url`."
  [url version]
  (sync/local-changes (content/tree-documents (repository! url) version) (content/local-documents)))
