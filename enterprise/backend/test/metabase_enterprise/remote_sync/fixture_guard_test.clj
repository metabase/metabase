(ns metabase-enterprise.remote-sync.fixture-guard-test
  "These tests delete remote-sync content from the app DB that they run on; do not run them against an app DB that
  serves an instance. Each remote-sync module test namespace not in [[exemptions]] has the shared fixture as its
  first `:each` fixture, no `:once` fixture that stores a `remote-sync%` setting row, and no `^:parallel` test."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [mb.hawk.parallel]
   [metabase-enterprise.remote-sync.isolation-check-test-util :as isolation-check]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each rs.test/clean-remote-sync-state)

(def ^:private exemptions
  "The module test namespaces that do not use the shared fixture, each with its reason."
  '{metabase-enterprise.remote-sync.merge-test                  "no app DB"
    metabase-enterprise.remote-sync.events-derivation-test      "no app DB"
    metabase-enterprise.remote-sync.spec-entity-count-test      "no app DB"
    metabase-enterprise.remote-sync.source.git-credentials-test "no app DB"
    metabase-enterprise.remote-sync.source.wrapping-source-test "no app DB"
    metabase-enterprise.remote-sync.source.git-progress-test    "no app DB"
    metabase-enterprise.remote-sync.core-test                   "its own clean-object fixture; binds no remote-sync setting"
    metabase-enterprise.remote-sync.guards-test                 "its own clean-task-table fixture; binds no remote-sync setting"
    metabase-enterprise.remote-sync.task.table-cleanup-test     "its own task-table cleanup; binds no remote-sync setting"
    metabase-enterprise.remote-sync.test-helpers-test           "tests the shared fixture"
    metabase-enterprise.remote-sync.cost-test-util-test         "tests the cost helpers"})

(defn- shared-fixture-first?
  "Whether the first `:each` fixture of `ns-sym` carries the shared-fixture marker."
  [ns-sym]
  (-> (find-ns ns-sym) meta :clojure.test/each-fixtures first meta ::rs.test/shared-fixture true?))

(defn- parallel-vars
  "The vars of `ns-sym` that hawk runs in parallel: each var whose own metadata says `:parallel`, and, when the
  var says neither `:parallel` nor `:synchronized`, each var of a `^:parallel` namespace."
  [ns-sym]
  (sort (for [[_ v] (ns-interns ns-sym)
              :when (mb.hawk.parallel/parallel? v)]
          (symbol v))))

(defn- once-fixtures-store-remote-sync-setting!
  "Whether the `:once` fixtures of `ns-sym` store a `remote-sync%` setting row while they run, from an app DB with no
  such row. Puts back the stored rows afterwards."
  [ns-sym]
  ;; the row that a `:once` binding of a remote-sync setting stores outlives the namespace, and a stored row makes
  ;; the shared fixture refuse every later test
  (let [once   (join-fixtures (-> (find-ns ns-sym) meta :clojure.test/once-fixtures))
        stored (volatile! nil)]
    (rs.test/clean-remote-sync-settings
     (fn []
       (t2/query-one {:delete-from :setting :where [:like :key "remote-sync%"]})
       (setting/restore-cache!)
       (once (fn [] (vreset! stored (seq (rs.test/stored-remote-sync-setting-rows)))))))
    (some? @stored)))

