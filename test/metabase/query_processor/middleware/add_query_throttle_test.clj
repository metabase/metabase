(ns metabase.query-processor.middleware.add-query-throttle-test
  (:require [environ.core :as environ]
            [expectations :refer :all]
            [metabase.query-processor.middleware
             [add-query-throttle :as throttle :refer :all]
             [catch-exceptions :as catch-exceptions]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u])
  (:import java.util.concurrent.Semaphore))

(defmacro ^:private exception-and-message [& body]
  `(try
     ~@body
     (catch Exception e#
       {:ex-class (class e#)
        :msg      (.getMessage e#)
        :data     (ex-data e#)})))

(defmacro ^:private with-query-wait-time-in-seconds [time-in-seconds & body]
  `(with-redefs [throttle/max-query-wait-time-in-millis ~(* 1000 time-in-seconds)]
     ~@body))

;; Check that the middleware will throw an exception and return a 503 if there are no tickets available in the
;; semaphore after waiting the timeout period
(expect
  {:ex-class clojure.lang.ExceptionInfo
   :msg      "Max concurrent query limit reached"
   :data     {:status-code 503
              :type        ::throttle/concurrent-query-limit-reached}}
  (with-query-wait-time-in-seconds 1
    (exception-and-message
     (let [semaphore (Semaphore. 5)]
       (.acquire semaphore 5)
       ((#'throttle/throttle-queries semaphore (constantly "Should never be returned")) {})))))

;; The `catch-exceptions` middleware catches any query pipeline errors and reformats it as a failed query result. The
;; 503 exception here is special and should be bubbled up
(expect
  {:ex-class clojure.lang.ExceptionInfo
   :msg      "Max concurrent query limit reached"
   :data     {:status-code 503
              :type        ::throttle/concurrent-query-limit-reached}}
  (with-query-wait-time-in-seconds 1
    (exception-and-message
     (let [semaphore (Semaphore. 5)
           my-qp     (->> identity
                          (#'throttle/throttle-queries semaphore)
                          catch-exceptions/catch-exceptions)]
       (.acquire semaphore 5)
       (my-qp {:my "query"})))))

;; Test that queries are "enqueued" for the timeout period and if another slot becomes available, it is used
(expect
  {:before-semaphore-release ::no-result
   :after-semaphore-release  {:query "map"}}
  (with-query-wait-time-in-seconds 120
    (let [semaphore    (Semaphore. 5)
          _            (.acquire semaphore 5)
          query-future (future ((#'throttle/throttle-queries semaphore identity) {:query "map"}))]
      {:before-semaphore-release (deref query-future 10 ::no-result)
       :after-semaphore-release  (do
                                   (.release semaphore)
                                   (deref query-future 10000 ::no-result))})))

;; Test that a successful query result will return the permit to the semaphore
(expect
  {:beinning-permits       5
   :before-failure-permits 4
   :query-result           {:query "map"}
   :after-success-permits  5}
  (with-query-wait-time-in-seconds 5
    (let [semaphore                 (Semaphore. 5)
          start-middleware-promise  (promise)
          finish-middleware-promise (promise)
          begin-num-permits         (.availablePermits semaphore)
          coordinate-then-finish    (fn [query-map]
                                      (deliver start-middleware-promise true)
                                      @finish-middleware-promise
                                      query-map)
          query-future              (future
                                      ((#'throttle/throttle-queries semaphore coordinate-then-finish) {:query "map"}))]
      {:beinning-permits       begin-num-permits
       :before-failure-permits (do
                                 @start-middleware-promise
                                 (.availablePermits semaphore))
       :query-result           (do
                                 (deliver finish-middleware-promise true)
                                 @query-future)
       :after-success-permits  (.availablePermits semaphore)})))

;; Ensure that the even if there is a failure, the permit is always released
(expect
  {:beinning-permits       5
   :before-failure-permits 4
   :after-failure-permits  5}
  (with-query-wait-time-in-seconds 5
    (let [semaphore                 (Semaphore. 5)
          start-middleware-promise  (promise)
          finish-middleware-promise (promise)
          begin-num-permits         (.availablePermits semaphore)
          coordinate-then-fail       (fn [_]
                                       (deliver start-middleware-promise true)
                                       @finish-middleware-promise
                                       (throw (Exception. "failure")))
          query-future              (future
                                      (u/ignore-exceptions
                                        ((#'throttle/throttle-queries semaphore coordinate-then-fail) {:query "map"})))]
      {:beinning-permits       begin-num-permits
       :before-failure-permits (do
                                 @start-middleware-promise
                                 (.availablePermits semaphore))
       :after-failure-permits  (do
                                 (deliver finish-middleware-promise true)
                                 @query-future
                                 (.availablePermits semaphore))})))

;; Test the function that adds the middleware only when MB_ENABLE_QUERY_THROTTLE is set to true

(defmacro ^:private with-query-throttle-value [enable-query-thottle-str & body]
  `(with-redefs [environ/env {:mb-enable-query-throttle ~enable-query-thottle-str}]
     ~@body))

;; By default the query throttle should not be applied
(expect
  #'identity
  (tu/throw-if-called throttle/throttle-queries
    (with-query-throttle-value nil
      (throttle/maybe-add-query-throttle #'identity))))

;; The query throttle should not be applied if MB_ENABLE_QUERY_THROTTLE is false
(expect
  #'identity
  (tu/throw-if-called throttle/throttle-queries
    (with-query-throttle-value "false"
      (throttle/maybe-add-query-throttle #'identity))))

;; The query throttle should be applied if MB_ENABLE_QUERY_THROTTLE is true
(expect
  (let [called? (atom false)]
    (with-redefs [throttle/throttle-queries (fn [& args]
                                              (reset! called? true))]
      (with-query-throttle-value "true"
        (throttle/maybe-add-query-throttle #'identity)
        @called?))))
