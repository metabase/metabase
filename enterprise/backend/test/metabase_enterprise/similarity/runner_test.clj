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

(defn- register-ordered-view!
  "Register a view that pushes its name into `order-atom` when `compute!`
   fires. Returns the view name."
  [order-atom phase]
  (let [view (keyword (str "runner-test-" (name phase) "-" (random-uuid)))]
    (scorer/register-view! view
                           {:phase       phase
                            :typed-pairs #{[:card :card]}
                            :compute!    (fn [_opts]
                                           (swap! order-atom conj view)
                                           1)})
    view))

(deftest ^:sequential run-all-views!-runs-base-before-fusion-test
  (testing "run-all-views! orders :base views before :fusion views"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [order  (atom [])
            base   (register-ordered-view! order :base)
            fusion (register-ordered-view! order :fusion)
            _      (runner/run-all-views!)
            picked (filter #{base fusion} @order)]
        (is (= [base fusion] picked))))))

(defn- register-gated-view!
  "Register a view with a configurable density check. Returns
   `[view-name compute-counter check-result-atom seen-opts]` so tests can flip
   the gate result, observe whether compute! ran, and inspect the opts that
   reached compute!."
  []
  (let [view            (keyword (str "runner-test-gated-" (random-uuid)))
        compute-counter (atom 0)
        check-result    (atom {:passed? true})
        seen-opts       (atom nil)]
    (scorer/register-view! view
                           {:phase         :base
                            :typed-pairs   #{[:card :card]}
                            :density-check (fn [_] @check-result)
                            :compute!      (fn [opts]
                                             (reset! seen-opts opts)
                                             (swap! compute-counter inc))})
    [view compute-counter check-result seen-opts]))

(deftest ^:sequential density-gate-pass-runs-compute-test
  (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
    (let [[view counter result-atom _opts] (register-gated-view!)]
      (reset! result-atom {:passed? true})
      (let [result (runner/run-view! view)]
        (is (= :ok (:status result)))
        (is (not (:skipped? result)))
        (is (= 1 @counter))
        (is (= :ok (:status (t2/select-one :model/SimilarEdgeStatus :view view))))))))

(deftest ^:sequential density-gate-skip-short-circuits-test
  (testing "failing density check skips compute! and writes :skipped status"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [[view counter result-atom _opts] (register-gated-view!)]
        (reset! result-atom {:passed? false
                             :reason  "synthetic skip"
                             :metrics {:k 0}})
        (let [result (runner/run-view! view)]
          (is (= :ok (:status result)))
          (is (true? (:skipped? result)))
          (is (= "synthetic skip" (:skip-reason result)))
          (is (= {:k 0} (:metrics result)))
          (is (= 0 @counter) "compute! must NOT fire on skip")
          (let [row (t2/select-one :model/SimilarEdgeStatus :view view)]
            (is (= :skipped (:status row)))
            (is (= "synthetic skip" (:last_error row)))))))))

(deftest ^:sequential density-gate-skip-preserves-prior-edges-test
  (testing "a prior healthy run leaves edges; later skip leaves them in place"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [[view _counter result-atom _opts] (register-gated-view!)]
        (reset! result-atom {:passed? true})
        (t2/insert! :model/SimilarEdge
                    {:from_entity_type :card :from_entity_id 9001
                     :to_entity_type   :card :to_entity_id   9002
                     :view             view :score 0.5
                     :last_computed_at (java.time.OffsetDateTime/now)})
        (reset! result-atom {:passed? false :reason "skip" :metrics {}})
        (runner/run-view! view)
        (is (t2/exists? :model/SimilarEdge
                        :from_entity_id 9001 :to_entity_id 9002 :view view))))))

(deftest ^:sequential density-gate-skip-never-marks-running-test
  (testing "a skipped view's status goes straight to :skipped, never :running"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [[view _counter result-atom _opts] (register-gated-view!)]
        (reset! result-atom {:passed? false :reason "skip" :metrics {}})
        (runner/run-view! view)
        (let [row (t2/select-one :model/SimilarEdgeStatus :view view)]
          (is (= :skipped (:status row)))
          (is (nil? (:last_full_run_at row))))))))

(deftest ^:sequential density-gate-compute-opts-pipe-through-test
  (testing ":compute-opts from the density check merge into compute! opts"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [[view _counter result-atom seen-opts] (register-gated-view!)]
        (reset! result-atom {:passed? true :compute-opts {:source :alt}})
        (runner/run-view! view)
        (is (= :alt (:source @seen-opts)))
        (is (= 500 (:batch-size @seen-opts))
            "runner-default :batch-size survives when probe doesn't override it")))))

(deftest ^:sequential views-without-density-check-still-pass-test
  (testing "views registered without :density-check default to passing"
    (mt/with-model-cleanup [:model/SimilarEdge :model/SimilarEdgeStatus]
      (let [[view counter] (register-counting-view!)
            result         (runner/run-view! view)]
        (is (= :ok (:status result)))
        (is (not (:skipped? result)))
        (is (= 1 @counter))))))
