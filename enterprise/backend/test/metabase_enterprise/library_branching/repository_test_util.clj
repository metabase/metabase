(ns metabase-enterprise.library-branching.repository-test-util
  "Helpers of the repository, operation, status and route tests: remotes on disk with branches and a default branch,
  the repository settings of a test, a record of the stores that the code opens, a synchronous task start, and a
  committed metric of the Library."
  (:require
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tasks.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2])
  (:import
   (java.io File)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectInserter PersonIdent Repository)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Remotes -----------------------------------------------------

(defn do-with-remote
  "Calls `(f repo url)`: `repo` is a new empty bare repository, and `url` its file:// URL. Removes it after."
  [f]
  (let [dir (.toFile (Files/createTempDirectory "library-branching-repository-" (make-array FileAttribute 0)))]
    (try
      (with-open [git (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))]
        (f (.getRepository git) (str "file://" (.getAbsolutePath ^File dir))))
      (finally
        (FileUtils/deleteDirectory dir)))))

(defmacro with-remote
  "Binds `repo` to a new empty bare repository and `url` to its file:// URL, for `body`."
  [[repo url] & body]
  `(do-with-remote (fn [~(vary-meta repo assoc :tag `Repository) ~url] ~@body)))

(defn commit-branch!
  "Writes a commit with one file into the remote `repo`, and moves `branch` to it. Returns the commit id."
  [^Repository repo ^String branch]
  (with-open [^ObjectInserter inserter (.newObjectInserter repo)]
    (let [index (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)
          ident (PersonIdent. "Someone" "someone@example.com")]
      (.add builder (doto (DirCacheEntry. "README.md")
                      (.setFileMode FileMode/REGULAR_FILE)
                      (.setObjectId (.insert inserter Constants/OBJ_BLOB (.getBytes branch StandardCharsets/UTF_8)))))
      (.finish builder)
      (let [commit (doto (CommitBuilder.)
                     (.setTreeId (.writeTree index inserter))
                     (.setAuthor ident)
                     (.setCommitter ident)
                     (.setMessage branch))
            id     (.insert inserter commit)]
        (.flush inserter)
        (doto (.updateRef repo (str "refs/heads/" branch))
          (.setNewObjectId id)
          (.forceUpdate))
        (.name id)))))

(defn set-head!
  "Makes HEAD of the remote `repo` name `branch`: the default branch of the remote."
  [^Repository repo ^String branch]
  (.link (.updateRef repo Constants/HEAD) (str "refs/heads/" branch)))

(defn remote-with-branches!
  "Gives the remote `repo` the branches `branches`, and makes the first one its default branch."
  [repo branches]
  (doseq [b branches]
    (commit-branch! repo b))
  (set-head! repo (first branches)))

;;; ----------------------------------------------------- Settings -----------------------------------------------------

(defn saved
  "The saved repository settings: a map of `repository/setting-keys`."
  []
  (into {} (map (juxt identity setting/get)) repository/setting-keys))

(defmacro with-settings
  "Runs `body` with the repository settings `settings` (keys of `repository/setting-keys`, others nil), and puts the
  settings back after."
  [settings & body]
  `(let [settings# (merge {:remote-sync-url nil :remote-sync-token nil :remote-sync-branch nil
                           :remote-sync-type :read-write :remote-sync-auto-import false}
                          ~settings)]
     (mt/with-temporary-setting-values [remote-sync-url         (:remote-sync-url settings#)
                                        remote-sync-token       (:remote-sync-token settings#)
                                        remote-sync-branch      (:remote-sync-branch settings#)
                                        remote-sync-type        (:remote-sync-type settings#)
                                        remote-sync-auto-import (:remote-sync-auto-import settings#)]
       ~@body)))

(defn do-recording-stores
  "Calls `(f calls)`, where `calls` is an atom that receives `{:url :token}` for each store that
  `repository/open-store` opens."
  [f]
  (let [calls    (atom [])
        original (dynamic-redefs/original-fn #'repository/open-store)]
    (dynamic-redefs/with-dynamic-fn-redefs
      [repository/open-store (fn
                               ([] (original))
                               ([url token]
                                (swap! calls conj {:url url :token token})
                                (original url token)))]
      (f calls))))

;;; ------------------------------------------------------- Tasks ------------------------------------------------------

(defn synchronous-submit!
  "`tasks/submit!` that runs the worker on the calling thread, and returns the task as it started."
  [kind user-id f & {:as opts}]
  (let [{:keys [id] :as started} (tasks/start! kind user-id)]
    (tasks/run-task! id f (dissoc opts :timeout-ms))
    started))

(defmacro with-synchronous-tasks
  "Runs `body` with [[synchronous-submit!]] as `tasks/submit!`."
  [& body]
  `(dynamic-redefs/with-dynamic-fn-redefs [tasks/submit! synchronous-submit!]
     ~@body))

;;; ------------------------------------------------------ Content -----------------------------------------------------

(defn- children-location
  [{:keys [id location]}]
  (str location id "/"))

(defn- sum-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :venues :price)))))))

(defn do-with-library-metric!
  "Calls `(f metric)` with a committed metric named \"Before\" in a committed metrics collection of the Library, with
  library branching on, no task row and no base. Deletes the rows that it inserted afterwards."
  [f]
  (let [rows    (atom ())
        insert! (fn [model row]
                  (let [inserted (t2/insert-returning-instance! model row)]
                    (swap! rows conj [model inserted])
                    inserted))]
    (tasks.tu/with-no-tasks
      (try
        (mt/with-temporary-setting-values [library-branching-enabled true]
          (let [library (or (t2/select-one :model/Collection :type "library" :archived false)
                            (insert! :model/Collection {:name "Library" :type "library" :location "/"}))
                metrics (insert! :model/Collection {:name     "Operation metrics"
                                                    :type     "library-metrics"
                                                    :location (children-location library)})]
            (f (insert! :model/Card {:name                   "Before"
                                     :type                   :metric
                                     :collection_id          (:id metrics)
                                     :creator_id             (mt/user->id :crowberto)
                                     :display                :scalar
                                     :visualization_settings {}
                                     :dataset_query          (sum-query)}))))
        (finally
          (doseq [[model row] @rows]
            (t2/delete! model :id (:id row))))))))
