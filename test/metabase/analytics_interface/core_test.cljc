(ns metabase.analytics-interface.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.analytics-interface.core :as analytics.interface]))

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

(defn- do-with-test-reporter! [thunk]
  (let [calls             (atom [])
        original-reporter (analytics.interface/get-reporter)]
    (try
      (analytics.interface/set-reporter! (make-test-reporter calls))
      (thunk calls)
      (finally
        (analytics.interface/set-reporter! original-reporter)))))

(deftest ^:synchronized no-op-when-no-reporter-test
  (let [original-reporter (analytics.interface/get-reporter)]
    (try
      (analytics.interface/set-reporter! nil)
      (testing "inc! is a no-op when no reporter is set"
        (is (nil? (analytics.interface/inc! :test/counter {:label "a"} 1))))
      (testing "dec-gauge! is a no-op when no reporter is set"
        (is (nil? (analytics.interface/dec-gauge! :test/gauge {:label "a"} 1))))
      (testing "set-gauge! is a no-op when no reporter is set"
        (is (nil? (analytics.interface/set-gauge! :test/gauge {:label "a"} 10))))
      (testing "observe! is a no-op when no reporter is set"
        (is (nil? (analytics.interface/observe! :test/histogram {:label "a"} 42))))
      (testing "clear! is a no-op when no reporter is set"
        (is (nil? (analytics.interface/clear! :test/counter))))
      (finally
        (analytics.interface/set-reporter! original-reporter)))))

(deftest ^:synchronized delegates-to-reporter-test
  (do-with-test-reporter!
   (fn [calls]
     (testing "inc! delegates to reporter"
       (analytics.interface/inc! :test/counter {:label "a"} 5)
       (is (= [{:op :inc! :metric :test/counter :labels {:label "a"} :amount 5}]
              @calls)))
     (testing "dec-gauge! delegates to reporter"
       (reset! calls [])
       (analytics.interface/dec-gauge! :test/gauge {:label "a"} 3)
       (is (= [{:op :dec-gauge! :metric :test/gauge :labels {:label "a"} :amount 3}]
              @calls)))
     (testing "set-gauge! delegates to reporter"
       (reset! calls [])
       (analytics.interface/set-gauge! :test/gauge {:label "a"} 10)
       (is (= [{:op :set-gauge! :metric :test/gauge :labels {:label "a"} :amount 10}]
              @calls)))
     (testing "observe! delegates to reporter"
       (reset! calls [])
       (analytics.interface/observe! :test/histogram {:label "b"} 42)
       (is (= [{:op :observe! :metric :test/histogram :labels {:label "b"} :amount 42}]
              @calls)))
     (testing "clear! delegates to reporter"
       (reset! calls [])
       (analytics.interface/clear! :test/counter)
       (is (= [{:op :clear! :metric :test/counter}]
              @calls))))))

(deftest ^:synchronized inc!-arity-test
  (do-with-test-reporter!
   (fn [calls]
     (testing "1-arity: metric only, defaults to nil labels and amount 1"
       (analytics.interface/inc! :test/counter)
       (is (= [{:metric :test/counter :labels nil :amount 1}]
              (mapv #(dissoc % :op) @calls))))
     (testing "2-arity with number: metric + amount"
       (reset! calls [])
       (analytics.interface/inc! :test/counter 5)
       (is (= [{:metric :test/counter :labels nil :amount 5}]
              (mapv #(dissoc % :op) @calls))))
     (testing "2-arity with map: metric + labels"
       (reset! calls [])
       (analytics.interface/inc! :test/counter {:x "y"})
       (is (= [{:metric :test/counter :labels {:x "y"} :amount 1}]
              (mapv #(dissoc % :op) @calls)))))))

(deftest ^:synchronized dec-gauge!-arity-test
  (do-with-test-reporter!
   (fn [calls]
     (testing "1-arity: metric only, defaults to nil labels and amount 1"
       (analytics.interface/dec-gauge! :test/gauge)
       (is (= [{:metric :test/gauge :labels nil :amount 1}]
              (mapv #(dissoc % :op) @calls))))
     (testing "2-arity with number: metric + amount"
       (reset! calls [])
       (analytics.interface/dec-gauge! :test/gauge 3)
       (is (= [{:metric :test/gauge :labels nil :amount 3}]
              (mapv #(dissoc % :op) @calls))))
     (testing "2-arity with map: metric + labels"
       (reset! calls [])
       (analytics.interface/dec-gauge! :test/gauge {:x "y"})
       (is (= [{:metric :test/gauge :labels {:x "y"} :amount 1}]
              (mapv #(dissoc % :op) @calls)))))))

(deftest ^:synchronized set-gauge!-arity-test
  (do-with-test-reporter!
   (fn [calls]
     (testing "2-arity: metric + amount, nil labels"
       (analytics.interface/set-gauge! :test/gauge 10)
       (is (= [{:metric :test/gauge :labels nil :amount 10}]
              (mapv #(dissoc % :op) @calls))))
     (testing "3-arity: metric + labels + amount"
       (reset! calls [])
       (analytics.interface/set-gauge! :test/gauge {:x "y"} 20)
       (is (= [{:metric :test/gauge :labels {:x "y"} :amount 20}]
              (mapv #(dissoc % :op) @calls)))))))
