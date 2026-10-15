(ns metabase-enterprise.library-branching.push-test-util
  "Helpers of the push tests: a remote on disk, an instance in memory, wrappers that put an event of the world between
  two steps of a push, a push as a task, sample items, and a generator of snapshots that a push accepts."
  (:require
   [clojure.test.check.generators :as gen]
   [metabase-enterprise.library-branching.engine.diff :as diff]
   [metabase-enterprise.library-branching.format.claims :as claims]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.test-util :as kinds.tu]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.test-util :as lb.tu])
  (:import
   (java.io File)
   (java.nio.charset StandardCharsets)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId ObjectInserter PersonIdent Repository)))

(set! *warn-on-reflection* true)

(def branch
  "The branch of the push tests."
  "main")

(def ^:private ref-name (str "refs/heads/" branch))

;;; ------------------------------------------------------ Remote ------------------------------------------------------

(defn utf8
  "The UTF-8 bytes of `s`."
  ^bytes [^String s]
  (.getBytes s StandardCharsets/UTF_8))

(defn do-with-remote
  "Calls `(f repo store)`: `repo` is a new empty bare repository, and `store` a JGit store on it. Removes both after."
  [f]
  (let [dir (.toFile (Files/createTempDirectory "library-branching-push-" (make-array FileAttribute 0)))]
    (try
      (with-open [git (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))]
        (let [s (store.jgit/open-store (str "file://" (.getAbsolutePath ^File dir)))]
          (try
            (f (.getRepository git) s)
            (finally
              (store/close s)))))
      (finally
        (FileUtils/deleteDirectory dir)))))

(defmacro with-remote
  "Binds `repo` to a new empty bare remote repository and `store` to a JGit store on it, for `body`."
  [[repo store] & body]
  `(do-with-remote (fn [~(vary-meta repo assoc :tag `Repository) ~store] ~@body)))

(defn remote-head
  "The commit id of the branch of the remote `repo`, or nil."
  [^Repository repo]
  (some-> (.exactRef repo ^String ref-name) .getObjectId .name))

(defn remote-commit!
  "Writes a commit of `files`, `{path bytes}`, with `parents` into the remote `repo`, and moves its branch to it: a
  push by someone else. Returns the commit id."
  [^Repository repo parents files]
  (with-open [^ObjectInserter inserter (.newObjectInserter repo)]
    (let [index (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)
          ident (PersonIdent. "Someone" "someone@example.com")]
      (doseq [[^String path ^bytes content] files]
        (.add builder (doto (DirCacheEntry. path)
                        (.setFileMode FileMode/REGULAR_FILE)
                        (.setObjectId (.insert inserter Constants/OBJ_BLOB content)))))
      (.finish builder)
      (let [commit (doto (CommitBuilder.)
                     (.setTreeId (.writeTree index inserter))
                     (.setAuthor ident)
                     (.setCommitter ident)
                     (.setMessage "someone else"))
            _      (doseq [^String p parents] (.addParentId commit (ObjectId/fromString p)))
            id     (.insert inserter commit)]
        (.flush inserter)
        (doto (.updateRef repo ref-name)
          (.setNewObjectId id)
          (.forceUpdate))
        (.name id)))))

