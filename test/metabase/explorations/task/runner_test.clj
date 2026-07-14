(ns metabase.explorations.task.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.explorations.task.runner :as runner]
   [metabase.explorations.timeline-interestingness :as explorations.timeline-interestingness]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.scope]
   [metabase.metabot.self.claude]
   [metabase.metabot.usage]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(def ^:private run-one-iteration! #'runner/run-one-iteration!)

(defn- temp-thread!
  ([user-id] (temp-thread! user-id nil))
  ([user-id prompt]
   (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                            {:name "runner-test"
                                                             :creator_id user-id}))]
     (first (t2/insert-returning-instances! :model/ExplorationThread
                                            (cond-> {:exploration_id (:id exploration)
                                                     :position       0}
                                              prompt (assoc :prompt prompt)))))))

(defn- thread-page!
  "Create a minimal ExplorationBlock + ExplorationPage for `thread-id` and return the page id.
  Query rows require a non-null page_id (FK to exploration_page)."
  [thread-id card-id]
  (let [block-id (t2/insert-returning-pk! :model/ExplorationBlock
                                          {:exploration_thread_id thread-id})]
    (t2/insert-returning-pk! :model/ExplorationPage
                             {:exploration_block_id block-id
                              :card_id              card-id
                              :dimension_id         "d1"
                              :query_type           "default"})))

(defn- pending-query!
  [thread-id card-id mbql]
  (first (t2/insert-returning-instances! :model/ExplorationQuery
                                         {:exploration_thread_id thread-id
                                          :card_id               card-id
                                          :database_id           (mt/id)
                                          :page_id               (thread-page! thread-id card-id)
                                          :dimension_id          "d1"
                                          :dataset_query         mbql
                                          :status                "pending"
                                          :position              0})))

(defn- drain-until-terminal!
  "Repeatedly call `run-one-iteration!` until the row with `row-id` reaches a terminal state, or
  `max-iters` is exhausted. Necessary because other concurrent tests may have their own pending
  rows that get processed first."
  [row-id max-iters]
  (loop [n max-iters]
    (when (zero? n)
      (throw (ex-info "ran out of iterations waiting for row" {:row-id row-id})))
    (run-one-iteration!)
    (let [r (t2/select-one :model/ExplorationQuery :id row-id)]
      (if (#{"done" "error"} (:status r))
        r
        (recur (dec n))))))

(defn- stored-result-for
  "Fetch the stored_result row linked from the EQR for `eq-id`. Returns nil when nothing
  exists yet."
  [eq-id]
  (eqr/stored-results eq-id))

(deftest run-one-iteration-happy-path-test
  (testing "A pending row gets executed, the linked stored_result holds result_data, and status flips to done"
    (mt/with-temp [:model/User u {:email "happy@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
            final  (drain-until-terminal! (:id row) 10)
            result (t2/select-one :model/ExplorationQueryResult
                                  :exploration_query_id (:id row))
            sr     (stored-result-for (:id row))]
        (is (= "done" (:status final)))
        (is (some? (:started_at final)))
        (is (some? (:finished_at final)))
        (is (nil? (:error_message final)))
        (is (some? result))
        (is (some? (:stored_result_id result)))
        (is (some? sr))
        (is (pos? (count (:result_data sr))))))))

(deftest run-one-iteration-records-stored-result-use-test
  (testing "Running a query records a stored_result_use row tying the snapshot to the exploration"
    (mt/with-temp [:model/User u {:email "sruse@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread  (temp-thread! (:id u))
            expl-id (t2/select-one-fn :exploration_id :model/ExplorationThread :id (:id thread))
            row     (pending-query! (:id thread) (:id card)
                                    (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
            _       (drain-until-terminal! (:id row) 10)
            sr-id   (:stored_result_id (t2/select-one :model/ExplorationQueryResult
                                                      :exploration_query_id (:id row)))
            use-row (t2/select-one :model/StoredResultUse :stored_result_id sr-id)]
        (is (some? use-row))
        (is (= expl-id (:exploration_id use-row)))
        (is (nil? (:card_id use-row)))))))

(deftest run-one-iteration-writes-interestingness-score-test
  (testing "A 2-column result gets scored and the score lands on the result row"
    (mt/with-temp [:model/User u {:email "score@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))
            _      (drain-until-terminal! (:id row) 10)
            result (t2/select-one :model/ExplorationQueryResult
                                  :exploration_query_id (:id row))
            score  (:interestingness_score result)]
        (is (some? result))
        (is (double? score))
        (is (<= 0.0 score 1.0))))))

(deftest run-one-iteration-survives-scoring-failure-test
  (testing "A scoring exception leaves the row done with a nil score; the result blob is still written"
    (mt/with-temp [:model/User u {:email "scorefail@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))]
        (mt/with-dynamic-fn-redefs [explorations.interestingness/qp-result->chart-config
                                    (fn [& _] (throw (ex-info "boom" {})))]
          (let [final  (drain-until-terminal! (:id row) 10)
                result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))
                sr     (stored-result-for (:id row))]
            (is (= "done" (:status final)))
            (is (some? result))
            (is (some? sr))
            (is (pos? (count (:result_data sr))))
            (is (nil? (:interestingness_score result)))))))))

(deftest run-one-iteration-writes-contextual-score-test
  (testing "When the thread has a prompt and the lego returns a score, it lands on the result row"
    (mt/with-temp [:model/User u {:email "ctx-score@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u) "Why are venue counts dropping in this region?")
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))]
        (mt/with-dynamic-fn-redefs [contextual-interestingness/score-and-describe-chart
                                    (fn [_inputs] {:score 0.73})]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (= 0.73 (:contextual_interestingness_score result)))))))))

