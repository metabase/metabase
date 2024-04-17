(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require
   [clojure.test :refer :all]
   [metabase.models.field :refer [Field]]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this acutally works right!"
    (let [position #(t2/select-one-fn :position Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))

  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
     (mt/with-temp-vals-in-db Field (data/id :venues :price) {:position -1}
       (throw (Exception.))))
    (is (= 5
           (t2/select-one-fn :position Field :id (data/id :venues :price))))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default    ["A" "B" "C"]
  :type       :csv)

(deftest with-temporary-setting-values-test
  (testing "`with-temporary-setting-values` should do its thing"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (is (= ["D" "E" "F"]
             (test-util-test-setting)))))

  (testing "`with-temporary-setting-values` shouldn't stomp over default values"
    (mt/with-temporary-setting-values [test-util-test-setting ["D" "E" "F"]]
      (test-util-test-setting))
    (is (= ["A" "B" "C"]
           (test-util-test-setting)))))

(defn- clump [x y] (str x y))

(deftest ^:parallel with-dynamic-redefs-test
  (testing "Three threads can independently redefine a regular var"
    (let [n-threads  3
          thread-id  #(.threadId (Thread/currentThread))
          latch      (CountDownLatch. (inc n-threads))
          take-latch #(do
                        (.countDown latch)
                        ;; We give a generous timeout here in case there is heavy contention for the thread pool in CI
                        (when-not (.await latch 30 TimeUnit/SECONDS)
                          (throw (ex-info "Timeout waiting on all threads to pull their latch"
                                          {:latch     latch
                                           :thread-id (thread-id)}))))]

      (testing "The original definition"
        (is (= "original" (clump "o" "riginal"))))

      (future
        (testing "A thread that minds its own business"
          (log/info "Starting no-op thread, thread-id:" (thread-id))
          (is (= "123" (clump 12 3)))
          (take-latch)
          (is (= "321" (clump 3 21)))))

      (future
        (testing "A thread that redefines it in reverse"
          (log/info "Starting reverse thread, thread-id:" (thread-id))
          (mt/with-dynamic-redefs [clump #(str %2 %1)]
            (is (= "ok" (clump "k" "o")))
            (take-latch)
            (is (= "ko" (clump "o" "k"))))))

      (future
        (testing "A thread that redefines it twice"
          (log/info "Starting double-redefining thread, thread-id:" (thread-id))
          (mt/with-dynamic-redefs [clump (fn [_ y] (str y y))]
            (is (= "zz" (clump "a" "z")))
            (mt/with-dynamic-redefs [clump (fn [x _] (str x x))]
              (is (= "aa" (clump "a" "z")))
              (take-latch)
              (is (= "mm" (clump "m" "l"))))
            (is (= "bb" (clump "a" "b"))))))

      (log/info "Taking latch on main thread, thread-id:" (thread-id))
      (take-latch)
      (testing "The original definition survives"
        (is (= "original" (clump "orig" "inal")))))))
