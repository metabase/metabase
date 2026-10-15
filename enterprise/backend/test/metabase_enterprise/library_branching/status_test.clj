(ns metabase-enterprise.library-branching.status-test
  "The status, the change lists, the remote changes with their cache, and the push preview, against a remote on disk
  and an instance in memory."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.status :as status]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures])
  (:import
   (org.eclipse.jgit.lib Repository)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(def ^:private none status/no-changes)

(defn- pushed-instance!
  "A memory instance that pushed `s` to the branch of store `st`, and the commit of the push."
  [st s]
  (let [inst (pltu/memory-instance (atom {:snapshot s}))
        c    (:commit (pltu/push! inst st))]
    [inst c]))

(defn- with-store-of
  "A `with-store` function that calls `f` with `st`, and counts its calls in the atom `calls`."
  [st calls]
  (fn [f]
    (swap! calls inc)
    (f st)))

(defrecord ^:private CountingStore [s calls]
  store/Store
  (head [_ r] (swap! calls conj :head) (store/head s r))
  (branches [_] (swap! calls conj :branches) (store/branches s))
  (default-branch [_] (store/default-branch s))
  (read-tree [_ c] (swap! calls conj :read-tree) (store/read-tree s c))
  (changed-paths [_ a b] (swap! calls conj :changed-paths) (store/changed-paths s a b))
  (write-commit [_ ps t m] (store/write-commit s ps t m))
  (cas-ref! [_ r e n] (store/cas-ref! s r e n))
  (ancestor? [_ a b] (store/ancestor? s a b))
  (merge-base [_ a b] (store/merge-base s a b))
  (close [_] (store/close s)))

(defn- counting
  "`st` that records in the atom `calls` the name of each read of the remote or of a tree."
  [st calls]
  (->CountingStore st calls))

(defn- fresh-store
  "A new JGit store on the remote `repo`: its local object store holds only what a fetch brings."
  [^Repository repo]
  (store.jgit/open-store (str "file://" (.getAbsolutePath (.getDirectory repo)))))

;;; ------------------------------------------------------ Items -------------------------------------------------------

(def ^:private reports-id "ReportsCollection0001")
(def ^:private nested-id "NestedCollection00001")
(def ^:private nested-metric-id "NestedMetric000000001")
(def ^:private added-id "AddedSnippet000000001")

(def ^:private nested
  "The sample, with a second collection of the Library that holds a nested collection with a metric."
  (assoc ptu/sample
         reports-id       (ptu/item reports-id :collection "Reports" ptu/library-id {:type "library-metrics"})
         nested-id        (ptu/item nested-id :collection "Nested" reports-id {:type "library-metrics"})
         nested-metric-id (ptu/item nested-metric-id :metric "Nested revenue" nested-id
                                    {:display "scalar" :query (ptu/count-query ptu/orders-table)})))

(def ^:private remote-metric-id "RemoteMetric000000001")

(def ^:private sections
  "The Library and its three sections, with their fixed identities."
  {"librarylibrarylibrary" (ptu/item "librarylibrarylibrary" :collection "Library" nil {:type "library"})
   "librarylibrarydatadat" (ptu/item "librarylibrarydatadat" :collection "Data" "librarylibrarylibrary"
                                     {:type "library-data"})
   "librarylibrarymetrics" (ptu/item "librarylibrarymetrics" :collection "Metrics" "librarylibrarylibrary"
                                     {:type "library-metrics"})
   "librarylibrarydashbrd" (ptu/item "librarylibrarydashbrd" :collection "Dashboards" "librarylibrarylibrary"
                                     {:type "library-dashboards"})})

(defn- described
  [s id text]
  (assoc-in s [id :attrs :description] text))

;;; -------------------------------------------------- Local changes ---------------------------------------------------

(deftest no-local-change-test
  ;; Scenarios M6-076 and M6-016 (changed): the instance computes the difference; no ledger row exists.
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s nested)
           calls     (atom 0)
           result    (status/local-changes inst (with-store-of s calls) ptu/branch {})]
       (testing "in-scope content equal to the base has no local change, and an empty change list"
         (is (= {:base c1 :local nested :changes none :shadowed-tables []} result))
         (is (false? (status/changed? (:changes result))))
         (is (= [] (status/change-list (:changes result) (:local result) nil))))
       (testing "the digests of the base are enough: no store is opened"
         (is (= 0 @calls)))))))

