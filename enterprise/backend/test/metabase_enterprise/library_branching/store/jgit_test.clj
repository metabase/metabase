(ns metabase-enterprise.library-branching.store.jgit-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId ObjectInserter PersonIdent Repository)))

(set! *warn-on-reflection* true)

;;; A remote is a bare repository in a temporary directory, reached by a file:// URL. The helpers below write to
;;; it with JGit directly, so that a test does not depend on the store to set up the remote.

(defn- temp-dir ^File [prefix]
  (.toFile (Files/createTempDirectory prefix (make-array FileAttribute 0))))

(defn- remote-url [^File dir]
  (str "file://" (.getAbsolutePath dir)))

(defn- do-with-remote [f]
  (let [dir (temp-dir "library-branching-remote-")]
    (try
      (with-open [git (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))]
        (f (.getRepository git) (remote-url dir)))
      (finally
        (FileUtils/deleteDirectory dir)))))

(defmacro ^:private with-remote
  "Binds `repo` to a new empty bare repository and `url` to its file:// URL."
  [[repo url] & body]
  `(do-with-remote (fn [~(vary-meta repo assoc :tag `Repository) ~url] ~@body)))

(defn- do-with-store [url f]
  (let [s (store.jgit/open-store url)]
    (try
      (f s)
      (finally
        (store/close s)))))

(defmacro ^:private with-store
  [[binding url] & body]
  `(do-with-store ~url (fn [~binding] ~@body)))

(defn- remote-commit!
  "Writes a commit with `parents` and the one file a.txt = `content` into the remote `repo`, and moves `ref` to
  it. Returns its id."
  [^Repository repo ^String ref parents ^String content]
  (with-open [^ObjectInserter inserter (.newObjectInserter repo)]
    (let [index (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)
          ident (PersonIdent. "Test" "test@example.com")]
      (.add builder (doto (DirCacheEntry. "a.txt")
                      (.setFileMode FileMode/REGULAR_FILE)
                      (.setObjectId (.insert inserter Constants/OBJ_BLOB (.getBytes content "UTF-8")))))
      (.finish builder)
      (let [commit (doto (CommitBuilder.)
                     (.setTreeId (.writeTree index inserter))
                     (.setAuthor ident)
                     (.setCommitter ident)
                     (.setMessage content))
            _      (doseq [^String p parents] (.addParentId commit (ObjectId/fromString p)))
            id     (.insert inserter commit)]
        (.flush inserter)
        (doto (.updateRef repo ref)
          (.setNewObjectId id)
          (.forceUpdate))
        (.name id)))))

(defn- remote-ref [^Repository repo ^String ref]
  (some-> (.exactRef repo ref) .getObjectId .name))

(deftest cas-ref-refuses-when-remote-moved-test
  (testing "cas-ref! refuses and moves nothing when the remote ref is not at the expected commit"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (with-store [s url]
          (is (= c0 (store/head s "main")))
          ;; another writer moves main after this store read its head
          (let [c1 (remote-commit! remote "refs/heads/main" [c0] "one")
                _  (is (= c1 (store/head s "main")))
                ;; a fast-forward of the new head, so that only the expected id can stop the push
                c2 (store/write-commit s [c1] {"a.txt" (.getBytes "two" "UTF-8")} "two")]
            (is (= {:moved c1} (store/cas-ref! s "main" c0 c2)))
            (is (= c1 (remote-ref remote "refs/heads/main")))))))))
