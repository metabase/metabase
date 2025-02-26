(ns metabase.test.gentest
  (:require
   [clojure.test]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.test.util.random :as tu.rng]
   [metabase.util.log :as log])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

(defonce ^:dynamic *initial-seed* (doto (or (config/config-long :mb-gentest-seed)
                                            (.nextLong ^Random (Random.)))
                                    (as-> $ (log/infof "Initial seed: %d" $))))

(defonce ^:dynamic *iteration-seed* nil)

(comment
  (alter-var-root #'*initial-seed* (fn [& _] (.nextLong ^Random (Random.))))
  (alter-var-root #'*initial-seed* (fn [& _] 1784144538647289715)))

(def ^:dynamic *original-report* nil)

#_:clj-kondo/ignore ;; because of println as done in clojure.test, subject to change
(defn- report
  [m]
  ;; temporary hack for printing non-exceptional results.
  (when (and (not (::iteration-seed m)) (#{:fail :error} (:type m)))
    (clojure.test/with-test-out
      (println "Iteration seed: %d" *iteration-seed*)))
  (case (:type m)
    (::generation ::execution)
    (clojure.test/with-test-out
      (clojure.test/inc-report-counter :error)
      (println "\nERROR in" (clojure.test/testing-vars-str m))
      (when (seq clojure.test/*testing-contexts*)
        (println (clojure.test/testing-contexts-str)))
      (clojure.pprint/pprint m))

    (*original-report* m)))

;; TODO: this is not written best possible way; later
(defn pretty-stacktrace
  ([stacktrace]
   (mapv (fn [^StackTraceElement s]
           [(.getClassName s) (.getFileName s) (.getLineNumber s)])
         stacktrace))
  ([stacktrace limit]
   (let [ps (pretty-stacktrace stacktrace)]
     (subvec ps 0 (min (count ps) limit)))))

(defn- ex->map
  [^Exception e]
  (let [se ^StackTraceElement (first (.getStackTrace e))]
    (merge {:message (ex-message e)
            :file (.getFileName se)
            :line (.getLineNumber se)}
           (when-some [data (ex-data e)]
             {:data data})
           {:stacktrace (vec (cond->> (pretty-stacktrace (.getStackTrace e))
                               (some? (ex-cause e)) (take 10)))})))

(defn process-exception-chain
  [^Exception e]
  (when (some? e)
    (into [(ex->map e)]
          (process-exception-chain (ex-cause e)))))

(defn generate-report
  [iteration-index iteration-seed ^Exception e]
  (let [toplevel (ex->map e)]
    (merge
     {:type (-> toplevel :data :type)
      ::iteration-index iteration-index
      ::iteration-seed iteration-seed
      :message (-> toplevel :message)
      :file (-> toplevel :file)
      :line (-> toplevel :line)}
     ;; temporarily? hardcoded!!!
     (select-keys (:data toplevel) [:form :bindings])
     {:chain (process-exception-chain (ex-cause e))})))

;; TODO: Add repl override!
(defn limit-spec->limit-fn
  [limit-spec]
  (let [env-iterations (config/config-int :mb-gentest-limit-iterations)
        env-seconds (config/config-int :mb-gentest-limit-seconds)
        ;; override the test provided limit-spec by environment
        limit-spec (cond env-iterations {:gentest.default-limit/iterations env-iterations}
                         env-seconds    {:gentest.default-limit/seconds env-seconds}
                         :else          limit-spec)]
    (log/infof "limit-spec->limit-fn\n```%s\n```\n" (with-out-str #_:clj-kondo/ignore (clojure.pprint/pprint limit-spec)))
    (or (and (map? limit-spec)
             (condp #(get %2 %1) limit-spec
               :gentest.default-limit/iterations
               :>> (fn [iterations]
                     (let [counter (atom -1)]
                       (fn []
                         (< (swap! counter inc) iterations))))

               :gentest.default-limit/seconds
               :>> (fn [seconds]
                     (let [stop-time (t/+ (t/local-date-time) (t/seconds seconds))]
                       (fn []
                         (let [now (t/local-date-time)]
                           (t/< now stop-time)))))

               nil))
        (let [counter (atom -1)]
          (fn []
            (< (swap! counter inc) 1))))))

;; TODO: Maybe add testing context?
(defn do-with-gentest
  [limit-spec thunk]
  (let [limit-fn (limit-spec->limit-fn limit-spec)
        seed (atom *initial-seed*)]
    ;; TODO: Double check binding works as expected. "exprs executed first and _bound_ in parallel"
    (binding [*original-report* clojure.test/report
              clojure.test/report report]
      (loop [iteration-index 0]
        (when (limit-fn)
          (binding [*iteration-seed* @seed
                    tu.rng/*generator* (Random. @seed)]
            (try
              (thunk)
              (catch Exception e
                (when-not (#{::generation ::execution} (:type (ex-data e)))
                  ;; TODO: Should wrap in unhandled exception
                  (throw e))
                (report (generate-report iteration-index *iteration-seed* e)))
              (finally
                (reset! seed (.nextLong ^Random tu.rng/*generator*)))))
          (recur (inc iteration-index)))))))

(defmacro with-gentest
  [limit-spec bindings & body]
  (let [safer-bindings (map-indexed (fn [i form]
                                      (if (zero? (mod i 2))
                                        form
                                        `(try ~form
                                              (catch Exception e#
                                                (throw (ex-info "Generation failed"
                                                                {:type ::generation
                                                                 :form (quote ~form)}
                                                                e#))))))
                                    bindings)
        quoted-bindings (into [] (comp (take-nth 2)
                                       (mapcat (fn [binding-sym]
                                                 [`(quote ~binding-sym) binding-sym])))
                              bindings)]
    `(do-with-gentest ~limit-spec (fn []
                                    (let [~@safer-bindings]
                                      (try
                                        ~@body
                                        (catch Exception e#
                                          (throw (ex-info "Execution failed"
                                                          {:type ::execution
                                                           :bindings ~quoted-bindings}
                                                          e#)))))))))