(deftest local-change-list-test
  ;; Scenarios M6-077, M6-078, M6-017 and M6-018 (changed): the change type comes from the difference.
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s nested)
           calls     (atom 0)]
       (pltu/save! inst #(-> %
                             (ptu/renamed ptu/revenue-id "Revenue, net")
                             (described nested-metric-id "In a nested collection.")
                             (dissoc ptu/orders-id)
                             (assoc added-id (ptu/item added-id :snippet "Added" ptu/snippets-root {:content "x"}))))
       (let [{:keys [base local changes]} (status/local-changes inst (with-store-of s calls) ptu/branch {})]
         (testing "an update, a nested update, a delete and a create"
           (is (= c1 base))
           (is (status/changed? changes))
           (is (= {:created #{added-id} :deleted #{ptu/orders-id} :updated #{ptu/revenue-id nested-metric-id}}
                  changes)))
         (testing "each entry has the identity, the kind, the name and the change type; a deleted item has its name
                  in the base"
           (is (= [{:id added-id :kind :snippet :name "Added" :change :created}
                   {:id nested-metric-id :kind :metric :name "Nested revenue" :change :updated}
                   {:id ptu/orders-id :kind :metric :name "Orders" :change :deleted}
                   {:id ptu/revenue-id :kind :metric :name "Revenue, net" :change :updated}]
                  (status/change-list changes local (status/base-snapshot s ptu/branch base {})))))
         (testing "with no base snapshot, a deleted item has no kind and no name"
           (is (= {:id ptu/orders-id :kind nil :name nil :change :deleted}
                  (some #(when (= :deleted (:change %)) %) (status/change-list changes local nil))))))))))

(deftest a-change-and-its-revert-are-no-local-change-test
  (enabled
   (with-remote [_repo s]
     (let [[inst _c1] (pushed-instance! s ptu/sample)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Changed"))
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Revenue"))
       (is (= none (:changes (status/local-changes inst (with-store-of s (atom 0)) ptu/branch {}))))))))

(deftest local-changes-with-no-base-test
  (enabled
   (with-remote [_repo s]
     (let [inst  (pltu/memory-instance (atom {:snapshot ptu/sample}))
           calls (atom 0)]
       (testing "with no base, every item is created, and no store is opened"
         (is (= {:base nil :local ptu/sample :changes (assoc none :created (set (keys ptu/sample))) :shadowed-tables []}
                (status/local-changes inst (with-store-of s calls) ptu/branch {})))
         (is (= 0 @calls)))))))

(deftest local-changes-with-no-stored-digests-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           calls     (atom 0)]
       (swap! (:state inst) assoc :digests nil)
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Changed"))
       (testing "with no digests stored, the content of the base comes from its tree, through a new store"
         (let [fresh (fresh-store repo)]
           (try
             (is (= (assoc none :updated #{ptu/revenue-id})
                    (:changes (status/local-changes inst (with-store-of fresh calls) ptu/branch {}))))
             (is (= 1 @calls))
             (finally
               (store/close fresh)))))
       (testing "with no digests and a base that no branch holds, the content of the base is not known"
         (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
         (let [fresh (fresh-store repo)]
           (try
             (is (= 400 (try
                          (status/local-changes inst (with-store-of fresh calls) ptu/branch {})
                          nil
                          (catch clojure.lang.ExceptionInfo e
                            (:status-code (ex-data e))))))
             (is (nil? (status/base-snapshot fresh ptu/branch c1 {})))
             (finally
               (store/close fresh)))))))))

;;; -------------------------------------------------- Remote changes --------------------------------------------------

(defn- both
  "The remote changes from `b` to `h` by [[status/remote-changes]] and by [[status/full-remote-changes]], with the
  digests of `base` as the content of the base."
  [st b h base]
  (let [opts {:base-digests (some->> base (writer/item-digests kinds/codecs))}]
    [(status/remote-changes st b h opts) (status/full-remote-changes st b h opts)]))

(deftest head-at-the-base-has-no-remote-change-test
  ;; Scenario M6-025.
  (enabled
   (with-remote [_repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           calls     (atom [])]
       (testing "the head is the base: no change, with no read of the store"
         (is (= {:changes none} (status/remote-changes (counting s calls) c1 c1 {})))
         (is (= [] @calls)))))))

(deftest new-commit-with-equal-content-has-no-remote-change-test
  ;; Scenario M6-024 (changed): remote changes are a difference of content, not of commit ids.
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] ptu/sample {"README.md" (ptu/utf8 "# Notes")})]
       (store/head s ptu/branch)
       (is (not= c1 h))
       (is (= [{:changes none} {:changes none}] (both s c1 h ptu/sample)))))))

