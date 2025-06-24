(ns metabase.test.gentest
  (:refer-clojure :exclude [iterate])
  (:require
   [clojure.test]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.test.util.random :as tu.rng]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   [java.util Random]))

(set! *warn-on-reflection* true)

;; TODO: In later ms add option to override via spec!!!
(defn limit-spec->limit-fn
  [limit-spec]
  (let [env-iterations (config/config-int :mb-gentest-limit-iterations)
        env-seconds (config/config-int :mb-gentest-limit-seconds)
        limit-spec (cond env-iterations {:gentest.default-limit/iterations env-iterations}
                         env-seconds    {:gentest.default-limit/seconds env-seconds}
                         :else          limit-spec)]
    (log/debugf "limit-spec->limit-fn limit spec: %s" (u/pprint-to-str limit-spec))
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
                                          `(u/pprint-to-str ~form))
                                        args))
     ~@body))

(defonce startup-context-seed (doto (or (config/config-long :mb-gentest-context-seed)
                                        (.nextLong ^Random (Random.)))
                                (as-> $ (log/infof "STARTUP context-seed %d" $))))
(defn initial-context-seed
  "Context seed is either (1) from environment or (2) the one set during the first load of this namespace."
  []
  (or (config/config-long :mb-gentest-context-seed)
      startup-context-seed))

(defn initial-iteration-seed
  "Iteration seed is either (1) from environment or (2) the [[initial-context-seed]]."
  []
  (or (config/config-long :mb-gentest-iteration-seed)
      (initial-context-seed)))

(defn do-iterate
  [limit-spec thunk]
  (let [limit-fn (limit-spec->limit-fn limit-spec)
        ;; Atom is used to overcome recur over binding.
        iteration-seed (atom (initial-iteration-seed))]
    (loop [iteration-index 0]
      (when (limit-fn)
        (testing ["iteration index" iteration-index]
          (testing ["iteration seed" @iteration-seed]
            (log/tracef "do-iterate: iteration-index: %s" iteration-index)
            (log/tracef "do-iterate: iteration-seed: %s" @iteration-seed)
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

;; TODO: Later milestones: Because of debug log it makes sense to do-defgentest.
(defmacro defgentest
  [test-sym & body]
  `(clojure.test/deftest ~test-sym
     (when (config/config-bool :mb-gentest-run)
       (let [seed# (initial-context-seed)]
         (binding [tu.rng/*generator* (Random. seed#)]
           (log/debugf "defgentest: seed: %s" (pr-str seed#))
           (testing ["context-seed" seed#]
             ~@body))))))
