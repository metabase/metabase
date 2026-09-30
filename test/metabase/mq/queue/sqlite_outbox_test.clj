(ns metabase.mq.queue.sqlite-outbox-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.jdbc-protocols]
   [metabase.app-db.setup]
   [metabase.mq.payload :as payload]
   [metabase.mq.quartz-affinity :as affinity]
   [metabase.mq.queue.backend :as backend]
   [metabase.mq.queue.outbox :as outbox]
   [metabase.mq.queue.quartz :as quartz]
   [metabase.mq.queue.registry :as registry]
   [metabase.task.impl :as task]
   [metabase.task.sqlite-test :as sqlite-test]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (java.nio.file Files)
   (java.util UUID)
   (org.h2.util ScriptReader)))

(set! *warn-on-reflection* true)

(def ^:dynamic *test-queue* nil)

(defn- with-baseline! [f]
  (let [path (Files/createTempFile "sqlite-outbox" ".db" (make-array java.nio.file.attribute.FileAttribute 0))
        ds (data-source/broken-out-details->DataSource :sqlite {:db (str path)})]
    (try
      (with-open [conn (.getConnection ds)
                  reader (doto (ScriptReader. (io/reader (io/resource "sqlite/baseline.sql")))
                           (.setSkipRemarks true))
                  statement (.createStatement conn)]
        (.setAutoCommit conn false)
        (loop []
          (when-let [sql (.readStatement reader)]
            (when-not (str/blank? sql)
              (.execute statement sql))
            (recur)))
        (.commit conn))
      (binding [connection/*application-db* (connection/application-db :sqlite ds)
                t2.conn/*current-connectable* nil
                registry/*queues* (atom {})
                *test-queue* (keyword "queue" (str "sqlite-outbox-" (UUID/randomUUID)))]
        (registry/register-queue! *test-queue* {:transactional :require})
        (let [scheduler (#'sqlite-test/scheduler (str "sqlite-outbox-" (UUID/randomUUID))
                                                 (str "jdbc:sqlite:" path)
                                                 (affinity/ensure-delegate-loadable! :sqlite))]
          (try
            (binding [task/*quartz-scheduler* (atom scheduler)
                      backend/*backend* (quartz/make-backend)]
              (f))
            (finally (.shutdown ^org.quartz.Scheduler scheduler true)))))
      (finally
        (doseq [suffix ["" "-wal" "-shm"]]
          (Files/deleteIfExists (.toPath (io/file (str path suffix)))))))))

(defn- trigger-count []
  (:n (t2/query-one ["SELECT count(*) AS n FROM QRTZ_TRIGGERS"])))

(defn- stale-outbox! []
  (t2/query ["UPDATE queue_message_outbox SET created_at = '2000-01-01 00:00:00.000000'"]))

(deftest sqlite-outbox-commit-and-recovery-test
  (with-baseline!
    (fn []
      (testing "a committed message publishes through a separate Quartz connection and deletes its outbox row"
        (t2/with-transaction [_]
          (outbox/defer-transactional! *test-queue* [{:message "committed"}]))
        (is (= 1 (trigger-count)))
        (is (zero? (t2/count :queue_message_outbox))))
      (testing "nested rollback discards the message along with its outbox row"
        (t2/with-transaction [_]
          (t2/with-transaction [_ nil {:rollback-only true}]
            (outbox/defer-transactional! *test-queue* [{:message "rolled back"}])))
        (is (= 1 (trigger-count)))
        (is (zero? (t2/count :queue_message_outbox))))
      (testing "a failed post-commit publish retains the committed row, and recovery publishes it later"
        (binding [task/*quartz-scheduler* (atom nil)]
          (t2/with-transaction [_]
            (outbox/defer-transactional! *test-queue* [{:message "recover me"}])))
        (is (= 1 (t2/count :queue_message_outbox)))
        (is (= 1 (trigger-count)))
        (stale-outbox!)
        (is (= 1 (outbox/recover-outbox!)))
        (is (= 2 (trigger-count)))
        (is (zero? (t2/count :queue_message_outbox)))))))

(deftest sqlite-outbox-concurrent-recovery-test
  (with-baseline!
    (fn []
      (t2/with-transaction [_]
        (doseq [i (range 120)]
          (outbox/insert-batch! *test-queue* (payload/encode [{:message i}]))))
      (stale-outbox!)
      (let [start (promise)
            sweeps (vec (repeatedly 2 #(future @start (outbox/recover-outbox!))))]
        (deliver start true)
        (is (= 120 (reduce + (map #(deref % 30000 ::timeout) sweeps))))
        (is (= 120 (trigger-count)) "concurrent sweeps must not publish the same row twice")
        (is (zero? (t2/count :queue_message_outbox)))))))

(deftest sqlite-outbox-poison-row-backoff-test
  (with-baseline!
    (fn []
      (let [good-backend backend/*backend*
            fail? (atom true)]
        (outbox/insert-batch! *test-queue* "poison")
        (outbox/insert-batch! *test-queue* (payload/encode [{:message "good"}]))
        (stale-outbox!)
        (binding [backend/*backend* #_{:clj-kondo/ignore [:missing-protocol-method]}
                  (reify backend/QueueBackend
                    (publish! [_ queue encoded]
                      (if (and @fail? (= encoded "poison"))
                        (throw (ex-info "message-specific failure" {}))
                        (backend/publish! good-backend queue encoded))))]
          (is (= 1 (outbox/recover-outbox!)))
          (is (= 1 (trigger-count)))
          (let [row (t2/select-one :queue_message_outbox)]
            (is (= 1 (:publish_attempts row)))
            (is (some? (:next_attempt_at row))))
          (is (zero? (outbox/recover-outbox!)) "backoff prevents immediate retry")
          (reset! fail? false)
          (t2/query ["UPDATE queue_message_outbox SET next_attempt_at = '2000-01-01 00:00:00.000000'"])
          (is (= 1 (outbox/recover-outbox!)))
          (is (= 2 (trigger-count)))
          (is (zero? (t2/count :queue_message_outbox))))))))

(deftest sqlite-outbox-ambiguous-publish-remains-at-least-once-test
  (with-baseline!
    (fn []
      (outbox/insert-batch! *test-queue* (payload/encode [{:message "ambiguous"}]))
      (stale-outbox!)
      (let [good-backend backend/*backend*]
        (binding [backend/*backend* #_{:clj-kondo/ignore [:missing-protocol-method]}
                  (reify backend/QueueBackend
                    (publish! [_ queue encoded]
                      (backend/publish! good-backend queue encoded)
                      ;; Simulates a failed acknowledgement after durable publication.
                      (throw (backend/backend-unavailable-ex "lost acknowledgement" {}))))]
          (is (zero? (outbox/recover-outbox!)))))
      (is (= 1 (trigger-count)))
      (is (= 1 (t2/count :queue_message_outbox)) "uncertain publication must retain the committed message")
      (is (= 1 (outbox/recover-outbox!)))
      (is (= 2 (trigger-count)) "retry may duplicate a publication: delivery remains at-least-once")
      (is (zero? (t2/count :queue_message_outbox))))))
