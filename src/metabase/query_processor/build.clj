(ns metabase.query-processor.build
  "Logic for building a function that can process MBQL queries. TODO ­ consider renaming this namespace to
  `metabase.query-processor.impl`."
  (:require [clojure.core.async :as a]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.query-processor.error-type :as error-type]
            [potemkin.types :as p.types]
            [pretty.core :refer [PrettyPrintable]]))

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (cond
    config/is-prod? (u/minutes->ms 20)
    config/is-test? (u/seconds->ms 30)
    config/is-dev?  (u/minutes->ms 3)))

(defn- async-chans-set-up-result-forwarding!
  "Asynchronously forward the result of `canceled-chan`, `raise-chan`, or `reduced-chan` to `finished-chan`; close all
  channels afterward."
  [{:keys [canceled-chan raise-chan reduced-chan finished-chan], :as chans}]
  (letfn [(close-all! []
            (log/trace "<closing all core.async channels>")
            (doseq [chan (vals chans)]
              (a/close! chan)))]
    (a/go
      (let [[val port] (a/alts! [canceled-chan raise-chan reduced-chan finished-chan] :priority true)]
        (log/tracef "%s got %s %s"
                    (condp = port
                      reduced-chan  "reduced-chan"
                      canceled-chan "canceled-chan"
                      raise-chan    "raised-chan"
                      finished-chan "finished-chan")
                    (cond
                      (and (map? val) (:status val)) {:status (:status val)}
                      (map? val)                     (format "map with keys %s" (vec (keys val)))
                      (keyword? val)                 val
                      :else                          (class val))
                    (if (= port finished-chan) "" "(forwarding result to finished-chan)"))
        ;; send a cancelation message if appropriate
        (cond
          ;; if `finished-chan` is closed or otherwise gets a result before finishing the query, cancel it
          (= port finished-chan)
          (do
            (log/trace "finished-chan closed or got result before query was finished. Canceling query.")
            (a/>! canceled-chan ::canceled))

          ;; if an Exception was thrown, cancel anything outstanding
          (= port raise-chan)
          (a/>! canceled-chan ::exception))
        ;; now foward the result to finished-chan (if applicable)
        (when-not (= port finished-chan)
          (a/>! finished-chan (if (= port canceled-chan)
                                {:status :interrupted}
                                (if (some? val) val {:status :no-value}))))
        ;; finally, close all the channels once one of these channels gets a result
        (close-all!)))))

(defn- async-chans-set-up-timeout!
  "If query isn't completely finished by `timeout-ms`, raise a timeout Exception."
  [{:keys [raise-chan finished-chan]} timeout-ms]
  (a/go
    (let [[_ port] (a/alts! [finished-chan (a/timeout timeout-ms)])]
      (when-not (= port finished-chan)
        (log/tracef "Query timed out after %d ms, raising timeout exception." timeout-ms)
        (a/>! raise-chan (ex-info (format "Timed out after %s." (u/format-milliseconds timeout-ms))
                           {:status :timed-out
                            :type   error-type/timed-out}))))))

(defn async-chans
  ;; TODO - consider adding a `:preprocessed-chan` and a `:native` chan for getting the preprocessed and native
  ;; versions of the query respectfully
  "* `:reducible-chan`    ­ sent a fn with the signature (reduce-results rff) when preprocessing completes successfully
                            (used internally)
   * `:preprocessed-chan` ­ sent the fully-preprocessed query before conversion before `mbql->native` is called.
   * `:native-query-chan` ­ sent the query after calling `mbql->native`.
   * `:start-reduce-chan` ­ sent a message when (reducible) query is executed successfully and first row is available
                            (called automatically)
   * `:reduced-chan`      ­ sent the result of fully reducing a query. (called automatically)
   * `:raise-chan`        ­ sent any Exception that is thrown.
   * `:canceled-chan`     ­ sent a message if query is canceled before completion.
   * `:finished-chan`     ­ sent the result of either reduced, raise, or cancel."
  [timeout-ms]
  {:pre [(integer? timeout-ms)]}
  (let [chans {:reducible-chan    (a/promise-chan)
               :preprocessed-chan (a/promise-chan)
               :native-query-chan (a/promise-chan)
               :start-reduce-chan (a/promise-chan)
               :reduced-chan      (a/promise-chan)
               :raise-chan        (a/promise-chan)
               :canceled-chan     (a/promise-chan)
               :finished-chan     (a/promise-chan)}]
    (async-chans-set-up-result-forwarding! chans)
    (async-chans-set-up-timeout! chans timeout-ms)
    chans))

