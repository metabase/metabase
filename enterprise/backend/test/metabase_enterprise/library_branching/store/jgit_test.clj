(ns metabase-enterprise.library-branching.store.jgit-test
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.store.jgit-test/with-remote clojure.core/fn
                                 metabase-enterprise.library-branching.store.jgit-test/with-store  clojure.core/with-open}}}
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit])
  (:import
   (java.io File)
   (java.nio.file Files LinkOption)
   (java.nio.file.attribute FileAttribute PosixFilePermission)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId ObjectInserter PersonIdent Ref Repository)))

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
  "Binds `repo` to a new empty bare repository and `url` to its file:// URL, as the arguments of a `fn`."
  [[repo url] & body]
  `(do-with-remote (fn [~(vary-meta repo assoc :tag `Repository) ~url] ~@body)))

(defn- do-with-store [url f]
  (let [s (store.jgit/open-store url)]
    (try
      (f s)
      (finally
        (store/close s)))))

(defmacro ^:private with-store
  "Binds `binding` to a new store on `url`, and closes it after `body`."
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

(defn- set-remote-ref!
  "Moves `ref` of the remote `repo` to `commit`, or deletes it when `commit` is nil: a push by someone else."
  [^Repository repo ^String ref commit]
  (let [update (doto (.updateRef repo ref) (.setForceUpdate true))]
    (if commit
      (doto update (.setNewObjectId (ObjectId/fromString ^String commit)) (.forceUpdate))
      (.delete update))))

(defn- refs
  "{ref-name commit-id} of every ref of `repo`."
  [^Repository repo]
  (into {} (map (fn [^Ref r] [(.getName r) (some-> (.getObjectId r) .name)]))
        (.getRefs (.getRefDatabase repo))))

(defn- store-refs [s]
  (with-open [git (Git/open (store.jgit/directory s))]
    (refs (.getRepository git))))

(defn- utf8 ^bytes [^String s] (.getBytes s "UTF-8"))

(defn- tree= [a b]
  (= (update-vals a vec) (update-vals b vec)))

;;; cas-ref!

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

(deftest cas-ref-expected-nil-test
  (with-remote [remote url]
    (with-store [s url]
      (let [c0 (store/write-commit s [] {"a.txt" (utf8 "zero")} "zero")]
        (testing "expected nil creates a ref that does not exist"
          (is (nil? (store/head s "main")))
          (is (= :ok (store/cas-ref! s "main" nil c0)))
          (is (= c0 (remote-ref remote "refs/heads/main"))))
        (testing "expected nil refuses when the ref exists, also when it is at the new commit"
          (let [c1 (store/write-commit s [c0] {"a.txt" (utf8 "one")} "one")]
            (is (= {:moved c0} (store/cas-ref! s "main" nil c1)))
            (is (= {:moved c0} (store/cas-ref! s "main" nil c0)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))
        (testing "a move from the current commit to itself"
          (is (= :ok (store/cas-ref! s "main" c0 c0))))))))

(deftest cas-ref-not-fast-forward-test
  (testing "cas-ref! moves the ref to a commit that does not descend from it, when the ref is at the expected commit"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")
            c1 (remote-commit! remote "refs/heads/main" [c0] "one")]
        (with-store [s url]
          (is (= c1 (store/head s "main")))
          (let [c2 (store/write-commit s [c0] {"a.txt" (utf8 "two")} "two")]
            (is (= :ok (store/cas-ref! s "refs/heads/main" c1 c2)))
            (is (= c2 (remote-ref remote "refs/heads/main")))))))))

(deftest cas-ref-refused-by-remote-test
  (testing "cas-ref! throws when the remote refuses the update and the ref is still at the expected commit"
    (with-remote [remote url]
      (let [c0   (remote-commit! remote "refs/heads/main" [] "zero")
            lock (io/file (.getDirectory remote) "refs" "heads" "main.lock")]
        (with-store [s url]
          (is (= c0 (store/head s "main")))
          (let [c1 (store/write-commit s [c0] {"a.txt" (utf8 "one")} "one")]
            ;; another process holds the lock of the ref on the remote
            (spit lock "")
            (try
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Git push of refs/heads/main to .* failed"
                                    (store/cas-ref! s "main" c0 c1)))
              (finally
                (.delete lock)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))))))