(deftest module-namespaces-use-the-shared-fixture-test
  (let [namespaces (isolation-check/module-test-namespaces)
        checked    (remove exemptions namespaces)]
    (testing "the file lookup finds the module test namespaces"
      (is (some #{'metabase-enterprise.remote-sync.source.git-test} namespaces)))
    (testing "every exemption names a module test namespace"
      (is (= #{} (set/difference (set (keys exemptions)) (set namespaces)))))
    (apply require checked)
    (testing "the first :each fixture of each namespace is the shared fixture"
      (is (= [] (remove shared-fixture-first? checked))))
    (testing "no namespace with the shared fixture has a :once fixture that stores a remote-sync setting"
      (is (= [] (filter once-fixtures-store-remote-sync-setting! checked))))
    (testing "no namespace with the shared fixture has a ^:parallel test"
      (is (= [] (mapcat parallel-vars checked))))))

(def ^:private run-time-ns
  'metabase-enterprise.remote-sync.fixture-guard-test.run-time)

(defn- make-namespace!
  "Create the namespace [[run-time-ns]] with the `:once` fixtures `once-fixtures`, the `:each` fixtures `each-fixtures`,
  and one test var, with `:parallel` metadata on the var when `parallel?`, `:synchronized` when `synchronized?`, and
  `:parallel` on the namespace when `ns-parallel?`. Stores the fixture functions, as `use-fixtures` does."
  [{:keys [once-fixtures each-fixtures parallel? ns-parallel? synchronized?]}]
  (let [the-ns (create-ns run-time-ns)]
    (intern the-ns (with-meta 'the-test (cond-> {:test (fn [])}
                                          parallel? (assoc :parallel true)
                                          synchronized? (assoc :synchronized true))) (fn []))
    (apply alter-meta! the-ns merge
           {:clojure.test/once-fixtures (mapv #(if (var? %) (deref %) %) once-fixtures)
            :clojure.test/each-fixtures (mapv #(if (var? %) (deref %) %) each-fixtures)}
           (when ns-parallel? {:parallel true}))
    run-time-ns))

(defn- other-fixture [f] (f))

(deftest guard-checks-reject-a-namespace-that-breaks-them-test
  (try
    (testing "a namespace with the shared fixture first, a :once fixture that stores no setting, and no parallel test passes"
      (let [ns-sym (make-namespace! {:once-fixtures [(fixtures/initialize :db)]
                                     :each-fixtures [rs.test/clean-remote-sync-state other-fixture]})]
        (is (= [true false []]
               [(shared-fixture-first? ns-sym)
                (once-fixtures-store-remote-sync-setting! ns-sym)
                (parallel-vars ns-sym)]))))
    (testing "a namespace with no :each fixture fails"
      (remove-ns run-time-ns)
      (is (false? (shared-fixture-first? (make-namespace! {})))))
    (testing "a namespace with the shared fixture second fails"
      (remove-ns run-time-ns)
      (is (false? (shared-fixture-first? (make-namespace! {:each-fixtures [other-fixture rs.test/clean-remote-sync-state]})))))
    (testing "a namespace with a :once fixture that binds a remote-sync setting fails"
      (remove-ns run-time-ns)
      (is (true? (once-fixtures-store-remote-sync-setting!
                  (make-namespace! {:once-fixtures [(fn [f]
                                                      (mt/with-temporary-setting-values [remote-sync-transforms true]
                                                        (f)))]
                                    :each-fixtures [rs.test/clean-remote-sync-state]})))))
    (testing "a namespace with a ^:parallel test fails"
      (remove-ns run-time-ns)
      (is (= [(symbol (str run-time-ns) "the-test")]
             (parallel-vars (make-namespace! {:each-fixtures [rs.test/clean-remote-sync-state] :parallel? true})))))
    (testing "a namespace whose own metadata is ^:parallel fails"
      (remove-ns run-time-ns)
      (is (= [(symbol (str run-time-ns) "the-test")]
             (parallel-vars (make-namespace! {:each-fixtures [rs.test/clean-remote-sync-state] :ns-parallel? true})))))
    (testing "a ^:synchronized test of a ^:parallel namespace does not fail"
      (remove-ns run-time-ns)
      (is (= []
             (parallel-vars (make-namespace! {:each-fixtures [rs.test/clean-remote-sync-state]
                                              :ns-parallel? true
                                              :synchronized? true})))))
    (finally
      (remove-ns run-time-ns))))
