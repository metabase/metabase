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

;; TODO: Refactor!
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

;; It is written this way in case we decide for multiple parameters in fmtstr.
(defmacro testing
  [[fmtstr & args] & body]
  `(clojure.test/testing (format ~(str "\nwith " fmtstr "\n%s\n")
                                   ~@(map (fn [form]
                                            `(with-out-str (clojure.pprint/pprint ~form)))
                                          args))
       ~@body))

;; sole purpose of this is just to signal to [[initial-iteration-seed]] It should use bound tu.rng/*generator* to
;; generate initial interation seed. This smells.
(def ^:dynamic *context-seed* nil)

;; Print this on load so it is included in CI log, just in case everything passed and we would want verbatim replay.
(when-some [seed (config/config-long :mb-gentest-context-seed)]
  (log/infof "ENV context-seed %d" seed))

(defn context-seed
  "Context seed is either plain random or from env"
  []
  (or (config/config-long :mb-gentest-context-seed)
      (.nextLong ^Random (Random.))))

(defn initial-iteration-seed
  "Iteration seed is 1 from env 2 dependent on context or 3 random"
  []
  (or (config/config-long :mb-gentest-iteration-seed)
      (when *context-seed*
        (.nextLong ^Random tu.rng/*generator*))
      (.nextLong ^Random (Random.))))

(defn do-iterate
  [limit-spec thunk]
  (let [limit-fn (limit-spec->limit-fn limit-spec)
        ;; TODO: the atom can be removed!!!
        iteration-seed (atom (initial-iteration-seed))]
    (loop [iteration-index 0]
      (when (limit-fn)
        (testing ["iteration index" iteration-index]
          (testing ["iteration seed" @iteration-seed]
            (binding [tu.rng/*generator* (Random. @iteration-seed)]
              (try
                (thunk)
                (catch Throwable t
                  ;; TODO: Consider setting actual to cause instead.
                  (clojure.test/do-report {:type :error, :message nil, :expected nil, :actual t}))
                (finally
                  (reset! iteration-seed (.nextLong ^Random tu.rng/*generator*)))))))
        (recur (inc iteration-index))))))

(defmacro iterate
  [limit-spec bindings & body]
  (let [safer-bindings (mapcat (fn [[sym form]]
                                 [sym `(try
                                         ~form
                                         (catch Exception e#
                                           (throw (ex-info "Binding error"
                                                           {:type :error
                                                            ;; form is unused atm, maybe will be in do-with-
                                                            :form (quote ~form)}
                                                           e#))))])
                               (partition 2 bindings))]
    `(do-iterate ~limit-spec
                 (fn []
                   (let [~@safer-bindings]
                     (testing ["iteration bindings" ~(mapv (fn [sym#]
                                                             [`'~sym# sym#])
                                                           (take-nth 2 safer-bindings))]
                       (try
                         ~@body
                         (catch Exception e#
                           (throw (ex-info "Execution error"
                                           {:type :error}
                                           e#))))))))))

;; TODO: Consider do-with-gentest.
(defmacro defgentest
  [test-sym & body]
  `(clojure.test/deftest ~test-sym
    (when (config/config-bool :mb-gentest-run)
      (let [seed# (context-seed)]
        (binding [*context-seed* seed#
                  tu.rng/*generator* (Random. seed#)]
          (testing ["context-seed" seed#]
            ~@body))))))
