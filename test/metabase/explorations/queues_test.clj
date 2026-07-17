(ns ^:synchronous metabase.explorations.queues-test
  "End-to-end tests for the exploration queues.

  `mq.tu/with-test-mq` starts the real subsystem on an in-memory backend and realizes every
  `def-queue!`/`def-listener!` in the codebase — including the ones in
  `metabase.explorations.queues` — so these exercise the production wiring, not a stand-in: publish a
  message, wait, and assert on what the handlers did.

  Marked `^:synchronous` because `with-test-mq` installs its backend with `alter-var-root` — it is
  process-global, so two of these running in parallel would clobber each other's backend.

  NOTE ON FIXTURES: these deliberately do NOT use `mt/with-temp`. It runs the body inside a
  transaction that is rolled back, and the exploration queues are `:transactional :require` — their
  messages go through the outbox, which inserts at before-commit and publishes at after-commit. Under
  `with-temp` that commit never comes, so nothing is ever published and the handlers never run, with
  no error to show for it. Fixtures are therefore inserted and cleaned up by hand, so the publish
  happens in a transaction that really commits, exactly as it does behind the API."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan]
   [metabase.explorations.queues :as explorations.queues]
   [metabase.explorations.runner :as runner]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

;; Without `mt/with-temp` there is nothing else here that would bring the app DB up.
(use-fixtures :once (fixtures/initialize :db))

(defn- venues-query []
  (lib/->legacy-MBQL
   (let [mp (mt/metadata-provider)]
     (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
         (lib/aggregate (lib/count))))))

(defn- do-with-fixtures!
  "Insert a user, a metric card, and a started exploration thread — committed, not `with-temp`'d —
  and hand them to `f`. Cleans up afterwards; deleting the Exploration cascades to its threads,
  pages and queries."
  [f]
  (let [user   (first (t2/insert-returning-instances!
                       :model/User (assoc (mt/with-temp-defaults :model/User)
                                          :email (str (random-uuid) "@example.com"))))
        card   (first (t2/insert-returning-instances!
                       :model/Card (assoc (mt/with-temp-defaults :model/Card)
                                          :type          :metric
                                          :creator_id    (:id user)
                                          :database_id   (mt/id)
                                          :dataset_query (venues-query))))
        expl   (first (t2/insert-returning-instances!
                       :model/Exploration {:name "queues-test" :creator_id (:id user)}))
        thread (first (t2/insert-returning-instances!
                       :model/ExplorationThread {:exploration_id (:id expl)
                                                 :position       0
                                                 :started_at     (OffsetDateTime/now)}))]
    (try
      (f {:user user :card card :exploration expl :thread thread})
      (finally
        (t2/delete! :model/Exploration :id (:id expl))
        (t2/delete! :model/Card :id (:id card))
        (t2/delete! :model/User :id (:id user))))))

(defn- insert-query!
  "Stand in for the planner: insert one pending query row, the way `insert-plan-rows!` would."
  [thread-id card-id mbql]
  (let [block-id (t2/insert-returning-pk! :model/ExplorationBlock {:exploration_thread_id thread-id})
        page-id  (t2/insert-returning-pk! :model/ExplorationPage
                                          {:exploration_block_id block-id
                                           :card_id              card-id
                                           :dimension_id         "d1"
                                           :query_type           "default"})]
    (t2/insert-returning-pk! :model/ExplorationQuery
                             {:exploration_thread_id thread-id
                              :card_id               card-id
                              :database_id           (mt/id)
                              :page_id               page-id
                              :dimension_id          "d1"
                              :dataset_query         mbql
                              :status                "pending"
                              :position              0})))

(defn- status [query-id]
  (:status (t2/select-one :model/ExplorationQuery :id query-id)))

(deftest plan-message-plans-then-runs-every-query-test
  (testing "publishing a plan message runs the planner, enqueues the queries it produced, and each
            one is executed to done — the whole pipeline, driven only by the queue"
    (do-with-fixtures!
     (fn [{:keys [card thread]}]
       (let [planned (atom nil)]
         ;; `with-redefs`, not `mt/with-dynamic-fn-redefs`: the handler runs on an MQ worker thread,
         ;; which does not carry this thread's dynamic bindings.
         #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
         (with-redefs [metabase.explorations.query-plan/generate-query-plan!
                       (fn [tid]
                         (reset! planned (insert-query! tid (:id card) (venues-query)))
                         :ok)]
           (mq.tu/with-test-mq [ctx]
             (t2/with-transaction [_conn]
               (explorations.queues/start-thread! (:id thread)))
             (mq.tu/eventually! ctx #(when-let [qid @planned] (= "done" (status qid))) 60000)))
         (is (some? @planned) "the plan handler ran and inserted a query")
         (let [row (t2/select-one :model/ExplorationQuery :id @planned)]
           (is (= "done" (:status row))
               "the query handler picked up the message the plan handler published, and ran it")
           (is (some? (:finished_at row)))
           (is (= 1 (t2/count :model/ExplorationQueryResult :exploration_query_id @planned)))))))))

(deftest query-that-keeps-failing-ends-up-terminally-error-test
  (testing "a query that fails every attempt ends up in the user-visible error state — the row must
            never be left pending, or the thread's completion gate would never close and the client
            would poll forever. Whether that state is written by the listener giving up on the
            message or by :on-error giving up on the batch, the contract is the same"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (do-with-fixtures!
       (fn [{:keys [card thread]}]
         ;; a database that doesn't exist: the QP throws on every attempt
         (let [qid (insert-query! (:id thread) (:id card)
                                  {:database 999999
                                   :type     :query
                                   :query    {:source-table 1 :aggregation [[:count]]}})]
           (mq.tu/with-test-mq [ctx]
             (#'explorations.queues/publish-pending-queries! (:id thread))
             (mq.tu/eventually! ctx #(= "error" (status qid)) 60000))
           (let [row (t2/select-one :model/ExplorationQuery :id qid)]
             (is (= "error" (:status row))
                 "retries exhausted → :on-error recorded the terminal failure")
             (is (some? (:error_message row)) "and the message the UI shows")
             (is (some? (:finished_at row)))
             (is (zero? (t2/count :model/ExplorationQueryResult :exploration_query_id qid))
                 "no partial result was written"))))))))

(deftest plan-that-keeps-failing-terminally-stamps-the-thread-test
  (testing "a plan delivery that fails every attempt ends with the thread terminally stamped — the
            same state the planner's own failure path writes — so the client stops polling and the
            failure is recorded, not just logged"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (do-with-fixtures!
       (fn [{:keys [thread]}]
         ;; a failure *around* the planner (`generate-query-plan!` catches its own): the thread
         ;; select blowing up on every delivery stands in for app-DB trouble. `with-redefs`, not
         ;; `mt/with-dynamic-fn-redefs`: the handler runs on an MQ worker thread, which does not
         ;; carry this thread's dynamic bindings.
         #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
         (with-redefs [runner/plan-thread! (fn [_] (throw (ex-info "planner infrastructure down" {})))]
           (mq.tu/with-test-mq [ctx]
             (t2/with-transaction [_conn]
               (explorations.queues/start-thread! (:id thread)))
             (mq.tu/eventually! ctx
                                #(some? (:completed_at (t2/select-one :model/ExplorationThread
                                                                      :id (:id thread))))
                                60000)))
         (let [after (t2/select-one :model/ExplorationThread :id (:id thread))]
           (is (some? (:completed_at after))
               "the thread completes, releasing the client from its polling loop")
           (is (= :error (:outcome (:query_plan_transcript after)))
               "and the transcript records why")
           (is (= "planner infrastructure down" (:error (:query_plan_transcript after))))))))))

