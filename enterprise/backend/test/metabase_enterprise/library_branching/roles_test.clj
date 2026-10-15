(ns metabase-enterprise.library-branching.roles-test
  "Drift on a consumption instance, against a remote on disk and an instance in memory: the admin's \"discard the
  changes\", the drift of an instance before a deploy, the drift in the status, and the role switch rule. The scenarios
  of the formal model are here: a deploy never writes over drift (drift-overwrite, ProdNoLostDrift), and with the
  admin's choice production still converges on its branch (drift, ProdConverges)."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.kinds.metric :as format.metric]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.status :as status]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(defn- env-of
  "The environment that holds every environment object that snapshot `s` refers to."
  [s]
  (into {}
        (for [[_ {:keys [refs]}] s
              [_ [tag k]]        refs
              :when              (= :env tag)]
          [k {:object :table}])))

(defn- deploy!
  ([inst s] (deploy! inst s {}))
  ([inst s opts] (deploy/deploy! inst s ptu/branch (:env opts (env-of ptu/sample)) (dissoc opts :env))))

(defn- discard!
  ([inst s] (discard! inst s {}))
  ([inst s opts] (deploy! inst s (assoc opts :discard-drift? true))))

(defn- deployed-instance!
  "A memory instance that deployed the head of the branch of store `s`, and the head."
  [s]
  (let [inst (pltu/memory-instance (atom {:snapshot {}}))
        {:keys [result head]} (deploy! inst s)]
    (assert (= :deployed result) result)
    [inst head]))

(defn- described
  [s id text]
  (assoc-in s [id :attrs :description] text))

(def ^:private other-id "OtherSnippet000000001")

(defn- other-snippet []
  (ptu/item other-id :snippet "Other" nil {:content "other = true"}))

;;; ------------------------------------------------ Discard the changes -----------------------------------------------

(deftest discard-takes-the-head-for-every-changed-item-test
  ;; Scenario M9-012 (changed): the admin's choice discards the drift and deploys the head.
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           remote   (ptu/renamed ptu/sample ptu/revenue-id "Theirs")
           h        (pltu/commit-snapshot! repo ptu/branch [c1] remote)]
       (pltu/save! inst #(-> %
                             (described ptu/snippet-id "Drift")
                             (assoc other-id (other-snippet))
                             (dissoc ptu/orders-id)))
       (testing "with no choice of the admin, the deploy stops on the drift"
         (is (= :drift (:result (deploy! inst s))))
         (is (= c1 (instance/base inst))))
       (testing "the admin discards the changes: the instance shows the head, and the base is the head"
         (let [{:keys [result head discarded]} (discard! inst s)]
           (is (= :deployed result))
           (is (= h head))
           (is (= #{ptu/snippet-id other-id ptu/orders-id} (set discarded))))
         (is (= remote (pltu/snapshot-of inst)))
         (is (= h (instance/base inst)))
         (is (= (writer/item-digests kinds/codecs remote) (instance/base-digests inst h))))
       (testing "the created item of the drift goes to the trash"
         (is (contains? (:trash @(:state inst)) other-id)))))))

(deftest discard-with-the-head-at-the-base-restores-the-base-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Script"))
       (testing "the head is the base: a deploy has nothing to do, and the drift stays"
         (is (= {:result :up-to-date :head c1} (deploy! inst s)))
         (is (= "Script" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name]))))
       (testing "the admin discards the changes: the instance goes back to the content of its base commit"
         (is (=? {:result :deployed :head c1 :discarded [ptu/revenue-id]} (discard! inst s)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))
       (testing "with no drift, a discard has nothing to do"
         (is (= {:result :up-to-date :head c1} (discard! inst s))))))))

(deftest discard-with-an-ill-formed-head-keeps-the-drift-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           bad      (dissoc ptu/sample ptu/metrics-id)
           files    (assoc (writer/encode-tree kinds/codecs (dissoc bad ptu/revenue-id ptu/orders-id))
                           "library/revenue.metric.yaml"
                           (writer/write-yaml (codec/encode format.metric/codec ptu/revenue-id
                                                            (get bad ptu/revenue-id))))]
       (pltu/commit-on! repo ptu/branch [c1] files)
       (pltu/save! inst #(described % ptu/snippet-id "Drift"))
       (testing "the head breaks a structural rule: the discard refuses with the findings, and writes nothing"
         (is (= :invalid (:result (discard! inst s))))
         (is (= "Drift" (get-in (pltu/snapshot-of inst) [ptu/snippet-id :attrs :description])))
         (is (= c1 (instance/base inst))))))))

