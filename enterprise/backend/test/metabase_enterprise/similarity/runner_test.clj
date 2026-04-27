(ns metabase-enterprise.similarity.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase-enterprise.similarity.scorer :as scorer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(defn- register-counting-view!
  "Register a view whose `compute!` increments a counter and returns the value
   it 'inserted'. Returns `[view-name counter]`."
  []
  (let [view (keyword (str "runner-test-" (random-uuid)))
        counter (atom 0)]
    (scorer/register-view! view
                           {:typed-pairs #{[:card :card]}
                            :compute!    (fn [_opts] (swap! counter inc))})
    [view counter]))

(defn- register-throwing-view! [ex]
  (let [view (keyword (str "runner-test-throw-" (random-uuid)))]
    (scorer/register-view! view
                           {:typed-pairs #{[:card :card]}
                            :compute!    (fn [_opts] (throw ex))})
    view))

(deftest ^:sequential happy-path-test
  (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
    (let [[view _counter] (register-counting-view!)
          result (runner/run-view! view)]
      (is (= :ok (:status result)))
      (is (= view (:view result)))
      (is (= 1 (:inserted result)))
      (is (some? (:duration-ms result)))
      (let [status-row (t2/select-one :model/SimilarEdgeStatus :view view)]
        (is (= :ok (:status status-row)))
        (is (some? (:last_full_run_at status-row)))))))

(deftest ^:sequential failure-rolls-back-and-records-error-test
  (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
    (let [view (register-throwing-view! (ex-info "intentional failure" {:reason :test}))]
      (testing "pre-seed an edge to verify rollback preserves prior state"
        (t2/insert! :model/SimilarEdge
                    {:from_entity_type :card
                     :from_entity_id   9001
                     :to_entity_type   :card
                     :to_entity_id     9002
                     :view             view
                     :score            0.99
                     :last_computed_at (java.time.OffsetDateTime/now)}))
      (let [result (runner/run-view! view)]
        (is (= :error (:status result)))
        (is (= "intentional failure" (:error result))))
      (testing "the prior edge is preserved (transaction rolled back)"
        (is (t2/exists? :model/SimilarEdge
                        :from_entity_id 9001 :to_entity_id 9002 :view view)))
      (testing "status reflects the error with truncated message"
        (let [status-row (t2/select-one :model/SimilarEdgeStatus :view view)]
          (is (= :error (:status status-row)))
          (is (re-find #"intentional failure" (:last_error status-row))))))))

(deftest ^:sequential unknown-view-name-throws-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"No scorer registered for view"
                        (runner/run-view! :no-such-view-xyz))))

(deftest ^:sequential run-all-views!-runs-each-registered-view-test
  (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
    (let [[v1 c1] (register-counting-view!)
          [v2 c2] (register-counting-view!)
          results (runner/run-all-views!)
          picked  (filter #(#{v1 v2} (:view %)) results)]
      (is (= 2 (count picked)))
      (is (every? #(= :ok (:status %)) picked))
      (is (= 1 @c1))
      (is (= 1 @c2)))))