(defn commit-parents
  "The parent ids of `commit` in the remote `repo`."
  [^Repository repo ^String commit]
  (with-open [rw (org.eclipse.jgit.revwalk.RevWalk. repo)]
    (mapv #(.name ^ObjectId %) (.getParents (.parseCommit rw (ObjectId/fromString commit))))))

(defn commit-snapshot
  "The snapshot that the tree of `commit` holds (`claims/decode`), read through `store`, or nil."
  [s commit]
  (:snapshot (claims/decode kinds/codecs (store/read-tree s commit))))

;;; ----------------------------------------------------- Instance -----------------------------------------------------

(defrecord FakeInstance [state]
  instance/Instance
  (read-snapshot [_] {:snapshot (:snapshot @state)})
  (base [_] (:base @state))
  (base-digests [_ commit]
    (let [{:keys [base digests]} @state]
      (when (and (some? commit) (= commit base)) digests)))
  (apply-plan! [_ _plan _opts] (instance/not-yet! `instance/apply-plan!))
  (set-base! [_ expected new digests]
    (let [[old] (swap-vals! state (fn [st] (cond-> st
                                             (= expected (:base st)) (assoc :base new :digests digests))))]
      (if (= expected (:base old)) :ok {:moved (:base old)}))))

(defn fake-instance
  "An `Instance` in memory, over the atom `state`: `{:snapshot s :base b :digests d}`."
  [state]
  (->FakeInstance state))

(defrecord WrappedInstance [inst overrides]
  instance/Instance
  (read-snapshot [_] (if-let [f (:read-snapshot overrides)]
                       (f #(instance/read-snapshot inst))
                       (instance/read-snapshot inst)))
  (base [_] (instance/base inst))
  (base-digests [_ commit] (instance/base-digests inst commit))
  (apply-plan! [_ plan opts] (instance/apply-plan! inst plan opts))
  (set-base! [_ expected new digests]
    (if-let [f (:set-base! overrides)]
      (f #(instance/set-base! inst expected new digests) expected new digests)
      (instance/set-base! inst expected new digests))))

(defn wrap-instance
  "`inst` with the methods of `overrides`, `{:read-snapshot f :set-base! g}`: each override gets the method of `inst`
  as its first argument, then the method's other arguments."
  [inst overrides]
  (->WrappedInstance inst overrides))

(defrecord RacingStore [s before-cas after-cas]
  store/Store
  (head [_ r] (store/head s r))
  (branches [_] (store/branches s))
  (default-branch [_] (store/default-branch s))
  (read-tree [_ c] (store/read-tree s c))
  (changed-paths [_ a b] (store/changed-paths s a b))
  (write-commit [_ ps t m] (store/write-commit s ps t m))
  (cas-ref! [_ r e n]
    (before-cas)
    (let [result (store/cas-ref! s r e n)]
      (after-cas)
      result))
  (ancestor? [_ a b] (store/ancestor? s a b))
  (merge-base [_ a b] (store/merge-base s a b))
  (close [_] (store/close s)))

(defn wrap-store
  "`s` with `before-cas` and `after-cas`, functions of no argument that run before and after each `cas-ref!`."
  ([s before-cas]
   (wrap-store s before-cas (constantly nil)))
  ([s before-cas after-cas]
   (->RacingStore s before-cas after-cas)))

;;; ------------------------------------------------------- Tasks ------------------------------------------------------

(def ended-by-test-message
  "The error message of a push task that the test ends."
  "The test ended the task.")

(defn do-with-push-task!
  "Calls `(f task-id)` with a new running push task (`tasks/start!`), and ends the task afterwards when it is still
  open, as the caller of a push does."
  [f]
  (let [{:keys [id]} (tasks/start! "push" nil)]
    (try
      (f id)
      (finally
        (tasks/fail! id ended-by-test-message)))))

(defn push!
  "`push/push!` of `inst` to [[branch]] of store `s`, with `opts`, as a new push task ([[do-with-push-task!]])."
  ([inst s]
   (push! inst s {}))
  ([inst s opts]
   (do-with-push-task! #(push/push! inst s branch % opts))))

(defn local-changes
  "The local changes of `inst`: `{:created :deleted :updated}`, the difference by digest of its synced snapshot from
  the digests that it stored with its base. An item shows as synced iff it is in none of the three."
  [inst]
  (diff/diff (or (instance/base-digests inst (instance/base inst)) {})
             (writer/item-digests kinds/codecs (:snapshot (instance/read-snapshot inst)))))

;;; ------------------------------------------------------ Items -------------------------------------------------------

(defn count-query
  "The portable query of a metric: the count of `table` (a table key), or of a metric `metric-id` when given."
  ([table]
   {:lib/type "mbql/query"
    :database (first table)
    :stages   [{:lib/type "mbql.stage/mbql" :source-table table :aggregation [["count" {}]]}]})
  ([table metric-id]
   (assoc-in (count-query table) [:stages 0 :aggregation] [["metric" {} metric-id]])))

(defn item
  "The item of `kind` named `item-name` at `place` with attributes `attrs`, with the references of the attributes."
  [id kind item-name place attrs]
  {:kind kind :name item-name :place place :refs (kinds/refs kind id attrs) :attrs attrs})

(def library-id "LibraryCollection0001")
(def metrics-id "MetricsCollection0001")
(def revenue-id "RevenueMetric00000001")
(def orders-id  "OrdersCountMetric0001")
(def snippet-id "ActiveFilterSnippet01")

(def orders-table ["Sample Database" "PUBLIC" "ORDERS"])

(def sample
  "A snapshot that a push accepts: the Library, its metrics collection with two metrics, and a snippet at the root
  level of the snippets namespace."
  {library-id (item library-id :collection "Library" nil {:type "library"})
   metrics-id (item metrics-id :collection "Metrics" library-id {:type "library-metrics"})
   revenue-id (item revenue-id :metric "Revenue" metrics-id {:display "scalar" :query (count-query orders-table)})
   orders-id  (item orders-id :metric "Orders" metrics-id {:display "scalar" :description "All orders."
                                                           :query (count-query orders-table)})
   snippet-id (item snippet-id :snippet "Active" nil {:content "active = true"})})

(defn renamed
  "Snapshot `s` with item `id` named `item-name`."
  [s id item-name]
  (assoc-in s [id :name] item-name))

;;; ---------------------------------------------------- Generator -----------------------------------------------------

(defn- acceptable
  "Item `item` changed so that a push accepts it: a root-level collection is a Library root, no collection has a
  namespace (so each has the namespace of its parent), and no attribute names an item by identity."
  [{:keys [kind place] :as item}]
  (case kind
    :collection (cond-> (update item :attrs dissoc :namespace)
                  (nil? place) (update :attrs assoc :type "library"))
    :metric     (update item :attrs #(-> %
                                         (assoc :query (count-query orders-table))
                                         (dissoc :visualization_settings :parameters :parameter_mappings
                                                 :dimensions :dimension_mappings)))
    :snippet    (update item :attrs dissoc :template_tags)
    item))

(def pushable-snapshot-gen
  "Generates snapshots of the kinds that a push accepts, of at most 12 items: well formed, every root-level item
  a fixed root, references only to the environment, and every item in the schema of its codec."
  (gen/fmap (fn [s] (kinds.tu/with-refs (update-vals s acceptable)))
            (lb.tu/well-formed-snapshot-gen {:kinds       snapshot/kinds
                                             :may-contain snapshot/may-contain
                                             :root-kinds  #{:collection :glossary-term :snippet}
                                             :attrs       kinds.tu/attrs-gens
                                             :max-items   12})))
