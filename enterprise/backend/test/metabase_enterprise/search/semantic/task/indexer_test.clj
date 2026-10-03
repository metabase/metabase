(ns metabase-enterprise.search.semantic.task.indexer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.search.semantic.core :as semantic.core]
   [metabase-enterprise.search.semantic.env :as semantic.env]
   [metabase-enterprise.search.semantic.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.search.semantic.indexer :as semantic.indexer]
   [metabase-enterprise.search.semantic.settings :as semantic.settings]
   [metabase-enterprise.search.semantic.task.indexer :as sut]
   [metabase-enterprise.search.semantic.util :as semantic.u]
   [metabase.task.core :as task]
   [metabase.test :as mt])
  (:import
   (org.quartz DisallowConcurrentExecution InterruptableJob Job JobDetail)))

(set! *warn-on-reflection* true)

(defn- new-job ^Job []
  (let [^Class job-class (#'sut/job-class)]
    (.newInstance (.getConstructor job-class (make-array Class 0)) (object-array 0))))

(deftest job-class-keeps-its-pre-move-name-test
  ;; Quartz stores this name in the app DB, see `sut/job-class-name`
  (let [^Class job-class (#'sut/job-class)]
    (is (= {:name                             "metabase_enterprise.semantic_search.task.indexer.SemanticSearchIndexer"
            :concurrent-execution-disallowed? true
            :interruptible?                   true}
           {:name                             (.getName job-class)
            :concurrent-execution-disallowed? (.isAnnotationPresent job-class DisallowConcurrentExecution)
            :interruptible?                   (isa? job-class InterruptableJob)}))))

(deftest init-schedules-the-pinned-job-class-test
  (let [scheduled (atom nil)]
    (mt/with-dynamic-fn-redefs
      [semantic.u/semantic-search-configured?           (constantly true)
       semantic.settings/semantic-search-vector-strategy (constantly :brute-force)
       task/schedule-task!                              (fn [job _trigger] (reset! scheduled job))]
      (task/init! ::sut/SemanticSearchIndexer))
    (is (= (#'sut/job-class) (.getJobClass ^JobDetail @scheduled)))))

(deftest job-namespace-reloads-from-source-test
  (testing "an unload and reload, as `refresh` and clj-reload do, brings the job namespace back"
    (#'sut/job-class)
    (let [job-ns 'metabase-enterprise.search.semantic.task.indexer-job]
      (remove-ns job-ns)
      (dosync (commute @#'clojure.core/*loaded-libs* disj job-ns))
      (require job-ns)
      (is (some? (find-ns job-ns))))))

(deftest startup-hnsw-safety-net-test
  (testing "the indexer task's startup builds the HNSW index when configured for any index-backed strategy"
    ;; Covers instances that boot already configured for an HNSW-index-backed strategy (e.g. strategy set via
    ;; env var), where the setter's transition event never fired -- see the safety net in sut/init!. Redefs
    ;; avoid scheduling a real quartz job or spawning a real build future.
    (let [builds (atom 0)]
      (mt/with-dynamic-fn-redefs [semantic.u/semantic-search-configured? (constantly true)
                                  task/schedule-task!                   (fn [& _] nil)
                                  semantic.core/build-hnsw-index-async! (fn [] (swap! builds inc))]
        (testing ":brute-force does not trigger a build"
          (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly :brute-force)]
            (task/init! ::sut/SemanticSearchIndexer))
          (is (zero? @builds)))
        (doseq [strategy [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
          (testing (str strategy " triggers a build")
            (reset! builds 0)
            (mt/with-dynamic-fn-redefs [semantic.settings/semantic-search-vector-strategy (constantly strategy)]
              (task/init! ::sut/SemanticSearchIndexer))
            (is (= 1 @builds))))))))

(deftest indexer-builds-only-absent-or-abandoned-hnsw-indexes-test
  (let [builds (atom 0)
        runs   (atom 0)
        job    (new-job)]
    (mt/with-dynamic-fn-redefs
      [semantic.u/semantic-search-active?                (constantly true)
       semantic.env/get-pgvector-datasource!             (constantly ::pgvector)
       semantic.env/get-index-metadata                   (constantly ::index-metadata)
       semantic.index-metadata/get-active-index-state    (constantly {:index {:table-name "index_1"}})
       semantic.settings/semantic-search-vector-strategy (constantly :hnsw)
       semantic.core/build-hnsw-index-async!             #(swap! builds inc)
       semantic.indexer/quartz-job-run!                  (fn [& _] (swap! runs inc))]
      (doseq [[state expected-builds] [[nil 1] [:invalid 1] [:building 0] [:ready 0]]]
        (reset! builds 0)
        (mt/with-dynamic-fn-redefs [semantic.u/index-state (constantly state)]
          (.execute job nil))
        (is (= expected-builds @builds) (str state " build count")))
      (is (= 4 @runs) "index maintenance continues in every catalog state"))))
