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
   [metabase.mq.transport :as transport]
   [metabase.task.impl :as task.impl]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs :refer [with-dynamic-fn-redefs]]
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

;; These tests read/write the `queue_message_outbox` table directly, so the app-db must be migrated.
(use-fixtures :once (fixtures/initialize :db))
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
                  task.impl/*quartz-scheduler* (atom nil)]
          (outbox/publish-outbox-rows!
           (atom {:metabase.mq.queue.outbox/rows
                  [{:id id :channel :queue/outbox-require :payload pl}]})))
        (is (t2/exists? :queue_message_outbox :id id)
            "publish failed, so the row is retained (not silently deleted)")))))

(deftest recover-outbox-partial-failure-keeps-delivered-rows-deleted-test
  (testing "a publish failure partway through the sweep does not roll back rows already published+deleted"
    (mq.tu/with-test-mq [_ctx]
      (let [good    (payload/encode ["good"])
            bad     (payload/encode ["bad"])
            old     (Timestamp/from (.minusMillis (Instant/now) (* 5 60 1000)))
            good-id (t2/insert-returning-pk! :queue_message_outbox
                                             {:queue_name "outbox-recover" :payload good :created_at old})
            ;; higher id -> published after the good row (order-by id asc)
            bad-id  (t2/insert-returning-pk! :queue_message_outbox
                                             {:queue_name "outbox-recover" :payload bad :created_at old})
            published (atom [])
            ;; capture the unpatched fn via original-fn — a bare var ref would resolve to the
            ;; with-dynamic-fn-redefs proxy and recurse (see that macro's docstring).
            real-publish (dynamic-redefs/original-fn #'transport/publish-encoded!)]
        (with-dynamic-fn-redefs [transport/publish-encoded!
                                 (fn [channel payload]
                                   (if (= payload bad)
                                     (throw (ex-info "boom" {}))
                                     (do (swap! published conj payload)
                                         (real-publish channel payload))))]
          (is (= 1 (outbox/recover-outbox!)) "only the good row counts as recovered"))
        (is (= [good] @published) "the good row was published exactly once")
        (is (not (t2/exists? :queue_message_outbox :id good-id))
            "the published row is deleted and its delete is NOT rolled back by the later failure")
        (is (t2/exists? :queue_message_outbox :id bad-id)
            "the failed row is retained for a later sweep")))))

(deftest publish-outbox-rows-batches-deletes-test
  (testing "successfully published rows are deleted as a batch; a row whose publish fails is retained"
    (mq.tu/with-test-mq [_ctx]
      (let [p1   (payload/encode ["one"])
            p2   (payload/encode ["two"])
            p3   (payload/encode ["three"])
            id1  (t2/insert-returning-pk! :queue_message_outbox {:queue_name "outbox-require" :payload p1})
            id2  (t2/insert-returning-pk! :queue_message_outbox {:queue_name "outbox-require" :payload p2})
            id3  (t2/insert-returning-pk! :queue_message_outbox {:queue_name "outbox-require" :payload p3})
            published (atom [])
            real-publish (dynamic-redefs/original-fn #'transport/publish-encoded!)]
        (with-dynamic-fn-redefs [transport/publish-encoded!
                                 (fn [channel payload]
                                   ;; the middle row fails to publish
                                   (if (= payload p2)
                                     (throw (ex-info "boom" {}))
                                     (do (swap! published conj payload)
                                         (real-publish channel payload))))]
          (outbox/publish-outbox-rows!
           (atom {:metabase.mq.queue.outbox/rows
                  [{:id id1 :channel :queue/outbox-require :payload p1}
                   {:id id2 :channel :queue/outbox-require :payload p2}
                   {:id id3 :channel :queue/outbox-require :payload p3}]})))
        (is (not (t2/exists? :queue_message_outbox :id id1)) "published row deleted")
        (is (t2/exists? :queue_message_outbox :id id2) "failed row retained for recovery")
        (is (not (t2/exists? :queue_message_outbox :id id3)) "published row deleted")))))

(deftest recover-outbox-skips-fresh-rows-test
  (mq.tu/with-test-mq [_ctx]
    (testing "rows younger than the recovery age are left for the normal after-commit path"
      (t2/insert! :queue_message_outbox
                  {:queue_name "outbox-recover"
                   :payload    (payload/encode ["fresh"])})
      (is (= 0 (outbox/recover-outbox!)) "no rows old enough to recover")
      (is (= 1 (outbox-count "outbox-recover")) "fresh row left in place"))))

(defn- ->instant
  "Coerce a timestamp column value to an Instant — the app DB may hand it back as an OffsetDateTime
  (Postgres timestamptz) or a java.sql.Timestamp (H2), depending on the backend."
  ^java.time.Instant [t]
  (condp instance? t
    java.time.OffsetDateTime (.toInstant ^java.time.OffsetDateTime t)
    java.sql.Timestamp       (.toInstant ^java.sql.Timestamp t)
    java.time.Instant        t))

(def ^:private stale-ts (Timestamp/from (.minusMillis (Instant/now) (* 5 60 1000))))

(defn- insert-stale-row! [payload]
  (t2/insert-returning-pk! :queue_message_outbox
                           {:queue_name "outbox-recover" :payload payload :created_at stale-ts}))

(defn- always-fail-publish []
  (fn [_channel _payload] (throw (ex-info "always boom" {}))))

(deftest recover-outbox-bumps-attempts-on-publish-failure-test
  (testing "a row whose publish keeps failing is retained with its attempts bumped and a future retry scheduled — not dropped, and not re-attempted within the same sweep"
    (mq.tu/with-test-mq [_ctx]
      (let [id (insert-stale-row! (payload/encode ["poison"]))]
        (with-dynamic-fn-redefs [transport/publish-encoded! (always-fail-publish)]
          (is (= 0 (outbox/recover-outbox!)) "nothing recovered"))
        (is (t2/exists? :queue_message_outbox :id id) "poison row retained for a later sweep")
        (let [row (t2/select-one [:queue_message_outbox :publish_attempts :next_attempt_at] :id id)]
          (is (= 1 (:publish_attempts row))
              "attempts bumped exactly once for the one sweep (the failed row is skipped, not re-claimed)")
          (is (some? (:next_attempt_at row)) "a backed-off retry time is scheduled"))))))

(deftest recover-outbox-never-drops-and-backs-off-failing-row-test
  (testing "a row whose publish always fails is retried with exponential backoff forever — never dropped"
    (mq.tu/with-test-mq [_ctx]
      (let [id (insert-stale-row! (payload/encode ["always-fails"]))]
        (with-dynamic-fn-redefs [transport/publish-encoded! (always-fail-publish)]
          ;; sweep 1: attempt bumped and a future next_attempt_at scheduled (backing off)
          (is (= 0 (outbox/recover-outbox!)) "nothing recovered")
          (let [row (t2/select-one [:queue_message_outbox :publish_attempts :next_attempt_at] :id id)]
            (is (= 1 (:publish_attempts row)) "attempts bumped")
            (is (.isAfter (->instant (:next_attempt_at row)) (Instant/now))
                "next attempt scheduled in the future"))
          ;; immediate re-sweep: the row is not due yet, so it is skipped (attempts unchanged)
          (is (= 0 (outbox/recover-outbox!)) "nothing recovered")
          (is (= 1 (:publish_attempts (t2/select-one [:queue_message_outbox :publish_attempts] :id id)))
              "a row that is not yet due is not re-attempted before its backoff elapses")
          ;; force the row due and sweep again: re-attempted, attempt count grows, still retained
          (t2/update! :queue_message_outbox :id id
                      {:next_attempt_at (Timestamp/from (.minusSeconds (Instant/now) 1))})
          (is (= 0 (outbox/recover-outbox!)) "nothing recovered")
          (is (= 2 (:publish_attempts (t2/select-one [:queue_message_outbox :publish_attempts] :id id)))
              "a due row is re-attempted and its attempt count keeps growing")
          (is (t2/exists? :queue_message_outbox :id id)
              "the row is never dropped no matter how many times it fails"))))))

(deftest retry-delay-ms-is-exponential-and-capped-test
  (testing "recovery retry backoff doubles per consecutive failure and is capped"
    (is (= [60000 120000 240000 480000 (* 10 60 1000)] (map outbox/retry-delay-ms [1 2 3 4 5]))
        "exponential: 1m base, doubling — attempt 5 would be 16m but caps at the 10m max")
    (is (= (* 10 60 1000) (outbox/retry-delay-ms 50)) "capped at the max backoff")
    (is (= (* 10 60 1000) (outbox/retry-delay-ms 100000)) "no overflow at extreme attempt counts")))

(deftest recover-outbox-poison-row-does-not-block-newer-rows-test
  (testing "a full page of poison rows at the head does not starve the recoverable rows behind them in the same sweep"
    (mq.tu/with-test-mq [_ctx]
      ;; shrink the per-transaction page so two poison rows fill it; the good row (higher id) is only
      ;; reachable on the next loop iteration, which the old code never got to (it stopped on deleted=0).
      (with-redefs-fn {#'outbox/recovery-page-size 2}
        (fn []
          (let [poison  (payload/encode ["poison"])
                good    (payload/encode ["good"])
                _p1     (insert-stale-row! poison)
                _p2     (insert-stale-row! poison)
                good-id (insert-stale-row! good)
                published    (atom [])
                real-publish (dynamic-redefs/original-fn #'transport/publish-encoded!)]
            (with-dynamic-fn-redefs [transport/publish-encoded!
                                     (fn [channel payload]
                                       (if (= payload poison)
                                         (throw (ex-info "boom" {}))
                                         (do (swap! published conj payload)
                                             (real-publish channel payload))))]
              (is (= 1 (outbox/recover-outbox!))
                  "the good row is recovered despite the full batch of poison rows ahead of it"))
            (is (= [good] @published) "the good row was published exactly once")
            (is (not (t2/exists? :queue_message_outbox :id good-id)) "good row published and deleted")
            (is (= 2 (outbox-count "outbox-recover")) "only the two poison rows remain")))))))

(deftest recover-outbox-emits-retry-metric-on-publish-failure-test
  (testing "a recovery failure that will be retried surfaces as batches-retried{recovery} (rows are never dropped)"
    (mt/with-prometheus-system! [_ system]
      (mq.tu/with-test-mq [_ctx]
        (insert-stale-row! (payload/encode ["fails"]))
        (with-dynamic-fn-redefs [transport/publish-encoded! (always-fail-publish)]
          (outbox/recover-outbox!)
          (is (pos? (mt/metric-value system :metabase-mq/batches-retried {:channel "outbox-recover" :reason "outbox-recovery"}))
              "a failed recovery publish that will be retried increments batches-retried{reason=recovery}"))))))

(deftest recover-outbox-stops-early-when-backend-unavailable-test
  (testing "when a publish reports the backend is unavailable, the sweep stops after the first attempt instead of thrashing (and bumping) every remaining row"
    (mq.tu/with-test-mq [_ctx]
      (let [ids   (vec (repeatedly 3 #(insert-stale-row! (payload/encode ["x"]))))
            calls (atom 0)]
        (with-dynamic-fn-redefs [transport/publish-encoded!
                                 (fn [_ _]
                                   (swap! calls inc)
                                   (throw (q.backend/backend-unavailable-ex "backend down" {})))]
          (is (= 0 (outbox/recover-outbox!)) "nothing recovered while the backend is down"))
        (is (= 1 @calls)
            "only ONE publish is attempted — the sweep stops on the first backend-unavailable error")
        (doseq [id ids]
          (is (t2/exists? :queue_message_outbox :id id) "every row is retained for the next sweep")
          (is (= 0 (:publish_attempts (t2/select-one [:queue_message_outbox :publish_attempts] :id id)))
              "no row is bumped — a backend being down doesn't burn anyone's retry budget"))))))

(deftest recover-outbox-message-specific-failure-still-continues-past-it-test
  (testing "a message-specific (non-backend) failure is still skipped past — only backend-unavailable stops the sweep"
    (mq.tu/with-test-mq [_ctx]
      (with-redefs-fn {#'outbox/recovery-page-size 2}
        (fn []
          (let [poison  (payload/encode ["poison"])
                good    (payload/encode ["good"])
                _p      (insert-stale-row! poison)
                good-id (insert-stale-row! good)
                real-publish (dynamic-redefs/original-fn #'transport/publish-encoded!)]
            (with-dynamic-fn-redefs [transport/publish-encoded!
                                     (fn [channel payload]
                                       (if (= payload poison)
                                         (throw (ex-info "message-specific boom" {})) ; NOT backend-unavailable
                                         (real-publish channel payload)))]
              (is (= 1 (outbox/recover-outbox!))
                  "the good row behind a message-specific failure is still recovered"))
            (is (not (t2/exists? :queue_message_outbox :id good-id)) "good row published and deleted")))))))
