(ns metabase.api.common.throttle-test
  (:require [expectations :refer :all]
            [metabase.api.common.throttle :as throttle]
            [metabase.test.util :refer [resolve-private-fns]]))

(def ^:private test-throttler (throttle/make-throttler :test, :initial-delay-ms 5, :attempts-threshold 3, :delay-exponent 2, :attempt-ttl-ms 25))

;;; # tests for calculate-delay
(resolve-private-fns metabase.api.common.throttle calculate-delay)

;; no delay should be calculated for the 3rd attempt
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99]))
      (calculate-delay test-throttler :x 101)))

;; 4 ms delay on 4th attempt 1ms after the last
(expect 4
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98]))
      (calculate-delay test-throttler :x 101)))

;; 5 ms after last attempt, they should be allowed to try again
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98]))
      (calculate-delay test-throttler :x 105)))

;; However if this was instead the 5th attempt delay should grow exponentially (5 * 2^2 = 20), - 2ms = 18ms
(expect 18
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 102)))

;; Should be allowed after 18 more secs
(expect nil
  (do (reset! (:attempts test-throttler) '([:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 120)))

;; Check that delay keeps growing according to delay-exponent (5 * 3^2 = 5 * 9 = 45)
(expect 45
  (do (reset! (:attempts test-throttler) '([:x 108], [:x 100], [:x 99], [:x 98], [:x 97]))
      (calculate-delay test-throttler :x 108)))


;;; # tests for check

(defn- attempt
  ([n]
   (attempt n (gensym)))
  ([n k]
   (let [attempt-once (fn []
                      (try
                        (Thread/sleep 1)
                        (throttle/check test-throttler k)
                        :success
                        (catch Throwable e
                          (:test (:errors (ex-data e))))))]
     (vec (repeatedly n attempt-once)))))

;; a couple of quick "attempts" shouldn't trigger the throttler
(expect [:success :success]
  (attempt 2))

;; nor should 3
(expect [:success :success :success]
  (attempt 3))

;; 4 in quick succession should trigger it
(expect [:success :success :success "Too many attempts! You must wait 0 seconds before trying again."] ; rounded down
  (attempt 4))

;; Check that throttling correctly lets you try again after certain delay
(expect [[:success :success :success "Too many attempts! You must wait 0 seconds before trying again."]
         [:success]]
  [(attempt 4 :a)
   (do
     (Thread/sleep 6)
     (attempt 1 :a))])

;; Next attempt should be throttled, however
(expect [:success "Too many attempts! You must wait 0 seconds before trying again."]
  (do
    (attempt 4 :b)
    (Thread/sleep 6)
    (attempt 2 :b)))

;; Sleeping 5+ ms after that shouldn't work due to exponential growth
(expect ["Too many attempts! You must wait 0 seconds before trying again."]
  (do
    (attempt 4 :c)
    (Thread/sleep 6)
    (attempt 2 :c)
    (Thread/sleep 6)
    (attempt 1 :c)))

;; Sleeping 20+ ms however should work
(expect [:success]
  (do
    (attempt 4 :d)
    (Thread/sleep 6)
    (attempt 2 :d)
    (Thread/sleep 21)
    (attempt 1 :d)))

;; Check that the interal list for the throttler doesn't keep growing after throttling starts
(expect [0 3]
  [(do (reset! (:attempts test-throttler) '()) ; reset it to 0
       (count @(:attempts test-throttler)))
   (do (attempt 5)
       (count @(:attempts test-throttler)))])

;; Check that attempts clear after the TTL
(expect [0 3 1]
  [(do (reset! (:attempts test-throttler) '()) ; reset it to 0
       (count @(:attempts test-throttler)))
   (do (attempt 3)
       (count @(:attempts test-throttler)))
   (do (Thread/sleep 25)
       (attempt 1)
       (count @(:attempts test-throttler)))])