(deftest moved-file-is-no-remote-change-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           files     (writer/encode-tree kinds/codecs ptu/sample)
           path      (some #(when (str/includes? % "revenue.metric.yaml") %) (keys files))
           h         (pltu/commit-on! repo ptu/branch [c1] (-> files
                                                               (dissoc path)
                                                               (assoc "elsewhere/any-name.yaml" (get files path))))
           calls     (atom [])]
       (store/head s ptu/branch)
       (testing "a file moved in git decodes to the same item at both commits"
         (is (= [{:changes none} {:changes none}] (both (counting s calls) c1 h ptu/sample))))
       (testing "the store compared the two commits by their changed paths"
         (is (some #{:changed-paths} @calls)))))))

(deftest remote-changes-of-content-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           remote    (-> ptu/sample
                         (ptu/renamed ptu/revenue-id "Revenue, net")
                         (dissoc ptu/orders-id)
                         (assoc added-id (ptu/item added-id :snippet "Added" ptu/snippets-root {:content "x"})))
           h         (pltu/commit-snapshot! repo ptu/branch [c1] remote {"notes/plan.txt" (ptu/utf8 "plan")})]
       (store/head s ptu/branch)
       (testing "an update, a delete and a create; a foreign file is no change"
         (is (= (repeat 2 {:changes {:created #{added-id} :deleted #{ptu/orders-id} :updated #{ptu/revenue-id}}})
                (both s c1 h ptu/sample))))))))

(deftest remote-changes-with-no-base-test
  ;; Scenario M6-023 (changed): with no base, every remote item is a remote change.
  (enabled
   (with-remote [repo s]
     (let [h (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
       (store/head s ptu/branch)
       (is (= (repeat 2 {:changes (assoc none :created (set (keys ptu/sample)))})
              (both s nil h nil)))))))

(deftest remote-change-of-a-section-file-test
  (enabled
   (with-remote [repo s]
     (let [local     (assoc sections ptu/revenue-id (ptu/item ptu/revenue-id :metric "Revenue" "librarylibrarymetrics"
                                                              {:display "scalar" :query (ptu/count-query ptu/orders-table)}))
           [_inst c1] (pushed-instance! s local)
           files     (writer/encode-tree kinds/codecs local)]
       (testing "a head with no file of a section decodes with the section at its release content: no change"
         (let [h (pltu/commit-on! repo ptu/branch [c1] (dissoc files "library/dashboards/_collection.yaml"))]
           (store/head s ptu/branch)
           (is (= [{:changes none} {:changes none}] (both s c1 h local)))))
       (testing "a head with no file of the Library: the Library is deleted"
         (let [h (pltu/commit-on! repo ptu/branch [c1] (dissoc files "library/_collection.yaml"))]
           (store/head s ptu/branch)
           (is (= (repeat 2 {:changes (assoc none :deleted #{"librarylibrarylibrary"})})
                  (both s c1 h local)))))))))

(deftest new-file-with-an-item-of-the-base-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           copy      (writer/write-yaml (codec/encode format.metric/codec ptu/revenue-id
                                                      (get (ptu/renamed ptu/sample ptu/revenue-id "Copy")
                                                           ptu/revenue-id)))
           h         (pltu/commit-on! repo ptu/branch [c1] (assoc (writer/encode-tree kinds/codecs ptu/sample)
                                                                  "copy.yaml" copy))]
       (store/head s ptu/branch)
       (testing "a new file that holds an item of an unchanged file: the head does not decode, on both paths"
         (let [[fast full] (both s c1 h ptu/sample)]
           (is (= fast full))
           (is (= [:duplicate-identity] (map :type (:findings fast))))))))))

(deftest remote-changes-with-a-head-that-does-not-decode-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-on! repo ptu/branch [c1]
                                      (assoc (writer/encode-tree kinds/codecs ptu/sample)
                                             "library/broken.metric.yaml"
                                             (ptu/utf8 "kind: metric\nid: BrokenMetric000000001\n")))]
       (store/head s ptu/branch)
       (let [[fast full] (both s c1 h ptu/sample)]
         (is (= fast full))
         (is (= [:invalid] (map :type (:findings fast)))))))))

