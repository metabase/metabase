(ns metabase.query-processor.build
  "Logic for building a function that can process MBQL queries. TODO ­ consider renaming this namespace to
  `metabase.query-processor.impl`."
  (:require [clojure.core.async :as a]
            [metabase
             [config :as config]
             [driver :as driver]
             [util :as u]]
            [metabase.query-processor.error-type :as error-type]
            [potemkin.types :as p.types]))

;; Signatures:
;;
;; (Driver) execute-query-reducible:
;;
;; (execute-query-reducible: driver query respond raise canceled-chan) -> reducible result
;;
;; Middleware:
;;
;; (middleware qp) -> (fn [query xformf chans])
;;
;; qp3:
;;
;; (qp5 query rf-fn chans) -> ?
;;
;; qp2
;;
;; (qp query rf-fn) -> ?
;;
;; qp1
;;
;; (qp1 query) -> ?

(def query-timeout-ms
  "Maximum amount of time to wait for a running query to complete before throwing an Exception."
  ;; I don't know if these numbers make sense, but my thinking is we want to enable (somewhat) long-running queries on
  ;; prod but for test and dev purposes we want to fail faster because it usually means I broke something in the QP
  ;; code
  (cond
    config/is-prod? (u/minutes->ms 20)
    config/is-test? (u/seconds->ms 30)
    config/is-dev?  (u/minutes->ms 3)))

(defn- auto-closing-promise-chan
  "A `core.async` promise chan that closes itself when it recieves a value."
  [chan-name]
  (let [chan (a/promise-chan)]
    (a/go
      (when-let [x (a/<! chan)]
        (locking println (println (u/format-color 'green "%s sent to %s"
                                    (if (keyword? x)
                                      x
                                      (.getCanonicalName (class x)))
                                    chan-name))) ; NOCOMMIT
        (a/close! chan)))
    chan))

(defn async-chans
  ;; TODO - consider adding a `:preprocessed-chan` and a `:native` chan for getting the preprocessed and native
  ;; versions of the query respectfully
  "* `:reducible-chan`    ­ sent a fn with the signature (reduce-results rff) when preprocessing completes successfully.
   * `:start-reduce-chan` ­ sent a message when (reducible) query is executed successfully and first row is available (called automatically)
   * `:reduced-chan`      ­ sent the result of fully reducing a query. (called automatically)
   * `:raise-chan`        ­ sent any Exception that is thrown.
   * `:canceled-chan`     ­ sent a message if query is canceled before completion.
   * `:finished-chan`     ­ sent the result of either reduced, raise, or cancel."
  [timeout-ms]
  (let [reducible-chan    (auto-closing-promise-chan "reducible-chan")
        start-reduce-chan (auto-closing-promise-chan "start-reduce-chan")
        reduced-chan      (auto-closing-promise-chan "reduced-chan")
        raise-chan        (auto-closing-promise-chan "raise-chan")
        canceled-chan     (auto-closing-promise-chan "canceled-chan")
        finished-chan     (auto-closing-promise-chan "finished-chan")]
    (letfn [(close-all! []
              (locking println (println "<closing all core.async channels>"))
              (a/close! reducible-chan)
              (a/close! start-reduce-chan)
              (a/close! reduced-chan)
              (a/close! raise-chan)
              (a/close! canceled-chan)
              (a/close! finished-chan))]
      ;; forward the result of `reduced`/`cancel`/`raise` to `finished`
      (a/go
        (when-let [reduced-result (a/<! reduced-chan)]
          (a/>! finished-chan reduced-result)
          (close-all!)))
      (a/go
        (when-let [e (a/<! raise-chan)]
          (a/>! finished-chan e)
          (close-all!)))
      (a/go
        (when (a/<! canceled-chan)
          (a/>! finished-chan :canceled)
          (close-all!)))
      ;; if `start-reduce-chan` doesn't get something to start reducing by `timeout-ms`, throw a timeout Exception
      (a/go
        (let [[_ port] (a/alts! [start-reduce-chan (a/timeout timeout-ms)])]
          (when-not (= port start-reduce-chan)
            (a/>! raise-chan (ex-info (format "Timed out after %s." (u/format-milliseconds timeout-ms))
                               {:status :timed-out
                                :type   error-type/timed-out}))
            ;; TODO - not sure this makes sense
            (a/>! canceled-chan :timeout)
            (close-all!))))
      ;; if `finished-chan` is closed before getting a result, cancel the query
      (a/go
        (when-not (a/<! finished-chan)
          (a/>! canceled-chan :canceled))))
    {:reducible-chan    reducible-chan
     :start-reduce-chan start-reduce-chan
     :reduced-chan      reduced-chan
     :raise-chan        raise-chan
     :canceled-chan     canceled-chan
     :finished-chan     finished-chan}))

