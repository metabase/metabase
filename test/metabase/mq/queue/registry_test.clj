(ns metabase.mq.queue.registry-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.registry :as q.registry])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- with-fresh-queues [f]
  (binding [q.registry/*queues* (atom {})]
    (f)))

(use-fixtures :each with-fresh-queues)

(deftest transactional-is-required-test
  (testing "register-queue! throws when :transactional is missing"
    (is (thrown-with-msg?
         ExceptionInfo #"(?i)transactional"
         (q.registry/register-queue! :queue/no-transactional {}))))
  (testing "register-queue! throws when :transactional is an invalid value"
    (is (thrown-with-msg?
         ExceptionInfo #"(?i)transactional"
         (q.registry/register-queue! :queue/bad-transactional {:transactional :sometimes})))))

(deftest transactional-accepts-each-mode-test
  (doseq [mode [:require :try :never]]
    (testing (str ":transactional " mode " is accepted")
      (q.registry/register-queue! (keyword "queue" (str "txn-" (name mode))) {:transactional mode})
      (is (= mode (q.registry/transactional (keyword "queue" (str "txn-" (name mode)))))))))

(deftest transactional-accessor-returns-nil-for-unknown-queue-test
  (is (nil? (q.registry/transactional :queue/never-declared))))

(deftest other-config-still-works-with-transactional-test
  (q.registry/register-queue! :queue/configured
                              {:transactional :try :exclusive true :max-batch-messages 7})
  (is (true? (q.registry/exclusive? :queue/configured)))
  (is (= 7 (q.registry/max-batch-messages :queue/configured)))
  (is (= :try (q.registry/transactional :queue/configured))))

(deftest rejects-invalid-config-values-test
  (testing "register-queue! rejects a non-positive :max-batch-messages"
    (is (thrown-with-msg?
         ExceptionInfo #"max-batch-messages"
         (q.registry/register-queue! :queue/neg-batch {:transactional :try :max-batch-messages -5})))
    (is (thrown-with-msg?
         ExceptionInfo #"max-batch-messages"
         (q.registry/register-queue! :queue/zero-batch {:transactional :try :max-batch-messages 0}))))
  (testing "register-queue! rejects a non-boolean :exclusive"
    (is (thrown-with-msg?
         ExceptionInfo #"exclusive"
         (q.registry/register-queue! :queue/bad-exclusive {:transactional :try :exclusive "yes"}))))
  (testing "register-queue! rejects a non-fn :dedup-fn"
    (is (thrown-with-msg?
         ExceptionInfo #"dedup-fn"
         (q.registry/register-queue! :queue/bad-dedup {:transactional :try :dedup-fn 42}))))
  (testing "register-queue! rejects unknown/typo'd keys (closed map)"
    (is (thrown-with-msg?
         ExceptionInfo #"disallowed"
         (q.registry/register-queue! :queue/typo {:transactional :try :max-batch-mesages 3})))))

(deftest valid-config-still-registers-test
  (testing "a fully-valid config registers without error"
    (q.registry/register-queue! :queue/ok {:transactional :require :exclusive true
                                           :max-batch-messages 50 :dedup-fn identity})
    (is (= 50 (q.registry/max-batch-messages :queue/ok)))))

(deftest max-concurrent-batches-test
  (testing "a queue that doesn't declare a cap has none"
    (q.registry/register-queue! :queue/uncapped {:transactional :try})
    (is (nil? (q.registry/max-concurrent-batches :queue/uncapped))))
  (testing "an undeclared queue has no cap"
    (is (nil? (q.registry/max-concurrent-batches :queue/never-declared))))
  (testing "a literal int cap is returned as-is"
    (q.registry/register-queue! :queue/capped {:transactional :try :max-concurrent-batches 3})
    (is (= 3 (q.registry/max-concurrent-batches :queue/capped))))
  (testing "a fn cap is resolved at read time, so it tracks a setting that changes"
    (let [cap (atom 2)]
      (q.registry/register-queue! :queue/dynamic {:transactional :try
                                                  :max-concurrent-batches (fn [] @cap)})
      (is (= 2 (q.registry/max-concurrent-batches :queue/dynamic)))
      (reset! cap 5)
      (is (= 5 (q.registry/max-concurrent-batches :queue/dynamic))))))

(deftest max-concurrent-batches-fn-that-throws-is-treated-as-unbounded-test
  (testing "a cap fn that throws degrades to unbounded (nil) instead of propagating"
    ;; This resolver runs inside the Quartz trigger-acquisition filter, so a throw here would abort
    ;; acquisition for *every* queue on the node, not just this one. The cap is a best-effort throttle,
    ;; so a broken resolver must degrade to unbounded rather than wedge the scheduler.
    (q.registry/register-queue! :queue/boom-cap
                                {:transactional          :try
                                 :max-concurrent-batches (fn [] (throw (ex-info "boom" {})))})
    (is (nil? (q.registry/max-concurrent-batches :queue/boom-cap)))))

(deftest rejects-exclusive-with-max-concurrent-batches-test
  (testing "a queue cannot declare both :exclusive and :max-concurrent-batches"
    ;; :exclusive already pins the queue to one batch cluster-wide, which is strictly stronger than any
    ;; per-node cap. Declaring both reads like it means something and doesn't.
    (is (thrown-with-msg?
         ExceptionInfo #"(?i)exclusive"
         (q.registry/register-queue! :queue/both {:transactional          :try
                                                  :exclusive              true
                                                  :max-concurrent-batches 2}))))
  (testing "and not even with a cap of 1, which looks equivalent but isn't (per-node vs cluster-wide)"
    (is (thrown-with-msg?
         ExceptionInfo #"(?i)exclusive"
         (q.registry/register-queue! :queue/both-one {:transactional          :try
                                                      :exclusive              true
                                                      :max-concurrent-batches 1}))))
  (testing ":exclusive false alongside a cap is fine — that's just the per-node cap on its own"
    (q.registry/register-queue! :queue/not-exclusive {:transactional          :try
                                                      :exclusive              false
                                                      :max-concurrent-batches 3})
    (is (= 3 (q.registry/max-concurrent-batches :queue/not-exclusive)))
    (is (false? (q.registry/exclusive? :queue/not-exclusive))))
  (testing "either one on its own still registers"
    (q.registry/register-queue! :queue/just-exclusive {:transactional :try :exclusive true})
    (is (true? (q.registry/exclusive? :queue/just-exclusive)))
    (is (nil? (q.registry/max-concurrent-batches :queue/just-exclusive)))
    (q.registry/register-queue! :queue/just-capped {:transactional :try :max-concurrent-batches 2})
    (is (= 2 (q.registry/max-concurrent-batches :queue/just-capped)))
    (is (false? (q.registry/exclusive? :queue/just-capped)))))

(deftest rejects-invalid-max-concurrent-batches-test
  (testing "register-queue! rejects a non-positive :max-concurrent-batches"
    (is (thrown-with-msg?
         ExceptionInfo #"max-concurrent-batches"
         (q.registry/register-queue! :queue/zero-cap {:transactional :try :max-concurrent-batches 0})))
    (is (thrown-with-msg?
         ExceptionInfo #"max-concurrent-batches"
         (q.registry/register-queue! :queue/neg-cap {:transactional :try :max-concurrent-batches -1}))))
  (testing "register-queue! rejects a :max-concurrent-batches that is neither an int nor a fn"
    (is (thrown-with-msg?
         ExceptionInfo #"max-concurrent-batches"
         (q.registry/register-queue! :queue/str-cap {:transactional :try :max-concurrent-batches "2"})))))
