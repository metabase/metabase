(ns metabase.util.experiment-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.util.experiment :as experiment])
  #?(:cljs (:require-macros [metabase.util.experiment])))

(defn- reset-throttle! []
  (reset! #?(:clj  @#'experiment/last-run-times
             :cljs experiment/last-run-times)
          {}))

(defn- capture-report-fn
  "Returns [report-fn, results-atom]. The report-fn appends each result map to the atom."
  []
  (let [results (atom [])]
    [(fn [result] (swap! results conj result))
     results]))

(defn- do-with-experiment-test
  "Resets throttle state, creates a capture report-fn, binds *sync?* true,
   and calls `(f report-fn results-atom)`."
  [f]
  (reset-throttle!)
  (let [[report-fn results] (capture-report-fn)]
    (binding [experiment/*sync?* true]
      (f report-fn results))))

;;; ------------------------------------------------ Core behavior ------------------------------------------------

(deftest control-result-returned-test
  (do-with-experiment-test
   (fn [_report-fn _results]
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
                                     (throw (ex-info "boom" {})))))))))

(deftest control-exception-rethrown-test
  (do-with-experiment-test
   (fn [_report-fn _results]
     (is (thrown-with-msg?
          #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
          #"control-boom"
          (experiment/experiment {:name :test/control-throws :min-interval-ms 0}
                                 (throw (ex-info "control-boom" {:from :control}))
                                 :candidate))))))

(deftest candidate-side-effects-test
  (testing "candidate runs when experiment is enabled and not throttled"
    (do-with-experiment-test
     (fn [_report-fn _results]
       (let [side-effect (atom false)]
         (experiment/experiment {:name :test/side-effect :min-interval-ms 0}
                                :control
                                (do (reset! side-effect true) :candidate))
         (is (true? @side-effect))))))
  (testing "candidate does NOT run when globally disabled"
    (do-with-experiment-test
     (fn [_report-fn _results]
       (let [side-effect (atom false)]
         (experiment/set-experiments-enabled-fn! (constantly false))
         (try
           (experiment/experiment {:name :test/disabled :min-interval-ms 0}
                                  :control
                                  (do (reset! side-effect true) :candidate))
           (is (false? @side-effect))
           (finally
             (experiment/set-experiments-enabled-fn! (constantly true)))))))))

;;; ---------------------------------------------- Outcome comparison ----------------------------------------------

(deftest matching-results-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/match :min-interval-ms 0 :report-fn report-fn}
                            42
                            42)
     (is (= 1 (count @results)))
     (is (true? (:match? (first @results)))))))

(deftest mismatching-results-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/mismatch :min-interval-ms 0 :report-fn report-fn}
                            :old
                            :new)
     (is (= 1 (count @results)))
     (is (false? (:match? (first @results)))))))

(deftest candidate-throws-control-doesnt-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/candidate-error :min-interval-ms 0 :report-fn report-fn}
                            :control
                            (throw (ex-info "boom" {})))
     (is (false? (:match? (first @results))))
     (is (contains? (:candidate-outcome (first @results)) :error)))))

(deftest control-throws-candidate-doesnt-test
  (do-with-experiment-test
   (fn [report-fn results]
     (is (thrown?
          #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
          (experiment/experiment {:name :test/control-error :min-interval-ms 0 :report-fn report-fn}
                                 (throw (ex-info "control-boom" {}))
                                 :candidate)))
     (is (= 1 (count @results)))
     (is (false? (:match? (first @results)))))))

(deftest both-throw-same-exception-test
  (do-with-experiment-test
   (fn [report-fn results]
     (is (thrown?
          #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
          (experiment/experiment {:name :test/both-throw-same :min-interval-ms 0 :report-fn report-fn}
                                 (throw (ex-info "boom" {:code 42}))
                                 (throw (ex-info "boom" {:code 42})))))
     (is (= 1 (count @results)))
     (is (true? (:match? (first @results)))))))

(deftest both-throw-different-exception-test
  (do-with-experiment-test
   (fn [report-fn results]
     (is (thrown?
          #?(:clj clojure.lang.ExceptionInfo :cljs ExceptionInfo)
          (experiment/experiment {:name :test/both-throw-diff :min-interval-ms 0 :report-fn report-fn}
                                 (throw (ex-info "boom-a" {:code 1}))
                                 (throw (ex-info "boom-b" {:code 2})))))
     (is (= 1 (count @results)))
     (is (false? (:match? (first @results)))))))

(deftest custom-comparator-test
  (do-with-experiment-test
   (fn [report-fn results]
     (let [close-enough? (fn [a b] (< (abs (- a b)) 0.01))]
       (experiment/experiment {:name       :test/custom-cmp
                               :min-interval-ms 0
                               :report-fn  report-fn
                               :comparator-fn close-enough?}
                              1.0
                              1.005))
     (is (true? (:match? (first @results)))))))

;;; --------------------------------------------------- Metrics ---------------------------------------------------

(deftest report-fn-receives-durations-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/durations :min-interval-ms 0 :report-fn report-fn}
                            (do #?(:clj (Thread/sleep 1) :cljs nil) :control)
                            (do #?(:clj (Thread/sleep 1) :cljs nil) :candidate))
     (let [r (first @results)]
       (is (pos? (:control-duration-ns r)))
       (is (pos? (:candidate-duration-ns r)))))))

(deftest report-fn-receives-name-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/name-check :min-interval-ms 0 :report-fn report-fn}
                            :a
                            :a)
     (is (= :test/name-check (:name (first @results)))))))

;;; -------------------------------------------------- Throttling -------------------------------------------------

(deftest throttle-no-limit-test
  (do-with-experiment-test
   (fn [report-fn results]
     (dotimes [_ 5]
       (experiment/experiment {:name :test/no-throttle :min-interval-ms 0 :report-fn report-fn}
                              :control
                              :candidate))
     (is (= 5 (count @results))))))

(deftest throttle-skips-rapid-calls-test
  (do-with-experiment-test
   (fn [report-fn results]
     (experiment/experiment {:name :test/throttled :min-interval-ms 60000 :report-fn report-fn}
                            :control
                            :candidate)
     (experiment/experiment {:name :test/throttled :min-interval-ms 60000 :report-fn report-fn}
                            :control
                            :candidate)
     (is (= 1 (count @results))))))

;;; ------------------------------------------------- Kill switch -------------------------------------------------

(deftest global-kill-switch-test
  (testing "experiments-enabled false prevents candidate from running"
    (do-with-experiment-test
     (fn [report-fn results]
       (experiment/set-experiments-enabled-fn! (constantly false))
       (try
         (experiment/experiment {:name :test/killed :min-interval-ms 0 :report-fn report-fn}
                                :control
                                :candidate)
         (is (empty? @results))
         (finally
           (experiment/set-experiments-enabled-fn! (constantly true)))))))
  (testing "re-enabling allows experiments again"
    (do-with-experiment-test
     (fn [report-fn results]
       (experiment/experiment {:name :test/re-enabled :min-interval-ms 0 :report-fn report-fn}
                              :control
                              :candidate)
       (is (= 1 (count @results)))))))

;;; -------------------------------------------- Async execution (JVM) --------------------------------------------

#?(:clj
   (deftest async-execution-test
     (testing "candidate runs asynchronously by default on JVM"
       (reset-throttle!)
       (let [p (promise)]
         (experiment/experiment {:name          :test/async
                                 :min-interval-ms 0
                                 :report-fn     #(deliver p %)}
                                :control
                                :control)
         (let [result (deref p 5000 ::timeout)]
           (is (not= ::timeout result))
           (is (true? (:match? result))))))))

;;; ------------------------------------------- Default report fn --------------------------------------------------

(deftest default-report-fn-test
  (testing "*default-report-fn* is used when no :report-fn is specified"
    (do-with-experiment-test
     (fn [_report-fn results]
       (binding [experiment/*default-report-fn* #(swap! results conj %)]
         (experiment/experiment {:name :test/default-report :min-interval-ms 0}
                                :a
                                :a))
       (is (= 1 (count @results)))
       (is (true? (:match? (first @results)))))))
  (testing ":report-fn overrides *default-report-fn*"
    (do-with-experiment-test
     (fn [_report-fn _results]
       (let [default-results (atom [])
             custom-results  (atom [])]
         (binding [experiment/*default-report-fn* #(swap! default-results conj %)]
           (experiment/experiment {:name      :test/override-report
                                   :min-interval-ms 0
                                   :report-fn #(swap! custom-results conj %)}
                                  :a
                                  :a))
         (is (empty? @default-results))
         (is (= 1 (count @custom-results))))))))
