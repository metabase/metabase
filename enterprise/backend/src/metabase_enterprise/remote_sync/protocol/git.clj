(ns metabase-enterprise.remote-sync.protocol.git
  "The repository of a git remote, cloned bare into a temporary directory, with JGit."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.net URI)
   (org.eclipse.jgit.api Git TransportCommand)
   (org.eclipse.jgit.dircache DirCache DirCacheEditor DirCacheEditor$DeletePath DirCacheEditor$PathEdit DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId PersonIdent Ref Repository)
   (org.eclipse.jgit.revwalk RevWalk)
   (org.eclipse.jgit.storage.file FileBasedConfig)
   (org.eclipse.jgit.transport PushResult RefSpec RemoteRefUpdate RemoteRefUpdate$Status
                               UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)
   (org.eclipse.jgit.util FS SystemReader SystemReader$Delegate)))

(set! *warn-on-reflection* true)

(defn- isolated-system-reader
  "The JGit system reader that reads no user or system git configuration, such as `~/.gitconfig`."
  []
  (let [base (SystemReader/getInstance)
        none (fn [^FS fs] (proxy [FileBasedConfig] [(io/file "_no_config_") fs] (load [] nil) (save [] nil)))]
    (proxy [SystemReader$Delegate] [base]
      (getenv [variable]
        (if (= "GIT_CONFIG_NOSYSTEM" variable) "true" (.getenv base variable)))
      (openUserConfig [_config fs]
        (none fs))
      (openSystemConfig [_config fs]
        (none fs)))))

(SystemReader/setInstance (isolated-system-reader))

(defn- credentials
  "The credentials of `token` for the host of `url`, or nil without a token."
  [^String url ^String token]
  (when token
    (UsernamePasswordCredentialsProvider. (if (= "bitbucket.org" (.getHost (URI. url))) "x-token-auth" "x-access-token")
                                          token)))

(defn- call-remote
  "Calls `command`, which talks to the remote at `url`, authenticated with `token`, within the git timeout."
  [^TransportCommand command url token]
  (try
    (.call (doto command
             (.setTimeout (int (setting/get :remote-sync-git-timeout-seconds)))
             (.setCredentialsProvider (credentials url token))))
    (catch Exception e
      (throw (ex-info (format "Git %s failed: %s" (.getSimpleName (class command)) (ex-message e)) {} e)))))

(defn- branch-ref
  "The full name of the ref of `branch`."
  [branch]
  (str "refs/heads/" branch))

(defn- clone!
  "Clones the remote at `url` bare into `dir`."
  ^Git [^File dir url token]
  (log/info "Cloning repository" {:url url})
  (io/make-parents dir)
  (call-remote (-> (Git/cloneRepository) (.setDirectory dir) (.setURI url) (.setBare true)) url token))

(defn- open
  "The repository of the remote at `url`, cloned into a directory of its own."
  ^Git [url token]
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "metabase-git-2"
                     (codecs/bytes->hex (buddy-hash/sha1 (str url ":" token))))]
    (if (.exists dir)
      (Git/open dir)
      (clone! dir url token))))

(defn- object-id
  "The id of the commit `version`, or nil when the repository lacks it."
  ^ObjectId [^Repository repo ^String version]
  (when-let [id (.resolve repo version)]
    (when (.has (.getObjectDatabase repo) id)
      id)))

