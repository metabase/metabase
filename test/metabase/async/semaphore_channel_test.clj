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
                               output-chan    (a/chan 1)]
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
   (first (a/alts!! [output-chan (a/timeout 100)]))))

;; Make sure `do-f-with-permit` returns the permit when functions finish normally
(expect
  {:permit-returned? true, :result ::value}
  (let [open?  (atom false)
        permit (reify
                 Closeable
                 (close [this]
                   (reset! open? false)))]
    (tu.async/with-open-channels [output-chan (a/chan 1)]
      (#'semaphore-channel/do-f-with-permit permit output-chan (constantly ::value))
      (let [[result] (a/alts!! [output-chan (a/timeout 100)])]
        {:permit-returned? (not @open?), :result result}))))

;; If `f` throws an Exception, `permit` should get returned, and Exception should get returned as the result
(expect
  {:permit-returned? true, :result "FAIL"}
  (let [open?  (atom false)
        permit (reify
                 Closeable
                 (close [this]
                   (reset! open? false)))]
    (tu.async/with-open-channels [output-chan (a/chan 1)]
      (#'semaphore-channel/do-f-with-permit permit output-chan (fn []
                                                                 (throw (Exception. "FAIL"))))
      (let [[result] (a/alts!! [output-chan (a/timeout 100)])]
        {:permit-returned? (not @open?), :result (when (instance? Exception result)
                                                   (.getMessage ^Exception result))}))))

;; If `output-chan` is closed early, permit should still get returned, but there's nowhere to write the result to so
;; it should be `nil`
(expect
  {:permit-returned? true, :result nil}
  (let [open?  (atom false)
        permit (reify
                 Closeable
                 (close [this]
                   (reset! open? false)))]
    (tu.async/with-open-channels [output-chan (a/chan 1)]
      (#'semaphore-channel/do-f-with-permit permit output-chan (fn []
                                                                 (Thread/sleep 100)
                                                                 ::value))
      (a/close! output-chan)
      (let [[result] (a/alts!! [output-chan (a/timeout 500)])]
        {:permit-returned? (not @open?), :result result}))))
