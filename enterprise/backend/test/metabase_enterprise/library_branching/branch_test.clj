(ns metabase-enterprise.library-branching.branch-test
  "The branch operations against a remote on disk and an instance in memory: create a branch, push to a new branch, and
  switch the instance to another branch. The scenarios of the formal model are here: a save during a switch to a
  branch whose head does not descend from the base is merged, not lost (TLC switch), and a pull never merges against a
  base that no branch holds (the mutation anybase)."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.branch :as branch]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (org.eclipse.jgit.lib Repository)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(def ^:private none
  {:created #{} :deleted #{} :updated #{}})

(defn- branch-head
  "The commit id of branch `branch-name` of the remote `repo`, or nil."
  [^Repository repo ^String branch-name]
  (some-> (.exactRef repo (str "refs/heads/" branch-name)) .getObjectId .name))

(defn- described
  [s id text]
  (assoc-in s [id :attrs :description] text))

(defn- synced-instance
  "A memory instance whose synced snapshot is `s`, with base `b` and the digests of `s`."
  [s b]
  (pltu/memory-instance (atom {:snapshot s :base b :digests (writer/item-digests kinds/codecs s)})))

;;; ------------------------------------------------------ Create ------------------------------------------------------

(deftest create-branch-test
  (with-remote [repo s]
    (let [m0 (pltu/commit-snapshot! repo "main" [] ptu/sample)]
      (testing "a new branch starts at the head of the branch it comes from"
        (is (= {:result :created :commit m0} (branch/create-branch! s "feature" "main")))
        (is (= m0 (branch-head repo "feature")))
        (is (= #{"main" "feature"} (store/branches s))))
      (testing "a branch that exists is refused, and stays where it is"
        (let [f1 (pltu/commit-snapshot! repo "feature" [m0] (ptu/renamed ptu/sample ptu/revenue-id "Feature"))]
          (is (= {:result :branch-exists :head f1} (branch/create-branch! s "feature" "main")))
          (is (= f1 (branch-head repo "feature")))))
      (testing "a branch to start from that does not exist is refused"
        (is (= {:result :no-branch :ref "nope"} (branch/create-branch! s "other" "nope")))
        (is (nil? (branch-head repo "other")))))))

(deftest create-branch-stops-at-its-commit-point-test
  (with-remote [repo s]
    (pltu/commit-snapshot! repo "main" [] ptu/sample)
    (testing "when the task may not go past its commit point, no branch is created"
      (is (= {:result :fenced :reason {:fenced "cancelled"}}
             (branch/create-branch! s "feature" "main" {:commit-point (constantly {:fenced "cancelled"})})))
      (is (nil? (branch-head repo "feature"))))
    (testing "the commit point is passed before the remote changes"
      (let [seen (atom nil)]
        (branch/create-branch! s "feature" "main" {:commit-point #(do (reset! seen (branch-head repo "feature")) nil)})
        (is (nil? @seen))
        (is (some? (branch-head repo "feature")))))))

;;; ----------------------------------------------- Push to a new branch -----------------------------------------------

(defn- push-new!
  "A push of `inst` to the new branch `branch-name` of store `s`, as a new push task."
  ([inst s branch-name]
   (push-new! inst s branch-name {}))
  ([inst s branch-name opts]
   (ptu/do-with-push-task! #(push/push! inst s branch-name % (assoc opts :new-branch? true)))))

(deftest push-to-a-new-branch-test
  (enabled
   (with-remote [repo s]
     (let [m0     (pltu/commit-snapshot! repo "main" [] ptu/sample {"README.md" (ptu/utf8 "hello")})
           inst   (synced-instance ptu/sample m0)
           local  (described ptu/sample ptu/snippet-id "Local edit.")
           _      (pltu/save! inst (constantly local))
           {:keys [result commit]} (push-new! inst s "stash" {:message "Stash message"})]
       (testing "the new branch holds the synced snapshot in a commit whose parent is the base"
         (is (= :pushed result))
         (is (= commit (branch-head repo "stash")))
         (is (= [m0] (ptu/commit-parents repo commit)))
         (is (= local (ptu/commit-snapshot s commit))))
       (testing "the branch of the base does not move"
         (is (= m0 (branch-head repo "main"))))
       (testing "the files that sync does not own stay"
         (is (= "hello" (String. ^bytes (get (store/read-tree s commit) "README.md") "UTF-8"))))
       (testing "the base is the new commit, with the digests of the pushed snapshot: nothing is a local change"
         (is (= commit (instance/base inst)))
         (is (= none (ptu/local-changes inst))))))))

(deftest push-to-a-new-branch-with-no-local-change-test
  (enabled
   (with-remote [repo s]
     (let [m0   (pltu/commit-snapshot! repo "main" [] ptu/sample)
           inst (synced-instance ptu/sample m0)
           {:keys [result commit]} (push-new! inst s "copy")]
       (testing "with no local change, the new branch still gets a commit on the base"
         (is (= :pushed result))
         (is (= [m0] (ptu/commit-parents repo commit)))
         (is (= ptu/sample (ptu/commit-snapshot s commit)))
         (is (= commit (instance/base inst))))))))

(deftest push-to-a-new-branch-that-exists-test
  (enabled
   (with-remote [repo s]
     (let [m0    (pltu/commit-snapshot! repo "main" [] ptu/sample)
           taken (pltu/commit-snapshot! repo "taken" [m0] (ptu/renamed ptu/sample ptu/revenue-id "Taken"))
           inst  (synced-instance (ptu/renamed ptu/sample ptu/orders-id "Mine") m0)]
       (testing "a branch that exists is refused: nothing is pushed, and the base stays"
         (is (= {:result :branch-exists :head taken} (push-new! inst s "taken")))
         (is (= taken (branch-head repo "taken")))
         (is (= m0 (instance/base inst))))
       (testing "a branch that someone creates during the push is refused, and keeps their commit; the push passed its
                commit point and did not land, so its task failed"
         (let [theirs (atom nil)
               racing (ptu/wrap-store s #(reset! theirs (pltu/commit-snapshot! repo "raced" [m0] ptu/sample)))]
           (ptu/do-with-push-task!
            (fn [task]
              (let [result (push/push! inst racing "raced" task {:new-branch? true})]
                (is (= {:result :branch-exists :head @theirs} result))
                (is (=? {:status "failed" :error_message (push/branch-exists-message "raced")} (tasks/task task))))))
           (is (= @theirs (branch-head repo "raced")))
           (is (= m0 (instance/base inst)))))))))

(deftest push-to-a-new-branch-records-in-one-step-test
  (enabled
   (with-remote [repo s]
     (let [m0      (pltu/commit-snapshot! repo "main" [] ptu/sample)
           inst    (synced-instance (ptu/renamed ptu/sample ptu/orders-id "Mine") m0)
           records (atom [])
           {:keys [commit]} (push-new! inst s "stash" {:on-record #(swap! records conj (instance/base inst))})]
       (testing "the record hook runs once, after the move of the base"
         (is (= [commit] @records)))
       (is (= commit (branch-head repo "stash")))))
   (testing "a push whose base another task moved does not call the record hook"
     (with-remote [repo s]
       (let [m0      (pltu/commit-snapshot! repo "main" [] ptu/sample)
             inner   (synced-instance (ptu/renamed ptu/sample ptu/orders-id "Mine") m0)
             inst    (ptu/wrap-instance inner {:set-base! (fn [_set-base _expected _new _digests] {:moved "other"})})
             records (atom 0)
             {:keys [result]} (push-new! inst s "stash" {:on-record #(swap! records inc)})]
         (is (= :base-moved result))
         (is (zero? @records)))))))

(deftest push-to-a-new-branch-refuses-an-invalid-snapshot-test
  (enabled
   (with-remote [repo s]
     (let [m0   (pltu/commit-snapshot! repo "main" [] ptu/sample)
           ;; a metric whose collection is not in the snapshot
           bad  (dissoc ptu/sample ptu/metrics-id)
           inst (synced-instance bad m0)
           {:keys [result findings]} (push-new! inst s "stash")]
       (is (= :invalid result))
       (is (seq findings))
       (is (nil? (branch-head repo "stash")))
       (is (= m0 (instance/base inst)))))))

(defspec push-to-a-new-branch-holds-the-snapshot-test 20
  (prop/for-all [local ptu/pushable-snapshot-gen]
    (mt/with-temporary-setting-values [library-branching-enabled true]
      (with-remote [repo s]
        (let [m0   (pltu/commit-snapshot! repo "main" [] ptu/sample)
              inst (synced-instance local m0)
              {:keys [result commit]} (push-new! inst s "stash")]
          (and (is (= :pushed result))
               (is (= local (ptu/commit-snapshot s commit)))
               (is (= [m0] (ptu/commit-parents repo commit)))
               (is (= commit (branch-head repo "stash") (instance/base inst)))
               (is (= m0 (branch-head repo "main")))))))))

;;; ------------------------------------------------------ Switch ------------------------------------------------------

(defn- switch-world!
  "A remote with branch main at `m0` (the sample) and branch feature at `f1` (from `m0`, with the metric revenue
  renamed), an instance on feature with base `f1` and no local change, then a commit `m1` of someone else on main that
  describes the metric orders. So the base is not an ancestor of the head of main. Returns `{:inst :m0 :f1 :m1}`."
  [repo]
  (let [feature (ptu/renamed ptu/sample ptu/revenue-id "Feature")
        m0      (pltu/commit-snapshot! repo "main" [] ptu/sample)
        f1      (pltu/commit-snapshot! repo "feature" [m0] feature)
        m1      (pltu/commit-snapshot! repo "main" [m0] (described ptu/sample ptu/orders-id "From main"))]
    {:inst (synced-instance feature f1) :m0 m0 :f1 f1 :m1 m1}))

(defn- saving-during-read!
  "`inst`, a memory instance, wrapped so that a save `f` by a person lands right after the first read of the synced
  snapshot: a save during the switch."
  [inst f]
  (let [saved? (atom false)]
    (ptu/wrap-instance inst {:read-snapshot (fn [read]
                                              (let [r (read)]
                                                (when (compare-and-set! saved? false true)
                                                  (pltu/save! inst f))
                                                r))})))

(deftest switch-merges-against-the-held-base-test
  (testing "TLC switch: the base is held by the old branch, so a switch to a branch whose head does not descend from
           the base is a three-way merge, and a save during the switch is merged, not lost"
    (enabled
     (with-remote [repo s]
       (let [{:keys [inst f1 m1]} (switch-world! repo)
             save   #(described % ptu/snippet-id "Saved during the switch.")
             result (pull/pull! (saving-during-read! inst save) s "main")]
         (is (not (store/ancestor? s f1 m1)))
         (is (=? {:result :pulled :head m1} result))
         (testing "the instance holds the content of main, with the save"
           (is (= (-> ptu/sample
                      (described ptu/orders-id "From main")
                      (described ptu/snippet-id "Saved during the switch."))
                  (pltu/snapshot-of inst))))
         (testing "the base is the head of main; the save is the only local change"
           (is (= m1 (instance/base inst)))
           (is (= (assoc none :updated #{ptu/snippet-id}) (ptu/local-changes inst))))
         (testing "the old branch keeps its commit"
           (is (= f1 (branch-head repo "feature")))))))))

(deftest switch-with-a-local-change-of-an-item-the-branch-changed-test
  (testing "a local change of an item that the other branch also changed is a conflict, and nothing is written"
    (enabled
     (with-remote [repo s]
       (let [{:keys [inst f1 m1]} (switch-world! repo)
             _      (pltu/save! inst #(described % ptu/orders-id "Mine"))
             before (pltu/snapshot-of inst)
             {:keys [result conflicts base-lost]} (pull/pull! inst s "main")]
         (is (= :conflicts result))
         (is (nil? base-lost))
         (is (= [ptu/orders-id] (map :id conflicts)))
         (is (= before (pltu/snapshot-of inst)))
         (is (= f1 (instance/base inst)))
         (is (some? m1)))))))

(deftest switch-to-a-base-that-no-branch-holds-test
  (testing "the mutation anybase: after a force push of the only branch that held the base, a switch merges two ways:
           every item where the instance and the head differ is a conflict, and nothing is written"
    (enabled
     (with-remote [repo s]
       (let [{:keys [inst f1 m1]} (switch-world! repo)
             _      (pltu/reset-branch! repo "feature" m1)
             before (pltu/snapshot-of inst)
             {:keys [result conflicts base-lost]} (pull/pull! inst s "main")]
         (is (= :conflicts result))
         (is (= :rewritten base-lost))
         (is (= #{ptu/revenue-id ptu/orders-id} (set (map :id conflicts))))
         (is (= before (pltu/snapshot-of inst)))
         (is (= f1 (instance/base inst))))))))

(deftest base-rewritten-away-during-the-switch-test
  (testing "the apply checks again that a branch holds the base it merged against: after a force push of the old
           branch during the switch, the apply writes nothing, and the next try merges two ways"
    (enabled
     (with-remote [repo s]
       (let [{:keys [inst f1 m1]} (switch-world! repo)
             before   (pltu/snapshot-of inst)
             rewriter (ptu/wrap-instance inst {:read-snapshot (let [done? (atom false)]
                                                                (fn [read]
                                                                  (when (compare-and-set! done? false true)
                                                                    (pltu/reset-branch! repo "feature" m1))
                                                                  (read)))})
             {:keys [result base-lost]} (pull/pull! rewriter s "main")]
         (is (= :conflicts result))
         (is (= :rewritten base-lost))
         (is (= before (pltu/snapshot-of inst)))
         (is (= f1 (instance/base inst))))))))

(deftest switch-commits-the-hook-with-the-apply-test
  (enabled
   (with-remote [repo s]
     (testing "the hook of a switch runs once, inside the apply that moves the base"
       (let [{:keys [inst m1]} (switch-world! repo)
             seen   (atom [])
             result (pull/pull! inst s "main" {:on-commit #(swap! seen conj (instance/base inst))})]
         (is (= :pulled (:result result)))
         ;; the memory instance moves its base when its transaction ends, so the hook sees the old base
         (is (= 1 (count @seen)))
         (is (= m1 (instance/base inst)))))
     (testing "a switch that writes nothing does not run the hook"
       (let [{:keys [inst]} (switch-world! repo)
             _    (pltu/save! inst #(described % ptu/orders-id "Mine"))
             seen (atom 0)]
         (is (= :conflicts (:result (pull/pull! inst s "main" {:on-commit #(swap! seen inc)}))))
         (is (zero? @seen)))))))
