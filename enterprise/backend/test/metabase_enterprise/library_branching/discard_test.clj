(ns metabase-enterprise.library-branching.discard-test
  "The discard of the local changes, against a remote on disk and an instance in memory."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.discard :as discard]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.store.jgit :as store.jgit]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

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

(def ^:private local-id "LocalSnippet000000001")

(defn- with-local-changes
  "Snapshot `s` with an update, a delete and a create."
  [s]
  (-> s
      (ptu/renamed ptu/revenue-id "Local")
      (dissoc ptu/orders-id)
      (assoc local-id (ptu/item local-id :snippet "Local" "snippetssnippetssnipp" {:content "local = true"}))))

(defn- discard!
  ([inst s] (discard/discard! inst s ptu/branch))
  ([inst s opts] (discard/discard! inst s ptu/branch opts)))

(deftest discard-writes-the-base-over-the-local-changes-test
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample :uses {"OutsideQuestion000001" #{local-id}})]
       (pltu/save! inst with-local-changes)
       (let [{:keys [result base discarded trashed-in-use]} (discard! inst s)]
         (testing "an update, a delete and a create are discarded"
           (is (= :discarded result))
           (is (= c1 base))
           (is (= [local-id ptu/orders-id ptu/revenue-id] discarded))
           (is (= ptu/sample (pltu/snapshot-of inst))))
         (testing "the local create goes to the trash, and the result names its user outside the Library"
           (is (contains? (:trash @(:state inst)) local-id))
           (is (= {local-id ["OutsideQuestion000001"]} trashed-in-use)))
         (testing "the base stays, with the digests of its content, and every item shows as synced"
           (is (= c1 (instance/base inst)))
           (is (= (writer/item-digests kinds/codecs ptu/sample) (instance/base-digests inst c1)))
           (is (= none (ptu/local-changes inst)))))
       (testing "a second discard has nothing to do"
         (is (= {:result :up-to-date :base c1} (discard! inst s))))))))

(deftest discard-with-a-moved-branch-test
  (enabled
   (with-remote [repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)]
       (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/orders-id "Remote"))
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "a branch that moved past the base still holds it: the discard writes the base, not the head"
         (is (=? {:result :discarded :base c1 :discarded [ptu/revenue-id]} (discard! inst s)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

(deftest discard-refusals-test
  (enabled
   (testing "an instance with no base has nothing to go back to"
     (with-remote [_repo s]
       (let [inst (pltu/memory-instance (atom {:snapshot ptu/sample}))]
         (is (= {:result :no-base} (discard! inst s)))
         (is (= ptu/sample (pltu/snapshot-of inst))))))
   (testing "a base that no branch holds is lost, and the discard writes nothing, also through a new store that
            never fetched the base"
     (with-remote [repo s]
       (let [[inst c1] (pushed-instance! s ptu/sample)]
         (pltu/commit-snapshot! repo ptu/branch [] (ptu/renamed ptu/sample ptu/orders-id "Rewritten"))
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
         (is (= {:result :base-lost :base c1} (discard! inst s)))
         (let [fresh (store.jgit/open-store (str "file://" (.getAbsolutePath (.getDirectory repo))))]
           (try
             (is (= {:result :base-lost :base c1} (discard! inst fresh)))
             (finally
               (store/close fresh))))
         (is (= "Local" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name]))))))
   (testing "a rewrite of the branch during the discard loses the base, and the discard writes nothing"
     (with-remote [repo s]
       (let [[inst c1] (pushed-instance! s ptu/sample)
             racing    (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                                 (let [read (read-snapshot)]
                                                                   (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
                                                                   read))})]
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
         (is (= {:result :base-lost :base c1} (discard! racing s)))
         (is (= "Local" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name]))))))
   (testing "a task that may not commit writes nothing"
     (with-remote [_repo s]
       (let [[inst c1] (pushed-instance! s ptu/sample)]
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
         (is (= {:result :fenced :base c1 :reason {:fenced "cancelled"}}
                (discard! inst s {:fence (constantly {:fenced "cancelled"})})))
         (is (= "Local" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))))))
  (testing "library branching is off"
    (mt/with-temporary-setting-values [library-branching-enabled false]
      (with-remote [_repo s]
        (is (= {:result :disabled} (discard! (pltu/memory-instance (atom {:snapshot {}})) s)))))))

(deftest discard-starts-again-after-a-save-test
  (enabled
   (with-remote [_repo s]
     (let [[inst c1] (pushed-instance! s ptu/sample)
           reads     (atom 0)
           racing    (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                               (let [read (read-snapshot)]
                                                                 ;; a save after the first read, before the apply
                                                                 (when (= 1 (swap! reads inc))
                                                                   (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Again")))
                                                                 read))})]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
       (testing "a save between the read and the apply makes the first apply stale; the discard reads again and
                writes the base over the new save too"
         (is (=? {:result :discarded :base c1 :discarded [ptu/revenue-id]} (discard! racing s)))
         (is (= 2 @reads))
         (is (= ptu/sample (pltu/snapshot-of inst))))
       (testing "a save after every read gives a stale result after the retries"
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Local"))
         (let [always (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                                (let [read (read-snapshot)]
                                                                  (pltu/save! inst #(ptu/renamed % ptu/revenue-id
                                                                                                 (str (gensym "save"))))
                                                                  read))})]
           (is (= {:result :stale :base c1 :ids [ptu/revenue-id]} (discard! always s {:retries 2})))))))))
