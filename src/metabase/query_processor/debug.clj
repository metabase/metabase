(ns metabase.query-processor.debug
  "Functions for debugging QP code. Enable QP debugging by binding `qp/*debug*`; the `debug-middleware` function below
  wraps each middleware function for debugging purposes."
  (:require [clojure
             [data :as data]
             [pprint :as pprint]
             [string :as str]]
            [metabase.mbql.schema :as mbql.s]
            [metabase.query-processor.middleware
             [async :as async]
             [mbql-to-native :as mbql-to-native]]
            [metabase.util :as u]
            [schema.core :as s]))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Generic Middleware Debugging Utils                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- maybe-deref [x]
  (if-not (instance? clojure.lang.IPending x)

    x
    (when (realized? x)
      @x)))

(defn- rethrow
  "Handle exceptions thrown or raised by QP middleware. Adds additional context and rethrows/re-raises the Exception.
  If `handle-exception-fn` is non-nil, calls it with the Exception as well.

  The following keys in `m` are automatically dereffed if their values are promises:

    {:query {:before ?, :after ?}, :result ?}"
  {:style/indent 1}
  ([message m e handle-exception-fn]
   (rethrow message m e handle-exception-fn (fn [e] (throw e))))

  ([message m e handle-exception-fn raise]
   (let [m (reduce (fn [m ks] (update-in m ks maybe-deref)) m [[:query :before] [:query :after] [:result]])
         e (ex-info message m e)]
     (when handle-exception-fn
       (handle-exception-fn e))
     (raise e))))

(defn- debug-sync
  [{:keys [pre post exception]} qp middleware before-query]
  (let [after-query   (promise)
        before-result (promise)
        wrapped-qp    (fn [query & args]
                        (deliver after-query query)
                        (when pre (pre before-query query))
                        (u/prog1 (apply qp query args)
                          (deliver before-result <>)))]
    (try
      (u/prog1 ((middleware wrapped-qp) before-query)
        (when (and post (realized? before-result))
          (post @before-result <>)))
      (catch Throwable e
        (rethrow "Middleware threw Exception."
          {:query {:before before-query, :after after-query}, :result before-result}
          e exception)))))

(defn- debug-async
  [{:keys [pre post exception]} orig-qp middleware before-query orig-respond orig-raise & args]
  (let [ex-context
        {:query {:before before-query, :after (promise)}, :result (promise)}

        ;; the basic idea is to pass `identity` to the middleware instead of `orig-respond`, then we can separate out
        ;; the changes the middleware makes to the response. `mw-respond` is the `respond` function the middleware
        ;; returns
        wrapped-respond
        (fn [mw-respond]
          (fn [before-result]
            (let [after-result (try
                                 (mw-respond before-result)
                                 (catch Throwable e
                                   (rethrow "Middleware threw Exception during post-processing." ex-context e exception)))]
              (deliver (:result ex-context) after-result)
              (when post
                (try
                  (post before-result after-result)
                  (catch Throwable e
                    (rethrow "Error in debugging 'post' fn" ex-context e exception))))
              (orig-respond after-result))))

        wrapped-qp
        (fn [after-query mw-respond mw-raise & args]
          (deliver (get-in ex-context [:query :after]) after-query)
          (when pre
            (try
              (pre before-query after-query)
              (catch Throwable e
                (rethrow "Error in debugging 'pre' fn" ex-context e exception))))
          (apply orig-qp after-query (wrapped-respond mw-respond) mw-raise args))

        wrapped-raise
        (fn [e]
          (rethrow "Middleware raised Exception." ex-context e exception orig-raise))]
    (apply (middleware wrapped-qp) before-query identity wrapped-raise args)))

