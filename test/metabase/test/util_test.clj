(ns metabase.test.util-test
  "Tests for the test utils!"
  (:require
   [clojure.test :refer :all]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (clojure.lang Agent)
   (java.util.concurrent CountDownLatch ThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

(deftest with-temp-vals-in-db-test
  (testing "let's make sure this actually works right!"
    (let [position #(t2/select-one-fn :position :model/Field :id (data/id :venues :price))]
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (is (= -1
               (position))))
      (is (= 5
             (position)))))

  (testing "if an Exception is thrown, original value should be restored"
    (u/ignore-exceptions
      (mt/with-temp-vals-in-db :model/Field (data/id :venues :price) {:position -1}
        (throw (Exception.))))
    (is (= 5
           (t2/select-one-fn :position :model/Field :id (data/id :venues :price))))))

(setting/defsetting test-util-test-setting
  "Another internal test setting"
  :visibility :internal
  :default    ["A" "B" "C"]
  :type       :csv
  :encryption :no)

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

(deftest ^:parallel with-dynamic-fn-redefs-test
  (testing "Three threads can independently redefine a regular var"
    (let [n-threads  3
          ;; Note that .getId is deprecated in favor of .threadId, but that method is only introduced in Java 19
          thread-id  #(.getId (Thread/currentThread))
          latch      (CountDownLatch. (inc n-threads))
          take-latch #(do
                        (.countDown latch)
                        ;; We give a generous timeout here in case there is heavy contention for the thread pool in CI
                        (when-not (.await latch 30 TimeUnit/SECONDS)
                          (throw (ex-info "Timeout waiting on all threads to pull their latch"
                                          {:latch      latch
                                           :thread-id  (thread-id)
                                           :agent-pool (let [^ThreadPoolExecutor executor Agent/pooledExecutor]
                                                         {:active-count (.getActiveCount executor)
                                                          :pool-size    (.getPoolSize executor)
                                                          :task-count   (.getTaskCount executor)})}))))]

      (testing "The original definition"
        (is (= "original" (clump "o" "riginal"))))

      (future
        (testing "A thread that minds its own business"
          (log/debug "Starting no-op thread, thread-id:" (thread-id))
          (is (= "123" (clump 12 3)))
          (take-latch)
          (is (= "321" (clump 3 21)))))

      (future
        (testing "A thread that redefines it in reverse"
          (log/debug "Starting reverse thread, thread-id:" (thread-id))
          (mt/with-dynamic-fn-redefs [clump #(str %2 %1)]
            (is (= "ok" (clump "k" "o")))
            (take-latch)
            (is (= "ko" (clump "o" "k"))))))

      (future
        (testing "A thread that redefines it twice"
          (log/debug "Starting double-redefining thread, thread-id:" (thread-id))
          (mt/with-dynamic-fn-redefs [clump (fn [_ y] (str y y))]
            (is (= "zz" (clump "a" "z")))
            (mt/with-dynamic-fn-redefs [clump (fn [x _] (str x x))]
              (is (= "aa" (clump "a" "z")))
              (take-latch)
              (is (= "mm" (clump "m" "l"))))
            (is (= "bb" (clump "a" "b"))))))

      (log/debug "Taking latch on main thread, thread-id:" (thread-id))
      (take-latch)
      (testing "The original definition survives"
        (is (= "original" (clump "orig" "inal")))))))

(def not-a-function 23)

(def accidentally-a-function :wut-up)

(def also-accidentally-a-function [:wut-up])

(deftest ^:parallel with-dynamic-fn-redefs-non-function
  (testing "It is an error to redefine a non-function"
    (is (thrown-with-msg?
         AssertionError
         #"Cannot proxy non-functions"
         (mt/with-dynamic-fn-redefs [not-a-function 5]
           (is (= 5 not-a-function))))))
  (testing "Redefining keywords or collections is likely to surprise you, so we don't allow it"
    (is (thrown-with-msg?
         AssertionError
         #"Cannot proxy keywords"
         (mt/with-dynamic-fn-redefs [accidentally-a-function :not-much]
           (is (= :not-much accidentally-a-function)))))
    (is (thrown-with-msg?
         AssertionError
         #"Cannot proxy collections"
         (mt/with-dynamic-fn-redefs [also-accidentally-a-function #{:butter-cup}]
           (is (= [:butter-cup] also-accidentally-a-function)))))))

(defn mock-me-inner []
  :mock/original)

(defn mock-me-outer []
  (mock-me-inner))

(deftest with-dynamic-fn-redefs-nested-binding-test
  (defn z []
    (mt/with-dynamic-fn-redefs [mock-me-outer
                                (let [orig (mt/dynamic-value mock-me-outer)]
                                  (fn []
                                    (mt/with-dynamic-fn-redefs [mock-me-inner (constantly :mock/redefined)]
                                      (orig))))]
      (mock-me-outer)))
  (is (= :mock/redefined (z))))

(deftest ^:parallel ordered-subset?-test
  (is (mt/ordered-subset? [1 2 3] [1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [1 2 1 3 4 5]))
  (is (mt/ordered-subset? [1 2 3] [1 2 3 4]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3]))
  (is (mt/ordered-subset? [1 2 3] [0 1 2 3 4 5]))
  (is (not (mt/ordered-subset? [1 2 3] [1 2])))
  (is (mt/ordered-subset? [] []))
  (is (mt/ordered-subset? [] [1]))
  (is (not (mt/ordered-subset? [1] [])))
  (is (mt/ordered-subset? ["foo"   "bar"              "baz"]
                          ["elephants" "foxes" "badgers" "zebras" "beavers" "platypi"]
                          (fn [x y] (= (first x) (first y))))))
