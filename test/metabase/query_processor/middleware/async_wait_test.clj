(ns metabase.query-processor.middleware.async-wait-test
  (:require [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.query-processor.middleware.async-wait :as async-wait]
            [metabase.test.util.async :as tu.async]))

(defn- async-wait
  "Mocked version of `async-wait/wait-for-permit` middleware. Runs `f` with 3 channels:

  *  `result-chan`    -- a channel will receive the result iff the rest of the QP pipeline is invoked
  *  `semaphore-chan` -- a mocked semapahore channel that `wait-for-permit` will wait to receive a permit from
  *  `canceled-chan`  -- a channel you can pass a cancellation message to to simulate request cancelation"
  [f]
  (tu.async/with-open-channels [result-chan    (a/promise-chan)
                                semaphore-chan (a/chan 15)
                                canceled-chan  (a/promise-chan)]
    (let [qp (fn [_ respond _ _]
               (respond ::result))]
      (with-redefs [async-wait/fetch-db-semaphore-channel (constantly semaphore-chan)]
        (let [query   {}
              respond (fn [result]
                        (when result
                          (a/>!! result-chan result))
                        (a/close! result-chan))]
          ((async-wait/wait-for-permit qp) query respond respond canceled-chan))
        (f {:result-chan result-chan, :semaphore-chan semaphore-chan, :canceled-chan canceled-chan})))))

;; QP should run if semaphore-chan gets a permit. Permit should be closed after QP finishes.
(expect
  {:result ::result, :permit-taken? true, :permit-closed? true}
  (async-wait
   (fn [{:keys [semaphore-chan result-chan]}]
     (let [permit (tu.async/permit)]
       ;; provide a permit async after a short delay
       (a/go
         (a/<! (a/timeout 10))
         (a/>! semaphore-chan permit))
       {:result         (tu.async/wait-for-result result-chan)
        :permit-taken?  (= (tu.async/wait-for-result semaphore-chan) ::tu.async/timed-out)
        :permit-closed? (tu.async/permit-closed? permit)}))))

;; If semaphore-chan never gets a permit, then the QP should never run
(expect
  {:result ::tu.async/timed-out, :permit-closed? false}
  (async-wait
   (fn [{:keys [result-chan]}]
     (let [permit (tu.async/permit)]
       {:result         (tu.async/wait-for-result result-chan)
        :permit-closed? (tu.async/permit-closed? permit)}))))

;; if canceled-chan gets a message before permit is provided, QP should never run
(expect
  {:result         nil
   :permit-taken?  false
   :permit-closed? false}
  (async-wait
   (fn [{:keys [result-chan semaphore-chan canceled-chan]}]
     (let [permit (tu.async/permit)]
       (a/go
         (a/<! (a/timeout 10))
         (a/>! canceled-chan :canceled)
         (a/<! (a/timeout 100))
         (a/>! semaphore-chan permit))
       {:result         (tu.async/wait-for-result result-chan)
        :permit-taken?  (= (tu.async/wait-for-result semaphore-chan) ::tu.async/timed-out)
        :permit-closed? (tu.async/permit-closed? permit)}))))