(defn- debug-with-fns
  "Wrap a `middleware` fn for debugging. `fns` is a map of functions called at various points before and after the
  middleware is applied. All functions are optional. It looks like:

    {:pre       (fn [before-query after-query] ...)
     :post      (fn [before-result after-result] ...)
     :exception (fn [e] ...)}"
  {:arglists '([{:keys [pre post exception]} qp middleware])}
  [fns qp middleware]
  (fn
    ([before-query]
     (debug-sync fns qp middleware before-query))

    ([before-query & args]
     (apply debug-async fns qp middleware before-query args))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             Actual Debugging Logic                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- middleware-name [middleware-var]
  (:name (meta middleware-var)))

(defn- print-diff [message middleware-var before after]
  (when-not (= before after)
    (let [[only-in-before only-in-after] (data/diff before after)]
      (println
       (str
        (u/format-color 'yellow (middleware-name middleware-var)) " " message "\n"
        "before:\n" (u/pprint-to-str 'blue before)
        "after:\n" (u/pprint-to-str 'green after)
        (when only-in-before
          (str "only in before:\n" (u/pprint-to-str 'cyan only-in-before)))
        (when only-in-after
          (str "only in after:\n" (u/pprint-to-str 'magenta only-in-after))))))))

(defn- validate-query [middleware-var after-query]
  ;; mbql->native is allowed to have both a `:query` and a `:native` key for whatever reason
  (when-not (= middleware-var #'mbql-to-native/mbql->native)
    (s/validate mbql.s/Query after-query)))

(defn- debug-pre [middleware-var before-query after-query]
  (print-diff "middleware modified query" middleware-var before-query after-query)
  (validate-query middleware-var after-query))

(defn- debug-post [middleware-var before-results after-results]
  (print-diff "middleware modified results" middleware-var before-results after-results)
  ;; TODO - validate results as well
  )

(defn- exception-causes-seq
  "Sequence of all causes of `e`. Does not include `e` itself."
  [e]
  (rest (take-while some? (iterate #(some-> ^Throwable % .getCause) e))))

(defn- ex-data-excluding-schema-errors [e]
  (let [data (ex-data e)]
    (when-not (= (:type data) :schema.core/error)
      data)))

(defn- format-exception [^Throwable e]
  {:type  (class e)
   :cause (.getMessage e)
   :data  (ex-data-excluding-schema-errors e)
   :via   (vec (for [^Throwable cause (exception-causes-seq e)]
                 {:type    (class cause)
                  :message (.getMessage cause)
                  :data    (ex-data-excluding-schema-errors cause)
                  :at      (first (seq (.getStackTrace e)))}))
   :trace (vec
           (for [frame (seq (.getStackTrace e))
                 :let  [frame (str frame)]
                 :when (and (not (str/starts-with? frame "clojure"))
                            (not (str/starts-with? frame "metabase.query_processor.debug")))]
             frame))})

(def ^:private already-logged-exception
  "An Exception that we can use to signify that we don't need to do any more logging (because we've already logged the
  Exception somewhere else.)"
  (Exception. "[Already logged]"))

(defn- debug-exception [middleware-var, ^Throwable e]
  ;; only log Exceptions the first time we see them
  (if (some (partial identical? already-logged-exception)
            (cons e (exception-causes-seq e)))
    (throw e)
    (do
      (println (u/format-color 'red "Exception in %s middleware" (middleware-name middleware-var)))
      (pprint/pprint (format-exception e))
      (throw already-logged-exception))))


(defn debug-middleware
  "Reducing function used to build the debugging QP pipeline. Bind `qp/*debug*` to use this.

  This does a few things to make QP debugging easier:

  *  Logs any changes in the query and results, along with the middleware that changed it
  *  Validates the results of the query after each step against the MBQL schema
  *  Catches thrown or raised Exceptions, and rethrows them with additional info such as input and when the Exception
     occured."
  [qp middleware-var]
  ;; don't try to wrap `async->sync` for debugging because it switches from async to sync right in the middle of
  ;; things which is much to hairy to try to deal with in the code above. (It also doesn't modify the query or results
  ;; anyway.)
  ;;
  ;; `async-setup` also produces weird unhelpful logging so skip that too.
  (if (#{#'async/async->sync #'async/async-setup} middleware-var)
    ((var-get middleware-var) qp)
    (debug-with-fns
     {:pre       (partial debug-pre middleware-var)
      :post      (partial debug-post middleware-var)
      :exception (partial debug-exception middleware-var)}
     qp
     (var-get middleware-var))))
