(ns metabase-enterprise.library.source.git
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library.source.protocol :as source.p]
   [metabase-enterprise.serialization.v2.ingest :as v2.ingest]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.eclipse.jgit.api Git GitCommand TransportCommand)
   (org.eclipse.jgit.dircache DirCache DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId PersonIdent Ref)
   (org.eclipse.jgit.revwalk RevWalk)
   (org.eclipse.jgit.transport RefSpec
                               UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)))

(set! *warn-on-reflection* true)

(def ^:private ^:dynamic repo-path (atom nil))

(defn- call-command [^GitCommand command]
  (.call command))

(defn- call-remote-command [^TransportCommand command {:keys [token]}]
  (let [credentials-provider (when token (UsernamePasswordCredentialsProvider. "x-access-token" token))]
    (-> command
        (.setCredentialsProvider credentials-provider)
        (.call))))

(defn- qualify-branch [branch]
  (if (str/starts-with? branch "refs/heads/")
    branch
    (str "refs/heads/" branch)))

(defn clone-repository!
  "Clone git repository to a temporary directory using jgit. Returns the path to the cloned jgit.Repository bare-repo object."
  [{:keys [^String url ^String token]}]
  (let [dir (Files/createTempDirectory "library-git-" (make-array FileAttribute 0))]
    (try
      (log/info "Cloning repository" {:url url :dir dir})
      (u/prog1 (call-remote-command (-> (Git/cloneRepository)
                                        (.setDirectory (.toFile dir))
                                        (.setURI url)
                                        (.setBare true)) {:token token})
        (log/info "Successfully cloned repository" {:dir dir}))
      (catch Exception e
        (throw (ex-info (format "Failed to clone git repository: %s" (.getMessage e))
                        {:url   url
                         :dir   dir
                         :error (.getMessage e)}))))))

(defn fetch!
  "Call fetch on the repository."
  [{:keys [^Git git] :as git-source}]
  (log/info "Fetching repository" {:repo (str git)})
  (u/prog1 (call-remote-command (.fetch git) git-source))
  (log/info "Successfully fetched repository" {:repo (str git)}))

(defn- list-files
  "List all files in the repository."
  [{:keys [^Git git]} ^String branch]
  (let [repo (.getRepository git)
        rev-walk (RevWalk. repo)
        commit-id (.resolve repo (qualify-branch branch))
        commit (.parseCommit rev-walk commit-id)
        tree-walk (TreeWalk. repo)]
    (.addTree tree-walk (.getTree commit))
    (.setRecursive tree-walk true)
    (sort (loop [files []]
            (if (.next tree-walk)
              (recur (conj files (.getPathString tree-walk)))
              files)))))

(defn read-file
  "Read a specific file from the repository. Returns nil if the file does not exist.
  Path should be relative to the root of the repository."
  [{:keys [^Git git]} ^String branch ^String path]
  (let [repo (.getRepository git)
        object-id (.resolve repo (str (qualify-branch branch) ":" path))]
    (when object-id
      (let [loader (.open repo object-id)]
        (String. (.getBytes loader) "UTF-8")))))

(defn push-branch!
  "Pushes a local branch to a remote branch."
  [{:keys [^Git git] :as git-source} ^String branch-name]
  (let [branch-name (qualify-branch branch-name)]
    (call-remote-command
     (-> (.push git)
         (.setRemote "origin")
         (.setRefSpecs [(RefSpec. (str branch-name ":" branch-name))]))
     git-source)))

(defn write-files!
  "Write a seq of files to the repo. `files` should be maps of :path and :content, with path relative to the root of the repository."
  [{:keys [^Git git] :as git-source} ^String branch ^String message files]
  (let [repo (.getRepository git)
        branch-ref (qualify-branch branch)
        parent-id (or (.resolve repo branch-ref)
                      (.resolve repo "refs/heads/main")
                      (.resolve repo "refs/heads/master"))]

    (with-open [inserter (.newObjectInserter repo)]
      (let [index (DirCache/newInCore)
            builder (.builder index)

            ;; Add/update the target files
            updated-paths (into #{} (map (fn [{:keys [path content]}]
                                           (let [blob-id (.insert inserter Constants/OBJ_BLOB (.getBytes content "UTF-8"))
                                                 entry (doto (DirCacheEntry. ^String path)
                                                         (.setFileMode FileMode/REGULAR_FILE)
                                                         (.setObjectId blob-id))]
                                             (.add builder entry))
                                           path) files))]

        ;; Copy existing tree entries, excluding the file we're updating
        (when parent-id
          (with-open [rev-walk (RevWalk. repo)
                      tree-walk (TreeWalk. repo)]
            (let [commit (.parseCommit rev-walk parent-id)]
              (.addTree tree-walk (.getTree commit))
              (.setRecursive tree-walk true)
              (while (.next tree-walk)
                (when-not (updated-paths (.getPathString tree-walk))
                  (let [entry (doto (DirCacheEntry. (.getPathString tree-walk))
                                (.setFileMode (.getFileMode tree-walk 0))
                                (.setObjectId (.getObjectId tree-walk 0)))]
                    (.add builder entry)))))))

        (.finish builder)

        ;; Create commit
        (let [tree-id (.writeTree index inserter)
              commit-builder (doto (CommitBuilder.)
                               (.setTreeId tree-id)
                               (.setAuthor (PersonIdent. "Metabase Library" "library@metabase.com"))
                               (.setCommitter (PersonIdent. "Metabase Library" "library@metabase.com"))
                               (.setMessage message))]
          (when parent-id
            (.setParentId commit-builder parent-id))

          (let [commit-id (.insert inserter commit-builder)]
            (.flush inserter)
            (doto (.updateRef repo branch-ref)
              (.setNewObjectId commit-id)
              (.update))))))
    (push-branch! git-source branch-ref)))

(defn- branches [{:keys [^Git git]}]
  (->> (call-command (.branchList git))
       (filter #(str/starts-with? (.getName %) "refs/heads/"))
       (remove #(.isSymbolic %))
       (map #(str/replace-first (.getName %) "refs/heads/" ""))
       sort))

(defrecord GitSource [git remote-url token]
  source.p/LibrarySource
  (branches [source] (branches source))

  (list-files [this branch]
    (list-files this branch))

  (read-file [this branch path]
    (read-file this branch path))

  (write-files! [this branch message files]
    (write-files! this branch message files)))

(defn new-git-source
  "Create a new git source"
  [url token]
  (->GitSource (clone-repository! {:url url
                                   :token token})
               url token))
