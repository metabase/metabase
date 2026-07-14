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
