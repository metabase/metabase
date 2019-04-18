(ns metabase.async.semaphore-channel
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.async.util :as async.u]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import java.io.Closeable
           java.util.concurrent.Semaphore))

(defn- permit-handle
  "Object that can holds on to a permit for a Semaphore. Can be closed with `.close`, and thus, used with `with-open`;
  also returns the permit upon finalization if not already returned."
  ^Closeable [^Semaphore semaphore, id]
  (let [closed? (atom false)
        close!  (fn []
                  (when (compare-and-set! closed? false true)
                    (.release semaphore)))]
    (reify
      Object
      (toString [_]
        (format "Permit #%d" id)) ; ID is a simple per-channel counter mainly for debugging purposes
      (finalize [_]
        (close!))
      Closeable
      (close [_]
        (close!)))))

(defn- notifying-semaphore
  "When a permit is released via Semaphore.release() we'll send a message to the `notify-released-chan`. This is a
  signal to the go-loop in the code below below to resume and try to acquire more permits from the semaphore."
  ^Semaphore [num-permits notify-released-chan]
  (proxy [Semaphore] [num-permits]
    (release []
      ;; Release the permit ASAP. (Add tag to proxy anaphor `this`, otherwise we get reflection warnings)
      (let [^Semaphore this this]
        (proxy-super release))
      ;; Then send the message right away to let the go-loop know a permit is available.
      (a/>!! notify-released-chan ::released))))

(defn semaphore-channel
  "Creates a core.async channel that manages a counting Semaphore with `num-permits`. Takes from this channel will block
  until a permit is available; the object taken is a special 'permit handle' that implements `Closeable`; hold on to
  it with `with-open` or close it with `.close` to return the permit when finished with it."
  [^Integer num-permits]
  (let [permits-chan         (a/chan)
        ;; We only need one such 'release' notification at any given moment to let the loop know to resume so we can
        ;; go ahead and make this channel a dropping buffer that will drop any additional messages.
        notify-released-chan (a/chan (a/dropping-buffer 1))
        semaphore            (notifying-semaphore num-permits notify-released-chan)]
    ;; start the loop that will deliver permits
    (a/go-loop [next-id 1]
      (if (.tryAcquire semaphore)
        ;; If the semaphore has a permit available right away, send a new `permit-handle` to `permits-chan`. Since
        ;; that channel has no buffer this loop will park until someone is there to take it. Recur unless the
        ;; permits-chan is closed.
        (if (a/>! permits-chan (permit-handle semaphore next-id))
          (recur (inc next-id))
          (a/close! notify-released-chan))
        ;; Otherwise if no permit is available, wait for a notification on `notify-released-chan`, then recur and try
        ;; again, unless channel is closed
        (when (a/<! notify-released-chan)
          (recur next-id))))
    ;; return a channel to get permits on
    permits-chan))


;;; ------------------------------------------- do-after-receiving-permit --------------------------------------------

(def ^:private ^:dynamic *permits*
  "Map of semaphore channel -> obtained permit for the current and child thread[s]. Used so we can skip obtaining a
  second permit if this thread already has one."
  {})

(s/defn ^:private do-with-existing-permit-for-current-thread :- (s/maybe async.u/PromiseChan)
  [semaphore-chan f & args]
  (when (get *permits* semaphore-chan)
    (log/debug (trs "Current thread already has a permit, will not wait to acquire another"))
    (apply async.u/do-on-separate-thread f args)))

(s/defn ^:private do-with-permit :- async.u/PromiseChan
  [semaphore-chan, permit :- Closeable, f & args]
  (binding [*permits* (assoc *permits* semaphore-chan permit)]
    (let [out-chan (apply async.u/do-on-separate-thread f args)]
      ;; whenever `out-chan` closes return the permit
      (a/go
        (a/<! out-chan)
        (.close permit))
      out-chan)))

(s/defn ^:private do-with-immediately-available-permit :- (s/maybe async.u/PromiseChan)
  [semaphore-chan f & args]
  (when-let [^Closeable permit (a/poll! semaphore-chan)]
    (log/debug (trs "Permit available without waiting, will run fn immediately"))
    (apply do-with-permit semaphore-chan permit f args)))

(s/defn ^:private do-after-waiting-for-new-permit :- async.u/PromiseChan
  [semaphore-chan f & args]
  (let [out-chan (a/promise-chan)]
    ;; fire off a go block to wait for a permit.
    (a/go
      (let [[permit first-done] (a/alts! [semaphore-chan out-chan])]
        (cond
          ;; If out-chan closes before we get a permit, there's nothing for us to do here.
          (= first-done out-chan)
          (log/debug (trs "Not running pending function call: output channel already closed."))

          ;; if `semaphore-chan` is closed for one reason or another we'll never get a permit so log a warning and
          ;; close the output channel
          (not permit)
          (do
            (log/warn (trs "Warning: semaphore-channel is closed, will not run pending function call"))
            (a/close! out-chan))

          ;; otherwise we got a permit and chan run f with it now.
          permit
          (async.u/single-value-pipe (apply do-with-permit semaphore-chan permit f args) out-chan))))
    ;; return `out-chan` which can be used to wait for results
    out-chan))

(s/defn do-after-receiving-permit :- async.u/PromiseChan
  "Run `(apply f args)` asynchronously after receiving a permit from `semaphore-chan`. Returns a channel from which you
  can fetch the results. Closing this channel before results are produced will cancel the function call."
  {:style/indent 1}
  [semaphore-chan f & args]
  (some #(apply % semaphore-chan f args)
        [do-with-existing-permit-for-current-thread
         do-with-immediately-available-permit
         do-after-waiting-for-new-permit]))
