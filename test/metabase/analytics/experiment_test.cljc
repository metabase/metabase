(ns metabase.analytics.experiment-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.experiment :as analytics.experiment]
   [metabase.util.experiment :as experiment]))

(defn- make-test-reporter [calls]
  (reify analytics.interface/Reporter
    (-inc! [_ metric labels amount]
      (swap! calls conj {:op :inc! :metric metric :labels labels :amount amount}))
    (-dec-gauge! [_ metric labels amount]
      (swap! calls conj {:op :dec-gauge! :metric metric :labels labels :amount amount}))
    (-set-gauge! [_ metric labels amount]
      (swap! calls conj {:op :set-gauge! :metric metric :labels labels :amount amount}))
    (-observe! [_ metric labels amount]
      (swap! calls conj {:op :observe! :metric metric :labels labels :amount amount}))
    (-clear! [_ metric]
      (swap! calls conj {:op :clear! :metric metric}))))

(defn- do-with-test-reporter [f]
  (let [calls             (atom [])
        original-reporter (analytics.interface/get-reporter)]
    (try
      (analytics.interface/set-reporter! (make-test-reporter calls))
      (f calls)
      (finally
        (analytics.interface/set-reporter! original-reporter)))))

(defn- calls-for [calls metric]
  (filterv #(= metric (:metric %)) @calls))

;;; ---------------------------------------------------- Tests ----------------------------------------------------

(deftest report-match-test
  (testing "matching result increments runs-total and matches-total, observes durations"
    (do-with-test-reporter
     (fn [calls]
       (analytics.experiment/report!
        {:name                  :test/match
         :match?                true
         :control-duration-ns   1000000
         :candidate-duration-ns 2000000
         :control-outcome       {:result 42}
         :candidate-outcome     {:result 42}})
       (let [labels {:experiment "test/match"}]
         (is (= [{:op :inc! :metric :experiment/runs-total :labels labels :amount 1}]
                (calls-for calls :experiment/runs-total)))
         (is (= [{:op :inc! :metric :experiment/matches-total :labels labels :amount 1}]
                (calls-for calls :experiment/matches-total)))
         (is (empty? (calls-for calls :experiment/mismatches-total)))
         (is (empty? (calls-for calls :experiment/errors-total)))
         (is (= [{:op :observe! :metric :experiment/control-duration-ms :labels labels :amount 1.0}]
                (calls-for calls :experiment/control-duration-ms)))
         (is (= [{:op :observe! :metric :experiment/candidate-duration-ms :labels labels :amount 2.0}]
                (calls-for calls :experiment/candidate-duration-ms))))))))

(deftest report-mismatch-test
  (testing "mismatching result increments runs-total and mismatches-total"
    (do-with-test-reporter
     (fn [calls]
       (analytics.experiment/report!
        {:name                  :test/mismatch
         :match?                false
         :control-duration-ns   1000000
         :candidate-duration-ns 2000000
         :control-outcome       {:result :old}
         :candidate-outcome     {:result :new}})
       (let [labels {:experiment "test/mismatch"}]
         (is (= [{:op :inc! :metric :experiment/runs-total :labels labels :amount 1}]
                (calls-for calls :experiment/runs-total)))
         (is (empty? (calls-for calls :experiment/matches-total)))
         (is (= [{:op :inc! :metric :experiment/mismatches-total :labels labels :amount 1}]
                (calls-for calls :experiment/mismatches-total)))
         (is (empty? (calls-for calls :experiment/errors-total))))))))

(deftest report-matching-errors-test
  (testing "both threw same exception: counted as match, not error"
    (do-with-test-reporter
     (fn [calls]
       (let [ex (ex-info "boom" {:code 1})]
         (analytics.experiment/report!
          {:name                  :test/matching-error
           :match?                true
           :control-duration-ns   1000000
           :candidate-duration-ns 800000
           :control-outcome       {:error ex}
           :candidate-outcome     {:error ex}}))
       (let [labels {:experiment "test/matching-error"}]
         (is (= [{:op :inc! :metric :experiment/matches-total :labels labels :amount 1}]
                (calls-for calls :experiment/matches-total)))
         (is (empty? (calls-for calls :experiment/errors-total)))
         (is (empty? (calls-for calls :experiment/mismatches-total))))))))

(deftest report-candidate-error-test
  (testing "candidate error (mismatch) increments runs-total and errors-total"
    (do-with-test-reporter
     (fn [calls]
       (analytics.experiment/report!
        {:name                  :test/error
         :match?                false
         :control-duration-ns   1000000
         :candidate-duration-ns 500000
         :control-outcome       {:result :ok}
         :candidate-outcome     {:error (ex-info "boom" {})}})
       (let [labels {:experiment "test/error"}]
         (is (= [{:op :inc! :metric :experiment/runs-total :labels labels :amount 1}]
                (calls-for calls :experiment/runs-total)))
         (is (= [{:op :inc! :metric :experiment/errors-total :labels labels :amount 1}]
                (calls-for calls :experiment/errors-total)))
         (is (empty? (calls-for calls :experiment/matches-total)))
         (is (empty? (calls-for calls :experiment/mismatches-total)))
         (is (empty? (calls-for calls :experiment/candidate-duration-ms)))
         (is (= [{:op :observe! :metric :experiment/candidate-error-duration-ms :labels labels :amount 0.5}]
                (calls-for calls :experiment/candidate-error-duration-ms))))))))

(deftest wiring-test
  (testing "requiring metabase.analytics.experiment installs report! as the default report fn"
    (is (= analytics.experiment/report!
           @@#'experiment/default-report-fn))))
