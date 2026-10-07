(ns metabase-enterprise.remote-sync.source.clone-registry-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.clone-registry :as clone-registry]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.nio.channels FileLock)
   (java.nio.file FileSystems Files LinkOption)
   (java.nio.file.attribute FileAttribute PosixFilePermissions UserPrincipal)
   (java.time Instant)
   (java.util.concurrent CountDownLatch TimeUnit)
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(def ^:private url "https://example.com/org/repo.git")

(defn- do-with-registry!
  "Calls `(f registry)` with a new registry under a new temp directory, and shuts the registry down after."
  [f]
  (let [base     (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))
        registry (clone-registry/make-registry base)]
    (try
      (f registry)
      (finally
        (clone-registry/shutdown! registry)
        (FileUtils/deleteQuietly base)))))

(defn- fake-clone
  "A clone function that makes the directory that it gets, and records the directory in `clones`. Its Git instance
  records its close in `closed`."
  [clones closed]
  (fn [^File dir]
    (swap! clones conj dir)
    (.mkdirs dir)
    (reify java.lang.AutoCloseable
      (close [_] (swap! closed conj dir)))))

(defn- root-dir ^File [registry]
  (:dir @(:root registry)))

(defn- owner-only?
  "True iff only the owner can read, write or enter `dir`, or the file system has no POSIX permissions."
  [^File dir]
  (or (not (contains? (.supportedFileAttributeViews (FileSystems/getDefault)) "posix"))
      (= "rwx------" (PosixFilePermissions/toString
                      (Files/getPosixFilePermissions (.toPath dir) (make-array LinkOption 0))))))

