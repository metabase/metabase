(ns metabase.util.retry-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.util :as tu]
   [metabase.util.retry :as retry])
  (:import
   (clojure.lang ExceptionInfo)))

(deftest retrying-on-exception-test
  (testing "recovery possible"
    (let [f +
          params (range 6)
          works-after 3
          flaky-f (tu/works-after works-after f)]
      (is (= (apply f params)
             (retry/with-retry (assoc (retry/retry-configuration)
                                      :max-retries works-after
                                      :initial-interval-millis 1)
               (apply flaky-f params))))))
  (testing "recovery impossible"
    (let [f +
          params (range 6)
          works-after 3
          flaky-f (tu/works-after works-after f)]
      (is (thrown? ExceptionInfo
                   (retry/with-retry (assoc (retry/retry-configuration)
                                            :max-retries (dec works-after)
                                            :initial-interval-millis 1)
                     (apply flaky-f params)))))))

(deftest retrying-on-result-test
  (testing "recovery possible"
    (let [a (atom 0)
          f #(swap! a inc)]
      (is (= 2 (retry/with-retry (assoc (retry/retry-configuration)
                                        :max-retries 1
                                        :retry-if (fn [val _] (odd? val))
                                        :initial-interval-millis 1)
                 (f))))))

  (testing "recovery impossible"
    (let [f (constantly 1)]
      (is (= 1 (retry/with-retry (assoc (retry/retry-configuration)
                                        :max-retries 1
                                        :retry-if (fn [val _] (odd? val))
                                        :initial-interval-millis 1)
                 (f)))))))

;; For use by other tests.

(defn retry-analytics-config-hook [& [extra-config]]
  (let [state (atom {:retries 0})]
    [(fn [config]
       (-> config
           (assoc :initial-interval-millis 1
                  :max-retries 1)
           (merge extra-config)
           (update :on-success (fn [f]
                                 (fn [res]
                                   (swap! state assoc :success true)
                                   (when f (f res)))))
           (update :on-failure (fn [f]
                                 (fn [res ex]
                                   (swap! state assoc :success false)
                                   (when f (f res ex)))))
           (update :on-retry (fn [f]
                               (fn [res ex]
                                 (swap! state update :retries inc)
                                 (when f (f res ex)))))))
     state]))
