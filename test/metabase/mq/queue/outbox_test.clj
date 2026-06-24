(ns ^:synchronous metabase.mq.queue.outbox-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as app-db.conn]
   [metabase.mq.core :as mq]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.outbox :as outbox]
   [metabase.mq.queue.quartz :as q.quartz]
   [metabase.mq.test-util :as mq.tu]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.sql Timestamp)
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; Queues declared the production way (namespace-load-time macros) so `register-queues!` realizes
;;; them into every `with-test-mq` run's fresh `*queues*` atom with the `:transactional` mode under test.
(mq/def-queue! :queue/outbox-require {:transactional :require})
(mq/def-queue! :queue/outbox-try     {:transactional :try})
(mq/def-queue! :queue/outbox-never   {:transactional :never})
(mq/def-queue! :queue/outbox-chunked {:transactional :require :max-batch-messages 2})
(mq/def-queue! :queue/outbox-dedup   {:transactional :require :dedup-fn distinct})
(mq/def-queue! :queue/outbox-recover {:transactional :require})

(def ^:private test-queue-names
  ["outbox-require" "outbox-try" "outbox-never" "outbox-chunked" "outbox-dedup" "outbox-recover"])

(defn- clear-outbox! [t]
  (t2/delete! :queue_message_outbox :queue_name [:in test-queue-names])
  (try (t) (finally (t2/delete! :queue_message_outbox :queue_name [:in test-queue-names]))))

(use-fixtures :each clear-outbox!)

(defn- outbox-count [qname]
  (t2/count :queue_message_outbox :queue_name qname))

(deftest require-mode-no-transaction-throws-test
  (mq.tu/with-test-mq [_ctx]
    (testing ":require published outside a transaction throws"
      (is (thrown-with-msg?
           ExceptionInfo #":transactional :require"
           (mq/with-queue :queue/outbox-require [q]
             (mq/put q "nope"))))
      (is (zero? (outbox-count "outbox-require")) "nothing written to the outbox"))))

(deftest require-mode-atomic-with-business-write-test
  (let [heard (atom [])
        email (mt/random-email)]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-require (fn [m] (swap! heard conj m))}
      (testing "rollback: neither the business write nor the message survive"
        (is (thrown? Exception
                     (t2/with-transaction [_conn]
                       (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))
                       (mq/with-queue :queue/outbox-require [q]
                         (mq/put q "nope"))
                       (throw (ex-info "rollback" {})))))
        (mq.tu/flush! ctx)
        (is (not (t2/exists? :model/User :email email)) "business write rolled back")
        (is (= [] @heard) "no message delivered")
        (is (zero? (outbox-count "outbox-require")) "no outbox row persisted"))
      (testing "commit: the business write commits and the message is delivered, outbox cleared"
        (try
          (t2/with-transaction [_conn]
            (t2/insert! :model/User (assoc (mt/with-temp-defaults :model/User) :email email))
            (mq/with-queue :queue/outbox-require [q]
              (mq/put q "hello")))
          (mq.tu/eventually! ctx #(= ["hello"] @heard) 5000)
          (is (= ["hello"] @heard))
          (is (t2/exists? :model/User :email email))
          (is (zero? (outbox-count "outbox-require")) "outbox row deleted after publish")
          (finally
            (t2/delete! :model/User :email email)))))))

(deftest try-mode-no-transaction-publishes-immediately-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-try (fn [m] (swap! heard conj m))}
      (mq/with-queue :queue/outbox-try [q]
        (mq/put q "x"))
      (mq.tu/eventually! ctx #(= ["x"] @heard) 5000)
      (is (= ["x"] @heard))
      (is (zero? (outbox-count "outbox-try")) "no outbox row used outside a transaction"))))

(deftest try-mode-in-transaction-uses-outbox-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-try (fn [m] (swap! heard conj m))}
      (t2/with-transaction [_conn]
        (mq/with-queue :queue/outbox-try [q]
          (mq/put q "y")))
      (mq.tu/eventually! ctx #(= ["y"] @heard) 5000)
      (is (= ["y"] @heard) ":try inside a transaction is delivered after commit"))))

(deftest never-mode-in-transaction-defers-in-memory-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-never (fn [m] (swap! heard conj m))}
      (t2/with-transaction [_conn]
        (mq/with-queue :queue/outbox-never [q]
          (mq/put q "z")))
      (mq.tu/eventually! ctx #(= ["z"] @heard) 5000)
      (is (= ["z"] @heard))
      (is (zero? (outbox-count "outbox-never")) ":never never touches the outbox table"))))