(defn- process-roots
  "The process roots on disk under the base directory of `registry`."
  [registry]
  (vec (filter #(str/starts-with? (.getName ^File %) "p-") (.listFiles ^File (:base-dir registry)))))

(deftest generation-directory-test
  (testing "a clone is in a directory named for its URL and generation, in an owner-only process root under the base"
    (do-with-registry!
     (fn [registry]
       (let [clones (atom [])
             {:keys [id ^File dir]} (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone clones (atom [])))
             root (root-dir registry)]
         (is (= 1 id))
         (is (= (str (#'clone-registry/url-key url) "-1") (.getName dir)) "the name depends on the URL, not on a token")
         (is (= root (.getParentFile dir)))
         (is (= (:base-dir registry) (.getParentFile root)))
         (is (str/starts-with? (.getName root) "p-"))
         (is (owner-only? root))
         (is (.isValid ^FileLock (:lock @(:root registry))) "the process holds the lock of its root"))))))

(deftest deleted-process-root-is-replaced-test
  (testing "when a cleaner of the temp dir deletes the process root, the next clone is in a new owner-only root that holds its lock file"
    (do-with-registry!
     (fn [registry]
       (let [clone!       (fake-clone (atom []) (atom []))
             {dir-1 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
             root-1       (.getParentFile ^File dir-1)]
         (FileUtils/deleteDirectory root-1)
         (let [{id-2 :id dir-2 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
               root-2                (.getParentFile ^File dir-2)]
           (is (= 2 id-2) "the next acquire clones again")
           (is (not= root-1 root-2) "the next clone is in a new root")
           (is (not (.exists root-1)) "no clone makes the deleted root again")
           (is (= root-2 (root-dir registry)))
           (is (owner-only? root-2))
           (is (.isFile (io/file root-2 ".lock")))
           (is (.isValid ^FileLock (:lock @(:root registry))) "the process holds the lock of its new root")))))))

(deftest deleted-lock-file-retires-the-process-root-test
  (testing "when the lock file of the process root is gone, the next acquire clones into a new root; the old root stays while a lease holds a clone in it, and a shutdown deletes it"
    (let [base     (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))
          registry (clone-registry/make-registry base)
          clone!   (fake-clone (atom []) (atom []))]
      (try
        (let [{dir-1 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
              root-1       (.getParentFile ^File dir-1)]
          (io/delete-file (io/file root-1 ".lock"))
          (let [{id-2 :id dir-2 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
                root-2                (.getParentFile ^File dir-2)]
            (is (= 2 id-2) "the active generation in the old root is retired")
            (is (not= root-1 root-2) "the next clone is in a new root")
            (is (.isFile (io/file root-2 ".lock")))
            (is (.exists ^File dir-1) "a lease holds the retired generation in the old root")
            (clone-registry/shutdown! registry)
            (is (= [] (process-roots registry)) "a shutdown deletes the old root and the new root")))
        (finally
          (FileUtils/deleteQuietly base))))))

(deftest failed-root-lock-leaves-no-directory-test
  (testing "when the lock file of a new process root cannot be opened, the registry deletes the new root"
    (do-with-registry!
     (fn [registry]
       (let [clones  (atom [])
             create! (mt/original-fn #'clone-registry/create-owner-only-dir!)]
         ;; A directory with the name of the lock file makes the open of the lock file throw.
         (mt/with-dynamic-fn-redefs [clone-registry/create-owner-only-dir! (fn [^File dir]
                                                                             (create! dir)
                                                                             (.mkdir (io/file dir ".lock")))]
           (dotimes [_ 2]
             (is (thrown? java.io.IOException
                          (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone clones (atom [])))))))
         (is (= [] (process-roots registry)) "no process root stays on disk")
         (is (= [] @clones) "no clone starts")
         (is (nil? @(:root registry)) "the registry has no root")
         (let [{:keys [^File dir]} (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone clones (atom [])))]
           (is (.isDirectory dir) "the next acquire makes a root and clones")
           (is (= [(.getParentFile dir)] (process-roots registry)))))))))

;; A clone job writes into the directory that it got before it started. A concurrent acquire can retire the root of
;; that directory in the meantime.
(defn- check-clone-job-in-a-retired-root!
  "A clone job of [[url]] gets its directory in the process root R1. Then `break-root!` breaks R1, and an acquire of
  another URL retires R1 and clones into a new root R2. Then the job writes its clone into R1. Checks that the acquire
  that waited for the job, and a later acquire, get a clone in R2."
  [break-root!]
  (do-with-registry!
   (fn [registry]
     (let [got-dir (promise)
           go      (CountDownLatch. 1)
           slow!   (fn [^File dir]
                     (deliver got-dir dir)
                     (.await go 10 TimeUnit/SECONDS)
                     ;; As JGit does: make the directory and its missing parents, then write the repository.
                     (.mkdirs dir)
                     (spit (io/file dir "HEAD") "ref: refs/heads/master")
                     (reify java.lang.AutoCloseable (close [_])))
           clone!  (fake-clone (atom []) (atom []))]
       (try
         (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/org/first.git") clone!)
         (let [root-1      (root-dir registry)
               waiter      (future (clone-registry/acquire! registry (clone-registry/new-lease url) slow!))
               ^File dir-1 (deref got-dir 10000 nil)]
           (is (= root-1 (some-> dir-1 .getParentFile)) "precondition: the clone job got a directory in R1")
           (break-root! root-1)
           (let [{other :dir} (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/org/other.git")
                                                       clone!)
                 root-2       (.getParentFile ^File other)]
             (is (not= root-1 root-2) "precondition: the acquire of the other URL retired R1 and made R2")
             (.countDown go)
             (doseq [[what {:keys [^File dir]}] [["the acquire that waited for the job" (deref waiter 10000 nil)]
                                                 ["a later acquire" (clone-registry/acquire! registry (clone-registry/new-lease url) slow!)]]]
               (testing what
                 (is (= root-2 (some-> dir .getParentFile)) "gets a clone in the current root")
                 (is (.isFile (io/file root-2 ".lock")))))
             (is (not (.exists dir-1)) "the clone that the job wrote into R1 is deleted")))
         (finally
           (.countDown go)))))))

(deftest clone-job-in-a-deleted-root-test
  (testing "when a cleaner deletes the process root while a clone job runs, and another acquire makes a new root, the clone of the job is not used"
    (check-clone-job-in-a-retired-root! (fn [^File root] (FileUtils/deleteDirectory root)))))

(deftest clone-job-in-a-root-without-its-lock-file-test
  (testing "when a cleaner deletes the lock file of the process root while a clone job runs, and another acquire makes a new root, the clone of the job is not used"
    (check-clone-job-in-a-retired-root! (fn [^File root] (io/delete-file (io/file root ".lock"))))))

(defn- posix? []
  (contains? (.supportedFileAttributeViews (FileSystems/getDefault)) "posix"))

(defn- set-permissions! [^File f ^String permissions]
  (Files/setPosixFilePermissions (.toPath f) (PosixFilePermissions/fromString permissions)))

(deftest base-directory-is-owner-only-test
  (testing "a clone makes the base directory owner-only, so that no other user can enter a directory below it"
    (testing "a new base directory"
      (do-with-registry!
       (fn [registry]
         (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone (atom []) (atom [])))
         (is (owner-only? (:base-dir registry))))))
    (when (posix?)
      (testing "a base directory that exists with wider permissions"
        (do-with-registry!
         (fn [registry]
           (.mkdirs ^File (:base-dir registry))
           (set-permissions! (:base-dir registry) "rwxr-xr-x")
           (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone (atom []) (atom [])))
           (is (owner-only? (:base-dir registry)))))))))

(defn- p-dirs
  "The directories named like a process root in `dir`."
  [^File dir]
  (vec (filter #(str/starts-with? (.getName ^File %) "p-") (.listFiles dir))))

(defn- check-refused!
  "Checks that an acquire with `registry` throws an error that names `path` and has `reason`, and that no clone starts."
  [registry ^File path reason]
  (let [clones (atom [])
        e      (try
                 (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone clones (atom [])))
                 nil
                 (catch Exception e e))]
    (is (some? e) "the acquire throws")
    (is (str/includes? (str (ex-message e)) (str path)) "the error names the path")
    (is (str/includes? (str (ex-message e)) "Remove this path, or make it a directory that the Metabase user owns.")
        "the error gives the remedy")
    (is (= reason (:reason (ex-data e))))
    (is (= [] @clones) "no clone starts")))

(deftest symlink-base-directory-is-refused-test
  (when (posix?)
    (testing "when the base directory is a symbolic link, the registry refuses to clone and does not change its target"
      (let [target (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-target-" (random-uuid)))
            base   (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))]
        (try
          (.mkdirs target)
          (set-permissions! target "rwxrwxrwx")
          (Files/createSymbolicLink (.toPath base) (.toPath target) (make-array FileAttribute 0))
          (let [registry (clone-registry/make-registry base)]
            (try
              (check-refused! registry base :symbolic-link)
              (is (= "rwxrwxrwx" (PosixFilePermissions/toString
                                  (Files/getPosixFilePermissions (.toPath target) (make-array LinkOption 0))))
                  "the permissions of the target do not change")
              (is (= [] (p-dirs target)) "no process root is made in the target")
              (finally
                (clone-registry/shutdown! registry))))
          (finally
            (Files/deleteIfExists (.toPath base))
            (FileUtils/deleteQuietly target)))))))

(defn- owner ^UserPrincipal [^File f]
  (Files/getOwner (.toPath f) (into-array LinkOption [LinkOption/NOFOLLOW_LINKS])))

(defn- foreign-writable-dir
  "A directory that another user owns and that this process can write into, or nil. On most systems, the shared temp
  directory `/tmp` is such a directory."
  ^File []
  (let [tmp (io/file "/tmp")]
    (when (and (posix?) (.isDirectory tmp))
      (let [dir  (.toFile (.toRealPath (.toPath tmp) (make-array LinkOption 0)))
            mine (File/createTempFile "clone-registry-test-owner" nil)]
        (try
          (when (and (.canWrite dir) (not= (owner mine) (owner dir)))
            dir)
          (finally
            (io/delete-file mine true)))))))

(deftest base-directory-of-another-user-is-refused-test
  (if-let [base (foreign-writable-dir)]
    (testing "when another user owns the base directory, the registry refuses to clone and makes nothing in it"
      (let [registry (clone-registry/make-registry base)
            before   (set (p-dirs base))]
        (try
          (check-refused! registry base :another-owner)
          (is (= before (set (p-dirs base))) "no process root is made in the base directory")
          (finally
            (clone-registry/shutdown! registry)))))
    (log/info "No directory that another user owns and this process can write into, so this test checks nothing")))

(deftest base-directory-of-another-process-user-is-refused-test
  (testing "when the base directory is not owned by the user of the process, the registry refuses to clone and makes nothing in it"
    (do-with-registry!
     (fn [registry]
       (.mkdirs ^File (:base-dir registry))
       (mt/with-dynamic-fn-redefs [clone-registry/process-user (fn [] (reify UserPrincipal (getName [_] "another-user")))]
         (check-refused! registry (:base-dir registry) :another-owner))
       (is (= [] (process-roots registry)) "no process root is made in the base directory")))))

(defn- symlink!
  "Makes `link` a symbolic link to `target`."
  [^File link ^File target]
  (Files/createSymbolicLink (.toPath link) (.toPath target) (make-array FileAttribute 0)))

;; The URL of the first clone. For [[url]], the acquire that [[check-refused!]] makes reuses the active clone. For
;; another URL, that acquire makes a new clone.
(def ^:private first-urls
  {"an acquire that makes a new clone"       "https://example.com/org/first.git"
   "an acquire that reuses the active clone" url})

(deftest process-root-replaced-by-a-symlink-is-refused-test
  (when (posix?)
    (testing "when the process root is replaced by a symbolic link to a directory with a lock file, the registry refuses to use it"
      (doseq [[what first-url] first-urls]
        (testing what
          (do-with-registry!
           (fn [registry]
             (clone-registry/acquire! registry (clone-registry/new-lease first-url) (fake-clone (atom []) (atom [])))
             (let [root  (root-dir registry)
                   moved (io/file (.getParentFile root) (str (.getName root) ".moved"))]
               (try
                 (is (.renameTo root moved))
                 (symlink! root moved)
                 (check-refused! registry root :symbolic-link)
                 (finally
                   (Files/deleteIfExists (.toPath root))
                   (FileUtils/deleteQuietly moved)))))))))))

(deftest base-directory-replaced-by-a-symlink-is-refused-test
  (when (posix?)
    (testing "when the base directory is replaced by a symbolic link after a clone, the registry refuses to use it"
      (doseq [[what first-url] first-urls]
        (testing what
          (let [moved (atom nil)]
            (try
              (do-with-registry!
               (fn [{:keys [^File base-dir] :as registry}]
                 (clone-registry/acquire! registry (clone-registry/new-lease first-url) (fake-clone (atom []) (atom [])))
                 (reset! moved (io/file (str base-dir ".moved")))
                 (is (.renameTo base-dir @moved))
                 (symlink! base-dir @moved)
                 (try
                   (check-refused! registry base-dir :symbolic-link)
                   (finally
                     (Files/deleteIfExists (.toPath base-dir))))))
              (finally
                (some-> @moved FileUtils/deleteQuietly)))))))))

(defn- check-no-delete-through-a-symlink!
  "Makes a directory with a file in it. Calls `(f registry victim)` with a new registry. Checks that the file is still
  there after `f` and a shutdown of the registry."
  [f]
  (when (posix?)
    (let [victim (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-victim-" (random-uuid)))
          keep   (io/file victim "keep")]
      (try
        (.mkdirs victim)
        (spit keep "x")
        (do-with-registry! #(f % victim))
        (is (.isFile keep) "the file in the target of the symbolic link is not deleted")
        (finally
          (FileUtils/deleteQuietly victim))))))

(deftest shutdown-does-not-delete-through-a-symlink-root-test
  (testing "when a retired process root is replaced by a symbolic link, a shutdown removes the link and not the files of its target"
    (check-no-delete-through-a-symlink!
     (fn [registry victim]
       (let [clone! (fake-clone (atom []) (atom []))
             _      (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
             root-1 (root-dir registry)]
         (io/delete-file (io/file root-1 ".lock"))
         (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/org/b.git") clone!)
         (is (not= root-1 (root-dir registry)) "precondition: the acquire retired the first root")
         (FileUtils/deleteDirectory root-1)
         (symlink! root-1 victim)
         (clone-registry/shutdown! registry)
         (is (not (Files/exists (.toPath root-1) (make-array LinkOption 0))) "the shutdown removes the link"))))))

(deftest release-does-not-delete-through-a-symlink-generation-test
  (testing "when the directory of a retired generation is replaced by a symbolic link, its last release removes the link and not the files of its target"
    (check-no-delete-through-a-symlink!
     (fn [registry victim]
       (let [lease                  (clone-registry/new-lease url)
             {:keys [id ^File dir]} (clone-registry/acquire! registry lease (fake-clone (atom []) (atom [])))]
         (FileUtils/deleteDirectory dir)
         (symlink! dir victim)
         (clone-registry/retire! registry url id)
         (clone-registry/release! registry lease)
         (is (not (Files/exists (.toPath dir) (make-array LinkOption 0))) "the release removes the link"))))))

(defn- check-no-delete-through-a-symlink-base!
  "Makes a clone of [[url]] with a new registry. Then moves the base directory away, and puts at its path a symbolic link
  to a directory that has a file at the path of the clone. Calls `(f registry lease generation)`, and checks that the
  file is still there."
  [f]
  (when (posix?)
    (let [tmp      (System/getProperty "java.io.tmpdir")
          base     (io/file tmp (str "clone-registry-test-" (random-uuid)))
          moved    (io/file (str base ".moved"))
          victim   (io/file tmp (str "clone-registry-test-victim-" (random-uuid)))
          registry (clone-registry/make-registry base)]
      (try
        (let [lease                               (clone-registry/new-lease url)
              {:keys [^File dir] :as generation} (clone-registry/acquire! registry lease (fake-clone (atom []) (atom [])))
              keep                                (io/file victim (.getName (.getParentFile dir)) (.getName dir) "keep")]
          (io/make-parents keep)
          (spit keep "x")
          (is (.renameTo base moved))
          (symlink! base victim)
          (f registry lease generation)
          (is (.isFile keep) "the file in the target of the symbolic link is not deleted"))
        (finally
          (clone-registry/shutdown! registry)
          (Files/deleteIfExists (.toPath base))
          (FileUtils/deleteQuietly moved)
          (FileUtils/deleteQuietly victim))))))

(deftest no-delete-through-a-symlink-base-test
  (testing "when the base directory is replaced by a symbolic link, no delete of a process root or a clone follows the link"
    (testing "a shutdown"
      (check-no-delete-through-a-symlink-base!
       (fn [registry _lease _generation]
         (clone-registry/shutdown! registry))))
    (testing "the last release of a retired generation"
      (check-no-delete-through-a-symlink-base!
       (fn [registry lease {:keys [id]}]
         (clone-registry/retire! registry url id)
         (clone-registry/release! registry lease))))))

;; A clone job writes into the directory that it got before it started. An acquire can check the root of the active
;; generation before the job publishes it, and take the generation after.
(deftest acquire-does-not-get-a-clone-published-in-a-retired-root-test
  (testing "an acquire that runs while a clone job writes into a retired root gets a clone in the current root"
    (let [base     (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))
          registry (clone-registry/make-registry base)
          url-a    "https://example.com/org/a.git"
          got-dir  (promise)
          go       (CountDownLatch. 1)
          w-thread (promise)
          t-done   (promise)
          slow!    (fn [^File dir]
                     (deliver got-dir dir)
                     (.await go 10 TimeUnit/SECONDS)
                     (.mkdirs dir)
                     (spit (io/file dir "HEAD") "ref: refs/heads/master")
                     (reify java.lang.AutoCloseable (close [_])))
          quick!   (fake-clone (atom []) (atom []))
          rbr      (mt/original-fn #'clone-registry/retire-broken-root!)
          rm       (mt/original-fn #'clone-registry/retire-missing!)
          active?  (fn [u] (some? (get-in @(:state registry) [u :active])))]
      (try
        (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/org/first.git") quick!)
        (let [root-1 (root-dir registry)
              ;; W starts the clone job J of URL A. After J ends, W waits for T before its next loop.
              w      (future
                       (deliver w-thread (Thread/currentThread))
                       (mt/with-dynamic-fn-redefs [clone-registry/retire-broken-root!
                                                   (fn [reg]
                                                     (when (and (identical? @w-thread (Thread/currentThread))
                                                                (zero? (.getCount go)))
                                                       (deref t-done 10000 nil))
                                                     (rbr reg))]
                         (clone-registry/acquire! registry (clone-registry/new-lease url-a) slow!)))
              ^File d (deref got-dir 10000 nil)]
          (is (= root-1 (some-> d .getParentFile)) "precondition: J got a directory in R1")
          (FileUtils/deleteDirectory root-1)
          (let [{dir-b :dir} (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/org/b.git")
                                                      quick!)
                root-2       (.getParentFile ^File dir-b)]
            (is (not= root-1 root-2) "precondition: the acquire of URL B retired R1 and made R2")
            ;; T: after its checks of the active generation, J ends and publishes it in R1.
            (let [t (future
                      (try
                        (mt/with-dynamic-fn-redefs [clone-registry/retire-missing!
                                                    (fn [reg u]
                                                      (.countDown go)
                                                      (loop [n 0]
                                                        (when (and (not (active? u)) (< n 1000))
                                                          (Thread/sleep 10)
                                                          (recur (inc n))))
                                                      (rm reg u))]
                          (clone-registry/acquire! registry (clone-registry/new-lease url-a) slow!))
                        (finally
                          (deliver t-done true))))
                  {dir-t :dir} (deref t 10000 nil)
                  {dir-w :dir} (deref w 10000 nil)]
              (is (= root-2 (some-> ^File dir-t .getParentFile)) "the acquire gets a clone in the current root")
              (is (= root-2 (some-> ^File dir-w .getParentFile)) "the acquire that started the job gets a clone in the current root")
              (is (not (.exists ^File d)) "the clone that the job wrote into R1 is deleted"))))
        (finally
          (.countDown go)
          (deliver t-done true)
          (clone-registry/shutdown! registry)
          (FileUtils/deleteQuietly base))))))

(deftest leases-share-the-active-generation-test
  (testing "leases on one URL share its active generation, and only the first acquire clones"
    (do-with-registry!
     (fn [registry]
       (let [clones (atom [])
             clone! (fake-clone clones (atom []))
             a      (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)
             b      (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)]
         (is (= a b))
         (is (= 1 (count @clones))))))))

(deftest concurrent-acquires-share-one-clone-job-test
  (testing "concurrent first acquires of a URL wait for one clone job"
    (do-with-registry!
     (fn [registry]
       (let [clones  (atom [])
             clone!  (let [f (fake-clone clones (atom []))]
                       (fn [dir] (Thread/sleep 300) (f dir)))
             start   (promise)
             futures (mapv (fn [_] (future
                                     (deref start 10000 nil)
                                     (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)))
                           (range 4))
             _       (deliver start true)
             results (mapv #(deref % 10000 ::timeout) futures)]
         (is (apply = results))
         (is (= 1 (:id (first results))))
         (is (= 1 (count @clones))))))))

(deftest failed-clone-job-test
  (testing "a failed clone job fails every caller that waits for it, and the next acquire starts a new job"
    (do-with-registry!
     (fn [registry]
       (let [attempts (atom 0)
             failing! (fn [_dir]
                        (swap! attempts inc)
                        (Thread/sleep 300)
                        (throw (ex-info "Connection timed out" {})))
             start    (promise)
             futures  (mapv (fn [_] (future
                                      (deref start 10000 nil)
                                      (try (clone-registry/acquire! registry (clone-registry/new-lease url) failing!)
                                           (catch Exception e (ex-message e)))))
                            (range 3))
             _        (deliver start true)]
         (is (= ["Connection timed out" "Connection timed out" "Connection timed out"]
                (mapv #(deref % 10000 ::timeout) futures)))
         (is (= 1 @attempts))
         (let [clones (atom [])]
           (is (= 2 (:id (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone clones (atom []))))))
           (is (= 1 (count @clones)) "the next acquire clones")))))))

(deftest failed-clone-deletes-its-directory-test
  (testing "a clone job that fails after it wrote into its directory deletes the directory"
    (do-with-registry!
     (fn [registry]
       (let [made   (atom nil)
             clone! (fn [^File dir]
                      (reset! made dir)
                      (.mkdirs dir)
                      (spit (io/file dir "partial") "x")
                      (throw (ex-info "Connection timed out" {})))]
         (is (thrown-with-msg? Exception #"Connection timed out"
                               (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)))
         (is (some? @made) "precondition: the clone job ran")
         (is (not (.exists ^File @made))))))))

(deftest interrupted-caller-does-not-stop-the-clone-job-test
  (testing "an interrupt of the caller that started a clone job ends its wait; the job goes on for the other callers"
    (do-with-registry!
     (fn [registry]
       (let [clones   (atom [])
             in-clone (promise)
             clone!   (let [f (fake-clone clones (atom []))]
                        (fn [dir] (deliver in-clone true) (Thread/sleep 1000) (f dir)))
             owner    (future (clone-registry/acquire! registry (clone-registry/new-lease url) clone!))
             _        (is (true? (deref in-clone 5000 false)) "precondition: the clone job runs")
             waiter   (future (clone-registry/acquire! registry (clone-registry/new-lease url) clone!))]
         (Thread/sleep 100)
         (is (true? (future-cancel owner)))
         (is (= 1 (:id (deref waiter 10000 ::timeout))))
         (is (= 1 (count @clones))))))))

(deftest retired-generation-lives-while-a-lease-holds-it-test
  (testing "a retired generation stays while a lease holds it, and is closed and deleted at its last lease"
    (do-with-registry!
     (fn [registry]
       (let [clones  (atom [])
             closed  (atom [])
             deleted (atom [])
             delete! (mt/original-fn #'clone-registry/delete-dir!)
             clone!  (fake-clone clones closed)
             lease-a (clone-registry/new-lease url)
             lease-b (clone-registry/new-lease url)]
         (mt/with-dynamic-fn-redefs [clone-registry/delete-dir! (fn [dir] (swap! deleted conj dir) (delete! dir))]
           (let [{gen-1 :id dir-1 :dir} (clone-registry/acquire! registry lease-a clone!)]
             (clone-registry/retire! registry url gen-1)
             (is (.exists ^File dir-1) "a lease holds the retired generation")
             (let [{gen-2 :id dir-2 :dir} (clone-registry/acquire! registry lease-b clone!)]
               (is (= 2 gen-2) "a new acquire gets a new generation, not the retired one")
               (clone-registry/retire! registry url gen-1)
               (is (= 2 (count @clones)) "a second retire of a retired generation does nothing")
               (clone-registry/release! registry lease-a)
               (is (= [dir-1] @closed) "the last lease of the retired generation closes it")
               (is (= [dir-1] @deleted) "and deletes it with the tolerant delete")
               (is (not (.exists ^File dir-1)))
               (clone-registry/release! registry lease-a)
               (is (= [dir-1] @deleted) "a second release does nothing")
               (clone-registry/release! registry lease-b)
               (is (.exists ^File dir-2) "the active generation stays when no lease holds it")
               (clone-registry/retire! registry url gen-2)
               (is (= [dir-1 dir-2] @deleted) "a retired generation that no lease holds is deleted at once")))))))))

(deftest active-generation-with-a-missing-directory-is-cloned-again-test
  (testing "when the directory of the active generation is gone, the next acquire retires it and clones again"
    (do-with-registry!
     (fn [registry]
       (let [clones (atom [])
             closed (atom [])
             clone! (fake-clone clones closed)
             {dir-1 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) clone!)]
         (FileUtils/deleteDirectory dir-1)
         (is (= 2 (:id (clone-registry/acquire! registry (clone-registry/new-lease url) clone!))))
         (is (= 2 (count @clones))))))))

;;; ------------------------------------------------ the start sweep ------------------------------------------------

;; Java's file lock belongs to the process, not to the channel: two registries in one JVM cannot show what another
;; process sees. So these tests hold and check locks in a second OS process.

(def ^:private lock-program-source
  "The source of a single-file Java program. `hold <file>` locks the file, prints \"locked\", and sleeps until it is
  stopped. `check <file>` prints \"held\" when another process holds the lock of the existing file, else \"free\"."
  (str "import java.nio.channels.*; import java.nio.file.*;\n"
       "public class LockProgram {\n"
       "  public static void main(String[] a) throws Exception {\n"
       "    if (a[0].equals(\"hold\")) {\n"
       "      FileChannel ch = FileChannel.open(Paths.get(a[1]), StandardOpenOption.CREATE, StandardOpenOption.WRITE);\n"
       "      ch.lock(); System.out.println(\"locked\"); System.out.flush(); Thread.sleep(600000);\n"
       "    } else {\n"
       "      FileChannel ch = FileChannel.open(Paths.get(a[1]), StandardOpenOption.WRITE);\n"
       "      System.out.println(ch.tryLock() == null ? \"held\" : \"free\");\n"
       "    }\n"
       "  }\n"
       "}\n"))

(def ^:private lock-program
  (delay
    (let [dir  (doto (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-lock-program-" (random-uuid)))
                 .mkdirs
                 .deleteOnExit)
          file (doto (io/file dir "LockProgram.java") .deleteOnExit)]
      (spit file lock-program-source)
      file)))

(defn- start-lock-program
  "Starts the lock program in a new OS process with the java command of this JVM."
  ^Process [mode ^File lock-file]
  (.start (doto (ProcessBuilder. ^java.util.List (vector (str (io/file (System/getProperty "java.home") "bin" "java"))
                                                         (str @lock-program) mode (str lock-file)))
            (.redirectErrorStream true))))

(defn- hold-lock!
  "Starts a second OS process that holds the lock of `lock-file` until [[stop-process!]] stops it."
  ^Process [^File lock-file]
  (let [p    (start-lock-program "hold" lock-file)
        line (.readLine ^java.io.BufferedReader (io/reader (.getInputStream p)))]
    (is (= "locked" line) "precondition: the second process holds the lock")
    p))

(defn- stop-process! [^Process p]
  (.destroy p)
  (.waitFor p 30 TimeUnit/SECONDS))

(defn- lock-seen-by-another-process
  "\"held\" when a new OS process cannot take the lock of `lock-file`, else \"free\"."
  [^File lock-file]
  (let [p (start-lock-program "check" lock-file)]
    (u/prog1 (str/trim (slurp (.getInputStream p)))
      (.waitFor p 30 TimeUnit/SECONDS))))

(defn- ms-ago
  "The time `ms` milliseconds before now, in ms since the epoch."
  [ms]
  (.toEpochMilli (.minusMillis (Instant/now) ms)))

(defn- do-with-registries!
  "Calls `(f base make!)` with a new temp directory `base`. `(make! opts)` returns a new registry under `base` with the
  options `opts`. Shuts down each registry that `make!` made, then deletes `base`."
  [f]
  (let [base (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))
        made (atom [])]
    (try
      (.mkdirs base)
      (f base (fn [opts] (u/prog1 (clone-registry/make-registry base opts) (swap! made conj <>))))
      (finally
        (run! clone-registry/shutdown! @made)
        (FileUtils/deleteQuietly base)))))

(defn- acquire!
  "Acquires a clone of [[url]] in `registry` with a fake clone, and returns the generation."
  [registry]
  (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone (atom []) (atom []))))

(def ^:private two-hours-ms (* 2 3600000))

(defn- plant-root!
  "Makes a directory in `base` that looks like the process root of another process, with a clone in it. When
  `lock-file?` is true, the root has a lock file whose last write time is `lock-age-ms` before now."
  ^File [^File base & {:keys [lock-file? lock-age-ms] :or {lock-file? true lock-age-ms two-hours-ms}}]
  (let [root (io/file base (str "p-" (random-uuid)))]
    (io/make-parents (io/file root (str (#'clone-registry/url-key url) "-1") "HEAD"))
    (spit (io/file root (str (#'clone-registry/url-key url) "-1") "HEAD") "ref: refs/heads/master")
    (when lock-file?
      (doto (io/file root ".lock")
        (spit "")
        (.setLastModified (ms-ago lock-age-ms))))
    root))

(deftest sweep-keeps-roots-of-live-processes-and-deletes-roots-of-stopped-processes-test
  (testing "the first use deletes each process root whose lock is free, and keeps a root whose lock another OS process holds; after that process stops, the next sweep deletes its root"
    (do-with-registries!
     (fn [base make!]
       (let [dead    (plant-root! base)
             no-lock (plant-root! base :lock-file? false)
             young   (plant-root! base :lock-age-ms 1000)
             live    (plant-root! base)
             holder  (hold-lock! (io/file live ".lock"))]
         (try
           (acquire! (make! nil))
           (is (not (.exists dead)) "the sweep deletes a root whose lock is free")
           (is (.exists live) "the sweep keeps a root whose lock another process holds")
           (is (.exists no-lock) "the sweep keeps a root with no lock file: a process can make its root before its lock file")
           (is (.exists young) "the sweep keeps a root whose lock file is new: a process can make its lock file before its lock")
           (finally
             (stop-process! holder)))
         ;; A second registry stands for the next process.
         (acquire! (make! nil))
         (is (not (.exists live)) "after the other process stopped, the next sweep deletes its root"))))))

(deftest sweep-keeps-the-locks-of-the-roots-of-this-jvm-test
  (testing "after a sweep in this JVM, another OS process still sees the lock of each process root of this JVM as held"
    (do-with-registries!
     (fn [_base make!]
       (let [a      (make! nil)
             _      (acquire! a)
             lock-a (io/file (root-dir a) ".lock")]
         (is (= "held" (lock-seen-by-another-process lock-a)) "precondition: the root of the first registry is locked")
         (let [b      (make! nil)
               _      (acquire! b)
               lock-b (io/file (root-dir b) ".lock")]
           (is (.exists (root-dir a)) "the sweep keeps the root of another registry of this JVM")
           (is (= "held" (lock-seen-by-another-process lock-a)) "the sweep keeps the lock of another registry of this JVM")
           (is (= "held" (lock-seen-by-another-process lock-b)) "the sweep keeps the lock of its own root")))))))

(deftest registry-without-a-file-lock-test
  (testing "when the lock call of the new process root throws, the registry clones, deletes no directory of another process, and logs a warning that names its root"
    (do-with-registries!
     (fn [base make!]
       (let [dead     (plant-root! base)
             old      (doto (io/file base (#'clone-registry/url-key "https://example.com/org/old.git")) .mkdirs)
             _        (.setLastModified old (ms-ago (* 2 3600000)))
             registry (make! {:old-clone-idle-ms (constantly 3600000)})]
         (mt/with-log-messages-for-level [messages [metabase-enterprise.remote-sync.source.clone-registry :warn]]
           (mt/with-dynamic-fn-redefs [clone-registry/lock-root! (fn [_] (throw (java.io.IOException. "No locks available")))]
             (let [{:keys [^File dir]} (acquire! registry)
                   root                (root-dir registry)]
               (is (.isDirectory dir) "the registry clones")
               (is (= 1 (:id (acquire! registry))) "a later acquire shares the clone")
               (is (.exists dead) "no sweep deletes a root of another process")
               (is (.exists old) "no sweep deletes an old clone directory")
               (is (not (.exists (io/file root ".lock"))) "the root has no lock file, so a sweep of another process keeps it")
               (is (some #(str/includes? (str (:message %)) (str root)) (messages))
                   "the warning names the root of this process")))))))))

(defn- sha1-name
  "A random name of 40 lowercase hexadecimal characters."
  []
  (#'clone-registry/url-key (str (random-uuid))))

(defn- make-old-clone!
  "Makes the directory `name` in `base` with the files of a bare clone. Sets the last write time of the directory and of
  each file to `idle-ms` before now, except for the files in `recent`, whose time stays now."
  ^File [^File base ^String name idle-ms & {:keys [recent]}]
  (let [dir   (io/file base name)
        files (map #(io/file dir %) ["HEAD" "FETCH_HEAD" "packed-refs" "refs/heads/master" "objects/pack/pack-1.pack"])
        then  (ms-ago idle-ms)]
    (doseq [^File f files]
      (io/make-parents f)
      (spit f "x"))
    (doseq [^File f (reverse (file-seq dir))
            :when (not (contains? (set recent) (str (.relativize (.toPath dir) (.toPath f)))))]
      (.setLastModified f then))
    dir))

(deftest first-sweep-deletes-idle-old-clone-directories-test
  (testing "the first sweep deletes each clone directory of an earlier version that nobody wrote to for longer than the task timeout"
    (do-with-registries!
     (fn [^File base make!]
       (let [deleted [["a SHA-1 name" (make-old-clone! base (sha1-name) two-hours-ms)]
                      ["a SHA-1 name and a UUID" (make-old-clone! base (str (sha1-name) "-" (random-uuid)) two-hours-ms)]]
             kept    [["a recent FETCH_HEAD" (make-old-clone! base (sha1-name) two-hours-ms :recent ["FETCH_HEAD"])]
                      ["a recent packed-refs" (make-old-clone! base (sha1-name) two-hours-ms :recent ["packed-refs"])]
                      ["a recent ref" (make-old-clone! base (sha1-name) two-hours-ms :recent ["refs/heads/master"])]
                      ["a recent directory" (make-old-clone! base (sha1-name) 0)]
                      ["upper-case hexadecimal" (make-old-clone! base (u/upper-case-en (sha1-name)) two-hours-ms)]
                      ["39 characters" (make-old-clone! base (subs (sha1-name) 1) two-hours-ms)]
                      ["a SHA-1 name and a generation" (make-old-clone! base (str (sha1-name) "-1") two-hours-ms)]
                      ["a SHA-1 name and no UUID" (make-old-clone! base (str (sha1-name) "-not-a-uuid") two-hours-ms)]
                      ["a file" (doto (io/file base (sha1-name)) (spit "x") (.setLastModified 0))]]
             live    (plant-root! base)
             holder  (hold-lock! (io/file live ".lock"))]
         (try
           (doseq [^File f (file-seq live)]
             (.setLastModified f (ms-ago two-hours-ms)))
           (acquire! (make! {:old-clone-idle-ms (constantly 3600000)}))
           (doseq [[what ^File dir] deleted]
             (testing what
               (is (not (.exists dir)) "the first sweep deletes it")))
           (doseq [[what ^File dir] kept]
             (testing what
               (is (.exists dir) "the first sweep keeps it")))
           (is (.exists live) "a process root never matches the rule of an old clone directory")
           (finally
             (stop-process! holder))))))))

(deftest later-sweep-does-not-delete-old-clone-directories-test
  (testing "a later sweep of the same registry deletes the roots of stopped processes, but not old clone directories"
    (do-with-registries!
     (fn [^File base make!]
       (let [registry (make! {:old-clone-idle-ms (constantly 3600000)})
             _        (acquire! registry)
             old      (make-old-clone! base (sha1-name) two-hours-ms)
             dead     (plant-root! base)]
         ;; Without its lock file, the root is not intact, so the next acquire makes a new root and sweeps again.
         (io/delete-file (io/file (root-dir registry) ".lock"))
         (acquire! registry)
         (is (not (.exists dead)) "precondition: the later sweep ran")
         (is (.exists old) "the later sweep does not delete an old clone directory"))))))

(deftest failed-read-of-the-idle-time-does-not-stop-the-old-clone-sweep-test
  (testing "when the first sweep cannot read the idle time, a later sweep of the same registry deletes the old clone directories"
    (do-with-registries!
     (fn [^File base make!]
       (let [reads    (atom 0)
             registry (make! {:old-clone-idle-ms (fn []
                                                   (when (= 1 (swap! reads inc))
                                                     (throw (ex-info "The app DB is not reachable" {})))
                                                   3600000)})
             old      (make-old-clone! base (sha1-name) two-hours-ms)]
         (acquire! registry)
         (is (= 1 @reads) "precondition: the first sweep read the idle time")
         (is (.exists old) "precondition: the first sweep did not delete the old clone directory")
         ;; Without its lock file, the root is not intact, so the next acquire makes a new root and sweeps again.
         (io/delete-file (io/file (root-dir registry) ".lock"))
         (acquire! registry)
         (is (not (.exists old)) "a later sweep deletes the old clone directory"))))))

(deftest shutdown-test
  (testing "a shutdown closes every clone, releases the lock of the process root, and deletes the root"
    (let [base     (io/file (System/getProperty "java.io.tmpdir") (str "clone-registry-test-" (random-uuid)))
          registry (clone-registry/make-registry base)
          closed   (atom [])]
      (try
        (let [{dir-1 :dir} (clone-registry/acquire! registry (clone-registry/new-lease url) (fake-clone (atom []) closed))
              {dir-2 :dir} (clone-registry/acquire! registry (clone-registry/new-lease "https://example.com/other.git")
                                                    (fake-clone (atom []) closed))
              root         (root-dir registry)
              lock         (:lock @(:root registry))]
          (clone-registry/shutdown! registry)
          (is (= #{dir-1 dir-2} (set @closed)))
          (is (not (.isValid ^FileLock lock)))
          (is (not (.exists root))))
        (finally
          (FileUtils/deleteQuietly base))))))
