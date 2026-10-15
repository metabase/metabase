(ns metabase-enterprise.library-branching.pull-test
  "The pull, against a remote on disk and an instance in memory. The scenarios of the formal model are here: a save
  between the read and the apply (nowitness), a resolved conflict and new saves (the ABA trace), decisions against one
  head, a force push, a force push during the pull (forcepush-norecheck), and an ill-formed head (pullnovalidate)."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(def ^:private none
  {:created #{} :deleted #{} :updated #{}})

(defn- pushed-instance!
  "A memory instance that pushed `s` to the branch of store `st`, and the commit of the push."
  [st s & {:as more}]
  (let [inst (pltu/memory-instance (atom (merge {:snapshot s} more)))
        c    (:commit (pltu/push! inst st))]
    [inst c]))

(def ^:private new-snippet-id "PulledSnippet00000001")

(defn- new-snippet
  [place]
  (ptu/item new-snippet-id :snippet "Pulled" place {:content "pulled = true"}))

(defn- described
  [s id text]
  (assoc-in s [id :attrs :description] text))

;;; --------------------------------------------------- Simple pulls ---------------------------------------------------

(deftest pull-applies-the-remote-changes-and-keeps-the-local-ones-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           remote    (-> ptu/sample
                         (ptu/renamed ptu/revenue-id "Revenue, net")
                         (dissoc ptu/orders-id)
                         (assoc new-snippet-id (new-snippet ptu/library-id)))
           h         (pltu/commit-snapshot! repo ptu/branch [c1] remote)]
       (pltu/save! inst #(described % ptu/snippet-id "Local edit."))
       (let [{:keys [result head]} (pltu/pull! inst s)]
         (testing "the remote update, create and delete land, and the local change stays"
           (is (= :pulled result))
           (is (= h head))
           (is (= (described remote ptu/snippet-id "Local edit.") (pltu/snapshot-of inst))))
         (testing "a removed item goes to the trash"
           (is (= (get ptu/sample ptu/orders-id) (get-in @(:state inst) [:trash ptu/orders-id]))))
         (testing "the base is the head, with the digests of the content of the head"
           (is (= h (instance/base inst)))
           (is (= (writer/item-digests kinds/codecs remote) (instance/base-digests inst h))))
         (testing "the pulled items show as synced; the local change is still a local change"
           (is (= (assoc none :updated #{ptu/snippet-id}) (ptu/local-changes inst)))))))))

(deftest pull-of-the-base-is-up-to-date-test
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "the head is the base: nothing to do, and the local change stays"
         (is (= {:result :up-to-date :head c1} (pltu/pull! inst s)))
         (is (= "Local" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name]))))))))

(deftest pull-of-a-head-with-the-same-content-moves-the-base-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] ptu/sample {"README.md" (ptu/utf8 "hi")})]
       (testing "a new head with the same content: no step, and the base moves"
         (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! inst s)))
         (is (= h (instance/base inst))))))))