(deftest discard-with-no-base-takes-the-head-test
  (enabled
   (with-remote [repo s]
     (let [h     (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           local (-> (select-keys ptu/sample [ptu/library-id])
                     (assoc other-id (other-snippet)))
           inst  (pltu/memory-instance (atom {:snapshot local}))]
       (testing "with no base, a local item that the head does not hold is drift"
         (is (= {:result :drift :head h :ids [other-id]} (deploy! inst s))))
       (testing "the discard deploys the head and trashes the local item"
         (is (=? {:result :deployed :head h :discarded [other-id]} (discard! inst s)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= h (instance/base inst))))))))

;;; ---------------------------------------------- Drift before a deploy -----------------------------------------------

(defn- counting-with-store
  "A `with-store` function on store `s` that counts its calls in the atom `calls`."
  [s calls]
  (fn [f]
    (swap! calls inc)
    (f s)))

(deftest instance-drift-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           calls    (atom 0)]
       (testing "the content has the digests of the base: no drift, and no store is opened"
         (is (= [] (deploy/instance-drift inst (counting-with-store s calls) ptu/branch {})))
         (is (= 0 @calls)))
       (testing "a change since the base is drift, in the order of the identities"
         (pltu/save! inst #(-> % (described ptu/snippet-id "Drift") (ptu/renamed ptu/orders-id "Script")))
         (is (= [ptu/snippet-id ptu/orders-id] (deploy/instance-drift inst (counting-with-store s calls) ptu/branch {}))))
       (testing "a new head does not change the drift, which is against the base"
         (pltu/commit-snapshot! repo ptu/branch [c1] (described ptu/sample ptu/snippet-id "Drift"))
         (is (= [ptu/snippet-id ptu/orders-id] (deploy/instance-drift inst (counting-with-store s calls) ptu/branch {}))))
       (testing "with no base, the drift is against the head of the branch"
         (let [fresh (pltu/memory-instance (atom {:snapshot (-> ptu/sample
                                                                (described ptu/snippet-id "Drift")
                                                                (assoc other-id (other-snippet)))}))]
           (is (= [other-id] (deploy/instance-drift fresh (counting-with-store s calls) ptu/branch {})))
           (testing "and against nothing when the branch does not exist"
             (is (= (sort [ptu/library-id ptu/metrics-id ptu/revenue-id ptu/orders-id ptu/snippet-id other-id])
                    (sort (deploy/instance-drift fresh (counting-with-store s calls) "gone" {})))))))))))

;;; ------------------------------------------------- Drift in the status ----------------------------------------------

(deftest status-of-a-consumption-instance-reports-drift-test
  ;; Scenario M9-006 (changed): a change of synced content on a consumption instance is drift, shown with its list.
  (enabled
   (with-remote [repo s]
     (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
     (let [[inst _] (deployed-instance! s)]
       (testing "no change: no drift"
         (is (= [] (:drift (status/status inst s ptu/branch {:consumption? true})))))
       (testing "an admin script changes an in-scope item: the status lists it as drift"
         (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Script"))
         (is (=? {:local {:updated #{ptu/revenue-id}} :drift [ptu/revenue-id]}
                 (status/status inst s ptu/branch {:consumption? true}))))
       (testing "a creation instance has no drift: its changes are local changes to push"
         (is (not (contains? (status/status inst s ptu/branch {}) :drift))))))))

;;; ---------------------------------------------------- Role switch ---------------------------------------------------

(deftest switches-to-read-only-examples-test
  (let [url   "https://git.example.com/a.git"
        saved {:remote-sync-url url :remote-sync-token nil :remote-sync-type :read-write :remote-sync-branch "main"
               :remote-sync-auto-import false}]
    (doseq [[expected doc body saved env]
            [[true "a creation instance becomes a consumption instance" {:remote-sync-type :read-only} saved #{}]
             [true "with another repository" {:remote-sync-type :read-only :remote-sync-url "https://b.example.com/b.git"}
              saved #{}]
             [false "a consumption instance stays one" {:remote-sync-type :read-only}
              (assoc saved :remote-sync-type :read-only) #{}]
             [false "a consumption instance becomes a creation instance" {:remote-sync-type :read-write}
              (assoc saved :remote-sync-type :read-only) #{}]
             [false "no type in the body" {:remote-sync-branch "main"} saved #{}]
             [false "a type from an environment variable is never written" {:remote-sync-type :read-only} saved
              #{:remote-sync-type}]
             [false "a blank URL turns library branching off" {:remote-sync-type :read-only :remote-sync-url ""}
              saved #{}]]]
      (testing doc
        (is (= expected (repository/switches-to-read-only? body saved env)))))))

;;; ---------------------------------------------------- Properties ----------------------------------------------------

(defspec deploy-never-writes-over-drift-property-test 25
  (prop/for-all [[s1 s2 s3] (gen/tuple ptu/pushable-snapshot-gen ptu/pushable-snapshot-gen ptu/pushable-snapshot-gen)]
    (enabled
     (with-remote [repo s]
       (let [c1   (pltu/commit-snapshot! repo ptu/branch [] s1)
             inst (pltu/memory-instance (atom {:snapshot {}}))
             _    (deploy! inst s {:env (env-of s1)})
             ;; a change outside sync: the synced content becomes s3
             _    (pltu/save! inst (constantly s3))
             h    (pltu/commit-snapshot! repo ptu/branch [c1] s2)
             r    (deploy! inst s {:env (env-of s2)})
             kept (if (= s3 s1)
                    (= :deployed (:result r))
                    ;; ProdNoLostDrift: the deploy writes nothing, and the drift stays
                    (and (= :drift (:result r))
                         (= s3 (pltu/snapshot-of inst))
                         (= c1 (instance/base inst))))
             d    (discard! inst s {:env (env-of s2)})]
         ;; with the admin's choice, production converges on the head (ProdConverges)
         (and kept
              (#{:deployed :up-to-date} (:result d))
              (= s2 (pltu/snapshot-of inst))
              (= h (instance/base inst))))))))