(deftest remote-changes-with-a-base-that-is-not-known-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           h          (pltu/commit-snapshot! repo ptu/branch [] (ptu/renamed ptu/sample ptu/revenue-id "Rewritten"))
           fresh      (fresh-store repo)]
       (try
         (store/head fresh ptu/branch)
         (testing "a base that no branch holds: the stored digests are its content"
           (is (= (repeat 2 {:changes (assoc none :updated #{ptu/revenue-id})})
                  (both fresh c1 h ptu/sample))))
         (testing "a base that no branch holds, and no digests: the content of the base is not known"
           (is (= {:unknown :base} (status/remote-changes fresh c1 h {})))
           (is (= {:unknown :base} (status/full-remote-changes fresh c1 h {}))))
         (finally
           (store/close fresh)))))))

;;; --------------------------------------------------- Held bases -----------------------------------------------------

(deftest base-held-test
  (enabled
   (with-remote [repo s]
     (let [[_inst c1] (pushed-instance! s ptu/sample)
           h1        (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Later"))]
       (testing "the head and an ancestor of the head are held"
         (is (true? (pull/held? s h1 ptu/branch (store/head s ptu/branch))))
         (is (true? (pull/held? s c1 ptu/branch (store/head s ptu/branch)))))
       (testing "a base that only another branch holds is held: a switch of branch"
         (pltu/commit-snapshot! repo "dev" [c1] ptu/sample)
         (let [h (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
           (is (= h (store/head s ptu/branch)))
           (is (true? (pull/held? s c1 ptu/branch h)))))
       (testing "after a force push of every branch that held it, the base is lost, also in a new store"
         (pltu/reset-branch! repo "dev" (store/head s ptu/branch))
         (is (false? (pull/held? s c1 ptu/branch (store/head s ptu/branch))))
         (let [fresh (fresh-store repo)]
           (try
             (is (false? (pull/held? fresh c1 ptu/branch (store/head fresh ptu/branch))))
             (finally
               (store/close fresh)))))))))

;;; ------------------------------------------------------ Status ------------------------------------------------------

(deftest status-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (testing "the head is the base, with no change"
         (is (= {:base c1 :head c1 :branch-missing false :base-lost false :head-findings nil :local none :remote none
                 :shadowed-tables []}
                (status/status inst s ptu/branch {}))))
       (testing "a local and a remote change"
         (let [h (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/orders-id "Remote"))]
           (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
           (is (= {:base c1 :head h :branch-missing false :base-lost false :head-findings nil
                   :local (assoc none :updated #{ptu/revenue-id}) :remote (assoc none :updated #{ptu/orders-id})
                   :shadowed-tables []}
                  (status/status inst s ptu/branch {})))))
       (testing "a head that breaks a structural rule has findings and no remote changes"
         (let [stray "StrayCollection000001"
               h     (pltu/commit-snapshot! repo ptu/branch [c1]
                                            (assoc ptu/sample stray (ptu/item stray :collection "Stray" nil {})))]
           (is (=? {:head h :head-findings [{:rule :root :id stray}] :remote nil}
                   (status/status inst s ptu/branch {})))))
       (testing "a force push removed the base from every branch: the base is lost"
         (let [h (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
           (is (=? {:base c1 :head h :base-lost true :remote none} (status/status inst s ptu/branch {})))))
       (testing "a branch that does not exist"
         (is (=? {:base c1 :head nil :branch-missing true :base-lost true :head-findings nil :remote nil
                  :local (assoc none :updated #{ptu/revenue-id})}
                 (status/status inst s "gone" {}))))))))

;;; --------------------------------------------------- Push preview ---------------------------------------------------

(def ^:private zero {:added 0 :updated 0 :removed 0})

(deftest push-preview-not-diverged-test
  ;; Scenario M8-065.
  (enabled
   (with-remote [_repo s]
     (let [[inst c1]  (pushed-instance! s ptu/sample)
           reads      (atom 0)
           counted    (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot] (swap! reads inc) (read-snapshot))})]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "the head is the base: no change, clean, no conflict, and no read of the instance"
         (is (= {:head c1 :diverged false :clean true :conflicts [] :violations [] :summary zero :branch-missing false
                 :base-lost false :head-findings nil}
                (status/push-preview counted s ptu/branch {})))
         (is (= 0 @reads)))))))

(deftest push-preview-clean-test
  ;; Scenario M8-066.
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                     (ptu/renamed ptu/orders-id "Remote")
                                                                     (dissoc ptu/snippet-id)
                                                                     (assoc added-id (ptu/item added-id :snippet "Added"
                                                                                               ptu/snippets-root {:content "x"}))))]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "a moved head with changes that do not conflict: diverged, clean, with a summary of what the merge
                takes from the head"
         (is (= {:head h :diverged true :clean true :conflicts [] :violations [] :summary {:added 1 :updated 1 :removed 1}
                 :branch-missing false :base-lost false :head-findings nil}
                (status/push-preview inst s ptu/branch {}))))))))