(deftest disabled-pull-writes-nothing-test
  (mt/with-temporary-setting-values [library-branching-enabled false]
    (with-remote [repo s]
      (let [h    (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
            inst (pltu/memory-instance (atom {:snapshot {}}))]
        (is (some? h))
        (is (= {:result :disabled} (pltu/pull! inst s)))
        (is (= {} (pltu/snapshot-of inst)))))))

(deftest first-pull-with-no-base-test
  (enabled
   (with-remote [repo s]
     (let [local-id "LocalSnippet000000001"
           local    (ptu/item local-id :snippet "Local" nil {:content "local = true"})
           h        (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
       (testing "with no base, the base snapshot is empty: remote items are created, and local items stay"
         (let [inst (pltu/memory-instance (atom {:snapshot {local-id local}}))]
           (is (= :pulled (:result (pltu/pull! inst s))))
           (is (= (assoc ptu/sample local-id local) (pltu/snapshot-of inst)))
           (is (= h (instance/base inst)))
           (is (= (assoc none :created #{local-id}) (ptu/local-changes inst)))))
       (testing "with no base, an item that both sides hold with different content is a conflict"
         (let [inst                       (pltu/memory-instance (atom {:snapshot (select-keys (described ptu/sample ptu/snippet-id "x") [ptu/snippet-id])}))
               {:keys [result conflicts]} (pltu/pull! inst s)]
           (is (= :conflicts result))
           (is (= [ptu/snippet-id] (map :id conflicts)))
           (is (nil? (instance/base inst)))))))))

(deftest pull-of-a-missing-branch-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (.delete (doto (.updateRef ^org.eclipse.jgit.lib.Repository repo (str "refs/heads/" ptu/branch)) (.setForceUpdate true)))
       (is (= {:result :no-branch} (pltu/pull! inst s)))
       (is (= c1 (instance/base inst)))))))

(deftest pull-after-a-crash-between-branch-and-base-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           local     (ptu/renamed ptu/sample ptu/revenue-id "Changed")
           crashes   (ptu/wrap-instance inst {:set-base! (fn [& _] (throw (ex-info "crash" {})))})]
       (pltu/save! inst (constantly local))
       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"crash" (pltu/push! crashes s)))
       (let [h (ptu/remote-head repo)]
         (testing "a push moved the branch and crashed before it moved the base: the next pull sees the local snapshot on
                  both sides, writes nothing, and moves the base"
           (is (not= c1 h))
           (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! inst s)))
           (is (= h (instance/base inst)))
           (is (= none (ptu/local-changes inst)))))))))

;;; ----------------------------------------------------- Conflicts ----------------------------------------------------

(deftest pull-conflict-writes-nothing-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                     (ptu/renamed ptu/revenue-id "Theirs")
                                                                     (ptu/renamed ptu/orders-id "Same")))]
       (pltu/save! inst #(-> % (ptu/renamed ptu/revenue-id "Mine") (ptu/renamed ptu/orders-id "Same")))
       (let [before                              (pltu/snapshot-of inst)
             {:keys [result conflicts base-lost]} (pltu/pull! inst s)]
         (testing "both sides changed one item in different ways: a conflict that names the item and its three contents"
           (is (= :conflicts result))
           (is (nil? base-lost))
           (is (= [{:id     ptu/revenue-id
                    :base   (get ptu/sample ptu/revenue-id)
                    :ours   (get (ptu/renamed ptu/sample ptu/revenue-id "Mine") ptu/revenue-id)
                    :theirs (get (ptu/renamed ptu/sample ptu/revenue-id "Theirs") ptu/revenue-id)}]
                  conflicts)))
         (testing "an equal change on both sides is no conflict; nothing is written and the base stays"
           (is (= before (pltu/snapshot-of inst)))
           (is (= c1 (instance/base inst)))
           (is (some? h))))))))

(deftest take-theirs-is-a-save-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           remote    (ptu/renamed ptu/sample ptu/revenue-id "Theirs")
           h         (pltu/commit-snapshot! repo ptu/branch [c1] remote)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Mine"))
       (is (= :conflicts (:result (pltu/pull! inst s))))
       (testing "the person takes theirs: an ordinary save of the remote content; the next pull has no conflict"
         (pltu/save! inst #(assoc % ptu/revenue-id (get remote ptu/revenue-id)))
         (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! inst s)))
         (is (= none (ptu/local-changes inst))))))))

