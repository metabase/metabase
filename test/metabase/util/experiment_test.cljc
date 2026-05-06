(ns metabase.util.experiment-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.util.experiment :as experiment])
  #?(:cljs (:require-macros [metabase.util.experiment])))

(defn- capture-report-fn
  "Returns [report-fn, results-atom]. The report-fn appends each result map to the atom."
  []
  (let [results (atom [])]
    [(fn [result] (swap! results conj result))
     results]))

(use-fixtures :each
  (fn [t]
    (binding [experiment/*sync?* true]
      (t))))

;;; ------------------------------------------------ Core behavior ------------------------------------------------

(deftest control-result-returned-test
  (testing "when candidate matches"
    (is (= :control
           (experiment/experiment {:name :test/match :min-interval-ms 0}
                                  :control
                                  :control))))
  (testing "when candidate mismatches"
    (is (= :control
           (experiment/experiment {:name :test/mismatch :min-interval-ms 0}
                                  :control
                                  :candidate))))
  (testing "when candidate throws"
    (is (= :control
           (experiment/experiment {:name :test/candidate-throws :min-interval-ms 0}
                                  :control
                                  (throw (ex-info "boom" {})))))))

(deftest control-exception-rethrown-test
  (is (thrown-with-msg?
       #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
       #"control-boom"
       (experiment/experiment {:name :test/control-throws :min-interval-ms 0}
                              (throw (ex-info "control-boom" {:from :control}))
                              :candidate))))

(deftest candidate-side-effects-test
  (testing "candidate runs when experiment is enabled and not throttled"
    (let [side-effect (atom false)]
      (experiment/experiment {:name :test/side-effect :min-interval-ms 0}
                             :control
                             (do (reset! side-effect true) :candidate))
      (is (true? @side-effect))))
  (testing "candidate does NOT run when globally disabled"
    (let [side-effect (atom false)]
      (experiment/set-experiments-enabled-fn! (constantly false))
      (try
        (experiment/experiment {:name :test/disabled :min-interval-ms 0}
                               :control
                               (do (reset! side-effect true) :candidate))
        (is (false? @side-effect))
        (finally
          (experiment/set-experiments-enabled-fn! (constantly true)))))))

;;; ---------------------------------------------- Outcome comparison ----------------------------------------------

(deftest matching-results-test
  (let [[report-fn results] (capture-report-fn)]
    (experiment/experiment {:name :test/match :min-interval-ms 0 :report-fn report-fn}
                           42
                           42)
    (is (= 1 (count @results)))
    (is (true? (:match? (first @results))))))

(deftest mismatching-results-test
  (let [[report-fn results] (capture-report-fn)]
    (experiment/experiment {:name :test/mismatch :min-interval-ms 0 :report-fn report-fn}
                           :old
                           :new)
    (is (= 1 (count @results)))
    (is (false? (:match? (first @results))))))

(deftest candidate-throws-control-doesnt-test
  (let [[report-fn results] (capture-report-fn)]
    (experiment/experiment {:name :test/candidate-error :min-interval-ms 0 :report-fn report-fn}
                           :control
                           (throw (ex-info "boom" {})))
    (is (false? (:match? (first @results))))
    (is (contains? (:candidate-outcome (first @results)) :error))))

(deftest control-throws-candidate-doesnt-test
  (let [[report-fn results] (capture-report-fn)]
    (is (thrown?
         #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
         (experiment/experiment {:name :test/control-error :min-interval-ms 0 :report-fn report-fn}
                                (throw (ex-info "control-boom" {}))
                                :candidate)))
    (is (= 1 (count @results)))
    (is (false? (:match? (first @results))))))

(deftest both-throw-same-exception-test
  (let [[report-fn results] (capture-report-fn)]
    (is (thrown?
         #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
         (experiment/experiment {:name :test/both-throw-same :min-interval-ms 0 :report-fn report-fn}
                                (throw (ex-info "boom" {:code 42}))
                                (throw (ex-info "boom" {:code 42})))))
    (is (= 1 (count @results)))
    (is (true? (:match? (first @results))))))

(deftest both-throw-different-exception-test
  (let [[report-fn results] (capture-report-fn)]
    (is (thrown?
         #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
         (experiment/experiment {:name :test/both-throw-diff :min-interval-ms 0 :report-fn report-fn}
                                (throw (ex-info "boom-a" {:code 1}))
                                (throw (ex-info "boom-b" {:code 2})))))
    (is (= 1 (count @results)))
    (is (false? (:match? (first @results))))))

(deftest custom-comparator-test
  (let [[report-fn results] (capture-report-fn)
        close-enough?       (fn [a b] (< (abs (- a b)) 0.01))]
    (experiment/experiment {:name       :test/custom-cmp
                            :min-interval-ms 0
                            :report-fn  report-fn
                            :comparator-fn close-enough?}
                           1.0
                           1.005)
    (is (true? (:match? (first @results))))))

;;; --------------------------------------------------- Metrics ---------------------------------------------------

(deftest report-fn-receives-durations-test
  (let [[report-fn results] (capture-report-fn)]
    (experiment/experiment {:name :test/durations :min-interval-ms 0 :report-fn report-fn}
                           #?(:clj  (do (Thread/sleep 1) :control)
                              :cljs :control)
                           #?(:clj  (do (Thread/sleep 1) :candidate)
                              :cljs :candidate))
    (let [r (first @results)]
      (is (pos? (:control-duration-ns r)))
      (is (pos? (:candidate-duration-ns r))))))

(deftest report-fn-receives-name-test
  (let [[report-fn results] (capture-report-fn)]
    (experiment/experiment {:name :test/name-check :min-interval-ms 0 :report-fn report-fn}
                           :a
                           :a)
    (is (= :test/name-check (:name (first @results))))))

;;; -------------------------------------------------- Throttling -------------------------------------------------

(deftest throttle-no-limit-test
  (let [[report-fn results] (capture-report-fn)]
    (dotimes [_ 5]
      (experiment/experiment {:name :test/no-throttle :min-interval-ms 0 :report-fn report-fn}
                             :control
                             :candidate))
    (is (= 5 (count @results)))))

(deftest throttle-skips-rapid-calls-test
  (let [[report-fn results] (capture-report-fn)
        ;; unique per run so the throttle atom's leftover state from previous runs doesn't affect us
        name-key            (keyword "test" (str "throttled-" (gensym)))]
    (experiment/experiment {:name name-key :min-interval-ms 60000 :report-fn report-fn}
                           :control
                           :candidate)
    (experiment/experiment {:name name-key :min-interval-ms 60000 :report-fn report-fn}
                           :control
                           :candidate)
    (is (= 1 (count @results)))))

;;; ------------------------------------------------- Kill switch -------------------------------------------------

(deftest global-kill-switch-test
  (testing "experiments-enabled false prevents candidate from running"
    (let [[report-fn results] (capture-report-fn)]
      (experiment/set-experiments-enabled-fn! (constantly false))
      (try
        (experiment/experiment {:name :test/killed :min-interval-ms 0 :report-fn report-fn}
                               :control
                               :candidate)
        (is (empty? @results))
        (finally
          (experiment/set-experiments-enabled-fn! (constantly true))))))
  (testing "re-enabling allows experiments again"
    (let [[report-fn results] (capture-report-fn)]
      (experiment/experiment {:name :test/re-enabled :min-interval-ms 0 :report-fn report-fn}
                             :control
                             :candidate)
      (is (= 1 (count @results))))))

;;; -------------------------------------------- Async execution (JVM) --------------------------------------------

#?(:clj
   (deftest async-execution-test
     (testing "candidate runs asynchronously by default on JVM"
       (binding [experiment/*sync?* false]
         (let [p (promise)]
           (experiment/experiment {:name          :test/async
                                   :min-interval-ms 0
                                   :report-fn     #(deliver p %)}
                                  :control
                                  :control)
           (let [result (deref p 5000 ::timeout)]
             (is (not= ::timeout result))
             (is (true? (:match? result)))))))))

;;; ------------------------------------------- Default report fn --------------------------------------------------

(defn- with-default-report-fn! [f body-fn]
  (let [prev @#?(:clj  @#'experiment/default-report-fn
                 :cljs experiment/default-report-fn)]
    (try
      (experiment/set-default-report-fn! f)
      (body-fn)
      (finally
        (experiment/set-default-report-fn! prev)))))

(deftest default-report-fn-test
  (testing "the default report fn is used when no :report-fn is specified"
    (let [[report-fn results] (capture-report-fn)]
      (with-default-report-fn!
        report-fn
        (fn []
          (experiment/experiment {:name :test/default-report :min-interval-ms 0}
                                 :a
                                 :a)))
      (is (= 1 (count @results)))
      (is (true? (:match? (first @results))))))
  (testing ":report-fn overrides the default report fn"
    (let [[default-report-fn default-results] (capture-report-fn)
          [custom-report-fn  custom-results]  (capture-report-fn)]
      (with-default-report-fn!
        default-report-fn
        (fn []
          (experiment/experiment {:name      :test/override-report
                                  :min-interval-ms 0
                                  :report-fn custom-report-fn}
                                 :a
                                 :a)))
      (is (empty? @default-results))
      (is (= 1 (count @custom-results))))))
