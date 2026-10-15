(ns metabase-enterprise.library-branching.merge-branch-test
  "Merge-branch in git, and the user's workflow: a sandbox works on a branch, main moves, and main is merged into the
  branch through Metabase or through a git text merge; the sandbox pulls the merge."
  {:clj-kondo/config '{:lint-as {metabase-enterprise.library-branching.push-test-util/with-remote clojure.core/fn}}}
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.format.writer :as writer]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.merge-branch :as merge-branch]
   [metabase-enterprise.library-branching.pull-test-util :as pltu]
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

(def ^:private main "upstream")

(def ^:private feature ptu/branch)

(defn- text
  [s commit path]
  (some-> (get (store/read-tree s commit) path) (String. "UTF-8")))

(defn- branches!
  "Main at a commit of `base`, and the feature branch made from it with `ours`; main then moves to `theirs`. Returns
  `[a f m]`, the three commits."
  [repo base ours theirs & {:keys [ours-foreign theirs-foreign]}]
  (let [a (pltu/commit-snapshot! repo main [] base)
        _ (pltu/reset-branch! repo feature a)
        f (pltu/commit-snapshot! repo feature [a] ours ours-foreign)
        m (pltu/commit-snapshot! repo main [a] theirs theirs-foreign)]
    [a f m]))

(deftest merge-branch-test
  (enabled
   (with-remote [repo s]
     (let [ours   (ptu/renamed ptu/sample ptu/revenue-id "Ours")
           theirs (ptu/renamed ptu/sample ptu/orders-id "Theirs")
           [_a f m] (branches! repo ptu/sample ours theirs
                               :ours-foreign {"README.md" (ptu/utf8 "ours")}
                               :theirs-foreign {".github/check.yml" (ptu/utf8 "on: push")})
           {:keys [result commit]} (merge-branch/merge-branch! s feature main {:message "Merge main"})]
       (testing "main is merged into the branch: a merge commit with both heads as parents, the merged snapshot in the
                encoding of the format, and the foreign files of both sides"
         (is (= :merged result))
         (is (= commit (store/head s feature)))
         (is (= [f m] (ptu/commit-parents repo commit)))
         (is (= (-> ptu/sample (ptu/renamed ptu/revenue-id "Ours") (ptu/renamed ptu/orders-id "Theirs"))
                (ptu/commit-snapshot s commit)))
         (is (= "ours" (text s commit "README.md")))
         (is (= "on: push" (text s commit ".github/check.yml")))
         (is (= m (store/head s main))))
       (testing "a second merge has nothing to do"
         (is (= {:result :up-to-date :head commit} (merge-branch/merge-branch! s feature main))))))))

(deftest merge-branch-refuses-conflicts-test
  (enabled
   (with-remote [repo s]
     (let [[_a f _m] (branches! repo ptu/sample
                                (ptu/renamed ptu/sample ptu/revenue-id "Ours")
                                (ptu/renamed ptu/sample ptu/revenue-id "Theirs"))
           {:keys [result conflicts]} (merge-branch/merge-branch! s feature main)]
       (testing "both branches changed one item in different ways: the merge refuses, and the branch stays"
         (is (= :conflicts result))
         (is (= [ptu/revenue-id] (map :id conflicts)))
         (is (= f (store/head s feature))))))))

(deftest merge-branch-refuses-a-reference-to-a-removed-item-test
  (enabled
   (with-remote [repo s]
     (let [user-id  "UsesOrdersMetric00001"
           user     (ptu/item user-id :metric "Uses orders" ptu/metrics-id
                              {:display "scalar" :query (ptu/count-query ptu/orders-table ptu/orders-id)})
           [_a f _m] (branches! repo ptu/sample (assoc ptu/sample user-id user) (dissoc ptu/sample ptu/orders-id))
           {:keys [result violations]} (merge-branch/merge-branch! s feature main)]
       (testing "main removes a metric, and the branch adds a metric that uses it: no item conflicts, the merge check
                finds the dangling reference and names the pair"
         (is (= :conflicts result))
         (is (= [{:rule :refs-closed :id user-id :ref [:metric ptu/orders-id] :ours user-id :theirs ptu/orders-id}]
                violations))
         (is (= f (store/head s feature))))))))

(deftest merge-branch-refuses-an-item-at-the-root-that-is-no-root-test
  (enabled
   (with-remote [repo s]
     (let [stray     "StrayCollection000001"
           [_a f _m] (branches! repo ptu/sample ptu/sample (assoc ptu/sample stray (ptu/item stray :collection "Stray" nil {})))
           {:keys [result findings]} (merge-branch/merge-branch! s feature main)]
       (testing "main has a collection at the root level that is no fixed root: the merge result breaks a structural rule,
                and the merge refuses"
         (is (= :invalid result))
         (is (= [{:rule :root :id stray}] findings))
         (is (= f (store/head s feature))))))))

(deftest merge-branch-refuses-a-conflict-of-foreign-files-test
  (enabled
   (with-remote [repo s]
     (let [[_a f _m] (branches! repo ptu/sample ptu/sample ptu/sample
                                :ours-foreign {"README.md" (ptu/utf8 "ours")}
                                :theirs-foreign {"README.md" (ptu/utf8 "theirs")})]
       (is (= {:result :conflicts :conflicts [] :violations [] :foreign ["README.md"]}
              (merge-branch/merge-branch! s feature main)))
       (is (= f (store/head s feature)))))))

