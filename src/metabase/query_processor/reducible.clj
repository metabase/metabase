(ns metabase.query-processor.reducible
  (:require
   [clojure.core.async :as a]
   [metabase.async.util :as async.u]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.context.default :as context.default]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn identity-qp
  "The initial value of `qp` passed to QP middleware."
  [query rff context]
  (qp.context/runf query rff context))

(defn combine-middleware
  "Combine a collection of QP middleware into a single QP function. The QP function, like the middleware, will have the
  signature:

    (qp query rff context)"
  ([middleware]
   (combine-middleware middleware identity-qp))

  ([middleware qp]
   (reduce
    (fn [qp middleware]
      (when (var? middleware)
        (assert (not (:private (meta middleware))) (format "%s is private" (pr-str middleware))))
      (if (some? middleware)
        (middleware qp)
        qp))
    qp
    middleware)))

;; Why isn't this just done automatically when we create the context in [[context.default/default-context]]? The timeout
;; could be subject to change so it makes sense to wait until we actually run the query to wire stuff up. Also, since
;; we're doing
;;
;;    (merge (context.default/default-context) context)
;;
;; all over the place, it probably reduces overhead a bit to not run around adding a bunch of timeouts to channels we
;; don't end up using.
(defn- wire-up-context-channels!
  "Wire up the core.async channels in a QP `context`

  1. If query doesn't complete by [[qp.context/timeout]], call [[qp.context/timeoutf]], which should raise an Exception.

  2. When [[qp.context/out-chan]] is closed prematurely, send a message to [[qp.context/canceled-chan]].

  3. When [[qp.context/out-chan]] is closed or gets a result, close both [[qp.context/out-chan]]
     and [[qp.context/canceled-chan]]."
  [context]
  (let [out-chan      (qp.context/out-chan context)
        canceled-chan (qp.context/canceled-chan context)
        timeout       (qp.context/timeout context)]
    (a/go
      (let [[val port] (a/alts! [out-chan (a/timeout timeout)] :priority true)]
        (log/tracef "Port %s got %s"
                    (if (= port out-chan) "out-chan" (format "[timeout after %s]" (u/format-milliseconds timeout)))
                    val)
        (cond
          (not= port out-chan) (qp.context/timeoutf context)
          (nil? val)           (a/>!! canceled-chan ::cancel))
        (log/tracef "Closing out-chan.")
        (a/close! out-chan)
        (a/close! canceled-chan)))
    nil))

(def ^:dynamic *run-on-separate-thread?*
  "Whether to run the query on a separate thread. When running a query asynchronously (i.e., with [[async-qp]]), this is
  normally `true`, meaning the `out-chan` is returned immediately. When running a query synchronously (i.e., with
  `sync-qp`), this is normally `false`, becuase we are blocking while waiting for results."
  true)

(defn async-qp
  "Wrap a QP function (middleware or a composition of middleware created with [[combine-middleware]]) with the signature:

    (qp query rff context)

  And return a function with the signatures:

    (qp query)
    (qp query context)

  While you can use a 3-arg QP function directly, this makes the function more user-friendly by providing a base
  `rff` and a default `context`,"
  [qp]
  (fn qp*
    ([query]
     (qp* query nil))

    ([query context]
     (qp* query nil context))

    ([query rff context]
     {:pre [(map? query) ((some-fn nil? map?) context)]}
     (let [context (doto (merge (context.default/default-context) context)
                     wire-up-context-channels!)
           rff     (or rff
                       (qp.context/rff context))
           thunk   (fn [] (try
                            (qp query rff context)
                            (catch Throwable e
                              (qp.context/raisef e context))))]
       (log/tracef "Running on separate thread? %s" *run-on-separate-thread?*)
       (if *run-on-separate-thread?*
         (future (thunk))
         (thunk))
       (qp.context/out-chan context)))))

(defn- wait-for-async-result [out-chan]
  {:pre [(async.u/promise-chan? out-chan)]}
  (let [result (a/<!! out-chan)]
    (if (instance? Throwable result)
      (throw result)
      result)))

(defn sync-qp
  "Wraps a QP function created by [[async-qp]] into one that synchronously waits for query results and rethrows any
  Exceptions thrown. Resulting QP has the signatures

    (qp query)
    (qp query context)"
  [qp]
  {:pre [(fn? qp)]}
  (fn qp* [& args]
    (binding [*run-on-separate-thread?* false]
      (wait-for-async-result (apply qp args)))))


;;; ------------------------------------------------- Other Util Fns -------------------------------------------------

(defn reducible-rows
  "Utility function for generating reducible rows when implementing [[metabase.driver/execute-reducible-query]].

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

(defn combine-additional-reducing-fns
  "Utility function for creating a reducing function that reduces results using `primary-rf` and some number of
  `additional-rfs`, then combines them into a final result with `combine`.

    (fn my-xform [rf]
      (combine-additional-reducing-fns
       rf
       [((take 100) conj)]
       (fn combine [result first-100-values]
         (rf (assoc result :first-100 first-100-values)))))

  This is useful for post-processing steps that need to reduce the result rows to provide some metadata that can be
  added to the final result.

  This is conceptually similar to a combination of [[redux.core/juxt]] and [[redux.core/post-complete]], with these
  differences:

  1. The accumulators of the additional reducing functions are maintained separately in a `volatile!`, so any
  transducers applied to the result of this function will work normally, exactly as if they were applied directly to
  `primary-rf`. Because `juxt` changes the accumulator itself, its use can break the behavior of other transducers.

  2. Since only the acc from `primary-rf` is exposed, the result will be `reduced` when the accumulator of the primary
  reducing function is reduced, rather than when the accumulators of *all* reducing functions are reduced. In other
  words, the `reduced` behavior will be exactly the same way as if you used `primary-rf` on its own.

  3. `combine` is like [[redux.core/post-complete]], but called with separate args, one for each reducing function.

  4. The completing arity of the primary reducing function is not applied automatically, so be sure to apply it
  yourself in the appropriate place in the body of your `combine` function."
  [primary-rf additional-rfs combine]
  {:pre [(fn? primary-rf) (sequential? additional-rfs) (every? fn? additional-rfs) (fn? combine)]}
  (let [additional-accs (volatile! (mapv (fn [rf] (rf))
                                         additional-rfs))]
    (fn combine-additional-reducing-fns-rf*
      ([] (primary-rf))

      ([acc]
       (let [additional-results (map (fn [rf acc]
                                       (rf (unreduced acc)))
                                     additional-rfs
                                     @additional-accs)]
         (apply combine acc additional-results)))

      ([acc x]
       (vswap! additional-accs (fn [accs]
                                 (mapv (fn [rf acc]
                                         (if (reduced? acc)
                                           acc
                                           (rf acc x)))
                                       additional-rfs
                                       accs)))
       (primary-rf acc x)))))