(deftest push-preview-conflict-test
  ;; Scenario M8-067.
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           h         (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                     (ptu/renamed ptu/revenue-id "Remote")
                                                                     (ptu/renamed ptu/orders-id "Remote orders")))]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "both sides changed one item: diverged, not clean, the conflict named with the change of each side"
         (is (= {:head h :diverged true :clean false
                 :conflicts [{:id ptu/revenue-id :kind :metric :name "Local" :ours :updated :theirs :updated}]
                 :violations [] :summary {:added 0 :updated 1 :removed 0} :branch-missing false :base-lost false
                 :head-findings nil}
                (status/push-preview inst s ptu/branch {}))))))))

(deftest push-preview-with-violations-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s nested)]
       (pltu/commit-snapshot! repo ptu/branch [c1] (assoc nested remote-metric-id
                                                          (ptu/item remote-metric-id :metric "Remote" nested-id
                                                                    {:display "scalar"
                                                                     :query   (ptu/count-query ptu/orders-table)})))
       (pltu/save! inst #(dissoc % nested-id nested-metric-id))
       (testing "the head adds a metric to a collection that the instance deleted: no conflict, and a violation that
                names the pair"
         (is (=? {:diverged true :clean false :conflicts []
                  :violations [{:rule :place-inside :ours nested-id :theirs remote-metric-id}]}
                 (status/push-preview inst s ptu/branch {}))))))))

