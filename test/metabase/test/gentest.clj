(ns metabase.test.gentest
  (:refer-clojure :exclude [iterate])
  (:require
   [clojure.test]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.test.util.random :as tu.rng]
   [metabase.util.log :as log])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

;; should following be set during startup?
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
      ;; this prints context
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
    (log/infof "INITIAL SEED: %d" *initial-seed*)
    ;; TODO: Double check binding works as expected. "exprs executed first and _bound_ in parallel"
    (binding [*original-report* clojure.test/report
              clojure.test/report report]
      (loop [iteration-index 0]
        (when (limit-fn)
          (binding [*iteration-seed* @seed
                    tu.rng/*generator* (Random. @seed)]
            (log/info "ITERATION SEED: %d" *iteration-seed*)
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

;;;;;;;;; another approach; defgentest + gentest/iterate


(def ^:dynamic *context* nil)

;; This I won't need!
(defn generate-report-2
  [iteration-index iteration-seed ^Exception e]
  (let [toplevel (ex->map e)]
    ;; this should be modified
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

;; to print also context I need special report
(defn report-2
  [m]
  (*original-report* (cond-> m
                       (#{:fail :error} (:type m)) (assoc :context @*context*))))


(def ^:dynamic *context-seed* nil)

(defn context-seed
  "Context seed is either plain random or from env"
  []
  (or (config/config-long :mb-gentest-context-seed)
      (.nextLong ^Random (Random.))))

(defn empty-context
  []
  (volatile! {}))

(defn update-context!
  [k f & args]
  (vswap! *context* update k #(apply f % args)))

(defn spit-context!
  [k v]
  (vswap! *context* assoc k v))

(defn initial-iteration-seed
  "Iteration seed is 1 from env 2 dependent on context or 3 random"
  []
  (or (config/config-long :mb-gentest-iteration-seed)
      (when *context-seed*
        (.nextLong ^Random tu.rng/*generator*))
      (.nextLong ^Random (Random.))))

(defn do-with-iterate!
  [limit-spec thunk]
  (let [limit-fn (limit-spec->limit-fn limit-spec)
        seed (atom (initial-iteration-seed))]
    (spit-context! :iteration/seed @seed)
    (loop [iteration-index 0]
      (when (limit-fn)
        (log/fatalf "ITERATION SEED: %d" @seed)
        (binding [tu.rng/*generator* (Random. @seed)]
          (try
            (thunk)
            (catch Exception e
              ;; This should be completely removed -- which exceptions to catch? any?
              (when-not (#{::generation ::execution} (:type (ex-data e)))
                  ;; TODO: Should wrap in unhandled exception
                (def eee e)
                (throw e))
              ;; this is not called right away!
              (report-2 (generate-report-2 iteration-index *iteration-seed* e)))
            (finally
              (let [next-seed (.nextLong ^Random tu.rng/*generator*)]
                (spit-context! :iteration/seed next-seed)
                (reset! seed next-seed)))))
        (recur (inc iteration-index))))))

;; TODO: add context manipulation in here, ie add things into the context
(defmacro iterate
  [limit-spec bindings & body]
  (let [safer-bindings (mapcat (fn [[sym form]]
                                 [sym
                                  (let [result-sym (gensym "result-")]
                                    `(try
                                       (let [~result-sym ~form]
                                         (update-context! :iteration/bindings
                                                          (fnil into []) [(quote ~sym) ~result-sym])
                                         ~result-sym)
                                       (catch Exception e#
                                         (throw (ex-info "Binding error"
                                                         {:type :iteration/binding-error
                                                          :form (quote ~form)}
                                                         e#)))))])
                               (partition 2 bindings))]
    `(do-with-iterate! ~limit-spec (fn []
                                    (let [~@safer-bindings]
                                      (try
                                        ~@body
                                        (catch Exception e#
                                          (throw (ex-info "Execution error"
                                                          {:type :iteration/execution-error}
                                                          e#)))))))))

(comment
  (macroexpand '(iterate 
                 {:gentest.default-limit/iterations 1}
                 [a (- 1 10)
                  b (+ 1 20)]
                 1))
)

;; TODO: consider do-with-gentest
(defmacro defgentest
  [test-sym & body]
  `(clojure.test/deftest ~test-sym
     (binding [*original-report* clojure.test/report
               clojure.test/report report-2]
       (when (config/config-bool :mb-gentest-run)
         (binding [*context* (volatile! {})]
           (let [seed# (context-seed)]
             (spit-context! :context/seed seed#)
             (binding [*context-seed* seed#
                       tu.rng/*generator* (Random. seed#)]
               (log/fatalf "CONTEXT SEED: %d" seed#)
               ~@body)))))))