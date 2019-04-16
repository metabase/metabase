(ns metabase.async.semaphore-channel
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.async.util :as async.u]
            [metabase.util.i18n :refer [trs]])
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

(defn- do-f-with-permit
  "Once a `permit` is obtained, execute `(apply f args)`, writing the results to `output-chan`, and returning the permit
  no matter what."
  [^Closeable permit out-chan f & args]
  (try
    (let [f (fn []
              (with-open [permit permit]
                (try
                  (apply f args)
                  (catch Throwable e
                    e)
                  (finally
                    (log/debug (trs "f finished, permit will be returned"))))))]
      (a/go
        (let [canceled-chan (async.u/single-value-pipe (async.u/do-on-separate-thread f) out-chan)]
          (when (a/<! canceled-chan)
            (log/debug (trs "request canceled, permit will be returned"))
            (.close permit)))))
    (catch Throwable e
      (log/error e (trs "Unexpected error attempting to run function after obtaining permit"))
      (a/>! out-chan e)
      (.close permit))))

(defn- do-after-waiting-for-new-permit [semaphore-chan f & args]
  (let [out-chan (a/chan 1)]
    ;; fire off a go block to wait for a permit.
    (a/go
      (let [[permit first-done] (a/alts! [semaphore-chan out-chan])]
        (binding [*permits* (assoc *permits* semaphore-chan permit)]
          ;; If out-chan closes before we get a permit, there's nothing for us to do here. Otherwise if we got our
          ;; permit then proceed
          (if (= first-done out-chan)
            (log/debug (trs "Not running pending function call: output channel already closed."))
            ;; otherwise if channel is still open run the function
            (apply do-f-with-permit permit out-chan f args)))))
    ;; return `out-chan` which can be used to wait for results
    out-chan))

(defn do-after-receiving-permit
  "Run `(apply f args)` asynchronously after receiving a permit from `semaphore-chan`. Returns a channel from which you
  can fetch the results. Closing this channel before results are produced will cancel the function call."
  {:style/indent 1}
  [semaphore-chan f & args]
  ;; check and see whether we already have a permit for `semaphore-chan`, if so, go ahead and run the function right
  ;; away instead of waiting for *another* permit
  (if (get *permits* semaphore-chan)
    (do
      (log/debug (trs "Current thread already has a permit for {0}, will not wait to acquire another" semaphore-chan))
      (apply async.u/do-on-separate-thread f args))
    ;; otherwise wait for a permit
    (apply do-after-waiting-for-new-permit semaphore-chan f args)))