(deftest aba-trace-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           remote    (ptu/renamed ptu/sample ptu/revenue-id "Theirs")
           h         (pltu/commit-snapshot! repo ptu/branch [c1] remote)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "a"))
       (is (= :conflicts (:result (pltu/pull! inst s))))
       (pltu/save! inst #(assoc % ptu/revenue-id (get remote ptu/revenue-id)))
       (let [racing (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                              (let [r (read-snapshot)]
                                                                ;; after the read point: the person saves b, then a
                                                                (pltu/save! inst #(ptu/renamed % ptu/revenue-id "b"))
                                                                (pltu/save! inst #(ptu/renamed % ptu/revenue-id "a"))
                                                                r))})]
         (testing "after take-theirs, the person saves b and then a during the pull: the item is in no plan, and the
                  pull does not write over the save"
           (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! racing s)))
           (is (= "a" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
           (is (= (assoc none :updated #{ptu/revenue-id}) (ptu/local-changes inst)))))))))

;;; ---------------------------------------------- A save during the pull ----------------------------------------------

(deftest save-between-read-and-apply-is-not-lost-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))
           saved?    (atom false)
           racing    (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                               (let [r (read-snapshot)]
                                                                 (when (compare-and-set! saved? false true)
                                                                   (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Saved")))
                                                                 r))})]
       (testing "the plan writes the remote content of an item that the person saved after the read point: the apply
                sees the save under its lock, writes nothing, and the pull starts again and finds a conflict"
         (let [{:keys [result conflicts head]} (pltu/pull! racing s)]
           (is (= :conflicts result))
           (is (= h head))
           (is (= [ptu/revenue-id] (map :id conflicts))))
         (is (= "Saved" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
         (is (= c1 (instance/base inst))))))))

(deftest stale-pull-gives-up-after-the-retries-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           _         (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))
           reads     (atom 0)
           racing    (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                               ;; each read sees the base content, and a save follows it
                                                               (pltu/save! inst #(assoc % ptu/revenue-id (get ptu/sample ptu/revenue-id)))
                                                               (let [r (read-snapshot)]
                                                                 (swap! reads inc)
                                                                 (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Saved"))
                                                                 r))})]
       (testing "a save after every read point: the pull stops after its retries, and writes nothing"
         (is (= {:result :stale :head (ptu/remote-head repo) :ids [ptu/revenue-id]} (pltu/pull! racing s {:retries 2})))
         (is (= 3 @reads))
         (is (= "Saved" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
         (is (= c1 (instance/base inst))))))))

;;; ----------------------------------------------------- Decisions ----------------------------------------------------