(deftest chunking-respects-max-batch-messages-test
  (mq.tu/with-test-mq [_ctx]
    (testing "messages are chunked by :max-batch-messages into one outbox row per chunk"
      (binding [app-db.conn/*transaction-state*
                (atom {:metabase.mq.queue.outbox/messages
                       {:queue/outbox-chunked ["a" "b" "c" "d" "e"]}})]
        (outbox/insert-outbox-rows!))
      (is (= 3 (outbox-count "outbox-chunked")) "5 messages, max-batch 2 -> 3 rows (2,2,1)")
      (let [payloads (->> (t2/query {:select   [:payload]
                                     :from     [:queue_message_outbox]
                                     :where    [:= :queue_name "outbox-chunked"]
                                     :order-by [[:id :asc]]})
                          (map (comp payload/decode :payload)))]
        (is (= [["a" "b"] ["c" "d"] ["e"]] payloads))))))

(deftest dedup-applied-in-outbox-test
  (mq.tu/with-test-mq [_ctx]
    (testing "the queue's dedup-fn is applied before messages are written to the outbox"
      (binding [app-db.conn/*transaction-state*
                (atom {:metabase.mq.queue.outbox/messages
                       {:queue/outbox-dedup ["a" "a" "b" "a"]}})]
        (outbox/insert-outbox-rows!))
      (is (= 1 (outbox-count "outbox-dedup")))
      (let [msgs (->> (t2/query {:select [:payload]
                                 :from   [:queue_message_outbox]
                                 :where  [:= :queue_name "outbox-dedup"]})
                      (mapcat (comp payload/decode :payload)))]
        (is (= ["a" "b"] (vec msgs)))))))

(deftest multiple-publishes-one-transaction-register-callbacks-once-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-require (fn [m] (swap! heard conj m))}
      (testing "several with-queue publishes in one txn register the before/after callbacks once — no duplicate delivery"
        (t2/with-transaction [_conn]
          (mq/with-queue :queue/outbox-require [q] (mq/put q "a"))
          (mq/with-queue :queue/outbox-require [q] (mq/put q "b"))
          (mq/with-queue :queue/outbox-require [q] (mq/put q "c")))
        (mq.tu/eventually! ctx #(<= 3 (count @heard)) 5000)
        (mq.tu/flush! ctx)
        (is (= ["a" "b" "c"] (sort @heard))
            "each message delivered exactly once (a second after-commit run would duplicate them)")
        (is (zero? (outbox-count "outbox-require")) "outbox cleared after publish")))))

(deftest nested-transaction-commit-delivers-all-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-require (fn [m] (swap! heard conj m))}
      (testing "publishes from outer and committed nested savepoints are all delivered once"
        (t2/with-transaction [_outer]
          (mq/with-queue :queue/outbox-require [q] (mq/put q "outer"))
          (t2/with-transaction [_inner]
            (mq/with-queue :queue/outbox-require [q] (mq/put q "inner"))))
        (mq.tu/eventually! ctx #(= #{"outer" "inner"} (set @heard)) 5000)
        (is (= #{"outer" "inner"} (set @heard)))
        (is (zero? (outbox-count "outbox-require")) "outbox cleared after publish")))))

(deftest nested-transaction-inner-rollback-discards-inner-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-require (fn [m] (swap! heard conj m))}
      (testing "a message published in a rolled-back nested savepoint is discarded; the outer one survives"
        (t2/with-transaction [_outer]
          (mq/with-queue :queue/outbox-require [q] (mq/put q "outer"))
          (try
            (t2/with-transaction [_inner]
              (mq/with-queue :queue/outbox-require [q] (mq/put q "inner"))
              (throw (ex-info "rollback inner" {})))
            (catch Exception _)))
        (mq.tu/eventually! ctx #(= ["outer"] @heard) 5000)
        (is (= ["outer"] @heard) "only the outer message is delivered")
        (is (zero? (outbox-count "outbox-require")) "outbox cleared after publish")))))

(deftest recover-outbox-republishes-stale-rows-test
  (let [heard (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/outbox-recover (fn [m] (swap! heard conj m))}
      (testing "a row a crash left behind is republished and deleted by the recovery sweep"
        (t2/insert! :queue_message_outbox
                    {:queue_name "outbox-recover"
                     :payload    (payload/encode ["recovered"])
                     :created_at (Timestamp/from (.minusMillis (Instant/now) (* 5 60 1000)))})
        (is (= 1 (outbox-count "outbox-recover")))
        (is (= 1 (outbox/recover-outbox!)) "one row republished")
        (mq.tu/eventually! ctx #(= ["recovered"] @heard) 5000)
        (is (= ["recovered"] @heard))
        (is (zero? (outbox-count "outbox-recover")) "row deleted after republish")))))

(deftest publish-outbox-rows-retains-row-when-publish-fails-test
  (testing "if the backend publish fails (e.g. quartz with no scheduler) the row is left for the recovery sweep, not deleted"
    (mq.tu/with-test-mq [_ctx]
      (let [pl (payload/encode ["keep-me"])
            id (t2/insert-returning-pk! :queue_message_outbox
                                        {:queue_name "outbox-require" :payload pl})]
        ;; Point the active backend at quartz with no scheduler so publish! throws; the per-row
        ;; try/catch in publish-outbox-rows! must then leave the row in place for recovery.
        (binding [q.backend/*backend*          q.quartz/backend
                  task.impl/*quartz-scheduler* (atom nil)
                  app-db.conn/*transaction-state*
                  (atom {:metabase.mq.queue.outbox/rows
                         [{:id id :channel :queue/outbox-require :payload pl}]})]
          (outbox/publish-outbox-rows!))
        (is (t2/exists? :queue_message_outbox :id id)
            "publish failed, so the row is retained (not silently deleted)")))))

(deftest recover-outbox-skips-fresh-rows-test
  (mq.tu/with-test-mq [_ctx]
    (testing "rows younger than the recovery age are left for the normal after-commit path"
      (t2/insert! :queue_message_outbox
                  {:queue_name "outbox-recover"
                   :payload    (payload/encode ["fresh"])})
      (is (= 0 (outbox/recover-outbox!)) "no rows old enough to recover")
      (is (= 1 (outbox-count "outbox-recover")) "fresh row left in place"))))
