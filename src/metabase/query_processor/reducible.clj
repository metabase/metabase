(ns metabase.query-processor.reducible
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase.async.util :as async.u]
            [metabase.query-processor.context :as context]
            [metabase.query-processor.context.default :as context.default]))

(defn- prepare-context!
  "Wire up the core.async channels in a QP `context`."
  [context]
  ;; 1) If query doesn't complete by `timeoutf`, call `timeoutf`, which should raise an Exception
  ;; 2) when `out-chan` is closed prematurely, call `cancelf` to send a message to `canceled-chan`
  ;; 3) when `out-chan` is closed or gets a result, close both out-chan and canceled-chan
  (let [out-chan      (context/out-chan context)
        canceled-chan (context/canceled-chan context)
        timeout       (context/timeout context)]
    (a/go
      (let [[val port] (a/alts! [out-chan (a/timeout timeout)] :priority true)]
        (log/tracef "Port %s got %s"
                    (if (= port out-chan) "out-chan" (format "[timeout after %d ms]" timeout))
                    val)
        (cond
          (not= port out-chan) (context/timeoutf context)
          (nil? val)           (context/cancelf context))
        (log/tracef "Closing out-chan and canceled-chan.")
        (a/close! out-chan)
        (a/close! canceled-chan)))
    nil))

(defn pivot
  "The initial value of `qp` passed to QP middleware."
  [query xformf context]
  (context/runf query xformf context))

(defn combine-middleware
  "Combine a collection of QP middleware into a single QP function. The QP function, like the middleware, will have the
  signature:

    (qp query xformf context)"
  [middleware]
  (reduce
   (fn [qp middleware]
     (middleware qp))
   pivot
   middleware))

(defn quit
  "Create a special Exception that, when thrown or raised in the QP, will cause `result` to be returned directly.

    (context/raisef (qp.reducible/quit :my-result) context)"
  [result]
  (log/trace "Quitting query processing early.")
  (ex-info "Quit early!" {::quit-result result}))

(defn quit-result
  "If `e` is an Exception created by `quit`, get the result; otherwise, return `nil`,"
  [e]
  (::quit-result (ex-data e)))

(defn- unpack-quit-result-xform [rf]
  (fn
    ([]    (rf))
    ([x]   (rf x))
    ([x y] (rf x (or (quit-result y)
                     y)))))

(defn- quittable-out-chan
  "Take a core.async promise chan `out-chan` and return a piped one that will unwrap a `quit-result` automatically."
  [out-chan]
  (let [out-chan* (a/promise-chan unpack-quit-result-xform
                                  (fn [e]
                                    (a/>!! out-chan e)))]
    (async.u/promise-pipe out-chan out-chan*)
    out-chan*))

(defn async-qp
  "Wrap a QP function (middleware or a composition of middleware created with `combine-middleware`) with the signature:

    (qp query xformf context)

  And return a function with the signatures:

    (qp query)
    (qp query context)

  While you can use a 3-arg QP function directly, this makes the function more user-friendly by providing a base
  `xformf` and a default `context`,"
  [qp]
  (fn qp*
    ([query]
     (qp* query nil))

    ([query context]
     (let [context (merge (context.default/default-context) context)]
       (prepare-context! context)
       ;; NOCOMMIT
       (future
         (try
           (qp query (context/base-xformf context) context)
           (catch Throwable e
             (context/raisef e context))))
       (quittable-out-chan (context/out-chan context))))))

(defn- wait-for-async-result [out-chan]
  {:pre [(async.u/promise-chan? out-chan)]}
  ;; TODO - consider whether we should have another timeout here as well
  (let [result (a/<!! out-chan)]
    (if (instance? Throwable result)
      (throw result)
      result)))

(defn sync-qp
  "Wraps a QP function created by `async-qp` into one that synchronously waits for query results and rethrows any
  Exceptions thrown. Resulting QP has the signatures

    (qp query)
    (qp query context)"
  [qp]
  {:pre [(fn? qp)]}
  (comp wait-for-async-result qp))


;;; ------------------------------------------------- Other Util Fns -------------------------------------------------

(defn reducible-rows
  "Utility function for generating reducible rows when implementing `metabase.driver/execute-reducible-query`.

  `row-thunk` is a function that, when called, should return the next row in the results, or falsey if no more rows
  exist."
  [row-thunk canceled-chan]
  (reify
    clojure.lang.IReduceInit
    (reduce [_ rf init]
      (loop [acc init]
        (cond
          (reduced? acc)
          @acc

          (a/poll! canceled-chan)
          acc

          :else
          (if-let [row (row-thunk)]
            (recur (rf acc row))
            (do
              (log/trace "All rows consumed.")
              acc)))))))