(deftest merge-branch-moves-the-branch-only-from-its-head-test
  (enabled
   (with-remote [repo s]
     (let [[_a f _m] (branches! repo ptu/sample (ptu/renamed ptu/sample ptu/revenue-id "Ours")
                                (ptu/renamed ptu/sample ptu/orders-id "Theirs"))
           other     (promise)
           racing    (ptu/wrap-store s (fn []
                                         (when-not (realized? other)
                                           (deliver other (pltu/commit-on! repo feature [f] {"README.md" (ptu/utf8 "x")})))))]
       (testing "someone pushes to the branch during the merge: the compare-and-swap refuses, and the push stays"
         (let [result (merge-branch/merge-branch! racing feature main)]
           (is (= {:result :remote-moved :head @other} result)))
         (is (= @other (store/head s feature))))))))

(deftest merge-branch-refuses-an-ill-formed-side-test
  (enabled
   (with-remote [repo s]
     (let [a (pltu/commit-snapshot! repo main [] ptu/sample)
           _ (pltu/reset-branch! repo feature a)
           _ (pltu/commit-on! repo main [a] (assoc (writer/encode-tree kinds/codecs ptu/sample)
                                                   "library/broken.metric.yaml"
                                                   (ptu/utf8 "kind: metric\nid: BrokenMetric000000001\n")))
           f (pltu/commit-snapshot! repo feature [a] (ptu/renamed ptu/sample ptu/revenue-id "Ours"))
           {:keys [result findings]} (merge-branch/merge-branch! s feature main)]
       (is (= :invalid result))
       (is (= [:invalid] (map :type findings)))
       (is (= f (store/head s feature)))))))

(deftest disabled-merge-branch-test
  (mt/with-temporary-setting-values [library-branching-enabled false]
    (with-remote [_repo s]
      (is (= {:result :disabled} (merge-branch/merge-branch! s feature main))))))

;;; -------------------------------------------------- The user's workflow ----------------------------------------------

(defn- workflow!
  "The sandbox workflow up to a moved main: main holds the sample; a sandbox on a new branch pulls it, its person saves a
  change, and the sandbox pushes it; then another change lands on main. Returns `[inst f m]`: the sandbox, the head of
  the branch and the head of main."
  [repo s]
  (let [m0   (pltu/commit-snapshot! repo main [] ptu/sample)
        _    (pltu/reset-branch! repo feature m0)
        inst (pltu/memory-instance (atom {:snapshot {}}))
        _    (is (= :pulled (:result (pltu/pull! inst s))))
        _    (is (= ptu/sample (pltu/snapshot-of inst)))
        _    (pltu/save! inst #(assoc-in % [ptu/revenue-id :attrs :description] "Sandbox"))
        f    (:commit (pltu/push! inst s))
        m    (pltu/commit-snapshot! repo main [m0] (ptu/renamed ptu/sample ptu/orders-id "Main"))]
    ;; the person keeps working after the push
    (pltu/save! inst #(assoc-in % [ptu/snippet-id :attrs :description] "Still working."))
    [inst f m]))

(def ^:private merged
  (-> ptu/sample
      (assoc-in [ptu/revenue-id :attrs :description] "Sandbox")
      (ptu/renamed ptu/orders-id "Main")
      (assoc-in [ptu/snippet-id :attrs :description] "Still working.")))

(deftest workflow-merge-main-through-metabase-test
  (enabled
   (with-remote [repo s]
     (let [[inst f m] (workflow! repo s)
           {:keys [result commit]} (merge-branch/merge-branch! s feature main)]
       (is (= :merged result))
       (is (= [f m] (ptu/commit-parents repo commit)))
       (testing "the sandbox pulls the merge: main's change lands, and the unpushed work stays"
         (is (= :pulled (:result (pltu/pull! inst s))))
         (is (= merged (pltu/snapshot-of inst)))
         (is (= commit (instance/base inst))))
       (testing "the next push carries the unpushed work, on top of the merge"
         (let [{:keys [result commit] :as pushed} (pltu/push! inst s)]
           (is (= :pushed result) (pr-str pushed))
           (is (= merged (ptu/commit-snapshot s commit)))))))))

(deftest workflow-merge-main-through-a-git-text-merge-test
  (enabled
   (with-remote [repo s]
     (let [[inst f m] (workflow! repo s)
           ;; a text merge in git: the files of main, with the file of the metric that the branch changed (at the same path)
           _           (store/head s main)
           tf          (store/read-tree s f)
           tm          (store/read-tree s m)
           path        (some (fn [[p ^bytes b]] (when (str/includes? (String. b "UTF-8") ptu/revenue-id) p)) tf)
           text-merged (pltu/commit-on! repo feature [f m] (assoc tm path (get tf path)))
           _           (store/head s feature)]
       (is (= (dissoc merged ptu/snippet-id) (dissoc (ptu/commit-snapshot s text-merged) ptu/snippet-id)))
       (testing "the sandbox pulls the text merge: main's change lands, and the unpushed work stays"
         (is (= :pulled (:result (pltu/pull! inst s))))
         (is (= merged (pltu/snapshot-of inst)))
         (is (= text-merged (instance/base inst))))))))
