(ns metabase.async.util-test
  (:require [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.async.util :as async.u]
            [metabase.test.util.async :as tu.async]))

(expect true  (async.u/promise-chan? (a/promise-chan)))
(expect false (async.u/promise-chan? (a/chan 1)))
(expect false (async.u/promise-chan? (a/chan)))
(expect false (async.u/promise-chan? nil))
(expect false (async.u/promise-chan? "ABC"))

;;; --------------------------------------------- promise-canceled-chan ----------------------------------------------

;; make sure the canceled chan gets a message if the promise-chan it wraps closes before anything is written to it
(expect
  ::async.u/canceled
  (tu.async/with-open-channels [chan (a/promise-chan)]
    (let [canceled-chan (async.u/promise-canceled-chan chan)]
      (a/close! chan)
      (first (a/alts!! [canceled-chan (a/timeout 1000)])))))

;; canceled-chan should close with no message if the channel it wraps gets a message before it closes
(expect
  {:val nil, :canceled-chan? true}
  (tu.async/with-open-channels [chan (a/promise-chan)]
    (let [canceled-chan (async.u/promise-canceled-chan chan)]
      (a/>!! chan "message")
      (a/close! chan)
      (let [[val port] (a/alts!! [canceled-chan (a/timeout 1000)])]
        {:val val, :canceled-chan? (= port canceled-chan)}))))

;; canceled-chan should be a promise-chan which means we can fetch results more than once
(expect
  ::async.u/canceled
  (tu.async/with-open-channels [chan (a/promise-chan)]
    (let [canceled-chan (async.u/promise-canceled-chan chan)]
      (a/close! chan)
      (first (a/alts!! [canceled-chan (a/timeout 1000)]))
      (first (a/alts!! [canceled-chan (a/timeout 1000)])))))

;; can we add multiple canceled-chans to the same channel?
(expect
  {1 ::async.u/canceled, 2 ::async.u/canceled}
  (tu.async/with-open-channels [chan (a/promise-chan)]
    (let [canceled-chans {1 (async.u/promise-canceled-chan chan)
                          2 (async.u/promise-canceled-chan chan)}]
      (a/close! chan)
      (into {} (for [[id chan] canceled-chans]
                 [id (first (a/alts!! [chan (a/timeout 1000)]))])))))

(expect
  {1 {:val nil, :canceled-chan? true}
   2 {:val nil, :canceled-chan? true}}
  (tu.async/with-open-channels [chan (a/promise-chan)]
    (let [canceled-chans {1 (async.u/promise-canceled-chan chan)
                          2 (async.u/promise-canceled-chan chan)}]
      (a/>!! chan "message")
      (a/close! chan)
      (into {} (for [[id chan] canceled-chans]
                 (let [[val port] (a/alts!! [chan (a/timeout 1000)])]
                   [id {:val val, :canceled-chan? (= port chan)}]))))))


;;; ----------------------------------------------- single-value-pipe ------------------------------------------------

;; make sure `single-value-pipe` pipes a value from in-chan to out-chan
(expect
  ::value
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (async.u/single-value-pipe in-chan out-chan)
    (a/>!! in-chan ::value)
    (first (a/alts!! [out-chan (a/timeout 1000)]))))

;; `single-value-pipe` should close input-chan if output-chan is closed
(expect
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (async.u/single-value-pipe in-chan out-chan)
    (a/close! out-chan)
    (tu.async/wait-for-close in-chan 100)))

;; `single-value-pipe` should close output-chan if input-chan is closed
(expect
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (async.u/single-value-pipe in-chan out-chan)
    (a/close! in-chan)
    (tu.async/wait-for-close out-chan 100)))

;; `single-value-pipe` should return a `canceled-chan` you can listen to to see whether either channel closes early
(expect
  ::async.u/canceled
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (let [canceled-chan (async.u/single-value-pipe in-chan out-chan)]
      (a/close! in-chan)
      (first (a/alts!! [canceled-chan (a/timeout 1000)])))))

(expect
  ::async.u/canceled
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (let [canceled-chan (async.u/single-value-pipe in-chan out-chan)]
      (a/close! out-chan)
      (first (a/alts!! [canceled-chan (a/timeout 1000)])))))

;; if things proceed normally the `canceled-chan` should close with no result
(expect
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (let [canceled-chan (async.u/single-value-pipe in-chan out-chan)]
      (a/>!! in-chan :ok)
      (tu.async/wait-for-close canceled-chan 100))))

;; if you are a knucklehead and write to out-chan it should cancel things
(expect
  ::async.u/canceled
  (tu.async/with-open-channels [in-chan  (a/chan 1)
                                out-chan (a/chan 1)]
    (let [canceled-chan (async.u/single-value-pipe in-chan out-chan)]
      (a/>!! out-chan "Oops")
      (first (a/alts!! [canceled-chan (a/timeout 1000)])))))

;; can we combine multiple single value pipes?
(expect
  ::value
  (tu.async/with-open-channels [in-chan    (a/chan 1)
                                out-chan-1 (a/chan 1)
                                out-chan-2 (a/chan 1)]
    (async.u/single-value-pipe in-chan out-chan-1)
    (async.u/single-value-pipe out-chan-1 out-chan-2)
    (a/>!! in-chan ::value)
    (first (a/alts!! [out-chan-2 (a/timeout 1000)]))))


;;; --------------------------------------------- do-on-separate-thread ----------------------------------------------

;; Make sure `do-on-separate-thread` can actually run a function correctly
(expect
  ::success
  (tu.async/with-open-channels [result-chan (async.u/do-on-separate-thread (fn []
                                                                             (Thread/sleep 100)
                                                                             ::success))]
    (first (a/alts!! [result-chan (a/timeout 500)]))))

;; when you close the result channel of `do-on-separate-thread,` it should cancel the future that's running it. This
;; will produce an InterruptedException
(expect
  InterruptedException
  (tu.async/with-open-channels [started-chan  (a/chan 1)
                                finished-chan (a/chan 1)]
    (let [f           (fn []
                        (try
                          (a/>!! started-chan ::started)
                          (Thread/sleep 5000)
                          (a/>!! finished-chan ::finished)
                          (catch Throwable e
                            (a/>!! finished-chan e))))
          result-chan (async.u/do-on-separate-thread f)]
      ;; wait for `f` to actually start running before we kill it. Otherwise it may not get started at all
      (a/go
        (a/alts!! [started-chan (a/timeout 1000)])
        (a/close! result-chan))
      (first (a/alts!! [finished-chan (a/timeout 1000)])))))

;; We should be able to combine the `single-value-pipe` and `do-on-separate-thread` and get results
(expect
  ::success
  (let [f (fn []
            (Thread/sleep 100)
            ::success)]
    (tu.async/with-open-channels [result-chan (a/chan 1)]
      (let [canceled-chan (async.u/single-value-pipe (async.u/do-on-separate-thread f) result-chan)]
        (first (a/alts!! [canceled-chan result-chan (a/timeout 500)]))))))
