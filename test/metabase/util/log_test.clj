(ns metabase.util.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.log :as log])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(defn- get-context
  []
  (ThreadContext/getImmutableContext))

(deftest with-context-test
  (testing "with-context should set and reset context correctly"
    (is (empty? (get-context)))  ; Initially context should be nil

    (log/with-context {:user-id 123 :action "test"}
      (is (= {"user-id" "123" "action" "test"}
             (get-context))
          "Context should be set inside macro"))

    (is (empty? (get-context))
        "Context should be reset to nil after macro"))

  (testing "with-context should handle nested contexts"
    (log/with-context {:outer "value" :empty "" :false false}
      (is (= {"outer" "value" "empty" "" "false" "false"}
             (get-context))
          "Outer context should be set")

      (log/with-context {:inner "nested"}
        (is (= {"outer" "value" "inner" "nested" "empty" "" "false" "false"}
               (get-context))
            "Inner context should replace outer context"))

      (is (= {"outer" "value" "empty" "" "false" "false"}
             (get-context))
          "Outer context should be restored after nested macro")))

  (testing "with-context should reset context even if exception occurs"
    (is (empty? (get-context)))

    (try
      (log/with-context {:error "test"}
        (throw (Exception. "Test exception")))
      (catch Exception _))

    (is (empty? (get-context))
        "Context should be reset after exception")))
