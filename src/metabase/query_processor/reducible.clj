(ns metabase.query-processor.reducible
  (:require
   [clojure.core.async :as a]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn default-rff
  "Default function returning a reducing function. Results are returned in the 'standard' map format e.g.

    {:data {:cols [...], :rows [...]}, :row_count ...}"
  [metadata]
  (let [row-count (volatile! 0)
        rows      (volatile! (transient []))]
    (fn default-rf
      ([]
       {:data metadata})

      ([result]
       {:pre [(map? (unreduced result))]}
       ;; if the result is a clojure.lang.Reduced, unwrap it so we always get back the standard-format map
       (-> (unreduced result)
           (assoc :row_count @row-count
                  :status :completed)
           (assoc-in [:data :rows] (persistent! @rows))))

      ([result row]
       (vswap! row-count inc)
       (vswap! rows conj! row)
       result))))

(defn reducible-rows
  "Utility function for generating reducible rows when implementing [[metabase.driver/execute-reducible-query]].

  `row-thunk` is a function that, when called, should return the next row in the results, or falsey if no more rows
  exist."
  ([row-thunk]
   (reducible-rows row-thunk qp.pipeline/*canceled-chan*))

  ([row-thunk canceled-chan]
   (reify
     clojure.lang.IReduceInit
     (reduce [_ rf init]
       (loop [acc init]
         (cond
           (reduced? acc)
           @acc

           (some-> canceled-chan a/poll!)
           acc

           :else
           (if-let [row (row-thunk)]
             (recur (rf acc row))
             (do
               (log/trace "All rows consumed.")
               acc))))))))

(mu/defn combine-additional-reducing-fns
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
  [primary-rf     :- ifn?
   additional-rfs :- [:sequential ifn?]
   combine        :- ifn?]
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