(deftest push-preview-nothing-in-scope-test
  ;; Scenario M8-068 (changed): an instance with nothing in scope reads an empty snapshot; the merge takes every item
  ;; of the head.
  (enabled
   (with-remote [repo s]
     (let [inst (pltu/memory-instance (atom {:snapshot {}}))
           h    (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
       (is (= {:head h :diverged true :clean true :conflicts [] :violations [] :summary {:added 5 :updated 0 :removed 0}
               :branch-missing false :base-lost false :head-findings nil}
              (status/push-preview inst s ptu/branch {})))))))

(deftest push-preview-with-no-base-test
  ;; Scenario M8-018 (changed).
  (enabled
   (with-remote [repo s]
     (let [inst (pltu/memory-instance (atom {:snapshot ptu/sample}))]
       (testing "no base and no branch: a push creates the branch, so nothing diverged"
         (is (=? {:head nil :diverged false :clean true :conflicts [] :branch-missing true}
                 (status/push-preview inst s ptu/branch {}))))
       (testing "no base, and someone created the branch with other items: diverged, clean, no conflict"
         (pltu/commit-snapshot! repo ptu/branch []
                                {added-id (ptu/item added-id :snippet "Added" "snippetssnippetssnipp" {:content "x"})})
         (is (=? {:diverged true :clean true :conflicts [] :summary {:added 1 :updated 0 :removed 0}}
                 (status/push-preview inst s ptu/branch {}))))))))

(deftest push-preview-with-a-lost-base-test
  (enabled
   (with-remote [repo s]
     (let [[inst _c1] (pushed-instance! s ptu/sample)]
       (pltu/commit-snapshot! repo ptu/branch [] (ptu/renamed ptu/sample ptu/orders-id "Rewritten"))
       (testing "a base that no branch holds: every difference of the two sides is a conflict"
         (is (=? {:diverged true :clean false :base-lost true
                  :conflicts [{:id ptu/orders-id :name "Orders" :ours :present :theirs :present}]}
                 (status/push-preview inst s ptu/branch {}))))))))

(deftest push-preview-with-a-head-that-does-not-decode-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (pltu/commit-on! repo ptu/branch [c1] (assoc (writer/encode-tree kinds/codecs ptu/sample)
                                                    "library/broken.metric.yaml"
                                                    (ptu/utf8 "kind: metric\nid: BrokenMetric000000001\n")))
       (is (=? {:diverged true :clean false :conflicts [] :head-findings [{:type :invalid}]}
               (status/push-preview inst s ptu/branch {})))))))

;;; ------------------------------------------------ Has remote changes ------------------------------------------------

(deftest check-remote-changes-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (testing "the head is the base"
         (is (= {:has-changes false :remote-version c1 :local-version c1 :branch-missing false}
                (status/check-remote-changes inst s ptu/branch {}))))
       (testing "a new commit with equal content"
         (let [h (pltu/commit-snapshot! repo ptu/branch [c1] ptu/sample {"README.md" (ptu/utf8 "x")})]
           (is (= {:has-changes false :remote-version h :local-version c1 :branch-missing false}
                  (status/check-remote-changes inst s ptu/branch {})))))
       (testing "a remote change"
         (let [h (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/orders-id "Remote"))]
           (is (= {:has-changes true :remote-version h :local-version c1 :branch-missing false}
                  (status/check-remote-changes inst s ptu/branch {})))))
       (testing "a head that does not decode has changes"
         (let [h (pltu/commit-on! repo ptu/branch [c1] {"library/x.metric.yaml" (ptu/utf8 "kind: metric\nid: x\n")})]
           (is (= {:has-changes true :remote-version h :local-version c1 :branch-missing false}
                  (status/check-remote-changes inst s ptu/branch {})))))
       (testing "scenario M6-029: a branch deleted upstream gives no changes, the base, and no head"
         (is (= {:has-changes false :remote-version nil :local-version c1 :branch-missing true}
                (status/check-remote-changes inst s "gone" {}))))))))