(deftest duplicate-delivery-does-not-run-a-query-twice-test
  (testing "at-least-once: with every message delivered twice, a query still runs once and writes
            exactly one result (exploration_query_result is 1:1 with exploration_query)"
    (do-with-fixtures!
     (fn [{:keys [card thread]}]
       (let [qid (insert-query! (:id thread) (:id card) (venues-query))]
         (mq.tu/with-test-mq [ctx {:duplicate-delivery? true}]
           (#'explorations.queues/publish-pending-queries! (:id thread))
           (mq.tu/eventually! ctx #(= "done" (status qid)) 60000))
         (is (= "done" (status qid)))
         (is (= 1 (t2/count :model/ExplorationQueryResult :exploration_query_id qid))
             "exactly one result despite doubled delivery"))))))

(deftest queues-declare-their-batching-and-concurrency-test
  ;; with-test-mq is what realizes the `def-queue!` declarations into the registry.
  (mq.tu/with-test-mq [_ctx]
    (testing "planning is uncapped: it is the pipeline's intake — one short LLM call, published one
              per click — so throttling it would only make one user's exploration wait behind
              another's before anything is on screen"
      (is (nil? (q.registry/max-concurrent-batches :queue/exploration-plan)))
      (is (= 1 (q.registry/max-batch-messages :queue/exploration-plan))))
    (testing "the fan-out queues batch, so a thread's work is a trigger or two rather than hundreds,
              and cap concurrent batches — which, batched, bounds explorations in flight per node
              rather than queries within one exploration"
      (doseq [queue [:queue/exploration-query :queue/exploration-timeline-score]]
        (is (= 100 (q.registry/max-batch-messages queue))
            (str queue " batches its messages"))
        (is (= 2 (q.registry/max-concurrent-batches queue))
            (str queue " defaults to explorations-worker-count (2)"))))
    (testing "the caps track the setting live, rather than freezing its value at registration"
      (mt/with-temporary-setting-values [explorations-worker-count 5]
        (is (= 5 (q.registry/max-concurrent-batches :queue/exploration-query)))
        (is (= 5 (q.registry/max-concurrent-batches :queue/exploration-timeline-score))))
      (mt/with-temporary-setting-values [explorations-worker-count 1]
        (is (= 1 (q.registry/max-concurrent-batches :queue/exploration-query)))))))

(deftest one-bad-query-does-not-strand-the-rest-of-its-batch-test
  (testing "a query that fails every attempt is recorded as an error on its own, and the queries
            sharing its batch still run. A batch is a delivery unit, not a shared fate: were a
            failure allowed to abort the batch, every message behind the poison one would go
            unattempted on this delivery and on every redelivery, and :on-error would then stamp
            them all `error` without one of them ever having been tried"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (do-with-fixtures!
       (fn [{:keys [card thread]}]
         ;; a database that doesn't exist: the QP throws on every attempt
         (let [poison (insert-query! (:id thread) (:id card)
                                     {:database 999999
                                      :type     :query
                                      :query    {:source-table 1 :aggregation [[:count]]}})
               good   (insert-query! (:id thread) (:id card) (venues-query))]
           (mq.tu/with-test-mq [ctx]
             ;; Published in one `with-queue` so the outbox chunks them into a single batch, poison
             ;; first — the order that strands the good query if one message can abort the batch.
             (t2/with-transaction [_conn]
               (mq/with-queue :queue/exploration-query [q]
                 (mq/put q {:query-id poison})
                 (mq/put q {:query-id good})))
             (mq.tu/eventually! ctx #(and (= "error" (status poison))
                                          (= "done" (status good)))
                                60000))
           (is (= "done" (status good))
               "the good query ran, despite sharing a batch with a query that failed ahead of it")
           (is (= 1 (t2/count :model/ExplorationQueryResult :exploration_query_id good)))
           (is (= "error" (status poison))
               "and the query that really did fail is terminally errored, on its own")
           (is (zero? (t2/count :model/ExplorationQueryResult :exploration_query_id poison)))))))))