(deftest run-one-iteration-skips-contextual-when-prompt-blank-test
  (testing "Threads with no prompt → contextual_interestingness_score is nil and the lego is not called"
    (mt/with-temp [:model/User u {:email "ctx-noprompt@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))
            calls  (atom 0)]
        (mt/with-dynamic-fn-redefs [contextual-interestingness/score-and-describe-chart
                                    (fn [_inputs] (swap! calls inc) {:score 0.99})]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (nil? (:contextual_interestingness_score result)))
            (is (zero? @calls) "lego must not be called when the thread has no prompt")))))))

(deftest run-one-iteration-survives-contextual-failure-test
  (testing "A throwing contextual scorer leaves the row done, heuristic still scored, contextual nil"
    (mt/with-temp [:model/User u {:email "ctx-throw@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u) "anything")
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))]
        (mt/with-dynamic-fn-redefs [contextual-interestingness/score-and-describe-chart
                                    (fn [& _] (throw (ex-info "boom" {})))]
          (let [final  (drain-until-terminal! (:id row) 10)
                result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))
                sr     (stored-result-for (:id row))]
            (is (= "done" (:status final)))
            (is (some? result))
            (is (some? sr))
            (is (pos? (count (:result_data sr))))
            (is (nil? (:contextual_interestingness_score result)))
            (is (double? (:interestingness_score result))
                "heuristic score still computed when contextual fails")))))))

(deftest run-one-iteration-skips-contextual-without-other-tools-permission-test
  (testing "When the exploration creator lacks :permission/metabot-other-tools, the
            permission check inside metabot.self/call-llm-structured-with-trace throws,
            score-and-describe-chart catches and returns nil, and the EQR row's
            contextual fields land nil (UXW-4126)"
    (mt/with-temp [:model/User u {:email "ctx-noperm@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u) "Some prompt about venues")
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))
            llm-calls (atom 0)]
        (mt/with-dynamic-fn-redefs [metabase.metabot.scope/resolve-user-permissions
                                    (fn [_uid] {:permission/metabot                :yes
                                                :permission/metabot-sql-generation :yes
                                                :permission/metabot-nlq            :yes
                                                :permission/metabot-other-tools    :no})
                                    metabase.metabot.self.claude/claude
                                    (fn [& _] (swap! llm-calls inc) [])]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (zero? @llm-calls)
                "LLM must not be invoked when creator lacks :permission/metabot-other-tools")
            (is (nil? (:contextual_interestingness_score result)))
            (is (nil? (:metric_description result)))
            (is (nil? (:chart_description result)))))))))

