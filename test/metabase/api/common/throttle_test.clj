(ns metabase.api.common.throttle-test
  (:require [expectations :refer :all]
            [metabase.api.common.throttle :as throttle]
            [metabase.test.util :refer [resolve-private-fns]]))

(def ^:private test-throttler (throttle/make-throttler :test, :initial-delay-ms 2, :attempts-threshold 3, :delay-exponent 2, :attempt-ttl-ms 10))

;;; # tests for calculate-delay
(resolve-private-fns metabase.api.common.throttle calculate-delay)

;; no delay should be calculated for the 3rd attempt
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100],[:x 99]))
      (calculate-delay test-throttler :x 101)))

;; 1 ms delay on 4th attempt 1ms after the last
(expect 1
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98]))
      (calculate-delay test-throttler :x 101)))

;; 2 ms after last attempt, they should be allowed to try again
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98]))
      (calculate-delay test-throttler :x 102)))

;; However if this was instead the 5th attempt delay should grow exponentially (2 * 2^2 = 8), - 2 ms = 6
(expect 6
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 102)))

;; Should be allowed after 6 more secs
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 108)))

;; Check that delay keeps growing according to delay-exponent (2 * 3^2 = 2 * 9 = 18)
(expect 18
  (do (reset! (:attempts test-throttler) '([:x 108], [:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 108)))


;;; # tests for check

(defn- login
  ([n]
   (login n (gensym)))
  ([n k]
   (let [login-once (fn []
                      (try
                        (throttle/check test-throttler k)
                        :success
                        (catch Throwable e
                          (:test (:errors (ex-data e))))))]
     (vec (repeatedly n login-once)))))

;; a couple of quick "logins" shouldn't trigger the throttler
(expect [:success :success]
  (login 2))

;; nor should 3
(expect [:success :success :success]
  (login 3))

;; 4 in quick succession should trigger it
(expect [:success :success :success "Too many attempts! You must wait 0 seconds before trying again."] ; rounded down
  (login 4))

;; Check that throttling correctly lets you try again after certain delay
(expect [[:success :success :success "Too many attempts! You must wait 0 seconds before trying again."]
         [:success]]
  [(login 4 :a)
   (do
     (Thread/sleep 2)
     (login 1 :a))])

;; Next attempt should be throttled, however
(expect [:success "Too many attempts! You must wait 0 seconds before trying again."]
  (do
    (login 4 :b)
    (Thread/sleep 2)
    (login 2 :b)))

;; Sleeping 2 ms after that shouldn't work due to exponential growth
(expect ["Too many attempts! You must wait 0 seconds before trying again."]
  (do
    (login 4 :c)
    (Thread/sleep 2)
    (login 2 :c)
    (Thread/sleep 2)
    (login 1 :c)))

;; Sleeping 8 ms however should work
(expect [:success]
  (do
    (login 4 :d)
    (Thread/sleep 2)
    (login 2 :d)
    (Thread/sleep 8)
    (login 1 :d)))

;; Check that the interal list for the throttler doesn't keep growing after throttling starts
(expect [0 4]
  [(do (reset! (:attempts test-throttler) '()) ; reset it to 0
       (count @(:attempts test-throttler)))
   (do (login 1000)
       (count @(:attempts test-throttler)))])

;; Check that login attempts clear after the TTL
(expect [0 3 1]
  [(do (reset! (:attempts test-throttler) '()) ; reset it to 0
       (count @(:attempts test-throttler)))
   (do (login 3)
       (count @(:attempts test-throttler)))
   (do (Thread/sleep 10)
       (login 1)
       (count @(:attempts test-throttler)))])
