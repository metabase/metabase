(ns metabase-enterprise.semantic-search.indexer-test
  (:require
   [clojure.test :refer :all]
   [honey.sql :as sql]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import (java.io Closeable)
           (java.sql Timestamp)
           (java.time Duration Instant)))

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
  (let [pgvector       semantic.tu/db
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        t1             (ts "2025-01-01T00:01:00Z")
        t2             (ts "2025-01-02T00:03:10Z")
        t3             (ts "2025-01-03T00:02:42Z")
        c1             {:model "card" :id "1" :name "Poodle" :searchable_text "Dog Training Guide"}
        c2             {:model "card" :id "2" :name "Pug"    :searchable_text "Dog Training Guide 2"}
        c3             {:model "card" :id "3" :name "Collie" :searchable_text "Dog Training Guide 3"}
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
            (is (= 0 (:last-indexed-count @indexing-state)))

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
            (is (= 2 (:last-indexed-count @indexing-state)))

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
            (is (= 0 (:last-indexed-count @indexing-state)))))

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
            (is (= 1 (:last-indexed-count @indexing-state)))))

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
  (testing "idle behavior based on novelty ratio"
    (let [indexing-state (volatile! {:last-poll-count 100 :last-indexed-count 30})]

      (testing "high novelty ratio (>25%) - no sleep"
        (with-redefs [semantic.indexer/sleep (fn [ms] (throw (ex-info "Should not sleep" {:ms ms})))]
          (is (nil? (semantic.indexer/on-indexing-idle indexing-state)))))

      (testing "medium novelty ratio (10-25%) - small backoff"
        (vswap! indexing-state assoc :last-indexed-count 15) ; 15% novelty
        (let [sleep-called (atom nil)]
          (with-redefs [semantic.indexer/sleep #(reset! sleep-called %)]
            (semantic.indexer/on-indexing-idle indexing-state)
            (is (= 250 @sleep-called)))))

      (testing "low novelty ratio (1-10%) - medium backoff"
        (vswap! indexing-state assoc :last-indexed-count 5) ; 5% novelty
        (let [sleep-called (atom nil)]
          (with-redefs [semantic.indexer/sleep #(reset! sleep-called %)]
            (semantic.indexer/on-indexing-idle indexing-state)
            (is (= 1500 @sleep-called)))))

      (testing "very low novelty ratio (<1%) - big backoff"
        (vswap! indexing-state assoc :last-indexed-count 0) ; 0% novelty
        (let [sleep-called (atom nil)]
          (with-redefs [semantic.indexer/sleep #(reset! sleep-called %)]
            (semantic.indexer/on-indexing-idle indexing-state)
            (is (= 3000 @sleep-called))))))))

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
  (let [pgvector       semantic.tu/db
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
  (let [pgvector       semantic.tu/db
        index-metadata (semantic.tu/unique-index-metadata)
        model          semantic.tu/mock-embedding-model
        index          (semantic.index-metadata/qualify-index (semantic.index/default-index model) index-metadata)
        t1             (ts "2025-01-01T00:01:00Z")
        c1             {:model "card" :id "1" :name "Dog" :searchable_text "Dog Training Guide"}
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
              (let [{:keys [^Thread thread caught-ex]} @loop-thread
                    max-wait 1000
                    wait-time (u/start-timer)]
                (testing "exits"
                  (is
                   (loop []
                     (cond
                       (not (.isAlive thread)) true
                       (< max-wait (u/since-ms wait-time)) false
                       :else (recur))))
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
              (let [{:keys [^Thread thread caught-ex]} @loop-thread
                    wait-time (u/start-timer)
                    max-wait 1000]
                (testing "exits"
                  (is
                   (loop []
                     (cond
                       (not (.isAlive thread)) true
                       (< max-wait (u/since-ms wait-time)) false
                       :else (recur))))
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
      (is (zero? (:last-indexed-count state-value)))
      (is (zero? (:last-poll-count state-value))))))

(deftest quartz-job-run!-test
  (let [pgvector        semantic.tu/db
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
          (with-open [job-thread ^Closeable  (open-job-thread pgvector index-metadata)]
            (let [{:keys [caught-ex ^Thread thread]} @job-thread]
              (testing "thread exited"
                (is (.join thread (Duration/ofSeconds 5))))
              (testing "crashed with expected msg"
                (is (= (ex-message ex) (ex-message @caught-ex)))))))))))
