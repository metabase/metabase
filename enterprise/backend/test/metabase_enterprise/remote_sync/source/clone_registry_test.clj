(ns metabase-enterprise.remote-sync.source.clone-registry-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.clone-registry :as clone-registry]
   [metabase.test :as mt])
  (:import
   (java.io File)
   (java.nio.channels FileLock)
   (java.nio.file FileSystems Files LinkOption)
   (java.nio.file.attribute PosixFilePermissions)
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
