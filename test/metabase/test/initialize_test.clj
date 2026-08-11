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

(deftest each-component-initializes-once-across-builds-test
  (testing "asking for ::branch also initializes its dependency, and neither runs again on a second build"
    ;; the once-only guard is global and permanent, so this assertion only holds the first time it runs in a JVM
    (let [before @calls]
      (ig/build test-config [::branch] #'initialize/init-once!)
      (ig/build test-config [::branch] #'initialize/init-once!)
      (is (= 2 (- @calls before))))))

(deftest component-exceeding-its-annotated-timeout-throws-test
  (is (thrown? TimeoutException
               (#'initialize/init-with-budget! ::slow {}))))

(deftest unknown-step-is-rejected-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Unknown initialization step: :not-a-fixture"
                        (initialize/initialize-if-needed! :not-a-fixture))))