(defn- writer-op [writers w] (nth writers (mod w (count writers))))

(def ^:private gen-cas-ops
  "Operations of two writers and an outside party on one remote branch: a compare-and-swap from the head that the
  writer read last (it can be stale), a compare-and-swap from any commit that exists or from nil, a read of the
  head, and an outside reset of the branch to any commit, or its deletion. Each operation is a small vector, so a
  failure shrinks to fewer and simpler operations."
  (gen/vector (gen/one-of [(gen/tuple (gen/return :cas-last) (gen/choose 0 1))
                           (gen/tuple (gen/return :cas-any) (gen/choose 0 1) gen/nat)
                           (gen/tuple (gen/return :head) (gen/choose 0 1))
                           (gen/tuple (gen/return :reset) gen/nat)])
              1 12))

(defn- run-cas-ops!
  "Runs `ops` against the remote and returns the first operation that breaks the law of cas-ref! or of head,
  with what the model expected, or nil."
  [^Repository remote url ops]
  (let [ref     "refs/heads/main"
        writers [(store.jgit/open-store url) (store.jgit/open-store url)]]
    (try
      (loop [[[op w k :as step] & more] ops
             model   nil                   ; the value of the remote ref
             known   [nil]                 ; nil and every commit that the remote holds
             last    {}                    ; writer index -> the head it read last
             counter 0]
        (if-not step
          nil
          (case op
            :head
            (let [s (writer-op writers w)
                  h (store/head s "main")]
              (if (= model h)
                (recur more model known (assoc last (mod w 2) h) counter)
                {:step step :expected model :actual h}))

            (:cas-last :cas-any)
            (let [i        (mod w 2)
                  s        (writers i)
                  parent   (get last i)
                  expected (if (= op :cas-last) parent (nth known (mod k (count known))))
                  new      (store/write-commit s (if parent [parent] []) {"a.txt" (utf8 (str counter))}
                                               (str "commit " counter))
                  result   (store/cas-ref! s "main" expected new)
                  want     (if (= model expected) :ok {:moved model})
                  after    (remote-ref remote ref)
                  model'   (if (= want :ok) new model)]
              (if (and (= want result) (= model' after))
                (recur more model' (cond-> known (= want :ok) (conj new)) last (inc counter))
                {:step step :expected [want model'] :actual [result after]}))

            :reset
            (let [target (nth known (mod w (count known)))]
              (set-remote-ref! remote ref target)
              (recur more target known last counter)))))
      (finally
        (run! store/close writers)))))

(defspec cas-ref-law-test 50
  (prop/for-all [ops gen-cas-ops]
    (with-remote [remote url]
      (let [failure (run-cas-ops! remote url ops)]
        (is (nil? failure))
        (nil? failure)))))

;;; head

(deftest head-test
  (with-remote [remote url]
    (with-store [s url]
      (testing "a ref that does not exist"
        (is (nil? (store/head s "main"))))
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
        (testing "a branch name and a full ref name give the commit of the remote"
          (is (= c0 (store/head s "main")))
          (is (= c0 (store/head s "refs/heads/main"))))
        (testing "head fetches the commit, so the store can read it"
          (is (tree= {"a.txt" (utf8 "zero")} (store/read-tree s c0))))
        (testing "a deleted ref"
          (set-remote-ref! remote "refs/heads/main" nil)
          (is (nil? (store/head s "main"))))))))

(deftest head-of-missing-remote-test
  (with-store [s (remote-url (io/file (System/getProperty "java.io.tmpdir") (str "no-such-remote-" (random-uuid))))]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Git fetch of .* failed" (store/head s "main")))))

;;; write-commit and read-tree

(deftest write-commit-changes-no-ref-test
  (with-remote [remote url]
    (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")]
      (with-store [s url]
        (store/head s "main")
        (let [local-before  (store-refs s)
              remote-before (refs remote)
              c1            (store/write-commit s [c0] {"b.txt" (utf8 "b")} "one")]
          (is (string? c1))
          (is (= local-before (store-refs s)))
          (is (= remote-before (refs remote)))
          (is (store/ancestor? s c0 c1)))))))

(deftest write-commit-refuses-bad-trees-test
  (with-remote [_remote url]
    (with-store [s url]
      (testing "a path that is a file and a directory"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is a file and a directory"
                              (store/write-commit s [] {"a" (utf8 "x") "a/b" (utf8 "y")} "m"))))
      (doseq [path ["" "/a" "a//b" "../a" ".git/config" "a/"]]
        (testing (pr-str path)
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid path"
                                (store/write-commit s [] {path (utf8 "x")} "m")))))
      (testing "a parent that is not in the local object store"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not in the local object store"
                              (store/write-commit s ["0123456789012345678901234567890123456789"] {} "m")))))))

(def ^:private gen-segment
  "A path segment of 1 to 4 characters, with ASCII, non-ASCII and non-BMP characters, so that the order of UTF-16
  strings and the byte order of git trees differ."
  (gen/fmap str/join (gen/vector (gen/elements ["a" "b" "Z" "0" "_" "-" "é" "中" "ｚ" "😀"]) 1 4)))

(def ^:private gen-any-tree
  "A tree {path bytes} of 0 to 10 files, 1 to 3 segments deep, with any bytes. A file name ends in `.f` and a
  directory name has no `.`, so no path is a file and a directory of another."
  (gen/fmap #(into {} %)
            (gen/vector (gen/tuple (gen/fmap (fn [[dirs file]] (str/join "/" (conj dirs (str file ".f"))))
                                             (gen/tuple (gen/vector gen-segment 0 2) gen-segment))
                                   gen/bytes)
                        0 10)))

(defspec read-tree-of-write-commit-test 50
  (prop/for-all [tree gen-any-tree]
    (with-remote [_remote url]
      (with-store [s url]
        (tree= tree (store/read-tree s (store/write-commit s [] tree "m")))))))

;;; Commit graphs: ancestor?, merge-base, changed-paths

(def ^:private path-universe
  "Paths with no file that is a directory of another."
  ["r0.yaml" "r1.yaml" "d0/a.yaml" "d0/b.yaml" "d0/e/f.yaml" "d1/a.yaml"])

(def ^:private gen-tree
  "A tree over `path-universe`, with contents from three values, so that two trees often hold one path with equal
  or with different bytes. Shrinks toward the empty tree."
  (gen/fmap (fn [contents]
              (into {} (keep (fn [[path c]] (when c [path (utf8 c)]))) (map vector path-universe contents)))
            (gen/vector (gen/elements [nil "a" "b" "c"]) (count path-universe))))

(def ^:private gen-graph
  "A commit graph of 1 to 8 commits, as [[parent-choices tree] ...] in topological order. Commit i has 0 to 2
  parents: each choice c gives the parent (mod c i). So every graph is acyclic by construction, and a failure
  shrinks toward fewer commits, fewer parents and smaller trees."
  (gen/vector (gen/tuple (gen/vector gen/nat 0 2) gen-tree) 1 8))

(defn- graph-parents
  "The parent indices of each commit of `graph`."
  [graph]
  (vec (map-indexed (fn [i [choices _]] (if (zero? i) [] (vec (distinct (map #(mod % i) choices))))) graph)))

(defn- graph-ancestors
  "For each commit index, the set of indices of its ancestors, itself included."
  [parents]
  (reduce (fn [acc ps] (conj acc (into #{(count acc)} (mapcat acc) ps))) [] parents))

(defn- write-graph!
  "Writes the commits of `graph` to store `s`; returns their ids by index."
  [s graph parents]
  (reduce (fn [ids [i [_ tree]]]
            (conj ids (store/write-commit s (mapv ids (parents i)) tree (str "commit " i))))
          []
          (map-indexed vector graph)))

(defn- tree-diff [from to]
  (let [from-paths (set (keys from))
        to-paths   (set (keys to))]
    {:added    (set/difference to-paths from-paths)
     :deleted  (set/difference from-paths to-paths)
     :modified (set (filter #(not= (vec (from %)) (vec (to %))) (set/intersection from-paths to-paths)))}))

(defn- graph-law-failures!
  "Every pair of commits of `graph` for which ancestor?, merge-base or changed-paths of `s` disagrees with the
  model of the graph, and every commit whose read-tree is not its tree."
  [s graph]
  (let [parents   (graph-parents graph)
        ancestors (graph-ancestors parents)
        ids       (write-graph! s graph parents)
        index     (zipmap ids (range))
        trees     (mapv second graph)
        n         (count graph)]
    (concat
     (for [i (range n)
           :when (not (tree= (trees i) (store/read-tree s (ids i))))]
       {:law :read-tree :commit i})
     (for [i (range n)
           :let [want (tree-diff {} (trees i))
                 got  (store/changed-paths s nil (ids i))]
           :when (not= want got)]
       {:law :changed-paths :from nil :to i :expected want :actual got})
     (for [i (range n)
           j (range n)
           :let [failures
                 (concat
                  (let [want (contains? (ancestors j) i)
                        got  (store/ancestor? s (ids i) (ids j))]
                    (when (not= want got)
                      [{:law :ancestor? :a i :b j :expected want :actual got}]))
                  (let [common (set/intersection (ancestors i) (ancestors j))
                        mb     (some-> (store/merge-base s (ids i) (ids j)) index)
                        lowest (set (remove (fn [k] (some #(and (not= k %) (contains? (ancestors %) k)) common))
                                            common))]
                    (when-not (if (empty? common) (nil? mb) (contains? lowest mb))
                      [{:law :merge-base :a i :b j :lowest lowest :actual mb}]))
                  (let [want (tree-diff (trees i) (trees j))
                        got  (store/changed-paths s (ids i) (ids j))]
                    (when (not= want got)
                      [{:law :changed-paths :from i :to j :expected want :actual got}])))]
           failure failures]
       failure))))

(defspec commit-graph-law-test 50
  (prop/for-all [graph gen-graph]
    (with-remote [_remote url]
      (with-store [s url]
        (let [failures (vec (graph-law-failures! s graph))]
          (is (= [] failures))
          (empty? failures))))))

(deftest reset-branch-ancestry-test
  (testing "after a reset of the branch to another commit, the old head is not an ancestor of the new head"
    (with-remote [remote url]
      (let [c0 (remote-commit! remote "refs/heads/main" [] "zero")
            c1 (remote-commit! remote "refs/heads/main" [c0] "one")]
        (with-store [s url]
          (is (= c1 (store/head s "main")))
          (let [c2 (remote-commit! remote "refs/heads/main" [c0] "two")]
            (is (= c2 (store/head s "main")))
            (is (not (store/ancestor? s c1 c2)))
            (is (store/ancestor? s c0 c2))
            (is (= c0 (store/merge-base s c1 c2)))))))))

;;; The local directory

(deftest local-directory-test
  (with-remote [_remote url]
    (let [s   (store.jgit/open-store url :token "secret-token-value")
          dir (store.jgit/directory s)]
      (try
        (testing "a new directory under java.io.tmpdir"
          (is (= (.getCanonicalFile (io/file (System/getProperty "java.io.tmpdir")))
                 (.getCanonicalFile (.getParentFile dir)))))
        (testing "only the owner can read, write and enter it"
          (is (= #{PosixFilePermission/OWNER_READ PosixFilePermission/OWNER_WRITE PosixFilePermission/OWNER_EXECUTE}
                 (set (Files/getPosixFilePermissions (.toPath dir) (make-array LinkOption 0))))))
        (testing "the printed store does not show the token"
          (is (not (str/includes? (pr-str s) "secret-token-value"))))
        (testing "two stores on one remote have two directories"
          (with-store [other url]
            (is (not= dir (store.jgit/directory other)))))
        (finally
          (store/close s)))
      (testing "close removes the directory"
        (is (not (.exists dir)))))))

(deftest no-hooks-test
  (testing "a push runs no hook, also with a refusing pre-push hook at the default place"
    (with-remote [remote url]
      (with-store [s url]
        (let [hooks (io/file (store.jgit/directory s) "hooks")
              hook  (io/file hooks "pre-push")]
          (.mkdirs hooks)
          (spit hook "#!/bin/sh\nexit 1\n")
          (.setExecutable hook true)
          (let [c0 (store/write-commit s [] {"a.txt" (utf8 "zero")} "zero")]
            (is (= :ok (store/cas-ref! s "main" nil c0)))
            (is (= c0 (remote-ref remote "refs/heads/main")))))))))
