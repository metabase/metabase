(ns metabase-enterprise.osi-generation.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.osi-generation.candidates :as candidates]
   [metabase-enterprise.osi-generation.core :as core]
   [metabase-enterprise.osi-generation.generate :as generate]
   [metabase-enterprise.osi-generation.metrics :as metrics]
   [metabase-enterprise.osi-generation.settings :as settings]
   [metabase-enterprise.osi-generation.throttle :as throttle]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- candidate
  ([id] (candidate id nil))
  ([id existing]
   {:entity           {:entity_type "table", :entity_local_id id}
    :llm-input        {:entity-type "table", :name (str "Table " id)}
    :basis            {:name (str "Table " id)}
    :diff             (when existing {:changed [:name]})
    :existing-context existing
    :tier             (if existing 3 1)}))

(defn- run-with!
  [cands overrides]
  (let [events (atom [])
        defaults {#'candidates/candidates (fn [_ _] cands)
                  ;; empty budget so the caps don't bind unless a test opts in; window quota unset.
                  #'throttle/run-budget (constantly {})
                  #'throttle/window-budget (constantly nil)
                  #'metrics/record-candidate! (fn [& _])
                  #'metrics/record-run! (fn [& _])
                  #'metrics/record-error! (fn [& _])
                  #'settings/osi-generation-candidate-offset (constantly 0)
                  #'settings/osi-generation-candidate-offset! (fn [_])
                  #'generate/generate-context (constantly {:ai_context {:synonyms ["alias"]}
                                                           :generator-version "v-test"
                                                           :usage {:input-tokens 2, :output-tokens 1}})
                  #'core/source-basis-current? (constantly true)
                  #'core/insert-new! (fn [entity-type entity-local-id stamp]
                                       (swap! events conj [:insert (merge stamp
                                                                          {:entity_type entity-type
                                                                           :entity_local_id entity-local-id})
                                                           embedding/*embedding-request-source*])
                                       :generated)
                  #'mirror/request-entity-sync! (fn [& args] (swap! events conj [:nudge (vec args)]) nil)
                  #'entity-retrieval/force-reconcile! (fn []
                                                        (swap! events conj
                                                               [:reconcile embedding/*embedding-request-source*])
                                                        :reconciled)}]
    {:result (with-redefs-fn (merge defaults overrides) core/run-generation!)
     :events events}))

(deftest generated-write-and-reconcile-carry-embedding-source-test
  (let [{:keys [result events]} (run-with! [(candidate 1)] {})
        stored (second (first @events))]
    (is (= {:generated  1
            :restamped  0
            :skipped    0
            :errors     0
            :usage      {:input-tokens 2, :output-tokens 1}
            :candidates 1
            :pending    0
            :reconcile  :reconciled}
           result))
    (is (= {:ai_context           {:synonyms ["alias"]}
            :data_source          :metabot
            :basis                {:name "Table 1"}
            :basis_invalidated_at nil
            :generator_version    "v-test"
            :rewrite_requested_at nil}
           (dissoc stored :entity_type :entity_local_id :generated_at)))
    (testing "the write and trailing reconcile both inherit the generation attribution"
      (is (= [[:insert "osi-generation"] [:reconcile "osi-generation"]]
             (mapv (juxt first last) @events))))))

(deftest existing-row-write-is-a-full-selection-token-cas-test
  (let [selected-at (java.time.OffsetDateTime/parse "2026-01-02T03:04:05Z")
        where       (atom nil)
        existing    {:entity_type     "table"
                     :entity_local_id 1
                     :data_source     :metabot
                     :updated_at      selected-at
                     :invalidated_at  selected-at
                     :basis           {:name "Old"}}
        {:keys [result]} (run-with! [(candidate 1 existing)]
                                    {#'t2/update! (fn [_model clause _stamp]
                                                    (reset! where clause)
                                                    0)})]
    (is (= 1 (:skipped result)))
    (is (nil? (:reconcile result)))
    (is (= selected-at (:updated_at @where)))
    (is (= :metabot (:data_source @where)))))

(deftest explicit-human-rewrite-flips-ownership-on-write-test
  (let [selected-at (java.time.OffsetDateTime/parse "2026-01-02T03:04:05Z")
        update       (atom nil)
        existing     {:entity_type          "table"
                      :entity_local_id      1
                      :data_source          :human
                      :updated_at           selected-at
                      :generated_at         (.minusDays ^java.time.OffsetDateTime selected-at 1)
                      :rewrite_requested_at selected-at
                      :basis                {:name "Old"}}
        c            (assoc (candidate 1 existing) :rewrite-requested? true)
        {:keys [result]} (run-with! [c]
                                    {#'t2/update! (fn [_model clause stamp]
                                                    (reset! update [clause stamp])
                                                    1)})
        [where stamp] @update]
    (is (= 1 (:generated result)))
    (is (= :human (:data_source where))
        "the CAS matches the ownership that was selected")
    (is (= selected-at (:updated_at where)))
    (is (= selected-at (:rewrite_requested_at where))
        "the CAS matches the rewrite request that authorized the human overwrite")
    (is (= :metabot (:data_source stamp))
        "generated content becomes Metabot-owned")
    (is (nil? (:rewrite_requested_at stamp))
        "the fulfilled request is cleared")))

(deftest cleared-human-rewrite-request-prevents-writeback-test
  (let [selected-at (java.time.OffsetDateTime/parse "2026-01-02T03:04:05Z")
        where       (atom nil)
        existing    {:entity_type          "table"
                     :entity_local_id      1
                     :data_source          :human
                     :updated_at           selected-at
                     :generated_at         (.minusDays ^java.time.OffsetDateTime selected-at 1)
                     :rewrite_requested_at selected-at
                     :basis                {:name "Old"}}
        c           (assoc (candidate 1 existing) :rewrite-requested? true)
        {:keys [result]} (run-with! [c]
                                    {#'t2/update! (fn [_model clause _stamp]
                                                    (reset! where clause)
                                                    ;; Simulate a newer approval clearing the request through a
                                                    ;; direct path that retained the selected updated_at.
                                                    0)})]
    (is (= 1 (:skipped result)))
    (is (= selected-at (:updated_at @where)))
    (is (= selected-at (:rewrite_requested_at @where)))
    (is (nil? (:reconcile result)))))

(deftest human-row-without-pending-rewrite-is-not-overwritten-test
  (let [existing {:entity_type     "table"
                  :entity_local_id 1
                  :data_source     :human
                  :updated_at      (java.time.OffsetDateTime/parse "2026-01-02T03:04:05Z")
                  :basis           {:name "Old"}}
        {:keys [result]} (run-with! [(candidate 1 existing)]
                                    {#'t2/update! (fn [& _]
                                                    (throw (AssertionError. "human row overwritten")))})]
    (is (= 1 (:skipped result)))
    (is (nil? (:reconcile result)))))

(deftest source-change-during-generation-skips-stale-write-test
  (let [{:keys [result]} (run-with! [(candidate 1)]
                                    {#'core/source-basis-current? (constantly false)
                                     #'core/insert-new! (fn [& _]
                                                          (throw (AssertionError. "stale context written")))})]
    (is (= 1 (:skipped result)))
    (is (= {:input-tokens 2, :output-tokens 1} (:usage result))
        "the completed LLM call is still billed")
    (is (nil? (:reconcile result)))))

(deftest source-basis-is-reloaded-immediately-before-write-test
  (let [candidate (candidate 1)]
    (mt/with-dynamic-fn-redefs [spec/member-entity (fn [& _] {:entity_type "table"
                                                              :entity_local_id 1
                                                              :name "Table 1"})
                                spec/hydrate (fn [_ entities] entities)
                                spec/entity-basis (fn [_ entity] (select-keys entity [:name]))]
      (is (true? (#'core/source-basis-current? candidate)))
      (is (false? (#'core/source-basis-current?
                   (assoc candidate :basis {:name "Before the LLM call"})))))))

(deftest empty-diff-restamps-without-generating-or-reconciling-test
  (let [invalidated (java.time.OffsetDateTime/parse "2026-01-02T03:04:05Z")
        update      (atom nil)
        existing    {:entity_type     "table"
                     :entity_local_id 1
                     :data_source     :metabot
                     :updated_at      invalidated
                     :invalidated_at  invalidated
                     :basis           {:name "Same"}}
        c            (assoc (candidate 1 existing) :tier 2 :diff nil)
        {:keys [result]} (run-with! [c]
                                    {#'generate/generate-context (fn [_] (throw (AssertionError. "LLM called")))
                                     #'t2/update! (fn [_model key values]
                                                    (reset! update [key values])
                                                    1)})]
    (is (= 1 (:restamped result)))
    (is (nil? (:reconcile result)))
    (is (= [{:entity_type "table", :entity_local_id 1}
            {:basis_invalidated_at invalidated}]
           @update))))

(deftest empty-generation-converges-test
  (testing "an all-blank generation still writes an empty ai_context with the basis stamp — the row
           converges instead of being re-selected and re-billed every run"
    (let [{:keys [result events]} (run-with! [(candidate 1)]
                                             {#'generate/generate-context
                                              (constantly {:ai_context {}
                                                           :generator-version "v-test"
                                                           :usage {:input-tokens 2, :output-tokens 1}})})
          stored (second (first @events))]
      (is (= {:generated  1
              :restamped  0
              :skipped    0
              :errors     0
              :usage      {:input-tokens 2, :output-tokens 1}
              :candidates 1
              :pending    0
              :reconcile  :reconciled}
             result))
      (is (= {:ai_context        {}
              :basis             {:name "Table 1"}
              :generator_version "v-test"}
             (select-keys stored [:ai_context :basis :generator_version]))))))

(deftest candidate-failure-is-isolated-and-its-usage-is-accounted-test
  (let [{:keys [result]} (run-with! (mapv candidate [1 2 3])
                                    {#'generate/generate-context
                                     (fn [{:keys [entity]}]
                                       (if (= 2 (:entity_local_id entity))
                                         (throw (ex-info "invalid" {:usage {:input-tokens 5, :output-tokens 7}}))
                                         {:ai_context {:synonyms ["alias"]}
                                          :generator-version "v-test"
                                          :usage {:input-tokens 2, :output-tokens 1}}))})]
    (is (= 2 (:generated result)))
    (is (= 1 (:errors result)))
    (is (= {:input-tokens 9, :output-tokens 9} (:usage result)))
    (is (= :reconciled (:reconcile result)))))

(deftest interruption-and-fatal-errors-are-not-isolated-test
  (testing "a wrapped interruption stops before another paid call and restores the thread flag"
    (let [calls  (atom 0)
          thrown (try
                   (run-with! (mapv candidate [1 2 3])
                              {#'generate/generate-context
                               (fn [_]
                                 (swap! calls inc)
                                 (throw (ex-info "provider wrapper" {}
                                                 (InterruptedException. "cancelled"))))})
                   nil
                   (catch Exception e e))
          interrupted? (.isInterrupted (Thread/currentThread))]
      (Thread/interrupted)
      (is (instance? clojure.lang.ExceptionInfo thrown))
      (is (= 1 @calls))
      (is interrupted?)))
  (testing "a fatal JVM error propagates instead of consuming the candidate error budget"
    (let [calls (atom 0)]
      (is (thrown-with-msg? LinkageError #"fatal"
                            (run-with! (mapv candidate [1 2 3])
                                       {#'generate/generate-context
                                        (fn [_]
                                          (swap! calls inc)
                                          (throw (LinkageError. "fatal")))})))
      (is (= 1 @calls)))))

(deftest wrapped-fatal-error-is-not-isolated-test
  (testing "a fatal error hidden under ordinary provider wrappers still terminates the run"
    (let [calls (atom 0)]
      (is (thrown-with-msg? LinkageError #"fatal"
                            (run-with! (mapv candidate [1 2 3])
                                       {#'generate/generate-context
                                        (fn [_]
                                          (swap! calls inc)
                                          (throw (ex-info "provider wrapper" {}
                                                          (LinkageError. "fatal"))))})))
      (is (= 1 @calls)))))

(deftest write-back-failure-does-not-lose-billed-usage-test
  (testing "a write failure after the LLM call still lands the call's usage in the run summary"
    (let [{:keys [result]} (run-with! (mapv candidate [1 2])
                                      {#'core/insert-new!
                                       (fn [_entity-type entity-local-id _stamp]
                                         (if (= 2 entity-local-id)
                                           (throw (ex-info "write refused" {}))
                                           :generated))})]
      (is (= {:generated  1
              :restamped  0
              :skipped    0
              :errors     1
              :usage      {:input-tokens 4, :output-tokens 2}
              :candidates 2
              :pending    0
              :reconcile  :reconciled}
             result)))))

(deftest candidate-construction-failure-is-isolated-test
  (let [failed (assoc (candidate 1) :candidate-error (ex-info "bad projection" {}))
        {:keys [result]} (run-with! [failed (candidate 2)] {})]
    (is (= 1 (:errors result)))
    (is (= 1 (:generated result)))
    (is (= 2 (:candidates result)))))

(deftest entity-cap-uses-one-sentinel-to-report-a-nonzero-backlog-test
  (testing "an entity cap of 2 over 3 eligible processes 2, asks for the cap + error budget + one sentinel,
           and reports pending 1"
    (let [requested-limit (atom nil)
          run-summary     (atom nil)
          cands           (mapv candidate [1 2 3])
          {:keys [result]} (run-with! cands
                                      {#'core/max-errors-per-run 5
                                       #'throttle/run-budget (constantly {:max-entities 2})
                                       #'candidates/candidates (fn [limit _offset]
                                                                 (reset! requested-limit limit)
                                                                 cands)
                                       #'metrics/record-run! (fn [summary _pending]
                                                               (reset! run-summary summary))})]
      (is (= 8 @requested-limit) "processing cap 2 + error budget 5 + one sentinel")
      (is (= 3 (:candidates result)))
      (is (= 1 (:pending result)))
      (is (= 2 (:generated result)))
      (is (= :entities (:stopped-by @run-summary))))))

(deftest candidate-construction-failures-do-not-consume-the-entity-cap-test
  (testing "cap 2 with 3 malformed candidates ordered ahead: pre-processing errors spend their own budget,
           so the healthy candidate behind them is still processed"
    (let [failing (mapv #(assoc (candidate %) :candidate-error (ex-info "corrupt row" {})) [1 2 3])
          {:keys [result]} (run-with! (conj failing (candidate 4))
                                      {#'throttle/run-budget (constantly {:max-entities 2})})]
      (is (= {:generated 1, :errors 3, :pending 0}
             (select-keys result [:generated :errors :pending]))))))

(deftest failed-generation-consumes-the-entity-cap-test
  (testing "a failed LLM attempt consumes the cap, so cap 1 cannot make many billed calls"
    (let [{:keys [result]} (run-with! (mapv candidate [1 2 3])
                                      {#'throttle/run-budget (constantly {:max-entities 1})
                                       #'generate/generate-context
                                       (fn [_]
                                         (throw (ex-info "provider failed"
                                                         {:usage {:input-tokens 5 :output-tokens 0}})))})]
      (is (= {:generated 0, :errors 1, :pending 2
              :usage {:input-tokens 5, :output-tokens 0}}
             (select-keys result [:generated :errors :pending :usage]))))))

(deftest error-budget-bounds-a-run-of-corrupt-candidates-test
  (testing "the error budget stops the run instead of churning every corrupt row; the rest count pending"
    (let [cands (mapv #(assoc (candidate %) :candidate-error (ex-info "corrupt row" {})) [1 2 3 4])
          {:keys [result]} (run-with! cands {#'core/max-errors-per-run 2})]
      (is (= {:errors 2, :generated 0, :pending 2, :reconcile nil}
             (select-keys result [:errors :generated :pending :reconcile]))))))

(deftest candidate-offset-advances-past-every-examined-candidate-test
  (let [seen    (atom nil)
        stored  (atom nil)
        failing (mapv #(assoc (candidate %) :candidate-error (ex-info "corrupt row" {})) [1 2 3])]
    (run-with! failing
               {#'core/max-errors-per-run 2
                #'settings/osi-generation-candidate-offset (constantly 17)
                #'settings/osi-generation-candidate-offset! #(reset! stored %)
                #'candidates/candidates (fn [_limit offset]
                                          (reset! seen offset)
                                          failing)})
    (is (= 17 @seen))
    (is (= 19 @stored) "the cursor skips both corrupt candidates examined before the error cap")))

(deftest token-cap-stops-mid-run-and-counts-the-rest-as-pending-test
  (testing "a token cap reached after the first call stops the loop and reports the unprocessed remainder as pending"
    (let [run-summary (atom nil)
          {:keys [result]} (run-with! (mapv candidate [1 2 3])
                                      {#'throttle/run-budget (constantly {:max-tokens 2})
                                       #'metrics/record-run! (fn [summary _pending]
                                                               (reset! run-summary summary))})]
      (is (= 1 (:generated result)) "the first call overshoots the soft cap; the second is refused")
      (is (= 2 (:pending result)))
      (is (= :reconciled (:reconcile result)) "reconcile still fires — one row was written")
      (is (= :tokens (:stopped-by @run-summary))))))

(deftest remaining-window-allowance-constrains-the-run-token-budget-test
  (testing "a run starting one token below the hourly quota stops after one soft-overshooting candidate"
    (let [{:keys [result]} (run-with! (mapv candidate [1 2])
                                      {#'throttle/run-budget (constantly {:max-tokens 500000})
                                       #'throttle/window-budget
                                       (constantly {:window :hour :remaining-tokens 1 :exhausted? false})})]
      (is (= 1 (:generated result)))
      (is (= 1 (:pending result))))))

(deftest selection-failure-is-counted-as-a-run-error-test
  (let [errors (atom [])]
    (mt/with-dynamic-fn-redefs [throttle/window-budget (constantly nil)
                                throttle/run-budget (constantly {})
                                candidates/candidates (fn [_ _] (throw (ex-info "selection failed" {})))
                                metrics/record-error! #(swap! errors conj %)]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"selection failed" (core/run-generation!))))
    (is (= [:run-failed] @errors))))

(deftest window-quota-blocks-the-run-before-selection-test
  (testing "a persistent hourly token quota already spent no-ops the run, without reaching candidate selection"
    (mt/with-temporary-setting-values [osi-generation-max-tokens-per-hour 500]
      (let [row (t2/insert-returning-instance! :model/AiUsageLog
                                               {:source            "osi-generation"
                                                :model             "test-model"
                                                :prompt_tokens     600
                                                :completion_tokens 0
                                                :total_tokens      600
                                                :created_at        (java.time.OffsetDateTime/now)})]
        (try
          (mt/with-dynamic-fn-redefs [candidates/candidates
                                      (fn [_ _] (throw (AssertionError. "selection reached despite exhausted quota")))
                                      metrics/record-run! (fn [& _])
                                      metrics/record-error! (fn [& _])]
            (is (= :hour (:window-quota-exhausted (core/run-generation!)))))
          (finally
            (t2/delete! :model/AiUsageLog :id (:id row))))))))
