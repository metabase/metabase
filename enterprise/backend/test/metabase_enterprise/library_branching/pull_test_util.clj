(ns metabase-enterprise.library-branching.pull-test-util
  "Helpers of the pull and merge-branch tests: an instance in memory that applies plans with `apply/apply-plan`, saves
  by a person, commits of other people on any branch of the remote, and a reset of a branch (a force push)."
  (:require
   [metabase-enterprise.library-branching.apply :as apply]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu]
   [metabase-enterprise.library-branching.snapshot :as snapshot])
  (:import
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId ObjectInserter PersonIdent Repository)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------------- Instance -----------------------------------------------------

(defn memory-ops!
  "The item operations of `apply/apply-plan` on the instance state in the volatile `st`, a state of
  [[memory-instance]]."
  [st]
  {:current     (fn [kind id]
                  (let [{:keys [snapshot trash]} @st]
                    (cond
                      (= kind (:kind (get snapshot id))) {:state :live :content (get snapshot id)}
                      (= kind (:kind (get trash id)))    {:state :trashed :content (get trash id)}
                      :else                              {:state :absent})))
   :key-holders (fn [kind k]
                  (let [{:keys [snapshot trash]} @st]
                    (into #{}
                          (keep (fn [[id item]]
                                  (when (and (= kind (:kind item)) (= k (snapshot/unique-key snapshot/unique-keys item)))
                                    id)))
                          (concat snapshot trash))))
   :write!    (fn [_kind id {:keys [place] :as content}]
                (when (contains? (:outside @st) id)
                  (instance/refuse! :outside-library id "An item outside the Library has this identity."))
                (when (and place (not (contains? (:snapshot @st) place)))
                  (instance/refuse! :place id "The container is not in scope."))
                (vswap! st #(-> %
                                (assoc-in [:snapshot id] content)
                                (update :trash dissoc id))))
   :trash!    (fn [_kind id]
                (when-let [item (get-in @st [:snapshot id])]
                  (vswap! st #(-> %
                                  (update :snapshot dissoc id)
                                  (assoc-in [:trash id] item)))))
   :stub      (fn [_kind _id content refs]
                (update content :refs #(reduce disj % refs)))
   :set-base! (fn [expected new digests]
                (if (= expected (:base @st))
                  (do (vswap! st assoc :base new :digests digests) :ok)
                  {:moved (:base @st)}))
   :in-use    (fn [trashed]
                (into {}
                      (keep (fn [{:keys [id]}]
                              (when-let [users (seq (sort (keep (fn [[user targets]] (when (contains? targets id) user))
                                                                (:uses @st))))]
                                [id (vec users)])))
                      trashed))})

(defrecord MemoryInstance [state]
  instance/Instance
  (read-snapshot [_] (locking state {:snapshot (:snapshot @state)}))
  (base [_] (:base @state))
  (base-digests [_ commit]
    (let [{:keys [base digests]} @state]
      (when (and (some? commit) (= commit base)) digests)))
  (apply-plan! [_ plan opts]
    ;; One lock for the whole instance stands for the row locks; the copy is the transaction.
    (locking state
      (let [st     (volatile! @state)
            result (apply/apply-plan (memory-ops! st) plan opts)]
        (when (contains? result :ok)
          (reset! state @st))
        result)))
  (set-base! [_ expected new digests]
    (locking state
      (let [old @state]
        (if (= expected (:base old))
          (do (swap! state assoc :base new :digests digests) :ok)
          {:moved (:base old)})))))

(defn memory-instance
  "An instance in memory over the atom `state`: `{:snapshot s :trash {id item} :outside #{id} :uses {user #{id}} :base b
  :digests d}`. `:outside` holds the identities of items outside the Library; `:uses` the items that each user outside
  the Library uses."
  [state]
  (->MemoryInstance state))

(defn save!
  "A save by a person on `inst`, a [[memory-instance]]: its synced snapshot becomes `(f snapshot)`."
  [inst f]
  (let [state (:state inst)]
    (locking state
      (swap! state update :snapshot f))))

(defn snapshot-of [inst] (:snapshot @(:state inst)))

;;; ------------------------------------------------------ Remote ------------------------------------------------------

(defn commit-on!
  "Writes a commit of `files` with `parents` into the remote `repo`, and moves branch `branch` to it whatever it was: a
  push, a merge or a force push by someone else. Returns the commit id."
  [^Repository repo branch parents files]
  (with-open [^ObjectInserter inserter (.newObjectInserter repo)]
    (let [index (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)
          ident (PersonIdent. "Someone" "someone@example.com")]
      (doseq [[^String path ^bytes content] (sort-by key files)]
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
        (doto (.updateRef repo (str "refs/heads/" branch))
          (.setNewObjectId id)
          (.forceUpdate))
        (.name id)))))

(defn commit-snapshot!
  "[[commit-on!]] of the encoding of snapshot `s`, with the foreign files `foreign`."
  ([repo branch parents s]
   (commit-snapshot! repo branch parents s {}))
  ([repo branch parents s foreign]
   (commit-on! repo branch parents (merge foreign (writer/encode-tree kinds/codecs s)))))

(defn reset-branch!
  "Moves branch `branch` of the remote `repo` to `commit`: a force push."
  [^Repository repo branch ^String commit]
  (doto (.updateRef repo (str "refs/heads/" branch))
    (.setNewObjectId (ObjectId/fromString commit))
    (.forceUpdate)))

;;; ------------------------------------------------------ Steps -------------------------------------------------------

(defn pull!
  ([inst s] (pull/pull! inst s ptu/branch))
  ([inst s opts] (pull/pull! inst s ptu/branch opts)))

(defn push!
  [inst s]
  (push/push! inst s ptu/branch))