(deftest run-one-iteration-skips-contextual-without-base-metabot-permission-test
  (testing "When the creator has metabot-other-tools but lacks the base :permission/metabot, scoring is still skipped"
    (mt/with-temp [:model/User u {:email "ctx-nobase@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u) "Some prompt")
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))
            llm-calls (atom 0)]
        (mt/with-dynamic-fn-redefs [metabase.metabot.scope/resolve-user-permissions
                                    (fn [_uid] {:permission/metabot                :no
                                                :permission/metabot-sql-generation :yes
                                                :permission/metabot-nlq            :yes
                                                :permission/metabot-other-tools    :yes})
                                    metabase.metabot.self.claude/claude
                                    (fn [& _] (swap! llm-calls inc) [])]
          (drain-until-terminal! (:id row) 10)
          (is (zero? @llm-calls)
              "LLM must not be invoked when creator lacks base :permission/metabot"))))))

(deftest run-one-iteration-skips-contextual-when-usage-limit-reached-test
  (testing "When check-usage-limits! returns a limit message, the usage check inside
            metabot.self/call-llm-structured-with-trace throws and the contextual fields
            land nil (UXW-4126)"
    (mt/with-temp [:model/User u {:email "ctx-limit@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u) "Some prompt about venues")
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)) (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))))
            llm-calls (atom 0)]
        (mt/with-dynamic-fn-redefs [metabase.metabot.usage/check-usage-limits!
                                    (fn [] "you've hit your AI usage limit")
                                    metabase.metabot.self.claude/claude
                                    (fn [& _] (swap! llm-calls inc) [])]
          (drain-until-terminal! (:id row) 10)
          (let [result (t2/select-one :model/ExplorationQueryResult
                                      :exploration_query_id (:id row))]
            (is (zero? @llm-calls)
                "LLM must not be invoked when usage limit is reached")
            (is (nil? (:contextual_interestingness_score result)))))))))

(deftest run-one-iteration-error-path-test
  (testing "A row whose query blows up is marked error, no result row is written"
    (mt/with-temp [:model/User u {:email "err@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   {:database 999999 :type :query
                                    :query {:source-table 1 :aggregation [[:count]]}})
            final  (drain-until-terminal! (:id row) 10)]
        (is (= "error" (:status final)))
        (is (some? (:error_message final)))
        (is (some? (:finished_at final)))
        (is (zero? (t2/count :model/ExplorationQueryResult
                             :exploration_query_id (:id row))))))))

(defn- store-fake-result!
  [query-id qp-result]
  (let [bytes (qp/do-with-serialization
               (fn [in result-fn]
                 (in qp-result)
                 (result-fn)))
        sr-id (first
               (t2/insert-returning-pks!
                :model/StoredResult
                {:result_data bytes}))]
    (t2/insert! :model/ExplorationQueryResult
                {:exploration_query_id query-id
                 :stored_result_id     sr-id})))

(defn- done-query-with-fake-result!
  [thread-id card-id]
  (let [q (first (t2/insert-returning-instances!
                  :model/ExplorationQuery
                  {:exploration_thread_id thread-id
                   :card_id               card-id
                   :database_id           (mt/id)
                   :page_id               (thread-page! thread-id card-id)
                   :dimension_id          "d1"
                   :dataset_query         (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))
                   :status                "done"
                   :position              0}))]
    (store-fake-result! (:id q) {:status :completed
                                 :data   {:cols [{:name "x"} {:name "y"}]
                                          :rows [["a" 1] ["b" 2]]}})
    q))

(deftest timeline-iteration-claims-and-scores-pair-test
  (testing "When a thread-selected timeline has no score for a done query, the worker scores it"
    (mt/with-temp [:model/User u {:email "ti-runner-claim@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (mt/with-dynamic-fn-redefs [explorations.timeline-interestingness/score-query-timeline
                                    (fn [_ _] 0.71)]
          (run-one-iteration!)
          ;; If the iteration picked up a different unrelated row first (e.g. a leftover
          ;; pending query from another test), drain a few more times until ours is scored.
          (loop [n 5]
            (when (and (pos? n)
                       (zero? (t2/count :model/ExplorationQueryTimelineInterestingness
                                        :exploration_query_id (:id q)
                                        :timeline_id (:id tl))))
              (run-one-iteration!)
              (recur (dec n)))))
        (let [scored (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                    :exploration_query_id (:id q)
                                    :timeline_id (:id tl))]
          (is (some? scored))
          (is (= 0.71 (:interestingness_score scored)))
          (is (some? (:scored_at scored))))))))

