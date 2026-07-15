(ns metabase.explorations.runner-test
  (:require
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.explorations.interestingness :as explorations.interestingness]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.explorations.query-plan]
   [metabase.explorations.runner :as runner]
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
  "Run `row-id` the way its queue does: execute it, and if it throws, record the terminal `error`
  that `:queue/exploration-query`'s listener writes for a message that fails every attempt.
  Returns the final row."
  [row-id]
  (try
    (runner/run-query! row-id)
    (catch Throwable e
      (runner/fail-query! row-id (ex-message e))))
  (t2/select-one :model/ExplorationQuery :id row-id))

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
            final  (drain-until-terminal! (:id row))
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
            _       (drain-until-terminal! (:id row))
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
            _      (drain-until-terminal! (:id row))
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
          (let [final  (drain-until-terminal! (:id row))
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
          (drain-until-terminal! (:id row))
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
          (drain-until-terminal! (:id row))
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
          (let [final  (drain-until-terminal! (:id row))
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
          (drain-until-terminal! (:id row))
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
          (drain-until-terminal! (:id row))
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
          (drain-until-terminal! (:id row))
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
            final  (drain-until-terminal! (:id row))]
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
          (runner/score-pair! (:id q) (:id tl)))
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
          (runner/score-pair! (:id q) (:id tl)))
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
          ;; at-least-once: the same pair can be delivered repeatedly
          (dotimes [_ 6] (runner/score-pair! (:id q) (:id tl))))
        (is (= 1 (t2/count :model/ExplorationQueryTimelineInterestingness
                           :exploration_query_id (:id q)
                           :timeline_id (:id tl))))))))

(deftest timeline-iteration-takes-over-an-unscored-row-test
  (testing "A pair reserved but left unscored (its delivery crashed) is scored in place on redelivery,
            with no duplicate row — no stale-claim window to wait out any more"
    (mt/with-temp [:model/User u {:email "ti-runner-stale@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread    (temp-thread! (:id u))
            q         (done-query-with-fake-result! (:id thread) (:id card))
            _link     (t2/insert! :model/ExplorationThreadTimeline
                                  {:exploration_thread_id (:id thread)
                                   :timeline_id           (:id tl)
                                   :position              0})
            ;; a worker that reserved the pair and died before scoring it
            orphan    (first (t2/insert-returning-instances!
                              :model/ExplorationQueryTimelineInterestingness
                              {:exploration_query_id (:id q)
                               :timeline_id          (:id tl)}))
            _unscored (t2/update! :model/ExplorationQueryTimelineInterestingness (:id orphan)
                                  {:scored_at nil})]
        (mt/with-dynamic-fn-redefs [explorations.timeline-interestingness/score-query-timeline
                                    (fn [_ _] 0.42)]
          (runner/score-pair! (:id q) (:id tl)))
        (let [reclaimed (t2/select-one :model/ExplorationQueryTimelineInterestingness :id (:id orphan))]
          (is (= 0.42 (:interestingness_score reclaimed))
              "the orphaned reservation was scored in place")
          (is (some? (:scored_at reclaimed))))
        (is (= 1 (t2/count :model/ExplorationQueryTimelineInterestingness
                           :exploration_query_id (:id q)
                           :timeline_id (:id tl)))
            "no duplicate row was inserted alongside it")))))

(deftest fail-pair-writes-the-unscored-sentinel-test
  (testing "When the queue gives up on a pair, fail-pair! records the null-score sentinel so the
            pair stops blocking its thread's completion gate"
    (mt/with-temp [:model/User u {:email "ti-runner-failpair@example.com"}
                   :model/Card card {:type :metric :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}
                   :model/Timeline tl {:name "Promotions" :creator_id (:id u)}]
      (let [thread (temp-thread! (:id u))
            q      (done-query-with-fake-result! (:id thread) (:id card))]
        (t2/insert! :model/ExplorationThreadTimeline
                    {:exploration_thread_id (:id thread) :timeline_id (:id tl) :position 0})
        (is (= (:id thread) (runner/fail-pair! (:id q) (:id tl))))
        (let [sentinel (t2/select-one :model/ExplorationQueryTimelineInterestingness
                                      :exploration_query_id (:id q) :timeline_id (:id tl))]
          (is (some? sentinel))
          (is (nil? (:interestingness_score sentinel)))
          (is (some? (:scored_at sentinel))
              "scored_at is set, so the completion gate no longer waits on this pair"))))))