(p.types/deftype+ ^:private DecoratedReducingFn [f]
  PrettyPrintable
  (pretty [_]
    (list 'decorated-reducing-fn f))

  clojure.lang.IFn
  (invoke [_ rff]
    (f rff)))

(defn decorated-reducing-fn
  "Wrapper for rffs that allow you to perform the reduction process in a manner of your choosing; e.g. in the context of
  maintain a handle to some resource with `with-open`.

  `decorated-reducing-fn` takes a single function that has the signature

    (f do-reduce)

  Obtain handles as needed, then call `do-reduce` with an `rff`:

    (do-reduce rff)

  Example:

    (decorated-reducing-fn
     (fn [do-reduce]
       (with-open [w (io/writer filename)]
         (do-reduce
          (fn [metadata]
            (fn
              ([] ...)
              ([acc] ...)
              ([acc row] ...)))))))"
  [f]
  (DecoratedReducingFn. f))

(defn- execute-query-and-reduce-results
  [execute-reducible-query query xformf {:keys [reducible-chan start-reduce-chan reduced-chan raise-chan], :as chans}]
  {:pre [(fn? xformf)]}
  (letfn [(respond* [rff metadata reducible-rows]
            {:pre [(or (fn? rff) (instance? DecoratedReducingFn rff)) (map? metadata)]}
            (a/put! start-reduce-chan :start)
            (try
              (letfn [(do-reduce [rff]
                        (assert (fn? rff))
                        (let [rf ((xformf metadata) rff)]
                          (assert (fn? rf))
                          (let [reduced-result (transduce identity rf reducible-rows)]
                            (a/put! reduced-chan reduced-result))))]
                (if (instance? DecoratedReducingFn rff)
                  (rff do-reduce)
                  (do-reduce rff)))
              (catch Throwable e
                (a/>!! raise-chan e)))
            nil)
          (reduce-results [rff]
            (try
              (execute-reducible-query driver/*driver* query chans (partial respond* rff))
              (catch Throwable e
                (a/>!! raise-chan e))))]
    (a/>!! reducible-chan (bound-fn* reduce-results)))
  nil)

(defn- base-qp3 [qp]
  (fn qp3* [query rff {:keys [reducible-chan raise-chan canceled-chan], :as chans}]
    (a/go
      (when-let [reduce-results (a/<! reducible-chan)]
        ;; run on a different thread
        ;; TODO ­ use dedicated threadpool (?)
        (let [futur (future
                      ;; check and make sure query hasn't been canceled yet!
                      (when-not (a/poll! canceled-chan)
                        (reduce-results rff)))]
          (when (a/<! canceled-chan)
            (future-cancel futur)))))
    (try
      (qp
       query
       (fn [metadata]
         (fn [rff]
           (rff metadata)))
       chans)
      (catch Throwable e
        (a/>!! raise-chan e)))))

(defn- apply-middleware [execute-reducible-query middleware]
  (reduce
   (fn [qp middleware]
     (middleware qp))
   (partial execute-query-and-reduce-results execute-reducible-query)
   middleware))

(defn base-query-processor
  "Returns a query processor function with the signature

    (qp3 query rff chans)

  `rff` is a function that should return a reducing function when passed results meta. It has the signature:

    (rff metadata) -> rf

  If query succeeds, the results of the query will transduced using `rf` and transforms added by `middleware`. The
  results of the query execution will be passed to chans as described in docstring for `async-chans`.

  If `execute-reducible-query` is passed, it should have the same signature as `driver/execute-reducible-query`, i.e.:

    (execute-reducible-query driver query chans respond)

  and call

    (respond metadata rows)."
  ([middleware]
   (base-query-processor driver/execute-reducible-query middleware))

  ([execute-reducible-query middleware]
   (base-qp3 (apply-middleware execute-reducible-query middleware))))

(defn default-rff
  "Default function returning a reducing function. Results are returned in the 'standard' map format e.g.

    {:data {:cols [...], :rows [...]}, :row_count ...}"
  [metadata]
  (fn default-rf
    ([]
     {:data      (assoc metadata :rows [])
      :row_count 0})

    ([result]
     {:pre [(map? result)]}
     (assoc result :status :completed))

    ([result row]
     (-> result
         (update-in [:data :rows] conj row)
         (update :row_count inc)))))

(defn async-query-processor
  "Returns an async query processor function from a `base-query-processor`. QP function has the signatures

    (qp2 query) and (qp2 query rff)

  Calling this function returns `core.async` channels as documented by `async-chans`.

  If a query is executed successfully, the results will be transduced using `rf` (the result of `(rff metadata)`)
  and transforms supplied by the middleware; the final result will be passed to `result-chan`. If query execution
  fails, the thrown Exception will be passed to `exception-chan`."
  ([base-qp]
   (async-query-processor base-qp query-timeout-ms))

  ([base-qp timeout-ms]
   (fn qp*
     ([query]
      (qp* query default-rff))

     ([query rff]
      (let [{:keys [raise-chan], :as chans} (async-chans timeout-ms)]
        (try
          (base-qp query rff chans)
          (catch Throwable e
            (a/>!! raise-chan e)))
        chans)))))

(defn sync-query-processor
  "Returns a synchronous query processor function from an `async-query-processor`. QP function has the signatures

    (qp2 query) and (qp2 query rff)

  If a query is executed successfully, the results will be transduced using `rf` (the result of `(rff metadata)`)
  and transforms supplied by the middleware, and returned synchronously; if the query fails, and Exception will be
  thrown (also synchronously)."
  [async-qp]
  (fn qp*
    ([query]
     (qp* query default-rff))

    ([query rff]
     (let [{:keys [finished-chan]} (async-qp query rff)
           result                  (a/<!! finished-chan)]
       (if (instance? Throwable result)
         (throw result)
         result)))))
