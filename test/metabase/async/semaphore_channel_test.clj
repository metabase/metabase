(ns metabase.async.semaphore-channel-test
  (:require [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.async.semaphore-channel :as semaphore-channel]
            [metabase.test.util.async :as tu.async])
  (:import java.io.Closeable))

(defn- get-permits [semaphore-chan n]
  (loop [acc [], n n]
    (if-not (pos? n)
      acc
      (let [[permit] (a/alts!! [semaphore-chan (a/timeout 100)])]
        (assert permit)
        (recur (conj acc permit) (dec n))))))

;; check that a semaphore channel only gives out the correct number of permits
(expect
  nil
  (tu.async/with-open-channels [semaphore-chan (semaphore-channel/semaphore-channel 3)]
    (let [permits  (get-permits semaphore-chan 3)
          response (first (a/alts!! [semaphore-chan (a/timeout 100)]))]
      ;; make sure we're actually doint something with the permits after we get `response`, otherwise there's a very
      ;; small chance they'll get garbage collected and `alts!!` will actually manage to get a permit
      (count permits)
      response)))

;; check that when a permit is returned, whoever was waiting will get their permit
(expect
  "Permit #4"
  (tu.async/with-open-channels [semaphore-chan (semaphore-channel/semaphore-channel 3)]
    (let [[^Closeable permit-1] (get-permits semaphore-chan 3)]
      (.close permit-1)
      (some-> (first (a/alts!! [semaphore-chan (a/timeout 100)])) str))))

;; if we are true knuckleheads and *lose* a permit it should eventually get garbage collected and returned to the pool
(expect
  "Permit #4"
  (tu.async/with-open-channels [semaphore-chan (semaphore-channel/semaphore-channel 3)]
    (get-permits semaphore-chan 3)
    (loop [tries 10]
      (System/gc)
      (or
       (some-> (a/alts!! [semaphore-chan (a/timeout 200)]) first str)
       (when (pos? tries)
         (recur (dec tries)))))))


;;; ------------------------------------------- do-after-receiving-permit --------------------------------------------

;; If we already have a permit, code should be smart enough to skip getting another one
(expect
 {:first-permit "Permit #1", :second-permit "Permit #1", :same? true}
 (tu.async/with-open-channels [semaphore-chan (semaphore-channel/semaphore-channel 1)
                               output-chan    (a/promise-chan)]
   (let [existing-permit #(get @#'semaphore-channel/*permits* semaphore-chan)]
     (semaphore-channel/do-after-receiving-permit semaphore-chan
       (fn []
         (let [first-permit (existing-permit)]
           (semaphore-channel/do-after-receiving-permit semaphore-chan
             (fn []
               (let [second-permit (existing-permit)]
                 (a/>!! output-chan {:first-permit  (str first-permit)
                                     :second-permit (str second-permit)
                                     :same?         (identical? first-permit second-permit)}))))))))
   (tu.async/wait-for-result output-chan)))

;; Make sure `do-with-permit` returns the permit when functions finish normally
(expect
  {:permit-returned? true, :result ::value}
  (let [permit (tu.async/permit)]
    (tu.async/with-open-channels [semaphore-chan (a/chan 1)
                                  output-chan    (#'semaphore-channel/do-with-permit
                                                  semaphore-chan
                                                  permit
                                                  (constantly ::value))]
      {:permit-returned? (tu.async/permit-closed? permit)
       :result           (tu.async/wait-for-result output-chan)})))

;; If `f` throws an Exception, `permit` should get returned, and Exception should get returned as the result
(expect
  {:permit-returned? true, :result "FAIL"}
  (let [permit (tu.async/permit)]
    (tu.async/with-open-channels [semaphore-chan (a/chan 1)
                                  output-chan    (#'semaphore-channel/do-with-permit
                                                  semaphore-chan
                                                  permit
                                                  (fn [] (throw (Exception. "FAIL"))))]
      {:permit-returned? (tu.async/permit-closed? permit)
       :result           (let [result (tu.async/wait-for-result output-chan)]
                           (if (instance? Throwable result)
                             (.getMessage ^Throwable result)
                             result))})))

;; If `output-chan` is closed early, permit should still get returned, but there's nowhere to write the result to so
;; it should be `nil`
(expect
  {:permit-returned? true, :result nil}
  (let [permit (tu.async/permit)]
    (tu.async/with-open-channels [semaphore-chan (a/chan 1)
                                  output-chan    (#'semaphore-channel/do-with-permit
                                                  semaphore-chan
                                                  permit
                                                  (fn []
                                                    (Thread/sleep 100)
                                                    ::value))]
      (a/close! output-chan)
      {:permit-returned? (tu.async/permit-closed? permit)
       :result           (tu.async/wait-for-result output-chan)})))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |      Tests for the new 0.32.5 optimizations that avoid async waits when permits are immediately available      |
;;; +----------------------------------------------------------------------------------------------------------------+

;; there are basically 3 strategies that can be used by `do-after-receiving-permit`
;; 1) run immediately, because permit is already present
;; 2) run immediately, because permit is immediately available
;; 3) run after waiting for permit

;; to check that everything works correctly in a few different scenarios, rather than right 3 x n tests, largely
;; repeating ourselves, we'll break things out into small functions that can be combined to pick + choose the
;; functionality to test with a given strategy.

(defn- do-semaphore-chan-fn [thunk-fn strategy-fn]
  (tu.async/with-open-channels [semaphore-chan (a/chan 1)]
    (strategy-fn semaphore-chan (thunk-fn (partial #'semaphore-channel/do-after-receiving-permit semaphore-chan)))))

(defn- with-existing-permit [semaphore-chan thunk]
  (binding [semaphore-channel/*permits* {semaphore-chan (tu.async/permit)}]
    (thunk)))

(defn- with-immediately-available-permit [semaphore-chan thunk]
  (a/>!! semaphore-chan (tu.async/permit))
  (thunk))

(defn- after-waiting [semaphore-chan thunk]
  (a/go
    (a/<! (a/timeout 50))
    (a/>! semaphore-chan (tu.async/permit)))
  (thunk))

;; test normal functions work correctly
(defn- normal-fn [do-f]
  (fn []
    (tu.async/wait-for-result
     (do-f (partial +) 1 2 3))))

(expect 6 (do-semaphore-chan-fn normal-fn with-existing-permit))
(expect 6 (do-semaphore-chan-fn normal-fn with-immediately-available-permit))
(expect 6 (do-semaphore-chan-fn normal-fn after-waiting))

;; Test that if output channel is closed, function gets interrupted
(defn- check-interrupted-fn [do-f]
  (fn []
    (let [f (fn [chan]
              (try
                (Thread/sleep 1000)
                (catch InterruptedException e
                  (a/>!! chan ::interrupted))))]
      (tu.async/with-open-channels [interrupted-chan (a/promise-chan)
                                    out-chan         (do-f f interrupted-chan)]
        (a/go
          (a/<! (a/timeout 100))
          (a/close! out-chan))
        (tu.async/wait-for-result interrupted-chan 500)))))

(expect ::interrupted (do-semaphore-chan-fn check-interrupted-fn with-existing-permit))
(expect ::interrupted (do-semaphore-chan-fn check-interrupted-fn with-immediately-available-permit))
(expect ::interrupted (do-semaphore-chan-fn check-interrupted-fn after-waiting))