;; ---------------------------- Cancellation guards ----------------------------

(def ^:private claim-analysis-if-ready! #'runner/claim-analysis-if-ready!)
(def ^:private canceled-mid-plan-cleanup! #'runner/canceled-mid-plan-cleanup!)

(defn- cancel-thread!
  "Stamp `canceled_at` + `completed_at` directly on the thread, the way the cancel endpoint does.
  Bypasses the API to keep these tests focused on the runner-side guards."
  [thread-id]
  (let [now (OffsetDateTime/now)]
    (t2/update! :model/ExplorationThread thread-id
                {:canceled_at now :completed_at now})))

(deftest run-query-skips-canceled-thread-test
  (testing "A delivered query whose thread was canceled after the message was published is a no-op:
            it must not run, and the row is left for the cancel flip rather than being executed"
    (mt/with-temp [:model/User u {:email "cancel-claim@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        (cancel-thread! (:id thread))
        (is (nil? (runner/run-query! (:id row)))
            "run-query! must not execute a query on a canceled thread")
        (is (zero? (t2/count :model/ExplorationQueryResult :exploration_query_id (:id row)))
            "no result was written")))))

(deftest run-query-is-idempotent-under-redelivery-test
  (testing "at-least-once: re-delivering a query that already ran is a no-op — it does not run twice
            or write a second exploration_query_result (which is 1:1 with the query)"
    (mt/with-temp [:model/User u {:email "redeliver@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))]
        (is (= (:id thread) (runner/run-query! (:id row))) "first delivery runs it")
        (is (nil? (runner/run-query! (:id row))) "redelivery is a no-op")
        (is (nil? (runner/run-query! (:id row))))
        (is (= "done" (:status (t2/select-one :model/ExplorationQuery :id (:id row)))))
        (is (= 1 (t2/count :model/ExplorationQueryResult :exploration_query_id (:id row)))
            "exactly one result row, despite three deliveries")))))

(deftest overlapping-runs-persist-exactly-one-result-test
  (testing "when two deliveries overlap, both run the warehouse query but only one persists: the
            loser is a benign no-op (same answer, wasted warehouse time), not an error, and no
            second exploration_query_result is written"
    (mt/with-temp [:model/User u {:email "overlap@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            row    (pending-query! (:id thread) (:id card)
                                   (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
            ;; both deliveries got past the `pending` gate and each ran the query
            computed-a (#'runner/compute-query-result row)
            computed-b (#'runner/compute-query-result row)
            now        (OffsetDateTime/now)]
        (is (true? (#'runner/persist-query-result! row now computed-a))
            "the first writer persists")
        (is (false? (#'runner/persist-query-result! row now computed-b))
            "the second writer finds the query already completed and discards its duplicate")
        (is (= 1 (t2/count :model/ExplorationQueryResult :exploration_query_id (:id row)))
            "exactly one result row")
        (is (= "done" (:status (t2/select-one :model/ExplorationQuery :id (:id row)))))))))

(deftest plan-thread-skips-canceled-test
  (testing "A started thread that was canceled before its plan message was delivered is not planned"
    (mt/with-temp [:model/User u {:email "cancel-plan@example.com"}]
      (let [thread (temp-thread! (:id u))
            called (atom 0)]
        (t2/update! :model/ExplorationThread (:id thread) {:started_at (OffsetDateTime/now)})
        (cancel-thread! (:id thread))
        (mt/with-dynamic-fn-redefs [metabase.explorations.query-plan/generate-query-plan!
                                    (fn [_] (swap! called inc) :ok)]
          (is (false? (runner/plan-thread! (:id thread)))))
        (is (zero? @called) "the planner (and its LLM call) must not run for a canceled thread")))))

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

;; ---------------------------- Planner idempotency & crash recovery ----------------------------

(deftest plan-thread-skips-an-already-planned-thread-test
  (testing "at-least-once: a redelivered plan message does not re-plan a thread that already has
            query rows — that check is the idempotency gate, and it replaces the old CAS claim"
    (mt/with-temp [:model/User u {:email "plan-idem@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))
            called (atom 0)]
        (t2/update! :model/ExplorationThread (:id thread) {:started_at (OffsetDateTime/now)})
        (pending-query! (:id thread) (:id card)
                        (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
        (mt/with-dynamic-fn-redefs [metabase.explorations.query-plan/generate-query-plan!
                                    (fn [_] (swap! called inc) :ok)]
          (is (false? (runner/plan-thread! (:id thread))))
          (is (false? (runner/plan-thread! (:id thread)))))
        (is (zero? @called)
            "the planner must not run again for a thread that already produced query rows")))))

(deftest plan-thread-replans-after-a-crashed-plan-test
  (testing "A thread whose planner crashed before producing any rows is simply planned again when
            the queue redelivers its message — no stale-claim window to wait out"
    (mt/with-temp [:model/User u {:email "plan-crash@example.com"}]
      (let [thread (temp-thread! (:id u))
            called (atom 0)]
        ;; a planner that claimed this thread long ago and died before inserting anything
        (t2/update! :model/ExplorationThread (:id thread)
                    {:started_at            (.minusMinutes (OffsetDateTime/now) 30)
                     :query_plan_started_at (.minusMinutes (OffsetDateTime/now) 30)})
        (mt/with-dynamic-fn-redefs [metabase.explorations.query-plan/generate-query-plan!
                                    (fn [_] (swap! called inc) :ok)]
          (is (true? (runner/plan-thread! (:id thread)))
              "the redelivered message re-plans it"))
        (is (= 1 @called))))))

(deftest fail-plan-records-the-terminal-planning-failure-test
  (testing "when the queue gives up on planning, fail-plan! writes the same terminal state the
            planner's own failure path does — transcript + terminal stamp — so the client stops
            polling and the failure is diagnosable"
    (mt/with-temp [:model/User u {:email "fail-plan@example.com"}]
      (let [thread (temp-thread! (:id u))]
        (t2/update! :model/ExplorationThread (:id thread) {:started_at (OffsetDateTime/now)})
        (runner/fail-plan! (:id thread) "the queue gave up")
        (let [after (t2/select-one :model/ExplorationThread :id (:id thread))]
          (is (some? (:completed_at after))
              "the thread is terminally stamped, so the client stops polling")
          (is (some? (:analysis_started_at after))
              "and the AI-summary machinery can't claim a thread that never planned")
          (is (= :error (:outcome (:query_plan_transcript after)))
              "the transcript records the terminal outcome")
          (is (= "the queue gave up" (:error (:query_plan_transcript after)))
              "with the error that exhausted the retries"))))))

(deftest fail-plan-leaves-a-planned-thread-alone-test
  (testing "a thread that already has query rows was successfully planned — a failing *duplicate*
            plan delivery must not stamp 'planning failed' over work that is genuinely in flight"
    (mt/with-temp [:model/User u {:email "fail-plan-dup@example.com"}
                   :model/Card card {:type :metric
                                     :creator_id (:id u)
                                     :dataset_query (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count)))))}]
      (let [thread (temp-thread! (:id u))]
        (t2/update! :model/ExplorationThread (:id thread) {:started_at (OffsetDateTime/now)})
        (pending-query! (:id thread) (:id card)
                        (lib/->legacy-MBQL (let [mp (mt/metadata-provider)] (-> (lib/query mp (lib.metadata/table mp (mt/id :venues))) (lib/aggregate (lib/count))))))
        (runner/fail-plan! (:id thread) "a duplicate delivery ran out of retries")
        (let [after (t2/select-one :model/ExplorationThread :id (:id thread))]
          (is (nil? (:completed_at after))
              "the thread is not completed out from under its pending queries")
          (is (nil? (:analysis_started_at after)))
          (is (nil? (:query_plan_transcript after))
              "and no failure transcript is written — planning did not fail"))))))

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
