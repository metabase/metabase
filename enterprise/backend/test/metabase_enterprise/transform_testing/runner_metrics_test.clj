(ns metabase-enterprise.transform-testing.runner-metrics-test
  (:require
   [clojure.test :refer :all]
   [iapetos.core :as prometheus]
   [metabase-enterprise.transform-testing.api :as api.transform-testing]
   [metabase-enterprise.transform-testing.errors :as errors]
   [metabase-enterprise.transform-testing.executor :as executor]
   [metabase-enterprise.transform-testing.metrics :as metrics]
   [metabase-enterprise.transform-testing.run-tracking :as run-tracking]
   [metabase-enterprise.transform-testing.runner :as runner]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.prometheus :as analytics.prometheus]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.events.core :as events]
   [metabase.run-tracking.core :as rt]
   [metabase.test :as mt])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

(driver/register! ::metrics-test :abstract? true)

(defmethod driver/do-with-test-connection ::metrics-test
  [_ database f]
  (when-let [failure (:connection-error database)]
    (throw failure))
  (f :connection))

(defn- exercise-run!
  [{:keys [status warehouse-error metrics-error connection-error cleanup-error validation-error] :or {status :passed}}]
  (let [events (atom [])
        now (Instant/now)
        expectation (cond-> {:type :empty :name "check" :status status}
                      (= status :failed) (assoc :columns [] :sample [] :truncated 0)
                      (= status :error) (assoc :error {:message "query failed" :type ::errors/expectation-failed}))
        metric! (fn [& args]
                  (swap! events conj (into [:metric] args))
                  (when metrics-error (throw metrics-error)))]
    (mt/with-dynamic-fn-redefs
      [runner/validated-plan (fn [& _]
                               (when validation-error (throw validation-error))
                               {:driver ::metrics-test :database {:connection-error connection-error}
                                :input->table {{} "input"} :output-table "output"
                                :labels {} :replacements {} :compiled {}})
       run-tracking/start-run! (fn [id user-id] (swap! events conj [:start id user-id]) {:id 9})
       run-tracking/finish-run! (fn [id outcome] (swap! events conj [:finish id outcome]))
       runner/create-inputs! (fn [& _])
       runner/create-output! (fn [& _] (when warehouse-error (throw warehouse-error)))
       runner/check-expectations (fn [& _] [expectation])
       executor/drop-temp-table! (fn [_ _ table]
                                   (swap! events conj [:drop table])
                                   (when cleanup-error (throw cleanup-error)))
       analytics/inc! metric!
       analytics/observe! metric!]
      (binding [api/*current-user-id* 3]
        (let [result (try
                       (runner/run-transform-test!
                        {:id 1 :entity_id "metrics-test" :transform_id 2 :creator_id 3 :name "metrics"
                         :description nil :inputs [] :expectations [] :created_at now :updated_at now})
                       (catch Throwable e e))]
          {:result result :events @events})))))

(deftest metrics-preserve-run-tracking-test
  (doseq [status [:passed :failed]]
    (let [{:keys [result events]} (exercise-run! {:status status})]
      (is (= status (:status result)))
      (is (= [:start 1 3] (first events)))
      (is (= [:metric :metabase-transform-test/runs-started {:driver ::metrics-test}] (second events)))
      (is (= [[:drop "output"] [:drop "input"]] (filterv #(= :drop (first %)) events)))
      (is (= [:finish 9 status] (last events)))
      (is (some #{[:metric :metabase-transform-test/runs {:driver ::metrics-test :status status}]} events))
      (is (some #{[:metric :metabase-transform-test/expectations
                   {:driver ::metrics-test :type :empty :status status}]} events))
      (let [duration (first (filter #(= :metabase-transform-test/run-duration-ms (second %)) events))]
        (is (= {:driver ::metrics-test} (nth duration 2)))
        (is (<= 0 (nth duration 3)))))))

(deftest metrics-failure-does-not-break-finalization-test
  (let [{:keys [result events]} (exercise-run! {:metrics-error (ex-info "metrics unavailable" {})})]
    (is (= :passed (:status result)))
    (is (= [:finish 9 :passed] (last events)))))

(deftest warehouse-failure-still-cleans-up-and-finalizes-test
  (let [failure (ex-info "warehouse unavailable" {})
        {:keys [result events]} (exercise-run! {:warehouse-error failure})]
    (is (identical? failure result))
    (is (= [[:start 1 3] [:drop "output"] [:drop "input"] [:finish 9 :error]]
           (filterv #(not= :metric (first %)) events)))
    (is (some #{[:metric :metabase-transform-test/runs {:driver ::metrics-test :status :error}]} events))))

(deftest duration-metric-accepts-driver-label-test
  (let [collector (first (filter #(and (= "metabase_transform_test" (:namespace %))
                                       (= "run_duration_ms" (:name %)))
                                 (#'analytics.prometheus/product-collectors)))
        registry (prometheus/register (prometheus/collector-registry "transform-test-metrics-test") collector)]
    (is (some? (prometheus/observe registry :metabase-transform-test/run-duration-ms {:driver "postgres"} 12)))))

(deftest execution-errors-record-start-and-completion-once-test
  (doseq [failure-point [:connection-error :warehouse-error :cleanup-error]]
    (let [failure (ex-info "execution failed" {:error-type ::errors/setup-failed})
          {:keys [result events]} (exercise-run! {failure-point failure})]
      (is (identical? failure result))
      (is (= [[:metric :metabase-transform-test/runs {:driver ::metrics-test :status :error}]]
             (filterv #(= :metabase-transform-test/runs (second %)) events)))
      (is (= 1 (count (filter #(= :metabase-transform-test/run-duration-ms (second %)) events))))
      (is (= [[:metric :metabase-transform-test/runs-started {:driver ::metrics-test}]]
             (filterv #(= :metabase-transform-test/runs-started (second %)) events)))
      (is (empty? (filter #(= :metabase-transform-test/refusals (second %)) events)))
      (is (= [:finish 9 :error] (last events))))))

(deftest expectation-errors-have-distinct-metric-outcome-test
  (let [{:keys [result events]} (exercise-run! {:status :error})]
    (is (= :failed (:status result)))
    (is (= [:finish 9 :failed] (last events)))
    (is (some #{[:metric :metabase-transform-test/runs {:driver ::metrics-test :status :error}]} events))
    (is (some #{[:metric :metabase-transform-test/expectations
                 {:driver ::metrics-test :type :empty :status :error}]} events))))

(deftest validation-refusals-never-start-a-run-test
  (doseq [operation [:create :update :run]]
    (let [failure (ex-info "invalid input" {:error-type ::errors/unused-inputs})
          {:keys [result events]} (binding [metrics/*operation* operation]
                                    (exercise-run! {:validation-error failure}))]
      (is (identical? failure result))
      (is (= [[:metric :metabase-transform-test/refusals
               {:operation operation :error-code "transform-test.unused-inputs"}]] events)))))

(deftest orphaned-runs-count-even-if-event-publishing-fails-test
  (let [recorded (atom [])
        batches (atom [[{:id 1} {:id 2}] []])]
    (mt/with-dynamic-fn-redefs [rt/reap-orphaned! (fn [_] (let [batch (first @batches)] (swap! batches rest) batch))
                                analytics/inc! #(swap! recorded conj %)
                                events/publish-event! (fn [& _] (throw (ex-info "event failed" {})))]
      (is (= [{:id 1} {:id 2}] (run-tracking/reap-orphaned-runs! 5)))
      (is (= [] (run-tracking/reap-orphaned-runs! 5)))
      (is (= [:metabase-transform-test/runs-orphaned :metabase-transform-test/runs-orphaned] @recorded)))))

(deftest phase-timings-cover-success-and-failure-test
  (doseq [[options phases] [[{} #{:connection :setup :transform :expectations :cleanup}]
                            [{:warehouse-error (ex-info "failed" {})} #{:connection :setup :transform :cleanup}]
                            [{:connection-error (ex-info "failed" {})} #{:connection}]]]
    (let [{:keys [events]} (exercise-run! options)
          timings (filter #(= :metabase-transform-test/phase-duration-ms (second %)) events)]
      (is (= phases (set (map #(get-in % [2 :phase]) timings))))
      (is (= (count phases) (count timings)))
      (is (every? #(<= 0 (nth % 3)) timings)))))

(deftest collectors-accept-all-instrumentation-labels-test
  (let [collectors (filter #(= "metabase_transform_test" (:namespace %))
                           (#'analytics.prometheus/product-collectors))
        registry (apply prometheus/register (prometheus/collector-registry "transform-metrics") collectors)]
    (doseq [status ["passed" "failed" "error"]]
      (prometheus/inc registry :metabase-transform-test/runs {:driver "postgres" :status status})
      (is (= 1.0 (prometheus/value registry :metabase-transform-test/runs {:driver "postgres" :status status}))))
    (prometheus/inc registry :metabase-transform-test/runs-started {:driver "postgres"})
    (is (= 1.0 (prometheus/value registry :metabase-transform-test/runs-started {:driver "postgres"})))
    (is (some? (prometheus/inc registry :metabase-transform-test/runs-orphaned)))
    (doseq [operation ["create" "update" "run"]]
      (is (some? (prometheus/inc registry :metabase-transform-test/refusals
                                 {:operation operation :error-code "transform-test.unused-inputs"}))))
    (doseq [phase ["connection" "setup" "transform" "expectations" "cleanup"]]
      (is (some? (prometheus/observe registry :metabase-transform-test/phase-duration-ms
                                     {:driver "postgres" :phase phase} 12))))))

(deftest telemetry-failures-preserve-original-exceptions-test
  (doseq [failure-point [:validation-error :connection-error :warehouse-error :cleanup-error]]
    (let [failure (ex-info "original failure" {:error-type ::errors/setup-failed})
          {:keys [result]} (exercise-run! {failure-point failure :metrics-error (ex-info "metrics failed" {})})]
      (is (identical? failure result)))))

(deftest api-validation-operation-and-error-response-test
  (doseq [operation [:create :update :run]]
    (let [recorded (atom [])
          failure (ex-info "unused input" {:error-type ::errors/unused-inputs})
          result (mt/with-dynamic-fn-redefs [analytics/inc! (fn [& args] (swap! recorded conj args))]
                   (try
                     (#'api.transform-testing/refusing operation #(metrics/validate! (fn [] (throw failure))))
                     (catch clojure.lang.ExceptionInfo e e)))]
      (is (= 400 (:status-code (ex-data result))))
      (is (= "transform-test.unused-inputs" (:error-code (ex-data result))))
      (is (= [[:metabase-transform-test/refusals
               {:operation operation :error-code "transform-test.unused-inputs"}]] @recorded)))))

(deftest concurrent-run-fixtures-do-not-share-replacements-test
  (let [connection-method (get-method driver/do-with-test-connection :postgres)
        runs (mapv (fn [status] (future (exercise-run! {:status status}))) [:passed :failed :error])]
    (doseq [[status run] (map vector [:passed :failed :error] runs)]
      (let [{:keys [result events]} (deref run 5000 {})]
        (is (= (if (= status :error) :failed status) (:status result)))
        (is (= [[:metric :metabase-transform-test/runs-started {:driver ::metrics-test}]]
               (filterv #(= :metabase-transform-test/runs-started (second %)) events)))
        (is (= [[:metric :metabase-transform-test/runs {:driver ::metrics-test :status status}]]
               (filterv #(= :metabase-transform-test/runs (second %)) events)))))
    (is (identical? connection-method (get-method driver/do-with-test-connection :postgres)))))
