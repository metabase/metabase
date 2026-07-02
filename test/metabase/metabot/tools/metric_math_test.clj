(ns metabase.metabot.tools.metric-math-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.metabot.tools.metric-math-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.metric-math :as metric-math]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ------------------------------------------------ Pure build-expression ------------------------------------------------

(deftest ^:parallel build-expression-stamps-unique-uuids-test
  (testing "each leaf occurrence gets its own :lib/uuid so the same metric can appear twice"
    (let [{:keys [ast filters]} (#'metric-math/build-expression
                                 {:op "/" :operands [{:type "metric" :id 1}
                                                     {:type "metric" :id 1}]})
          [op _opts a b] ast]
      (is (= :/ op))
      (is (= [:metric :metric] [(first a) (first b)]))
      (is (= [1 1] [(nth a 2) (nth b 2)]))
      (let [ua (get-in a [1 :lib/uuid])
            ub (get-in b [1 :lib/uuid])]
        (is (string? ua))
        (is (string? ub))
        (is (not= ua ub) "duplicate metric references must get distinct uuids"))
      (is (= [] filters)))))

(deftest ^:parallel build-expression-nested-and-constant-test
  (testing "nested arithmetic and bare numeric constants build into the internal AST"
    (let [{:keys [ast]} (#'metric-math/build-expression
                         {:op "*" :operands [{:op "/" :operands [{:type "metric" :id 42}
                                                                 {:type "measure" :id 7}]}
                                             100]})
          [op _ inner c] ast]
      (is (= :* op))
      (is (= 100 c))
      (is (= :/ (first inner)))
      (is (= :measure (first (nth inner 3)))))))

(deftest ^:parallel build-expression-per-leaf-filter-test
  (testing "a per-reference filter becomes an instance-filter keyed by that leaf's uuid"
    (let [flt                  [:> {} [:dimension {} "d-uuid"] 3]
          {:keys [ast filters]} (#'metric-math/build-expression
                                 {:type "measure" :id 5 :filter flt})
          uuid                 (get-in ast [1 :lib/uuid])]
      (is (= [:measure {:lib/uuid uuid} 5] ast))
      (is (= [{:lib/uuid uuid :filter flt}] filters)))))

(deftest ^:parallel build-expression-rejects-bad-input-test
  (testing "malformed nodes raise an LLM-facing :agent-error?"
    (doseq [node [{:op "%" :operands [{:type "metric" :id 1} {:type "metric" :id 2}]} ; bad operator
                  {:op "+" :operands [{:type "metric" :id 1}]}                        ; too few operands
                  {:type "widget" :id 1}                                              ; bad type
                  {:type "metric"}                                                    ; missing id
                  {:type "metric" :id -3}]]                                           ; non-positive id
      (let [e (try (#'metric-math/build-expression node) nil (catch Exception e e))]
        (is (some? e) (str "expected throw for " node))
        (is (:agent-error? (ex-data e)))))))

(deftest ^:parallel compute-metric-math-rejects-metric-free-expression-test
  (testing "an expression with no metric/measure leaves is rejected before any query work"
    (let [result (metric-math/compute-metric-math-tool
                  {:expression {:op "+" :operands [1 2]} :title "constants only"})]
      (is (nil? (:data-parts result)))
      (is (re-find #"at least one metric or measure" (:output result))))))

;;; ------------------------------------------------ Full tool (DB-backed) ------------------------------------------------

(deftest compute-metric-math-builds-metric-viz-part-test
  (testing "arithmetic over two metrics with a shared breakout yields a validated metric_viz part"
    ;; Deliberately DO NOT pre-sync the metrics' dimensions: the tool must sync them itself before
    ;; resolving the breakout. Without that (the original bug), a never-synced metric exposes zero
    ;; dimensions and the breakout is wrongly rejected.
    (mt/with-temp [:model/Card metric-a {:name "Metric A" :type :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}
                   :model/Card metric-b {:name "Metric B" :type :metric
                                         :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-test-user :rasta
        (let [result   (metric-math/compute-metric-math-tool
                        {:expression {:op "/" :operands [{:type "metric" :id (:id metric-a)}
                                                         {:type "metric" :id (:id metric-b)}]}
                         :breakout   {:field_id (mt/id :venues :price)}
                         :display    "line"
                         :title      "A over B"})
              part     (first (:data-parts result))
              structured (:structured-output result)]
          (is (= "metric_viz" (:data-type part)) (:output result))
          (is (= :arithmetic (:plan-type structured)))
          (testing "definition carries per-leaf projections and no metadata-provider"
            (let [definition (get-in part [:data :definition])]
              (is (= 2 (count (:projections definition))))
              (is (nil? (:metadata-provider definition)))
              (is (contains? definition :expression)))))))))

(deftest compute-metric-math-incompatible-breakout-test
  (testing "breaking out by a field absent from one metric returns a clean agent error, not a crash"
    ;; `users` and `venues` share no FK path, so a users field-id is not a reachable dimension on the
    ;; venues metric — the cross-leaf breakout must fail with an actionable message rather than crash.
    (mt/with-temp [:model/Card users-metric  {:name "Users metric" :type :metric
                                              :dataset_query (mt/mbql-query users {:aggregation [[:count]]})}
                   :model/Card venues-metric {:name "Venues metric" :type :metric
                                              :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-test-user :rasta
        (let [result (metric-math/compute-metric-math-tool
                      {:expression {:op "+" :operands [{:type "metric" :id (:id users-metric)}
                                                       {:type "metric" :id (:id venues-metric)}]}
                       :breakout   {:field_id (mt/id :users :name)}
                       :title      "mismatch"})
              output (:output result)]
          (is (nil? (:data-parts result)))
          (testing "the message names the field, the offending metric, and the cross-table constraint"
            (is (re-find #"(?i)can.t break out by field" output))
            (is (re-find #"Venues metric" output))
            (is (re-find #"(?i)different table" output))))))))

(deftest compute-metric-math-single-leaf-test
  (testing "a single metric with no breakout validates as a :leaf plan"
    (mt/with-temp [:model/Card metric {:name "Solo metric" :type :metric
                                       :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/with-test-user :rasta
        (let [result     (metric-math/compute-metric-math-tool
                          {:expression {:type "metric" :id (:id metric)} :title "solo"})
              structured (:structured-output result)]
          (is (= "metric_viz" (:data-type (first (:data-parts result)))))
          (is (= :leaf (:plan-type structured))))))))