(deftest timeline-iteration-records-nil-on-scorer-failure-test
  (testing "If the scorer throws or returns nil, scored_at is still set so we don't retry forever"
    (mt/with-temp [:model/User u {:email "ti-runner-fail@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (mt/with-dynamic-fn-redefs [explorations.timeline-interestingness/score-query-timeline
                                    (fn [_ _] (throw (ex-info "boom" {})))]
          (run-one-iteration!)
          (loop [n 5]
            (when (and (pos? n)
                       (zero? (t2/count :model/ExplorationQueryTimelineInterestingness
                                        :exploration_query_id (:id q)
                                        :timeline_id (:id tl))))
              (run-one-iteration!)
              (recur (dec n)))))
        (let [scored (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                    :exploration_query_id (:id q)
                                    :timeline_id (:id tl))]
          (is (some? scored))
          (is (nil? (:interestingness_score scored)))
          (is (some? (:scored_at scored))))))))

(deftest timeline-iteration-is-idempotent-test
  (testing "Once a (query, timeline) pair is scored, subsequent iterations don't duplicate it"
    (mt/with-temp [:model/User u {:email "ti-runner-idem@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))
            _link  (t2/insert! :model/ExplorationThreadTimeline
                               {:exploration_thread_id (:id thread)
                                :timeline_id           (:id tl)
                                :position              0})]
        (mt/with-dynamic-fn-redefs [explorations.timeline-interestingness/score-query-timeline
                                    (fn [_ _] 0.5)]
          (dotimes [_ 6] (run-one-iteration!)))
        (is (= 1 (t2/count :model/ExplorationQueryTimelineInterestingness
                           :exploration_query_id (:id q)
                           :timeline_id (:id tl))))))))

(deftest timeline-iteration-reclaims-stale-rows-test
  (testing "A claim row left in the in-flight state (scored_at=NULL) past the cutoff is reclaimed and re-scored"
    (mt/with-temp [:model/User u {:email "ti-runner-stale@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread     (temp-thread! (:id u))
            q          (done-query-with-fake-result! (:id thread) (:id card))
            _link      (t2/insert! :model/ExplorationThreadTimeline
                                   {:exploration_thread_id (:id thread)
                                    :timeline_id           (:id tl)
                                    :position              0})
            ;; Simulate a worker that died mid-score by manually planting a row whose
            ;; created_at is well past the stale cutoff and whose scored_at is still NULL.
            stale-row  (first (t2/insert-returning-instances!
                               :model/ExplorationQueryTimelineInterestingness
                               {:exploration_query_id (:id q)
                                :timeline_id          (:id tl)}))
            _backdate  (t2/update! :model/ExplorationQueryTimelineInterestingness (:id stale-row)
                                   {:created_at (.minusMinutes (OffsetDateTime/now) 10)
                                    :scored_at  nil})]
        (mt/with-dynamic-fn-redefs [explorations.timeline-interestingness/score-query-timeline
                                    (fn [_ _] 0.42)]
          (run-one-iteration!)
          ;; Drain any unrelated leftover work from earlier tests.
          (loop [n 5]
            (let [{:keys [scored_at]} (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                                     :id (:id stale-row))]
              (when (and (pos? n) (nil? scored_at))
                (run-one-iteration!)
                (recur (dec n))))))
        (let [reclaimed (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                       :id (:id stale-row))]
          (is (= 0.42 (:interestingness_score reclaimed))
              "stale row was reclaimed and rescored in place")
          (is (some? (:scored_at reclaimed))))
        (is (= 1 (t2/count :model/ExplorationQueryTimelineInterestingness
                           :exploration_query_id (:id q)
                           :timeline_id (:id tl)))
            "no duplicate row was inserted alongside the reclaimed one")))))

;; ---------------------------- Cancellation guards ----------------------------

