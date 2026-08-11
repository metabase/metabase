(ns metabase.test.initialize-test
  "Tests for the fixture-initialization middleware. The components under test are synthetic, so nothing here touches
  the real fixture graph."
  (:require
   [clojure.test :refer :all]
   [integrant.core :as ig]
   [metabase.test.initialize :as initialize])
  (:import
   (java.util.concurrent TimeoutException)))

(set! *warn-on-reflection* true)

(def ^:private calls (atom 0))

(defmethod ig/init-key ::leaf [_ _] (swap! calls inc))
(defmethod ig/init-key ::branch [_ _] (swap! calls inc))
(defmethod ig/init-key ::slow [_ _] (Thread/sleep 10000))

(ig/annotate ::slow {:metabase.test.initialize/timeout-ms 50})

(def ^:private test-config
  {::leaf   {}
   ::branch {:leaf (ig/ref ::leaf)}})

(def ^:private init-log (atom []))

(defmethod ig/init-key ::shared-dep [k _] (swap! init-log conj k))
(defmethod ig/init-key ::consumer-a [k _] (swap! init-log conj k))
(defmethod ig/init-key ::consumer-b [k _] (swap! init-log conj k))

(def ^:private shared-dep-config
  {::shared-dep {}
   ::consumer-a {:shared-dep (ig/ref ::shared-dep)}
   ::consumer-b {:shared-dep (ig/ref ::shared-dep)}})

(deftest each-component-initializes-once-across-builds-test
  (testing "asking for ::branch also initializes its dependency, and neither runs again on a second build"
    ;; the once-only guard is global and permanent, so this assertion only holds the first time it runs in a JVM
    (let [before @calls]
      (ig/build test-config [::branch] #'initialize/init-once!)
      (ig/build test-config [::branch] #'initialize/init-once!)
      (is (= 2 (- @calls before))))))

(deftest shared-dependency-initializes-once-across-subsets-test
  (testing "builds requesting different components initialize their common dependency once between them"
    ;; the once-only guard is global and permanent, so this assertion only holds the first time it runs in a JVM
    (ig/build shared-dep-config [::consumer-a] #'initialize/init-once!)
    (ig/build shared-dep-config [::consumer-b] #'initialize/init-once!)
    (is (= {::shared-dep 1, ::consumer-a 1, ::consumer-b 1}
           (frequencies @init-log)))))

(deftest component-exceeding-its-annotated-timeout-throws-test
  (is (thrown? TimeoutException
               (#'initialize/init-with-budget! ::slow {}))))

(deftest unknown-steps-are-all-reported-test
  (testing "every unknown step is named, not just the first"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Unknown initialization steps: :not-a-fixture, :also-bogus"
                          (initialize/initialize-if-needed! :not-a-fixture :db :also-bogus)))
    (is (= [:not-a-fixture :also-bogus]
           (-> (try
                 (initialize/initialize-if-needed! :not-a-fixture :db :also-bogus)
                 (catch clojure.lang.ExceptionInfo e (ex-data e)))
               :unknown-steps)))))