(p.types/deftype+ ^:private InContextRFF [f])

(defn in-context-rff
  "Wrapper for rffs that allow you to perform the reduction process in a manner of your choosing; e.g. in the context of
  maintain a handle to some resource with `with-open`.

  `in-context-rff` takes a single function that has the signature

    (f reduce-with-rff)

  Obtain handles as needed and call it with an `rff`:

    (reduce-with-rff rff)

  Example:

    (in-context-rff
     (fn [reduce-with-rff]
       (with-open [w (io/writer filename)]
         (reduce-with-rff
          (fn [metadata]
            (fn
              ([] ...)
              ([acc] ...)
              ([acc row] ...)))))))"
  [f]
  (InContextRFF. f))

(defn- execute-query-and-reduce-results
  [execute-reducible-query query xformf {:keys [reducible-chan start-reduce-chan reduced-chan raise-chan], :as chans}]
  {:pre [(fn? xformf)]}
  (letfn [(results-fn [rff metadata reducible-rows]
            {:pre [(or (fn? rff) (instance? InContextRFF rff)) (map? metadata)]}
            (a/put! start-reduce-chan :start)
            (try
              (letfn [(do-reduce [rff]
                        (assert (fn? rff))
                        (let [rf ((xformf metadata) rff)]
                          (assert (fn? rf))
                          (let [reduced-result (transduce identity rf reducible-rows)]
                            (a/put! reduced-chan reduced-result))))]
                (if (instance? InContextRFF rff)
                  ((.f rff) do-reduce)
                  (do-reduce rff)))
              (catch Throwable e
                (a/>!! raise-chan e)))
            nil)
          (reduce-results [rff]
            (execute-reducible-query driver/*driver* query chans (partial results-fn rff)))]
    (a/put! reducible-chan (bound-fn* reduce-results)))
  nil)

(defn base-query-processor
  "Returns a query processor function with the signature

    (qp3 query rff chans)

  `rff` is a function that should return a reducing function when passed results meta. It has the signature:

    (rff metadata) -> rf

  If query succeeds, the results of the query will transduced using `rf` and transforms added by `middleware`. The
  results of the query execution will be passed to chans as described in docstring for `async-chans`.

  If `execute-reducible-query` is passed, it should have the same signature as `driver/execute-reducible-query`, i.e.:

    (execute-reducible-query driver query chans results-fn)

  and call

    (results-fn metadata rows)."
  ([middleware]
   (base-query-processor driver/execute-reducible-query middleware))

  ([execute-reducible-query middleware]
   (let [qp (reduce
             (fn [qp middleware]
               (middleware qp))
             (partial execute-query-and-reduce-results execute-reducible-query)
             middleware)]
     (fn qp3* [query rff {:keys [reducible-chan reduced-chan raise-chan canceled-chan], :as chans}]
       (a/go
         (when-let [reduce-results (a/<! reducible-chan)]
           ;; run on a different thread
           ;; TODO ­ use dedicated threadpool (?)
           (let [futur (future
                         ;; check and make sure query hasn't been canceled yet!
                         (when-not (a/poll! canceled-chan)
                           (try
                             (reduce-results rff)
                             (catch Throwable e
                               (a/>!! raise-chan e)))))]
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
           (a/put! raise-chan e)))))))

(defn default-rff
  "Default function returning a reducing function. Results are returned in the 'standard' map format e.g.

    {:data {:cols [...], :rows [...]}, :row_count ...}"
  [metadata]
  (fn default-rf
    ([]
     {:data      (assoc metadata :rows [])
      :row_count 0})

    ([result]
     {:pre [(or (map? result) (println "NOT A MAP ::" (pr-str result)))]} ; NOCOMMIT
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
