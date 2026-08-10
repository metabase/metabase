(ns metabase-enterprise.data-studio.usage-metadata.task-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-studio.usage-metadata.task :as usage-metadata.task]
   [metabase.test :as mt]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]))

(set! *warn-on-reflection* true)

(deftest scheduled-refresh-dispatches-candidate-materialization-test
  (mt/with-premium-features #{:library}
    (let [run         {:id 2, :status :queued}
          queued-args (atom nil)]
      (mt/with-dynamic-fn-redefs
        [candidate-refresh/queue-refresh! (fn [trigger requested-by]
                                            (reset! queued-args [trigger requested-by])
                                            run)]
        (is (= run (usage-metadata.task/run-candidate-refresh!))))
      (is (= [:scheduled nil] @queued-args)))))

(deftest scheduled-refresh-does-nothing-without-library-test
  (mt/with-premium-features #{}
    (let [queued? (atom false)]
      (mt/with-dynamic-fn-redefs
        [candidate-refresh/queue-refresh! (fn [& _]
                                            (reset! queued? true))]
        (is (nil? (usage-metadata.task/run-candidate-refresh!))))
      (is (false? @queued?)))))