(deftest decisions-against-one-head-accumulate-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                     (ptu/renamed ptu/revenue-id "Theirs 1")
                                                                     (ptu/renamed ptu/orders-id "Theirs 2")))]
       (pltu/save! inst #(-> % (ptu/renamed ptu/revenue-id "Mine 1") (ptu/renamed ptu/orders-id "Mine 2")))
       (let [local (pltu/snapshot-of inst)
             d1    (pull/decide [] ptu/revenue-id (get local ptu/revenue-id) h)]
         (testing "one decision resolves one of two conflicts"
           (is (= [ptu/orders-id] (map :id (:conflicts (pltu/pull! inst s {:decisions d1}))))))
         (testing "a second decision against the same head does not replace the first: both hold, and the pull applies"
           (let [d2 (pull/decide d1 ptu/orders-id (get local ptu/orders-id) h)]
             (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! inst s {:decisions d2})))
             (is (= local (pltu/snapshot-of inst)))
             (is (= (assoc none :updated #{ptu/revenue-id ptu/orders-id}) (ptu/local-changes inst))))))))))

(deftest decision-is-bound-to-content-and-head-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h1        (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Mine"))
       (let [decisions (pull/decide [] ptu/revenue-id (get (pltu/snapshot-of inst) ptu/revenue-id) h1)]
         (testing "after a new save of the item, the decision does not hold"
           (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Mine again"))
           (is (= [ptu/revenue-id] (map :id (:conflicts (pltu/pull! inst s {:decisions decisions}))))))
         (testing "against a new head, the decision does not hold"
           (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Mine"))
           (pltu/commit-snapshot! repo ptu/branch [h1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs again"))
           (is (= [ptu/revenue-id] (map :id (:conflicts (pltu/pull! inst s {:decisions decisions}))))))
         (testing "a decision that keeps an absent item holds while the item is absent"
           (is (= {ptu/orders-id nil}
                  (pull/decisions-for (pull/decide [] ptu/orders-id nil h1) h1 (dissoc ptu/sample ptu/orders-id))))))))))

;;; ---------------------------------------------------- Force pushes --------------------------------------------------

(deftest force-push-loses-the-base-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           ;; someone resets the branch to a commit of another history
           remote    (ptu/renamed ptu/sample ptu/revenue-id "Rewritten")
           h         (pltu/commit-snapshot! repo ptu/branch [] remote)
           {:keys [result conflicts base-lost]} (pltu/pull! inst s)]
       (testing "the base is not in the history of the head: no three-way merge; every item where the instance and the
                head differ is a conflict, also one that the instance did not change"
         (is (= :conflicts result))
         (is (= :rewritten base-lost))
         (is (= [ptu/revenue-id] (map :id conflicts)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))
       (testing "after keep-mine decisions, the pull writes nothing and moves the base: the kept item is a local change"
         (let [decisions (pull/decide [] ptu/revenue-id (get ptu/sample ptu/revenue-id) h)]
           (is (= {:result :pulled :head h :steps [] :trashed-in-use {}} (pltu/pull! inst s {:decisions decisions})))
           (is (= ptu/sample (pltu/snapshot-of inst)))
           (is (= (assoc none :updated #{ptu/revenue-id}) (ptu/local-changes inst)))))))))

(deftest unreadable-base-is-a-lost-base-test
  (enabled
   (with-remote [repo s]
     (let [old  (pltu/commit-on! repo ptu/branch [] {"collections/main/x.yaml" (ptu/utf8 "name: x\n")})
           h    (pltu/commit-snapshot! repo ptu/branch [old] ptu/sample)
           inst (pltu/memory-instance (atom {:snapshot (ptu/renamed ptu/sample ptu/revenue-id "Mine") :base old}))
           {:keys [result conflicts base-lost]} (pltu/pull! inst s)]
       (is (some? h))
       (is (= :conflicts result))
       (is (= :unreadable base-lost))
       (is (= [ptu/revenue-id] (map :id conflicts)))))))

(deftest force-push-during-the-pull-aborts-the-apply-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           ;; item 1 = a is the base content "Revenue". main has its own history, with item 1 = b; a text merge of main into the branch takes b
           main      (pltu/commit-snapshot! repo "upstream" [] (ptu/renamed ptu/sample ptu/revenue-id "b"))
           merged    (pltu/commit-snapshot! repo ptu/branch [c1 main] (ptu/renamed ptu/sample ptu/revenue-id "b"))
           once      (atom false)
           racing    (ptu/wrap-instance
                      inst
                      {:read-snapshot (fn [read-snapshot]
                                        (let [r (read-snapshot)]
                                          (when (compare-and-set! once false true)
                                            ;; after the pull read item 1 = a and planned item 1 := b
                                            (pltu/save! inst #(ptu/renamed % ptu/revenue-id "b"))
                                            (pltu/reset-branch! repo ptu/branch main)
                                            ;; the save of a, the base content
                                            (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Revenue")))
                                          r))})
           {:keys [result head base-lost]} (pltu/pull! racing s)]
       (testing "the branch is reset during the pull, and the last save equals the base content: the apply reads the
                head again, finds that the planned head left the branch history, and writes nothing"
         (is (some? merged))
         (is (= "Revenue" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
         (is (= c1 (instance/base inst))))
       (testing "the pull starts again on the new head, whose history does not hold the base"
         (is (= :conflicts result))
         (is (= main head))
         (is (= :rewritten base-lost)))))))

;;; ----------------------------------------------------- Validation ---------------------------------------------------

(deftest pull-refuses-an-ill-formed-head-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           stray     "StrayCollection000001"
           ;; a text merge in git: one side removed the metrics collection, the other side added a metric in it
           bad       (-> ptu/sample
                         (dissoc ptu/metrics-id ptu/orders-id)
                         (assoc stray (ptu/item stray :collection "Stray" nil {})))
           ;; the layout needs every place, so the file of the metric is written by hand
           files     (assoc (writer/encode-tree kinds/codecs (dissoc bad ptu/revenue-id))
                            "library/revenue.metric.yaml"
                            (writer/write-yaml (codec/encode format.metric/codec ptu/revenue-id (get bad ptu/revenue-id))))
           h         (pltu/commit-on! repo ptu/branch [c1] files)
           {:keys [result head findings]} (pltu/pull! inst s)]
       (testing "the head breaks structural rules: the pull refuses with the findings, and the instance stays on its
                base"
         (is (= :invalid result))
         (is (= h head))
         (is (= #{{:rule :place-inside :id ptu/revenue-id :place ptu/metrics-id} {:rule :root :id stray}}
                (set findings)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

(deftest pull-refuses-a-head-that-does-not-decode-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           files     (assoc (writer/encode-tree kinds/codecs ptu/sample) "library/broken.metric.yaml" (ptu/utf8 "kind: [\n"))
           _         (pltu/commit-on! repo ptu/branch [c1] files)
           {:keys [result findings]} (pltu/pull! inst s)]
       (is (= :invalid result))
       (is (= [:unreadable] (map :type findings)))
       (is (= c1 (instance/base inst)))))))

(deftest pull-refuses-an-identity-outside-the-library-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample :outside #{new-snippet-id})
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                     (ptu/renamed ptu/orders-id "Changed")
                                                                     (assoc new-snippet-id (new-snippet nil))))
           result    (pltu/pull! inst s)]
       (testing "the head holds an identity of an item outside the Library: the apply refuses it and writes nothing"
         (is (= {:result  :refused
                 :head    h
                 :refused [{:id new-snippet-id :reason :outside-library
                            :message "An item outside the Library has this identity."}]}
                result))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

(deftest semantic-findings-are-reported-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           _         (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "x"))
           {:keys [result semantic]} (pltu/pull! inst s {:env {:databases {}}})]
       (is (= :pulled result))
       (is (seq semantic))))))

;;; ------------------------------------------------------ The trash ---------------------------------------------------

(deftest removed-item-in-use-goes-to-the-trash-and-comes-back-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample :uses {"OutsideQuestion000001" #{ptu/orders-id}})
           h1        (pltu/commit-snapshot! repo ptu/branch [c1] (dissoc ptu/sample ptu/orders-id))]
       (testing "the head removes a metric that a question outside the Library uses: it goes to the trash, and the
                pull reports it with its user"
         (is (= {ptu/orders-id ["OutsideQuestion000001"]} (:trashed-in-use (pltu/pull! inst s))))
         (is (not (contains? (pltu/snapshot-of inst) ptu/orders-id)))
         (is (contains? (:trash @(:state inst)) ptu/orders-id)))
       (testing "a later head that holds the item again restores it"
         (pltu/commit-snapshot! repo ptu/branch [h1] ptu/sample)
         (is (= :pulled (:result (pltu/pull! inst s))))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (not (contains? (:trash @(:state inst)) ptu/orders-id))))))))

(deftest collection-removed-with-its-contents-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           _         (pltu/commit-snapshot! repo ptu/branch [c1] (dissoc ptu/sample ptu/metrics-id ptu/revenue-id ptu/orders-id))
           {:keys [result steps]} (pltu/pull! inst s)]
       (testing "the head removes a collection and the metrics in it: all go to the trash, the metrics first"
         (is (= :pulled result))
         (is (= [ptu/orders-id ptu/revenue-id ptu/metrics-id] (map :id steps)))
         (is (= #{ptu/library-id ptu/snippet-id} (set (keys (pltu/snapshot-of inst))))))))))

;;; ---------------------------------------------------- Properties ----------------------------------------------------

(defspec pull-lands-the-head-property-test 25
  (prop/for-all [[s1 s2] (gen/tuple ptu/pushable-snapshot-gen ptu/pushable-snapshot-gen)]
    (enabled
     (with-remote [repo s]
       (let [[inst c1] (pushed-instance! s s1)
             h         (pltu/commit-snapshot! repo ptu/branch (if c1 [c1] []) s2)
             {:keys [result]} (pltu/pull! inst s)]
         ;; with no local change, the instance takes the head: get(A) = S after an apply of S
         (and (= :pulled result)
              (= s2 (pltu/snapshot-of inst))
              (= h (instance/base inst))
              (= none (ptu/local-changes inst))))))))