(deftest failing-terminal-write-does-not-strand-its-batch-mates-test
  (testing "if recording one message's terminal-failure state itself throws — a racing duplicate
            insert, a transient db blip — the remaining messages of the batch still get their
            terminal state written. deliver-batch! must isolate the fail! calls the way it isolates
            the handle! calls, or one un-recordable failure would strand every message behind it"
    (let [failed  (atom [])
          handle! (fn [_] (throw (ex-info "always fails" {})))
          fail!   (fn [msg _e]
                    (if (= msg {:id 1})
                      (throw (ex-info "recording THIS one blows up" {}))
                      (swap! failed conj msg)))]
      (#'explorations.queues/deliver-batch! [{:id 1} {:id 2} {:id 3}] handle! fail!)
      (is (= [{:id 2} {:id 3}] @failed)
          "every message whose terminal write succeeded is recorded, despite the first one throwing"))))

(deftest a-message-that-fails-once-is-retried-inside-its-delivery-test
  (testing "a transient failure is retried within the same delivery — a batch carries the rest of a
            user's queries, so a blip on one message must not cost the whole batch a redelivery"
    ;; `queue-max-retries` 1 means the queue drops a failed batch immediately rather than
    ;; redelivering it, so the *only* thing that can turn this query around is the listener's own
    ;; retry. Without it, the batch is dropped and :on-error leaves the query `error`.
    (mt/with-temporary-setting-values [queue-max-retries 1]
      (do-with-fixtures!
       (fn [{:keys [card thread]}]
         (let [qid       (insert-query! (:id thread) (:id card) (venues-query))
               attempts  (atom 0)
               run-query runner/run-query!]
           ;; `with-redefs`, not `mt/with-dynamic-fn-redefs`: the handler runs on an MQ worker
           ;; thread, which does not carry this thread's dynamic bindings.
           #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
           (with-redefs [runner/run-query! (fn [id]
                                             (when (= 1 (swap! attempts inc))
                                               (throw (ex-info "transient warehouse blip" {})))
                                             (run-query id))]
             (mq.tu/with-test-mq [ctx]
               (#'explorations.queues/publish-pending-queries! (:id thread))
               (mq.tu/eventually! ctx #(= "done" (status qid)) 60000)))
           (is (= "done" (status qid))
               "the retry happened inside the delivery — the queue had no redelivery left to give")
           (is (= 2 @attempts)
               "failed once, retried once, succeeded")))))))