(deftest cached-answer-test
  (let [entry {:key [:k] :at 1000 :answer {:has-changes true}}]
    (testing "an answer of the same key younger than the time to live"
      (is (= {:has-changes true} (status/cached-answer entry [:k] 1000 60000)))
      (is (= {:has-changes true} (status/cached-answer entry [:k] 60999 60000))))
    (testing "no answer for another key, an old entry, or no entry"
      (is (nil? (status/cached-answer entry [:other] 1000 60000)))
      (is (nil? (status/cached-answer entry [:k] 61000 60000)))
      (is (nil? (status/cached-answer nil [:k] 1000 60000))))))

(defn- has-remote-changes!
  [inst with-store opts]
  (status/has-remote-changes! inst with-store (merge {:url (str (random-uuid)) :branch ptu/branch :ttl-seconds 60}
                                                     opts)))

(deftest has-remote-changes-cache-test
  ;; Scenarios M6-026, M6-027 and M6-028 (changed): the cache is keyed by the URL, the branch and the base.
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           calls     (atom 0)
           with      (with-store-of s calls)
           url       "file:///cache-test"
           opts      {:url url :now-ms 0}]
       (testing "the first answer reads the remote; the second is cached"
         (is (= {:has-changes false :remote-version c1 :local-version c1 :branch-missing false :cached false}
                (has-remote-changes! inst with opts)))
         (is (= 1 @calls))
         (is (= {:has-changes false :remote-version c1 :local-version c1 :branch-missing false :cached true}
                (has-remote-changes! inst with (assoc opts :now-ms 59999))))
         (is (= 1 @calls)))
       (testing "an answer older than the time to live reads the remote again"
         (is (false? (:cached (has-remote-changes! inst with (assoc opts :now-ms 60000)))))
         (is (= 2 @calls)))
       (testing "a force refresh reads the remote again"
         (is (false? (:cached (has-remote-changes! inst with (assoc opts :now-ms 60001 :force-refresh? true)))))
         (is (= 3 @calls)))
       (testing "another branch reads the remote again"
         (pltu/commit-snapshot! repo "dev" [c1] ptu/sample)
         (is (false? (:cached (has-remote-changes! inst with (assoc opts :now-ms 60002 :branch "dev")))))
         (is (= 4 @calls)))
       (testing "a push that moves the base reads the remote again"
         (is (false? (:cached (has-remote-changes! inst with (assoc opts :now-ms 60003)))))
         (is (true? (:cached (has-remote-changes! inst with (assoc opts :now-ms 60004)))))
         (is (= 5 @calls))
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Pushed"))
         (let [c2 (:commit (pltu/push! inst s))]
           (is (= {:has-changes false :remote-version c2 :local-version c2 :branch-missing false :cached false}
                  (has-remote-changes! inst with (assoc opts :now-ms 60005))))
           (is (= 6 @calls))))))))

(deftest has-remote-changes-of-a-missing-branch-is-not-cached-test
  ;; Scenario M6-030.
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           calls     (atom 0)
           with      (with-store-of s calls)
           opts      {:url "file:///missing-test" :branch "gone" :now-ms 0}]
       (is (= {:has-changes false :remote-version nil :local-version c1 :branch-missing true :cached false}
              (has-remote-changes! inst with opts)))
       (testing "the branch exists again: the next answer reads the remote"
         (pltu/commit-snapshot! repo "gone" [c1] (ptu/renamed ptu/sample ptu/revenue-id "Back"))
         (is (=? {:has-changes true :branch-missing false :cached false} (has-remote-changes! inst with opts)))
         (is (= 2 @calls)))))))

(deftest has-remote-changes-propagates-other-errors-test
  ;; Scenario M6-031.
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           fails     (fn [_f] (throw (ex-info "Git fetch of x failed: boom" {:operation "fetch"})))
           calls     (atom 0)
           opts      {:url "file:///error-test" :now-ms 0}]
       (testing "a failure of the store that is not a missing branch propagates"
         (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom" (has-remote-changes! inst fails opts))))
       (testing "the failure is not cached: the next call reads the remote"
         (is (= {:has-changes false :remote-version c1 :local-version c1 :branch-missing false :cached false}
                (has-remote-changes! inst (with-store-of s calls) opts)))
         (is (= 1 @calls)))))))