(defn- push!
  "Pushes `branch` to the remote, throwing when the remote refuses it."
  [^Git git branch url token]
  (let [spec    (str (branch-ref branch) ":" (branch-ref branch))
        results (call-remote (.setRefSpecs (.push git) ^"[Lorg.eclipse.jgit.transport.RefSpec;" (into-array RefSpec [(RefSpec. spec)])) url token)
        refused (for [^PushResult result results
                      ^RemoteRefUpdate update (.getRemoteUpdates result)
                      :when (not (#{RemoteRefUpdate$Status/OK RemoteRefUpdate$Status/UP_TO_DATE} (.getStatus update)))]
                  (.getStatus update))]
    (when (seq refused)
      (throw (ex-info (format "The remote refused the push to %s: %s" branch (str/join ", " refused))
                      {:statuses refused})))))

(defrecord GitRepository [^Git git url token]
  protocol/Repository
  (fetch! [_]
    (call-remote (-> (.fetch git) (.setRemoveDeletedRefs true) (.setRefSpecs ^"[Lorg.eclipse.jgit.transport.RefSpec;" (into-array RefSpec [(RefSpec. "+refs/heads/*:refs/heads/*")])))
                 url token)
    nil)

  (branches [_]
    (->> (call-remote (.lsRemote git) url token)
         (map #(.getName ^Ref %))
         (filter #(str/starts-with? % "refs/heads/"))
         (map #(subs % (count "refs/heads/")))
         sort))

  (default-branch [_]
    (let [head (first (filter #(= "HEAD" (.getName ^Ref %)) (call-remote (.lsRemote git) url token)))]
      (or (some-> ^Ref head .getTarget .getName (str/replace-first "refs/heads/" ""))
          (throw (ex-info "The repository has no default branch." {})))))

  (version [_ branch]
    (some-> (object-id (.getRepository git) (branch-ref branch)) .name))

  (has-version? [_ version]
    (some? (object-id (.getRepository git) version)))

  (list-files [_ version]
    (let [repo (.getRepository git)]
      (with-open [walk      (RevWalk. repo)
                  tree-walk (TreeWalk. repo)]
        (.addTree tree-walk (.getTree (.parseCommit walk (object-id repo version))))
        (.setRecursive tree-walk true)
        (loop [paths []]
          (if (.next tree-walk)
            (recur (conj paths (.getPathString tree-walk)))
            paths)))))

  (read-file [_ version path]
    (let [repo (.getRepository git)]
      (when-let [id (.resolve repo (str version ":" path))]
        (String. (.getBytes (.open repo id)) "UTF-8"))))

  (commit! [_ branch parent changes message]
    (let [repo (.getRepository git)]
      (with-open [inserter (.newObjectInserter repo)
                  reader   (.newObjectReader repo)
                  walk     (RevWalk. repo)]
        (let [parent-id (some->> parent (object-id repo))
              index     (DirCache/newInCore)
              builder   (.builder index)
              _         (when parent-id
                          (.addTree builder (byte-array 0) DirCacheEntry/STAGE_0 reader (.getTree (.parseCommit walk parent-id))))
              _         (.finish builder)
              ^DirCacheEditor editor (.editor index)]
          (doseq [[^String path ^String content] changes]
            (if (some? content)
              (let [blob (.insert inserter Constants/OBJ_BLOB (.getBytes content "UTF-8"))]
                (.add editor (proxy [DirCacheEditor$PathEdit] [path]
                               (apply [^DirCacheEntry entry]
                                 (.setFileMode entry FileMode/REGULAR_FILE)
                                 (.setObjectId entry blob)))))
              (.add editor (DirCacheEditor$DeletePath. path))))
          (.finish editor)
          (let [author    (PersonIdent. "Metabase Library" "library@metabase.com")
                commit-id (.insert inserter (cond-> (doto (CommitBuilder.)
                                                      (.setTreeId (.writeTree index inserter))
                                                      (.setAuthor author)
                                                      (.setCommitter author)
                                                      (.setMessage ^String message))
                                              parent-id (doto (.setParentId parent-id))))]
            (.flush inserter)
            (doto (.updateRef repo (branch-ref branch))
              (.setExpectedOldObjectId (or parent-id (ObjectId/zeroId)))
              (.setNewObjectId commit-id)
              (.update))
            (push! git branch url token)
            (.name commit-id))))))

  (create-branch! [_ branch version]
    (doto (.updateRef (.getRepository git) (branch-ref branch))
      (.setNewObjectId (object-id (.getRepository git) version))
      (.update))
    (push! git branch url token)
    nil))

(defn repository
  "The repository of the remote at `url`, authenticated with `token`."
  [url token]
  (->GitRepository (open url token) url token))