(def ^:private claim-pending-query #'runner/claim-pending-query)
(def ^:private claim-unplanned-thread! #'runner/claim-unplanned-thread!)
(def ^:private claim-analysis-if-ready! #'runner/claim-analysis-if-ready!)
(def ^:private canceled-mid-plan-cleanup! #'runner/canceled-mid-plan-cleanup!)

(defn- cancel-thread!
  "Stamp `canceled_at` + `completed_at` directly on the thread, the way the cancel endpoint does.
  Bypasses the API to keep these tests focused on the runner-side guards."
  [thread-id]
  (let [now (OffsetDateTime/now)]
    (t2/update! :model/ExplorationThread thread-id
                {:canceled_at now :completed_at now})))

(deftest claim-pending-query-skips-canceled-thread-test
  (testing "A pending EQ whose owning thread has canceled_at set is invisible to the claim query"
    (mt/with-temp [:model/User u {:email "cancel-claim@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        (cancel-thread! (:id thread))
        (let [claimed (claim-pending-query)]
          (is (or (nil? claimed) (not= (:id row) (:id claimed)))
              "claim-pending-query must not return a row on a canceled thread"))))))

(deftest claim-unplanned-thread-skips-canceled-test
  (testing "An unplanned, started, canceled thread is not claimed by the planner"
    (mt/with-temp [:model/User u {:email "cancel-plan@example.com"}]
      (let [thread (temp-thread! (:id u))]
        (t2/update! :model/ExplorationThread (:id thread) {:started_at (OffsetDateTime/now)})
        (cancel-thread! (:id thread))
        ;; Other tests may have unplanned threads in flight; just assert ours isn't picked.
        (let [claimed (claim-unplanned-thread!)]
          (is (not= (:id thread) claimed)
              "canceled threads must not be claimed for planning"))))))

(deftest claim-analysis-skips-canceled-test
  (testing "claim-analysis-if-ready! refuses to CAS analysis_started_at on a canceled thread,
            even when every query is terminal and every timeline pair is scored"
    (mt/with-temp [:model/User u {:email "cancel-analysis@example.com"}]
      (let [thread (temp-thread! (:id u))]
        ;; Set started_at so the thread is past the draft phase. No EQs and no timeline pairs
        ;; means the two NOT-EXISTS predicates trivially hold — without canceled_at IS NULL, the
        ;; CAS would fire.
        (t2/update! :model/ExplorationThread (:id thread)
                    {:started_at (OffsetDateTime/now)})
        (cancel-thread! (:id thread))
        (is (false? (claim-analysis-if-ready! (:id thread)))
            "CAS must not fire on a canceled thread")
        (is (nil? (:analysis_started_at (t2/select-one :model/ExplorationThread :id (:id thread))))
            "analysis_started_at must remain NULL")))))

(deftest canceled-mid-plan-cleanup-flips-pending-rows-test
  (testing "Planner-race repair: when the planner finishes for a thread the user canceled mid-plan,
            the cleanup helper flips the just-inserted pending rows to canceled"
    (mt/with-temp [:model/User u {:email "cancel-cleanup@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread     (temp-thread! (:id u))
            pending-eq (pending-query! (:id thread) (:id card)
                                       (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        (cancel-thread! (:id thread))
        (canceled-mid-plan-cleanup! (:id thread))
        (is (= "canceled" (:status (t2/select-one :model/ExplorationQuery :id (:id pending-eq))))
            "pending EQ on a canceled thread must be flipped to canceled")))))

(deftest canceled-mid-plan-cleanup-noop-on-uncanceled-test
  (testing "cleanup helper does nothing for threads that aren't canceled — common-case no-op"
    (mt/with-temp [:model/User u {:email "cancel-cleanup-noop@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread     (temp-thread! (:id u))
            pending-eq (pending-query! (:id thread) (:id card)
                                       (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        (canceled-mid-plan-cleanup! (:id thread))
        (is (= "pending" (:status (t2/select-one :model/ExplorationQuery :id (:id pending-eq))))
            "pending EQ on a live thread must be left alone")))))

;; ---------------------------- Planner crash recovery (fix #5) ----------------------------

(deftest claim-stale-unplanned-thread-reclaims-crashed-plan-test
  (testing "Fix #5: a thread claimed for planning past the cutoff that still has no query rows
            (pod crashed mid-plan) is reclaimable; one that already produced query rows is not."
    (mt/with-temp [:model/User u {:email "plan-stale@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [old        (.minusMinutes (OffsetDateTime/now) 30)
            crashed    (temp-thread! (:id u))   ; claimed long ago, produced no rows ⇒ crashed mid-plan
            progressed (temp-thread! (:id u))]  ; claimed long ago, but produced a row ⇒ not crashed
        (t2/update! :model/ExplorationThread (:id crashed)
                    {:started_at old :query_plan_started_at old})
        (t2/update! :model/ExplorationThread (:id progressed)
                    {:started_at old :query_plan_started_at old})
        (pending-query! (:id progressed) (:id card)
                        (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
        ;; Reclaim loop; tolerates unrelated claimable threads being returned first.
        (loop [n 10]
          (let [c (claim-unplanned-thread!)]
            (when (and (pos? n) (not= (:id crashed) c))
              (recur (dec n)))))
        (let [crashed-after    (t2/select-one :model/ExplorationThread :id (:id crashed))
              progressed-after (t2/select-one :model/ExplorationThread :id (:id progressed))
              recent-threshold (.minusMinutes (OffsetDateTime/now) 5)]
          (is (.isAfter ^OffsetDateTime (:query_plan_started_at crashed-after) recent-threshold)
              "crashed-mid-plan thread was reclaimed (query_plan_started_at bumped to ~now)")
          (is (.isBefore ^OffsetDateTime (:query_plan_started_at progressed-after) recent-threshold)
              "a thread that already produced query rows must NOT be reclaimed"))))))

(deftest claim-unplanned-thread-ignores-fresh-in-flight-plan-test
  (testing "Fix #5: a recent (in-flight) planning claim with no rows is NOT stale-reclaimed."
    (mt/with-temp [:model/User u {:email "plan-inflight@example.com"}]
      (let [recent   (.minusMinutes (OffsetDateTime/now) 1)
            in-flight (temp-thread! (:id u))]
        (t2/update! :model/ExplorationThread (:id in-flight)
                    {:started_at recent :query_plan_started_at recent})
        ;; The claim must never return our in-flight thread (recent qps is neither NULL nor stale).
        (dotimes [_ 5]
          (is (not= (:id in-flight) (claim-unplanned-thread!))
              "an in-flight (recent) planning claim must not be reclaimed"))
        (is (.isBefore ^OffsetDateTime (:query_plan_started_at (t2/select-one :model/ExplorationThread :id (:id in-flight)))
                       (.minusSeconds (OffsetDateTime/now) 30))
            "in-flight thread's query_plan_started_at is untouched")))))

;; ---------------------------- Queue metrics (fix #4) ----------------------------

(def ^:private pending-query-depth #'runner/pending-query-depth)
(def ^:private oldest-pending-age-seconds #'runner/oldest-pending-age-seconds)

(deftest pending-query-depth-counts-pending-rows-test
  (testing "Fix #4: pending-query-depth counts rows in 'pending' status (and a done row is excluded)."
    (mt/with-temp [:model/User u {:email "depth-metric@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            before (pending-query-depth)
            _p1    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
            after  (pending-query-depth)]
        (is (= (inc before) after) "a new pending row increments the depth by exactly one")
        (done-query-with-fake-result! (:id thread) (:id card))
        (is (= after (pending-query-depth)) "a done row does not count toward pending depth")))))

(deftest oldest-pending-age-seconds-reflects-head-of-line-test
  (testing "Fix #4: oldest-pending-age-seconds is at least the age of the oldest pending row."
    (mt/with-temp [:model/User u {:email "age-metric@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        ;; Backdate our pending row 100s; the global oldest-age must be at least that (MIN(created_at)
        ;; is no later than our row), regardless of other tests' pending rows.
        (t2/update! :model/ExplorationQuery (:id row)
                    {:created_at (.minusSeconds (OffsetDateTime/now) 100)})
        (is (>= (oldest-pending-age-seconds) 100)
            "oldest-pending-age is at least the age of our backdated pending row")))))
