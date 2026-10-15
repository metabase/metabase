(ns metabase-enterprise.library-branching.deploy-test
  "The deploy on a consumption instance, against a remote on disk and an instance in memory. The scenarios of the
  formal model are here: the deploy validates the head itself (trustci), applies it in full or not at all
  (prodbatched), moves a removed item to the trash and goes on (harddelete, refuse-liveness), restores a re-added
  item (detachout), and never writes over a change that no commit holds (drift-overwrite)."
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
   [metabase-enterprise.library-branching.push :as push]
   [metabase-enterprise.library-branching.push-test-util :as ptu :refer [with-remote]]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defmacro ^:private enabled
  [& body]
  `(mt/with-temporary-setting-values [~'library-branching-enabled true]
     ~@body))

(defn env-of
  "The environment that holds every environment object that snapshot `s` refers to."
  [s]
  (into {}
        (for [[_ {:keys [refs]}] s
              [_ [tag k]]        refs
              :when              (= :env tag)]
          [k {:object :table}])))

(def ^:private env (env-of ptu/sample))

(defn- deploy!
  ([inst s] (deploy! inst s {}))
  ([inst s opts] (deploy/deploy! inst s ptu/branch (:env opts env) (dissoc opts :env))))

(defn deployed-instance!
  "A memory instance (state `more`) that deployed the head of the branch of store `s`, and the head."
  [s & {:as more}]
  (let [inst (pltu/memory-instance (atom (merge {:snapshot {}} more)))
        {:keys [result head]} (deploy! inst s)]
    (assert (= :deployed result) result)
    [inst head]))

(def ^:private other-id "OtherSnippet000000001")

(defn- other-snippet []
  (ptu/item other-id :snippet "Other" "snippetssnippetssnipp" {:content "other = true"}))

(defn- described
  [s id text]
  (assoc-in s [id :attrs :description] text))

(defn- counting!
  "`inst` with an atom of the plans that its `apply-plan!` received."
  [inst]
  (let [plans (atom [])]
    [(reify instance/Instance
       (read-snapshot [_] (instance/read-snapshot inst))
       (base [_] (instance/base inst))
       (base-digests [_ c] (instance/base-digests inst c))
       (table-names [_ ks] (instance/table-names inst ks))
       (apply-plan! [_ plan opts] (swap! plans conj plan) (instance/apply-plan! inst plan opts))
       (set-base! [_ e n d] (instance/set-base! inst e n d)))
     plans]))

;;; --------------------------------------------------- Simple deploys -------------------------------------------------

(deftest deploy-applies-the-head-in-full-test
  (enabled
   (with-remote [repo s]
     (let [c1             (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst first]   (deployed-instance! s)
           remote         (-> ptu/sample
                              (ptu/renamed ptu/revenue-id "Revenue, net")
                              (dissoc ptu/orders-id)
                              (assoc other-id (other-snippet)))
           h              (pltu/commit-snapshot! repo ptu/branch [c1] remote)
           [counted plans] (counting! inst)
           {:keys [result head steps]} (deploy! counted s)]
       (testing "the first deploy, with no base, takes the head"
         (is (= c1 first)))
       (testing "a new head: the instance shows exactly the head, through one apply of the whole plan"
         (is (= :deployed result))
         (is (= h head))
         (is (= remote (pltu/snapshot-of inst)))
         (is (= [steps] @plans))
         (is (= #{ptu/revenue-id ptu/orders-id other-id} (set (map :id steps)))))
       (testing "the removed item goes to the trash"
         (is (= (get ptu/sample ptu/orders-id) (get-in @(:state inst) [:trash ptu/orders-id]))))
       (testing "the base is the head, with the digests of its content"
         (is (= h (instance/base inst)))
         (is (= (writer/item-digests kinds/codecs remote) (instance/base-digests inst h))))))))

(deftest deploy-of-the-base-is-up-to-date-test
  (enabled
   (with-remote [repo s]
     (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
     (let [[inst c1] (deployed-instance! s)]
       (is (= {:result :up-to-date :head c1} (deploy! inst s)))))))

(deftest deploy-of-a-missing-branch-test
  (enabled
   (with-remote [_repo s]
     (let [inst (pltu/memory-instance (atom {:snapshot {}}))]
       (is (= {:result :no-branch} (deploy! inst s)))
       (is (nil? (instance/base inst)))))))

(deftest disabled-deploy-writes-nothing-test
  (mt/with-temporary-setting-values [library-branching-enabled false]
    (with-remote [repo s]
      (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
      (let [inst (pltu/memory-instance (atom {:snapshot {}}))]
        (is (= {:result :disabled} (deploy! inst s)))
        (is (= {} (pltu/snapshot-of inst)))))))

;;; ---------------------------------------------------- Validation ----------------------------------------------------

(deftest deploy-refuses-an-ill-formed-head-test
  (enabled
   (with-remote [repo s]
     (let [c1        (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _]  (deployed-instance! s)
           stray     "StrayCollection000001"
           ;; a text merge in git: one side removed the metrics collection, the other side added a metric in it
           bad       (-> ptu/sample
                         (dissoc ptu/metrics-id ptu/orders-id)
                         (assoc stray (ptu/item stray :collection "Stray" nil {})))
           files     (assoc (writer/encode-tree kinds/codecs (dissoc bad ptu/revenue-id))
                            "library/revenue.metric.yaml"
                            (writer/write-yaml (codec/encode format.metric/codec ptu/revenue-id (get bad ptu/revenue-id))))
           h         (pltu/commit-on! repo ptu/branch [c1] files)
           {:keys [result head findings]} (deploy! inst s)]
       (testing "the head breaks structural rules: the deploy refuses with the findings, and the instance stays on its
                last green commit"
         (is (= :invalid result))
         (is (= h head))
         (is (= #{{:rule :place-inside :id ptu/revenue-id :place ptu/metrics-id} {:rule :root :id stray}}
                (set findings)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

(deftest deploy-validates-the-head-against-its-own-environment-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           missing  ["Sample Database" "PUBLIC" "REVIEWS"]
           new-id   "ReviewsCountMetric001"
           remote   (assoc ptu/sample new-id (ptu/item new-id :metric "Reviews" ptu/metrics-id
                                                       {:display "scalar" :query (ptu/count-query missing)}))
           ;; CI checked the head against the manifest of the repository, which holds the table
           h        (pltu/commit-snapshot! repo ptu/branch [c1] remote)
           {:keys [result head findings]} (deploy! inst s)]
       (testing "the head names a table that this instance does not have: the deploy refuses it, whatever CI said, and
                writes nothing"
         (is (= :invalid result))
         (is (= h head))
         (is (= [{:rule :env-resolves :id new-id :ref [:source-table [:env missing]]}]
                (filterv #(= [:source-table [:env missing]] (:ref %)) findings)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))
       (testing "a later head that is green deploys"
         (let [h2 (pltu/commit-snapshot! repo ptu/branch [h] (ptu/renamed ptu/sample ptu/revenue-id "Green"))]
           (is (= :deployed (:result (deploy! inst s))))
           (is (= h2 (instance/base inst)))))
       (testing "with the table in its environment, the instance deploys the head"
         (pltu/commit-snapshot! repo ptu/branch [(instance/base inst)] remote)
         (is (= :deployed (:result (deploy! inst s {:env (env-of remote)}))))
         (is (= remote (pltu/snapshot-of inst))))))))

;;; ------------------------------------------------------ The trash ---------------------------------------------------

(deftest removed-item-in-use-goes-to-the-trash-and-deploys-go-on-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s :uses {"OutsideQuestion000001" #{ptu/orders-id}})
           h1       (pltu/commit-snapshot! repo ptu/branch [c1] (dissoc ptu/sample ptu/orders-id))]
       (testing "main removes a metric that a question outside the Library uses: the deploy moves it to the trash, so the
                question still resolves it, and the deploy reports it with its user"
         (let [{:keys [result trashed-in-use]} (deploy! inst s)]
           (is (= :deployed result))
           (is (= {ptu/orders-id ["OutsideQuestion000001"]} trashed-in-use)))
         (is (not (contains? (pltu/snapshot-of inst) ptu/orders-id)))
         (is (contains? (:trash @(:state inst)) ptu/orders-id)))
       (testing "the removal does not block a later deploy"
         (let [h2 (pltu/commit-snapshot! repo ptu/branch [h1] (-> ptu/sample
                                                                  (dissoc ptu/orders-id)
                                                                  (ptu/renamed ptu/revenue-id "Later")))]
           (is (= :deployed (:result (deploy! inst s))))
           (is (= h2 (instance/base inst)))))
       (testing "a later head that holds the item again restores it from the trash"
         (pltu/commit-snapshot! repo ptu/branch [(instance/base inst)] ptu/sample)
         (is (= :deployed (:result (deploy! inst s))))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (not (contains? (:trash @(:state inst)) ptu/orders-id))))))))

;;; ------------------------------------------------------- Drift ------------------------------------------------------

(deftest deploy-does-not-write-over-drift-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           _        (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))]
       (testing "a change on the instance that no commit holds (an admin script): the deploy refuses with its identity,
                and writes nothing"
         (pltu/save! inst #(described % ptu/snippet-id "Drift"))
         (is (= {:result :drift :head (ptu/remote-head repo) :ids [ptu/snippet-id]} (deploy! inst s)))
         (is (= "Drift" (get-in (pltu/snapshot-of inst) [ptu/snippet-id :attrs :description])))
         (is (= "Revenue" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
         (is (= c1 (instance/base inst))))
       (testing "a created and a deleted item are drift too"
         (pltu/save! inst #(-> % (assoc other-id (other-snippet)) (dissoc ptu/orders-id)))
         (is (= #{ptu/snippet-id other-id ptu/orders-id} (set (:ids (deploy! inst s))))))
       (testing "when the instance holds the base content again, the deploy goes on"
         (pltu/save! inst (constantly ptu/sample))
         (is (= :deployed (:result (deploy! inst s))))
         (is (= "Theirs" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name]))))))))

(deftest drift-that-equals-the-head-is-no-drift-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           remote   (ptu/renamed ptu/sample ptu/revenue-id "Theirs")
           h        (pltu/commit-snapshot! repo ptu/branch [c1] remote)]
       (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Other"))
       (testing "drift stops the deploy also when the head changes the same item"
         (is (= [ptu/revenue-id] (:ids (deploy! inst s)))))
       (testing "a deploy with no drift writes nothing that differs from the head"
         (pltu/save! inst (constantly ptu/sample))
         (is (= {:result :deployed :head h :steps [{:id ptu/revenue-id :write (get remote ptu/revenue-id)
                                                    :pre (get ptu/sample ptu/revenue-id)}]
                 :trashed-in-use {}}
                (deploy! inst s))))))))

(deftest first-deploy-with-no-base-test
  (enabled
   (with-remote [repo s]
     (let [h (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)]
       (testing "with no base, a local item with the content of the head is no drift"
         (let [inst (pltu/memory-instance (atom {:snapshot (select-keys ptu/sample [ptu/library-id ptu/snippet-id])}))]
           (is (= :deployed (:result (deploy! inst s))))
           (is (= ptu/sample (pltu/snapshot-of inst)))
           (is (= h (instance/base inst)))))
       (testing "with no base, a local item that the head does not hold, or holds with other content, is drift"
         (let [local (-> (select-keys ptu/sample [ptu/library-id])
                         (assoc other-id (other-snippet))
                         (assoc ptu/snippet-id (get (described ptu/sample ptu/snippet-id "Local") ptu/snippet-id)))
               inst  (pltu/memory-instance (atom {:snapshot local}))]
           (is (= {:result :drift :head h :ids #{other-id ptu/snippet-id}} (update (deploy! inst s) :ids set)))
           (is (= local (pltu/snapshot-of inst)))
           (is (nil? (instance/base inst)))))))))

(defn- unreadable-base-store!
  "`s` that throws on a read of the tree of commit `base`."
  [s base]
  (reify store/Store
    (head [_ r] (store/head s r))
    (branches [_] (store/branches s))
    (default-branch [_] (store/default-branch s))
    (read-tree [_ c] (if (= c base) (throw (ex-info "missing object" {:commit c})) (store/read-tree s c)))
    (changed-paths [_ a b] (store/changed-paths s a b))
    (write-commit [_ ps t m] (store/write-commit s ps t m))
    (cas-ref! [_ r e n] (store/cas-ref! s r e n))
    (ancestor? [_ a b] (store/ancestor? s a b))
    (merge-base [_ a b] (store/merge-base s a b))
    (close [_] (store/close s))))

(deftest drift-from-the-base-digests-test
  (enabled
   (with-remote [repo s]
     (let [c1         (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _]   (deployed-instance! s)
           _          (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))
           unreadable (unreadable-base-store! s c1)]
       (testing "the local content has the digests of the base: no read of the base commit, and the deploy goes on"
         (let [copy (pltu/memory-instance (atom @(:state inst)))]
           (is (= :deployed (:result (deploy! copy unreadable))))))
       (testing "the local content differs from the base digests, and the base commit cannot be read: the digests give
                the drift"
         (pltu/save! inst #(described % ptu/snippet-id "Drift"))
         (is (= [ptu/snippet-id] (:ids (deploy! inst unreadable)))))
       (testing "the base digests differ but the base content is equal (digests of another release): no drift"
         (pltu/save! inst (constantly ptu/sample))
         (swap! (:state inst) assoc-in [:digests ptu/revenue-id] "0000")
         (is (= :deployed (:result (deploy! inst s)))))))))

;;; ---------------------------------------------- A save during the deploy --------------------------------------------

(deftest save-during-the-deploy-is-not-lost-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           h        (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))
           saved?   (atom false)
           racing   (ptu/wrap-instance inst {:read-snapshot (fn [read-snapshot]
                                                              (let [r (read-snapshot)]
                                                                (when (compare-and-set! saved? false true)
                                                                  (pltu/save! inst #(ptu/renamed % ptu/revenue-id "Saved")))
                                                                r))})]
       (testing "a save after the read point: the apply sees it under its lock and writes nothing; the deploy reads again
                and finds the save as drift"
         (is (= {:result :drift :head h :ids [ptu/revenue-id]} (deploy! racing s)))
         (is (= "Saved" (get-in (pltu/snapshot-of inst) [ptu/revenue-id :name])))
         (is (= c1 (instance/base inst))))))))

(deftest fenced-deploy-writes-nothing-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s)
           h        (pltu/commit-snapshot! repo ptu/branch [c1] (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))]
       (is (= {:result :fenced :head h :reason :cancelled} (deploy! inst s {:fence (constantly :cancelled)})))
       (is (= ptu/sample (pltu/snapshot-of inst)))
       (is (= c1 (instance/base inst)))))))

(deftest refused-step-writes-nothing-test
  (enabled
   (with-remote [repo s]
     (let [c1       (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [inst _] (deployed-instance! s :outside #{other-id})
           h        (pltu/commit-snapshot! repo ptu/branch [c1] (-> ptu/sample
                                                                    (ptu/renamed ptu/revenue-id "Changed")
                                                                    (assoc other-id (other-snippet))))]
       (testing "the instance refuses the last write of the plan: the deploy writes none of its steps, so the instance
                never shows a mix of two commits"
         (is (= {:result  :refused
                 :head    h
                 :refused [{:id other-id :reason :outside-library :message "An item outside the Library has this identity."}]}
                (deploy! inst s)))
         (is (= ptu/sample (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

;;; ---------------------------------------------------- Kind change -------------------------------------------------

(def ^:private robin-id "AAAAAAAAAAAAAAAAAAAAA")

(def ^:private robin-collection
  {robin-id {:kind :collection :name "Robin" :place nil :refs #{} :attrs {:type "library"}}})

(def ^:private robin-term
  {robin-id {:kind :glossary-term :name "Robin" :place "glossaryglossarygloss" :refs #{} :attrs {:definition ""}}})

(deftest deploy-of-an-identity-of-another-kind-test
  (testing "the shrunk case of deploy-shows-the-head-property-test: a collection, then a glossary term with its identity,
           then the collection again; each deploy shows its head"
    (enabled
     (with-remote [repo s]
       (let [c1   (pltu/commit-snapshot! repo ptu/branch [] robin-collection)
             inst (pltu/memory-instance (atom {:snapshot {}}))]
         (is (= :deployed (:result (deploy! inst s))))
         (let [h2 (pltu/commit-snapshot! repo ptu/branch [c1] robin-term)
               {:keys [result steps]} (deploy! inst s)]
           (is (= :deployed result))
           (is (= [{:id robin-id :write (get robin-term robin-id) :pre nil}
                   {:id robin-id :trash true :pre (get robin-collection robin-id)}]
                  steps))
           (is (= robin-term (pltu/snapshot-of inst)))
           (is (= h2 (instance/base inst)))
           (let [h3 (pltu/commit-snapshot! repo ptu/branch [h2] robin-collection)]
             (is (= :deployed (:result (deploy! inst s))))
             (is (= robin-collection (pltu/snapshot-of inst)))
             (is (= h3 (instance/base inst))))))))))

(deftest deploy-of-a-card-of-another-type-test
  (testing "a question whose card becomes a model: one write of the card, as the app DB keeps both kinds in one table"
    (enabled
     (with-remote [repo s]
       (let [local    (assoc-in ptu/sample [ptu/revenue-id :kind] :question)
             c1       (pltu/commit-snapshot! repo ptu/branch [] local)
             [inst _] (deployed-instance! s)
             remote   (assoc-in ptu/sample [ptu/revenue-id :kind] :model)
             h        (pltu/commit-snapshot! repo ptu/branch [c1] remote)
             {:keys [result steps]} (deploy! inst s)]
         (is (= :deployed result))
         (is (= [{:id ptu/revenue-id :write (get remote ptu/revenue-id) :pre (get local ptu/revenue-id)}] steps))
         (is (= remote (pltu/snapshot-of inst)))
         (is (= h (instance/base inst))))))))

;;; ------------------------------------------------- The whole workflow -----------------------------------------------

(deftest sandbox-to-production-workflow-test
  (enabled
   (with-remote [repo s]
     (let [main     (pltu/commit-snapshot! repo ptu/branch [] ptu/sample)
           [prod _] (deployed-instance! s)
           sandbox  (pltu/memory-instance (atom {:snapshot ptu/sample :base main
                                                 :digests  (writer/item-digests kinds/codecs ptu/sample)}))
           work     (-> ptu/sample (ptu/renamed ptu/revenue-id "Revenue, net") (assoc other-id (other-snippet)))]
       (testing "a sandbox on a branch made from main: an agent saves, and the sandbox pushes to the branch"
         (pltu/reset-branch! repo "feature" main)
         (pltu/save! sandbox (constantly work))
         (is (= :pushed (:result (ptu/do-with-push-task! #(push/push! sandbox s "feature" %))))))
       (testing "production does not take the work of the branch"
         (is (= {:result :up-to-date :head main} (deploy! prod s))))
       (testing "the pull request merges the branch into main, and production deploys main"
         (let [pushed (store/head s "feature")
               merged (pltu/commit-snapshot! repo ptu/branch [main pushed] work)]
           (is (= :deployed (:result (deploy! prod s))))
           (is (= work (pltu/snapshot-of prod)))
           (is (= merged (instance/base prod)))))))))

(deftest deploy-refuses-the-name-of-a-trashed-snippet-test
  (enabled
   (with-remote [repo s]
     (let [before   (assoc ptu/sample other-id (other-snippet))
           c1       (pltu/commit-snapshot! repo ptu/branch [] before)
           [inst _] (deployed-instance! s)
           new-id   "NewOtherSnippet000001"
           h        (pltu/commit-snapshot! repo ptu/branch [c1]
                                           (assoc ptu/sample new-id (ptu/item new-id :snippet "other" "snippetssnippetssnipp" {:content "1 = 1"})))]
       (testing "the head removes a snippet and adds one with a name of one key: the trash keeps the removed snippet with
                its name, so the deploy refuses with the pair and writes nothing"
         (is (= {:result    :key-clash
                 :head      h
                 :key-clash [{:rule :unique-key :kind :snippet :key "other" :ids #{new-id other-id}}]}
                (deploy! inst s)))
         (is (= before (pltu/snapshot-of inst)))
         (is (= c1 (instance/base inst))))))))

;;; ---------------------------------------------------- Properties ----------------------------------------------------

(defspec deploy-shows-the-head-property-test 25
  (prop/for-all [[s1 s2] (gen/tuple ptu/pushable-snapshot-gen ptu/pushable-snapshot-gen)]
    (enabled
     (with-remote [repo s]
       (let [c1   (pltu/commit-snapshot! repo ptu/branch [] s1)
             inst (pltu/memory-instance (atom {:snapshot {}}))
             r1   (deploy! inst s {:env (env-of s1)})
             h    (pltu/commit-snapshot! repo ptu/branch [c1] s2)
             r2   (deploy! inst s {:env (env-of s2)})
             clashes (pltu/trashed-name-clashes s1 s2)]
         (and (= :deployed (:result r1))
              (if (seq clashes)
                ;; the head gives a snippet the name of a snippet that it removes: the trash keeps the removed one with
                ;; its name, so the apply refuses with exactly those pairs, and writes nothing
                (and (= :key-clash (:result r2))
                     (= clashes (set (map :ids (:key-clash r2))))
                     (= s1 (pltu/snapshot-of inst))
                     (= c1 (instance/base inst)))
                ;; with no drift, a consumption instance shows exactly the head after each deploy (ProdShowsValid)
                (and (= :deployed (:result r2))
                     (= s2 (pltu/snapshot-of inst))
                     (= h (instance/base inst))))))))))
