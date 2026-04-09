(ns metabase-enterprise.semantic-search.indexer-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.dlq :as semantic.dlq]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.test.util :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.io Closeable)
           (java.sql Timestamp)
           (java.time Duration Instant InstantSource)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(defn- get-metadata-row! [pgvector index-metadata index]
  (jdbc/execute-one! pgvector
                     (sql/format {:select [:*]
                                  :from   [(keyword (:metadata-table-name index-metadata))]
                                  :where  [:= :table_name (:table-name index)]}
                                 :quoted true)
                     {:builder-fn jdbc.rs/as-unqualified-lower-maps}))

(defn- ts ^Timestamp [s]
  (Timestamp/from (Instant/parse s)))

(deftest indexing-step-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        t1             (ts "2025-01-01T00:01:00Z")
        t2             (ts "2025-01-02T00:03:10Z")
        t3             (ts "2025-01-03T00:02:42Z")
        c1             {:model "card" :id "1" :name "Poodle" :searchable_text "Dog Training Guide" :embeddable_text "Dog Training Guide"}
        c2             {:model "card" :id "2" :name "Pug"    :searchable_text "Dog Training Guide 2" :embeddable_text "Dog Training Guide 2"}
        c3             {:model "card" :id "3" :name "Collie" :searchable_text "Dog Training Guide 3" :embeddable_text "Dog Training Guide 3"}
        version        semantic.gate/search-doc->gate-doc
        delete         (fn [doc t] (semantic.gate/deleted-search-doc->gate-doc (:model doc) (:id doc) t))]
    (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)
                _ (semantic.tu/open-index! pgvector index)]
      (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
      (let [metadata-row      (get-metadata-row! pgvector index-metadata index)
            initial-watermark (semantic.gate/resume-watermark metadata-row)
            indexing-state    (semantic.indexer/init-indexing-state metadata-row)
            {poll-proxy :proxy poll-calls :calls} (semantic.tu/spy semantic.gate/poll)
            {upsert-proxy :proxy upsert-calls :calls} (semantic.tu/spy semantic.index/upsert-index!)
            {delete-proxy :proxy delete-calls :calls} (semantic.tu/spy semantic.index/delete-from-index!)
            clear-spies       (fn []
                                (reset! poll-calls [])
                                (reset! upsert-calls [])
                                (reset! delete-calls []))]

        (is (= initial-watermark (:watermark @indexing-state)))

        (testing "gate is empty, poll counts should be zero - and upsert/delete should not be called"
          (with-redefs [semantic.index/upsert-index!      upsert-proxy
                        semantic.index/delete-from-index! delete-proxy
                        semantic.gate/poll                poll-proxy]
            (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
            (is (= [] @upsert-calls))
            (is (= [] @delete-calls))
            (is (= 1 (count @poll-calls)))
            (is (= 0 (:last-poll-count @indexing-state)))
            (is (= 0 (:last-novel-count @indexing-state)))

            (testing "watermark has been updated"
              (let [[{poll-result :ret}] @poll-calls]
                (is (= (semantic.gate/next-watermark initial-watermark poll-result) (:watermark @indexing-state)))
                (testing "watermark has been flushed to the metadata table"
                  (is (= (:watermark @indexing-state)
                         (semantic.gate/resume-watermark (get-metadata-row! pgvector index-metadata index)))))))))

        (testing "add some data to the gate we should see upsert / delete be called"
          (clear-spies)
          (semantic.gate/gate-documents! pgvector index-metadata [(version c1 t1) (delete c2 t2)])
          (with-redefs [semantic.index/upsert-index!      upsert-proxy
                        semantic.index/delete-from-index! delete-proxy
                        semantic.gate/poll                poll-proxy]
            (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
            (is (= 1 (count @upsert-calls)))
            (is (= 1 (count @delete-calls)))
            (is (= 1 (count @poll-calls)))
            (is (= 2 (:last-poll-count @indexing-state)))
            (is (= 2 (:last-novel-count @indexing-state)))

            (testing "watermark has been updated"
              (let [[{poll-result :ret}] @poll-calls]
                (is (= (semantic.gate/next-watermark initial-watermark poll-result) (:watermark @indexing-state)))
                (testing "watermark has been flushed to the metadata table"
                  (is (= (:watermark @indexing-state)
                         (semantic.gate/resume-watermark (get-metadata-row! pgvector index-metadata index)))))))))

        (testing "stepping again with no new data does nothing"
          (clear-spies)
          (with-redefs [semantic.index/upsert-index!      upsert-proxy
                        semantic.index/delete-from-index! delete-proxy
                        semantic.gate/poll                poll-proxy]
            (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
            (is (= 0 (count @upsert-calls)))
            (is (= 0 (count @delete-calls)))
            (is (= 1 (count @poll-calls)))
            (is (= 2 (:last-poll-count @indexing-state)))
            (is (= 0 (:last-novel-count @indexing-state)))))

        (testing "add some more data, picked up"
          (clear-spies)
          (semantic.gate/gate-documents! pgvector index-metadata [(version c2 t3)])
          (with-redefs [semantic.index/upsert-index!      upsert-proxy
                        semantic.index/delete-from-index! delete-proxy
                        semantic.gate/poll                poll-proxy]
            (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
            (is (= 1 (count @upsert-calls)))
            (is (= 0 (count @delete-calls)))
            (is (= 1 (count @poll-calls)))
            (is (= 1 (:last-novel-count @indexing-state)))))

        (testing "exceptions during indexing are bubbled, and the watermark position is preserved"
          (clear-spies)
          (semantic.gate/gate-documents! pgvector index-metadata [(version c3 t3)])
          (let [previous-state @indexing-state]
            (with-redefs [semantic.index/upsert-index!      (fn [& _] (throw (Exception. "Boom")))
                          semantic.index/delete-from-index! delete-proxy
                          semantic.gate/poll                poll-proxy]
              (is (thrown-with-msg? Exception #"Boom" (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)))
              (is (= 0 (count @delete-calls)))
              (is (= 1 (count @poll-calls)))
              (testing "state/watermark was not updated"
                (is (= previous-state @indexing-state)))))

          (testing "exceptions are recovered from"
            (clear-spies)
            (with-redefs [semantic.index/upsert-index!      upsert-proxy
                          semantic.index/delete-from-index! delete-proxy
                          semantic.gate/poll                poll-proxy]
              (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
              (is (= 1 (count @upsert-calls)))
              (is (= 0 (count @delete-calls)))
              (is (= 1 (count @poll-calls))))))))))

;; todo not sure I like this cuteness
(deftest on-indexing-idle-test
  (mt/with-prometheus-system! [_ system]
    (testing "idle behavior based on novelty ratio"
      (let [indexing-state (volatile! {:last-poll-count 100 :last-novel-count 30})
            original-sleep-fn @#'semantic.indexer/sleep
            sleep-metric-state (volatile! 0)
            test-sleep-metric (fn []
                                (testing "Sleep metric grows"
                                  (let [current-sleep (mt/metric-value system :metabase-search/semantic-indexer-sleep-ms)]
                                    (is (< @sleep-metric-state current-sleep))
                                    (vreset! sleep-metric-state current-sleep))))]

        (testing "high novelty ratio (>25%) - no sleep"
          (with-redefs [semantic.indexer/sleep (fn [ms] (throw (ex-info "Should not sleep" {:ms ms})))]
            (is (nil? (semantic.indexer/on-indexing-idle indexing-state)))))

        (testing "medium novelty ratio (10-25%) - small backoff"
          (vswap! indexing-state assoc :last-novel-count 15) ; 15% novelty
          (let [sleep-called (atom nil)]
            (with-redefs [semantic.indexer/sleep (fn [ms]
                                                   (original-sleep-fn ms)
                                                   (reset! sleep-called ms)) #_#(reset! sleep-called %)]
              (semantic.indexer/on-indexing-idle indexing-state)
              (is (= 250 @sleep-called))

              (test-sleep-metric))))

        (testing "low novelty ratio (1-10%) - medium backoff"
          (vswap! indexing-state assoc :last-novel-count 5) ; 5% novelty
          (let [sleep-called (atom nil)]
            (with-redefs [semantic.indexer/sleep (fn [ms]
                                                   (original-sleep-fn ms)
                                                   (reset! sleep-called ms)) #_#(reset! sleep-called %)]
              (semantic.indexer/on-indexing-idle indexing-state)
              (is (= 1500 @sleep-called))

              (test-sleep-metric))))

        (testing "very low novelty ratio (<1%) - big backoff"
          (vswap! indexing-state assoc :last-novel-count 0) ; 0% novelty
          (let [sleep-called (atom nil)]
            (with-redefs [semantic.indexer/sleep #(reset! sleep-called %)]
              (semantic.indexer/on-indexing-idle indexing-state)
              (is (= 3000 @sleep-called)))))))))

(defn- open-loop-thread! ^Closeable [& loop-args]
  (let [caught-ex (volatile! nil)]
    (semantic.tu/closeable
     {:caught-ex caught-ex
      :thread
      (doto (Thread.
             ^Runnable
             (bound-fn*
              (fn []
                (try
                  (apply semantic.indexer/indexing-loop loop-args)
                  (catch Throwable t
                    (vreset! caught-ex t))))))
        (.setDaemon true)
        (.start))}
     (fn [{:keys [^Thread thread]}]
       (when (.isAlive thread)
         (.interrupt thread)
         (when-not (.join thread (Duration/ofSeconds 30))
           (log/fatal "Indexing loop thread not exiting during test!")))))))

(deftest indexing-loop-thread-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        index          semantic.tu/mock-index
        metadata-row   {:indexer_last_poll Instant/EPOCH
                        :indexer_last_seen Instant/EPOCH}
        step-ex        (volatile! nil)                      ; holds an exception to be thrown during the step function
        indexing-state (semantic.indexer/init-indexing-state metadata-row)
        call-counter   (atom {:idle 0 :step 0})
        wait-for-calls (fn []
                         (let [ocalls   @call-counter
                               max-wait (+ (System/currentTimeMillis) 100)]
                           (loop []
                             (cond
                               (not= ocalls @call-counter) true
                               (< max-wait (System/currentTimeMillis)) false
                               :else (recur)))))
        step-called    (promise)
        idle-called    (promise)]

    (with-redefs [semantic.indexer/on-indexing-idle (fn [_]
                                                      (deliver idle-called true)
                                                      (swap! call-counter update :idle inc)
                                                      (when (.isInterrupted (Thread/currentThread))
                                                        (throw (InterruptedException.))))
                  semantic.indexer/indexing-step    (fn [& _]
                                                      (deliver step-called true)
                                                      (swap! call-counter update :step inc)
                                                      (when-some [ex @step-ex] (throw ex))
                                                      (when (.isInterrupted (Thread/currentThread))
                                                        (throw (InterruptedException.))))]

      (with-open [loop-thread
                  (open-loop-thread! pgvector
                                     index-metadata
                                     index
                                     indexing-state)]
        (let [{:keys [caught-ex ^Thread thread]} @loop-thread]
          (is (not= :timeout (deref idle-called 100 :timeout)))
          (is (not= :timeout (deref step-called 100 :timeout)))

          (testing "start time set"
            (is (inst? (:start-time @indexing-state))))

          (testing "called repeatedly"
            (is (wait-for-calls)))

          (testing "called 1 to 1"
            (let [{:keys [idle step]} @call-counter
                  lower (dec idle)
                  upper (inc idle)]
              (is (<= lower step upper))))

          (testing "exceptions are bubbled out of loop, will not loop forever"
            (let [ex (Exception. (str "Error: " (u/generate-nano-id)))]
              (vreset! step-ex ex)
              (is (.join thread (Duration/ofSeconds 1)) "loop exits")
              (is (= (ex-message ex) (ex-message @caught-ex)))))))

      (testing "loop interruptible"
        (with-open [loop-thread
                    (open-loop-thread! pgvector
                                       index-metadata
                                       index
                                       indexing-state)]
          (let [{:keys [^Thread thread]} @loop-thread]
            (.interrupt thread)
            (is (.join thread (Duration/ofSeconds 1)))))))))

(deftest indexing-loop-exit-test
  (let [pgvector       (semantic.env/get-pgvector-datasource!)
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        t1             (ts "2025-01-01T00:01:00Z")
        c1             {:model "card" :id "1" :name "Dog" :searchable_text "Dog Training Guide" :embeddable_text "Dog Training Guide"}
        version        semantic.gate/search-doc->gate-doc]
    (with-open [_ (semantic.tu/open-metadata! pgvector index-metadata)
                _ (semantic.tu/open-index! pgvector index)]
      (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
      (testing "exits immediately after max run duration elapses"
        (let [run-time       (u/start-timer)
              indexing-state (semantic.indexer/init-indexing-state (get-metadata-row! pgvector index-metadata index))]
          (vswap! indexing-state assoc :max-run-duration (Duration/ofMillis 1))
          (with-redefs [semantic.indexer/sleep (fn [_])]
            (with-open [loop-thread (open-loop-thread! pgvector
                                                       index-metadata
                                                       index
                                                       indexing-state)]
              (let [{:keys [^Thread thread caught-ex]} @loop-thread]
                (testing "exits"
                  (is (mt/poll-until 1000 (not (.isAlive thread))))
                  (testing "did not wait too long"
                    (is (<= (u/since-ms run-time) 500)))
                  (testing "did not crash"
                    (is (nil? @caught-ex)))))))))
      (testing "exists early if no new records after a time"
        (let [run-time       (u/start-timer)
              indexing-state (semantic.indexer/init-indexing-state (get-metadata-row! pgvector index-metadata index))
              upsert-index!  semantic.index/upsert-index!
              indexed        (atom [])]
          (vswap! indexing-state assoc :exit-early-cold-duration (Duration/ofMillis 1))
          (with-redefs [semantic.indexer/sleep       (fn [_])
                        semantic.index/upsert-index! (fn [pgvector index docs]
                                                       (let [docs (vec docs)]
                                                         (swap! indexed into docs)
                                                         (upsert-index! pgvector index docs)))]
            ;; need some data first for early exit, or it does nothing
            (semantic.gate/gate-documents! pgvector index-metadata [(version c1 t1)])
            (with-open [loop-thread (open-loop-thread! pgvector
                                                       index-metadata
                                                       index
                                                       indexing-state)]
              (let [{:keys [^Thread thread caught-ex]} @loop-thread]
                (testing "exits"
                  (is (mt/poll-until 1000 (not (.isAlive thread))))
                  (testing "has seen our row before exiting"
                    (is (= 1 (count @indexed))))
                  (testing "did not wait too long"
                    (is (<= (u/since-ms run-time) 500)))
                  (testing "did not crash"
                    (is (nil? @caught-ex))))))))))))

(deftest init-indexing-state-test
  (testing "initializes indexing state from metadata row"
    (let [metadata-row       {:indexer_last_poll      (ts "2025-01-01T12:00:00Z")
                              :indexer_last_seen      (ts "2025-01-01T11:30:00Z")
                              :indexer_last_seen_id   "foo"
                              :indexer_last_seen_hash "bar"}
          state              (semantic.indexer/init-indexing-state metadata-row)
          state-value        @state
          expected-last-seen {:id "foo" :document_hash "bar" :gated_at (ts "2025-01-01T11:30:00Z")}]
      (is (= (ts "2025-01-01T12:00:00Z") (get-in state-value [:watermark :last-poll])))
      (is (= expected-last-seen (get-in state-value [:watermark :last-seen])))
      (is (= #{expected-last-seen} (:last-seen-candidates state-value)))
      (is (zero? (:last-novel-count state-value)))
      (is (zero? (:last-poll-count state-value))))))

(defn- open-dlq! ^Closeable [pgvector index-metadata index-id]
  (semantic.tu/closeable
   (semantic.dlq/create-dlq-table-if-not-exists! pgvector index-metadata index-id)
   (fn [_] (semantic.dlq/drop-dlq-table-if-exists! pgvector index-metadata index-id))))

(deftest quartz-job-run!-test
  (let [pgvector        (semantic.env/get-pgvector-datasource!)
        index-metadata  (semantic.tu/unique-index-metadata)
        open-job-thread (fn [& args]
                          (let [caught-ex (volatile! nil)]
                            (semantic.tu/closeable
                             {:caught-ex caught-ex
                              :thread
                              (doto (Thread.
                                     ^Runnable
                                     (bound-fn*
                                      (fn []
                                        (try
                                          (apply semantic.indexer/quartz-job-run! args)
                                          (catch Throwable t
                                            (vreset! caught-ex t))))))
                                (.setDaemon true)
                                (.start))}
                             (fn [{:keys [^Thread thread]}]
                               (when (.isAlive thread)
                                 (.interrupt thread)
                                 (when-not (.join thread (Duration/ofSeconds 30))
                                   (log/fatal "Indexing loop thread not exiting during test!")))))))]

    (testing "exit immediately: no active index / index tables"
      (with-open [job-thread ^Closeable (open-job-thread pgvector index-metadata)]
        (let [{:keys [caught-ex ^Thread thread]} @job-thread]
          (testing "thread exited"
            (is (.join thread (Duration/ofSeconds 5))))
          (testing "did not crash"
            (is (nil? @caught-ex))))))

    (testing "runs loop on active index then exits"
      (let [loop-args    (atom [])
            metadata-row {:indexer_last_poll (ts "2025-01-01T12:00:00Z")
                          :indexer_last_seen (ts "2025-01-01T11:30:00Z")}
            index        {:table-name "foo"}]
        (with-redefs [semantic.index-metadata/get-active-index-state (fn [& _] {:index index :metadata-row metadata-row})
                      semantic.indexer/indexing-loop                 (fn [& args] (swap! loop-args conj args) nil)]
          (with-open [job-thread ^Closeable (open-job-thread pgvector index-metadata)]
            (let [{:keys [caught-ex ^Thread thread]} @job-thread]
              (testing "thread exited (loop returned)"
                (is (.join thread (Duration/ofSeconds 5))))
              (testing "args as expected"
                (is (= 1 (count @loop-args)))
                (let [[[_ _ passed-index indexing-state]] @loop-args]
                  (is (= index passed-index))
                  (is (= @(semantic.indexer/init-indexing-state metadata-row) @indexing-state))))
              (testing "did not crash"
                (is (nil? @caught-ex))))))))

    (doseq [ex [(Exception. "Boom")
                (AssertionError. "Assert")
                (InterruptedException. "Interrupt")]]
      (testing "exit on exception/error during loop"
        (with-redefs [semantic.index-metadata/get-active-index-state (fn [& _] {:index {} :metadata-row {}})
                      semantic.indexer/indexing-loop                 (fn [& _] (throw ex))]
          (with-open [job-thread ^Closeable (open-job-thread pgvector index-metadata)]
            (let [{:keys [caught-ex ^Thread thread]} @job-thread]
              (testing "thread exited"
                (is (.join thread (Duration/ofSeconds 5))))
              (testing "crashed with expected msg"
                (is (= (ex-message ex) (ex-message @caught-ex)))))))))

    (testing "initial dlq run is scheduled if table exists"
      (let [loop-args    (atom [])
            metadata-row {:id                42
                          :indexer_last_poll (ts "2025-01-01T12:00:00Z")
                          :indexer_last_seen (ts "2025-01-01T11:30:00Z")}
            index        {:table-name "foo"}
            t            (Instant/parse "2025-01-01T23:14:43Z")]
        (with-redefs [semantic.index-metadata/get-active-index-state (fn [& _] {:index index :metadata-row metadata-row})
                      semantic.indexer/indexing-loop                 (fn [& args] (swap! loop-args conj args) nil)
                      semantic.indexer/clock                         (reify InstantSource (instant [_] t))]
          (with-open [_          (open-dlq! pgvector index-metadata (:id metadata-row)) ; right now index id only matters for the table name, use anything
                      job-thread ^Closeable (open-job-thread pgvector index-metadata)]
            (let [{:keys [caught-ex ^Thread thread]} @job-thread]
              (testing "thread exited (loop returned)"
                (is (.join thread (Duration/ofSeconds 5))))
              (testing "args as expected"
                (is (= 1 (count @loop-args)))
                (let [[[_ _ _ indexing-state]] @loop-args]
                  (is (= (.plus t semantic.indexer/dlq-frequency) (:next-dlq-run @indexing-state)))))
              (testing "did not crash"
                (is (nil? @caught-ex))))))))))

(deftest dlq-step-test
  (mt/with-prometheus-system! [_ system]
    (let [pgvector       (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          model          semantic.tu/mock-embedding-model
          index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
          sut            semantic.indexer/dlq-step
          clock-ref      (volatile! (Instant/parse "2025-01-04T00:00:00Z"))
          clock          (reify InstantSource (instant [_] @clock-ref))
          dlq-loop-impl  (volatile! (constantly nil))
          run-scenario   (fn [{:keys [indexing-state dlq-loop-return]}]
                           (vreset! dlq-loop-impl (constantly dlq-loop-return))
                           (let [indexing-state-ref (semantic.indexer/init-indexing-state (get-metadata-row! pgvector index-metadata index))]
                             (vswap! indexing-state-ref merge indexing-state)
                             (sut pgvector index-metadata index indexing-state-ref)
                             @indexing-state-ref))]
      (with-redefs [semantic.dlq/dlq-retry-loop! (fn [& args] (apply @dlq-loop-impl args))
                    semantic.indexer/clock       clock
                    semantic.dlq/clock           clock]
        (with-open [_            (semantic.tu/open-metadata! pgvector index-metadata)
                    _            (semantic.tu/open-index! pgvector index)
                    index-id-ref (semantic.tu/closeable
                                  (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
                                  (constantly nil))
                    _            (open-dlq! pgvector index-metadata @index-id-ref)]

          (testing "dlq rescheduled after no change"
            (let [original-last-seen-change (Instant/parse "2025-01-12T03:22:45Z")
                  {:keys [last-seen-change next-dlq-run]}
                  (run-scenario {:indexing-state  {:last-seen-change original-last-seen-change}
                                 :dlq-loop-return {:exit-reason   :no-more-data,
                                                   :run-time      (Duration/parse "PT42S")
                                                   :success-count 0
                                                   :failure-count 0}})
                  expected-next-dlq-run     (.plus (.instant clock) semantic.indexer/dlq-frequency)]
              (testing ":last-seen-change not modified - would allow cold exit"
                (is (= original-last-seen-change last-seen-change)))
              (is (= expected-next-dlq-run next-dlq-run))))

          (testing "dlq rescheduled after change (no more data, should back off)"
            (let [{:keys [last-seen-change next-dlq-run]}
                  (run-scenario {:dlq-loop-return {:exit-reason   :no-more-data,
                                                   :run-time      (Duration/parse "PT12S")
                                                   :success-count 1
                                                   :failure-count 0}})
                  expected-next-dlq-run (.plus (.instant clock) semantic.indexer/dlq-frequency)]
              (is (= (.instant clock) last-seen-change))
              (is (= expected-next-dlq-run next-dlq-run))
              (testing "Metrics have expected values"
                (is (== 1 (mt/metric-value system :metabase-search/semantic-indexer-dlq-successes)))
                (is (== 0 (mt/metric-value system :metabase-search/semantic-indexer-dlq-failures))))))

          (testing "dlq rescheduled immediately after change (ran out of time, more to do)"
            (let [{:keys [last-seen-change next-dlq-run]}
                  (run-scenario {:dlq-loop-return {:exit-reason   :ran-out-of-time
                                                   :run-time      (Duration/parse "PT15S")
                                                   :success-count 1
                                                   :failure-count 0}})]
              (is (= (.instant clock) last-seen-change))
              (is (= (.instant clock) next-dlq-run))
              (testing "Metrics have expected values"
                (is (== 2 (mt/metric-value system :metabase-search/semantic-indexer-dlq-successes)))
                (is (== 0 (mt/metric-value system :metabase-search/semantic-indexer-dlq-failures))))))

          ;; for now policy for this branch is the same as the above - but may change
          (testing "dlq rescheduled immediately after change (ran out of time, more to do - failures)"
            (let [{:keys [last-seen-change next-dlq-run]}
                  (run-scenario {:dlq-loop-return {:exit-reason   :ran-out-of-time
                                                   :run-time      (Duration/parse "PT12S")
                                                   :success-count 2
                                                   :failure-count 3}})]
              (is (= (.instant clock) last-seen-change))
              (is (= (.instant clock) next-dlq-run))
              (testing "Metrics have expected values"
                (is (== 4 (mt/metric-value system :metabase-search/semantic-indexer-dlq-successes)))
                (is (== 3 (mt/metric-value system :metabase-search/semantic-indexer-dlq-failures))))))
          (testing ":metabase-search/semantic-indexer-dlq-loop-ms have expected value"
            (is (< 0 (mt/metric-value system :metabase-search/semantic-indexer-dlq-loop-ms)))))))))

(defn- get-dlq-rows! [pgvector index-metadata index-id]
  (let [q {:select [:*] :from [(semantic.dlq/dlq-table-name-kw index-metadata index-id)]}]
    (jdbc/execute! pgvector (sql/format q :quoted true) {:builder-fn jdbc.rs/as-unqualified-lower-maps})))

(deftest indexer-stall-and-recovery-test
  (mt/with-prometheus-system! [_ system]
    (let [pgvector             (semantic.env/get-pgvector-datasource!)
          index-metadata       (semantic.tu/unique-index-metadata)
          model                semantic.tu/mock-embedding-model
          index                (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
          clock-ref            (volatile! (Instant/parse "2025-01-04T10:00:00Z"))
          clock                (reify InstantSource (instant [_] @clock-ref))
          t1                   (ts "2025-01-01T00:01:00Z")
          card                 (fn [id] {:model "card" :id (str id) :name "Test" :searchable_text "Content" :embeddable_text "Content"})
          version              semantic.gate/search-doc->gate-doc
          fresh-indexing-state (fn []
                                 (let [state (semantic.indexer/init-indexing-state (get-metadata-row! pgvector index-metadata index))]
                                   (vswap! state assoc :next-dlq-run (.instant clock)) ; ensure DLQ is scheduled
                                   state))
          growing-metrics [:metabase-search/semantic-indexer-read-documents-ms
                           :metabase-search/semantic-indexer-write-indexing-ms
                           :metabase-search/semantic-indexer-write-metadata-ms]
          growing-metrics-state (volatile! (into {}
                                                 (map #(vector % 0))
                                                 growing-metrics))
          test-metric-growth (fn []
                               (doseq [metric growing-metrics]
                                 (testing metric
                                   (let [metric-value (mt/metric-value system metric)]
                                     (is (and (< 0 metric-value)
                                              (<= (metric @growing-metrics-state) metric-value)))
                                     (vswap! growing-metrics-state assoc metric metric-value)))))]
      (with-open [_            (semantic.tu/open-metadata! pgvector index-metadata)
                  _            (semantic.tu/open-index! pgvector index)
                  index-id-ref (semantic.tu/closeable
                                (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
                                (constantly nil))
                  _            (open-dlq! pgvector index-metadata @index-id-ref)]

        (with-redefs [semantic.indexer/clock         clock
                      semantic.dlq/clock             clock
                      ;; assume during this test that we are on the 'confident' gate poll branch.
                      semantic.indexer/lag-tolerance Duration/ZERO]

          (testing "normal indexing without stalls"
            (let [indexing-state (fresh-indexing-state)]
              (semantic.gate/gate-documents! pgvector index-metadata [(version (card 1) t1)])
              (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)

              (is (nil? (:stalled-at @indexing-state)))
              (is (nil? (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))))))

          (testing "indexing failure marks as stalled"
            (let [indexing-state (fresh-indexing-state)]
              (semantic.gate/gate-documents! pgvector index-metadata [(version (card 2) t1)])

              (with-redefs [semantic.index/upsert-index! (fn [& _] (throw (RuntimeException. "Index failure")))]
                (is (thrown? RuntimeException (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)))
                (is (some? (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index)))))

              (test-metric-growth))

            (testing "stalled indexing before grace period continues to throw"
              (let [indexing-state (fresh-indexing-state)
                    stall-time     (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))
                    initial-clock  (.instant clock)]
                (is (some? stall-time))
                (is (= stall-time (:stalled-at @indexing-state)))

                ;; Advance clock but (just about) stay within grace period
                (vreset! clock-ref (.plus initial-clock (.minus semantic.indexer/stall-grace-period (Duration/ofSeconds 1))))
                (with-redefs [semantic.index/upsert-index! (fn [& _] (throw (RuntimeException. "Still failing during grace period")))]
                  (is (thrown? RuntimeException (semantic.indexer/indexing-step pgvector index-metadata index indexing-state))))

                ;; Stall time should not be overwritten (retains original lower value)
                (let [current-stall-time (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))]
                  (is (= stall-time current-stall-time))))

              (test-metric-growth)))

          (testing "recovery from stall clears stall status"
            (let [indexing-state (fresh-indexing-state)
                  stall-time     (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))]
              (is (some? stall-time))
              (semantic.gate/gate-documents! pgvector index-metadata [(version (card 3) t1)])
              (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
              (is (nil? (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))))

              (test-metric-growth)

              (testing ":metabase-search/semantic-indexer-stalled"
                (is (== 0 (mt/metric-value system :metabase-search/semantic-indexer-stalled))))))

          (testing "stalled indexing uses DLQ after grace period"
            (let [indexing-state    (fresh-indexing-state)
                  initial-watermark (:watermark @indexing-state)]
              (vswap! indexing-state assoc :stalled-at (Timestamp/from (.instant clock)))
              (vreset! clock-ref (-> (.instant clock)
                                     (.plus semantic.indexer/stall-grace-period)
                                     (.plus (Duration/ofSeconds 1))))
              (semantic.gate/gate-documents! pgvector index-metadata [(version (card 4) t1)])

              (with-redefs [semantic.index/upsert-index! (fn [& _] (throw (RuntimeException. "Still failing")))]
                (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)

                (testing "DLQ entries created"
                  (let [dlq-rows (get-dlq-rows! pgvector index-metadata @index-id-ref)]
                    (is (seq dlq-rows))
                    (is (= ["card_4"] (map :gate_id dlq-rows)))))

                (testing "watermark progresses despite failures"
                  (let [new-watermark (:watermark @indexing-state)]
                    (is (not= initial-watermark new-watermark))
                    (is (= -1 (compare (:last-poll initial-watermark) (:last-poll new-watermark))))))

                (testing ":metabase-search/semantic-indexer-stalled"
                  (is (== 1 (mt/metric-value system :metabase-search/semantic-indexer-stalled)))))

              (testing ":metabase-search/semantic-indexer-poll-to-poll-interval-ms"
                (is (=? {:sum #(< 0 %)
                         :count #(== 4 %)
                         :buckets #(= 10 (count %))}
                        (mt/metric-value system :metabase-search/semantic-indexer-poll-to-poll-interval-ms)))))))))))

(deftest dlq-integration-with-indexer-loop-test
  (let [pgvector         (semantic.env/get-pgvector-datasource!)
        index-metadata   (semantic.tu/unique-index-metadata)
        model            semantic.tu/mock-embedding-model
        index            (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        clock-ref        (volatile! (Instant/parse "2025-01-04T10:00:00Z"))
        clock            (reify InstantSource (instant [_] @clock-ref))
        t1               (ts "2025-01-01T00:01:00Z")
        card             (fn [id content] {:model "card" :id (str id) :name content :searchable_text content :embeddable_text content})
        version          semantic.gate/search-doc->gate-doc
        poisoned-doc-id  (volatile! nil)
        get-indexed-docs (fn []
                           (jdbc/execute! pgvector
                                          (sql/format {:select [:model_id] :from [(keyword (:table-name index))]} :quoted true)
                                          {:builder-fn jdbc.rs/as-unqualified-lower-maps}))
        upsert-index!    semantic.index/upsert-index!]

    (with-open [_            (semantic.tu/open-metadata! pgvector index-metadata)
                _            (semantic.tu/open-index! pgvector index)
                index-id-ref (semantic.tu/closeable
                              (semantic.index-metadata/record-new-index-table! pgvector index-metadata index)
                              (constantly nil))
                _            (open-dlq! pgvector index-metadata @index-id-ref)]

      (with-redefs [semantic.indexer/lag-tolerance        Duration/ZERO
                    semantic.indexer/dlq-frequency        Duration/ZERO ; every loop iteration
                    semantic.indexer/dlq-max-run-duration (Duration/ofSeconds 2)
                    semantic.indexer/stall-grace-period   Duration/ZERO
                    semantic.indexer/sleep                (fn [_])
                    semantic.dlq/initial-backoff          Duration/ZERO
                    semantic.dlq/transient-policy         (semantic.dlq/linear-policy (Duration/ofMillis 1))
                    ;; upsert to track indexed docs and poison specific documents
                    semantic.index/upsert-index!          (fn [pgvector index docs]
                                                            (run! (fn [doc]
                                                                    (when (= (:id doc) @poisoned-doc-id)
                                                                      (throw (RuntimeException. "Poisoned document"))))
                                                                  docs)
                                                            (when (seq docs)
                                                              ;; Insert into actual index
                                                              (upsert-index! pgvector index docs)))]

        (testing "indexer loop with poisoned document uses DLQ correctly"
          (let [good-docs [(card 1 "Good Doc 1") (card 2 "Good Doc 2") (card 3 "Good Doc 3")]
                bad-doc   (card 4 "Poisoned Doc")
                all-docs  (conj good-docs bad-doc)]

            ;; Set up poisoned document
            (vreset! poisoned-doc-id (str (:id bad-doc)))

            ;; Add all documents to gate
            (semantic.gate/gate-documents! pgvector index-metadata (map #(version % t1) all-docs))

            ;; Create indexing state with short durations and DLQ scheduling
            (let [fresh-indexing-state (fn []
                                         (doto (semantic.indexer/init-indexing-state (get-metadata-row! pgvector index-metadata index))
                                           (vswap! assoc
                                                   :max-run-duration (Duration/ofSeconds 3)
                                                   :exit-early-cold-duration (Duration/ofSeconds 3)
                                                   :next-dlq-run (.instant clock))))]

              (testing "Initial loop will exit with the expected exception"
                (with-open [loop-thread (open-loop-thread! pgvector index-metadata index (fresh-indexing-state))]
                  (let [{:keys [^Thread thread caught-ex]} @loop-thread]
                    (is (.join thread (Duration/ofSeconds 5)) "dies in a reasonable amount of time")
                    (is (= "Poisoned document" (ex-message @caught-ex)))
                    (is (some? (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index)))))))

              (testing "dead letter queue is drained, everything can eventually be indexed"
                (with-open [loop-thread (open-loop-thread! pgvector index-metadata index (fresh-indexing-state))]
                  (let [{:keys [^Thread thread]} @loop-thread]
                    (testing "stall is cleared (dlq allowed us to seek to the gate tail)"
                      (is (mt/poll-until
                           1000
                           (nil? (:indexer_stalled_at (get-metadata-row! pgvector index-metadata index))))))

                    (testing "good docs get indexed right away, despite the poison"
                      (is (mt/poll-until
                           1000
                           (= (frequencies (map :id good-docs))
                              (frequencies (map :model_id (get-indexed-docs)))))))

                    (testing "only 1 dlq entry left"
                      (is (mt/poll-until
                           1000
                           (= 1 (count (get-dlq-rows! pgvector index-metadata @index-id-ref))))))

                    (testing "clear the poison"
                      (vreset! poisoned-doc-id nil)
                      (testing "all docs get indexed"
                        (is (mt/poll-until
                             1000
                             (= (frequencies (map :id all-docs))
                                (frequencies (map :model_id (get-indexed-docs))))))))

                    (testing "dlq drained"
                      (is (mt/poll-until
                           1000
                           (empty? (get-dlq-rows! pgvector index-metadata @index-id-ref)))))

                    (.interrupt thread)
                    (is (.join thread (Duration/ofSeconds 1)) "dies in a reasonable amount of time")))))))))))

(deftest indexer-loop-metric-test
  (mt/with-prometheus-system! [_ system]
    (let [pgvector (semantic.env/get-pgvector-datasource!)
          index-metadata (semantic.tu/unique-index-metadata)
          metadata-row {:id                42
                        :indexer_last_poll (ts "2025-01-01T12:00:00Z")
                        :indexer_last_seen (ts "2025-01-01T11:30:00Z")}
          index        {:table-name "foo"}]
      (testing ":metabase-search/semantic-indexer-loop-ms"
        (with-redefs [semantic.index-metadata/get-active-index-state
                      (fn [& _]
                        {:index index :metadata-row metadata-row})

                      semantic.indexer/indexing-loop
                      (fn [& _]
                        (Thread/sleep 200)
                        nil)]
          (semantic.indexer/quartz-job-run! pgvector index-metadata)
          (is (<= 0.2 (mt/metric-value system :metabase-search/semantic-indexer-loop-ms))))))))
