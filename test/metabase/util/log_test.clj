(ns metabase.util.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.log :as log])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(defn- to-map [immutable-context]
  (into {} immutable-context))

(defn- get-context-fn
  []
  (let [original-context (to-map (ThreadContext/getImmutableContext))]
    (fn []
      (let [new-context (to-map (ThreadContext/getImmutableContext))]
        (apply dissoc new-context (keys original-context))))))

(deftest with-context-test
  (let [get-context (get-context-fn)
        original-context (get-context)]
    (testing "with-context should set and reset context correctly"
      (log/with-context {:user-id 123 :action "test"}
        (is (= {"mb-user-id" "123" "mb-action" "test"}
               (get-context))
            "Context should be set inside macro"))

      (is (= original-context (get-context))
          "Context should be reset after macro"))

    (testing "with-context should handle nested contexts"
      (log/with-context {:outer "value" :empty "" :false false}
        (is (= {"mb-outer" "value" "mb-empty" "" "mb-false" "false"}
               (get-context))
            "Outer context should be set")

        (log/with-context {:inner "nested"}
          (is (= {"mb-outer" "value" "mb-inner" "nested" "mb-empty" "" "mb-false" "false"}
                 (get-context))
              "Inner context should replace outer context"))

        (is (= {"mb-outer" "value" "mb-empty" "" "mb-false" "false"}
               (get-context))
            "Outer context should be restored after nested macro")))

    (testing "with-context should reset context even if exception occurs"
      (is (= original-context (get-context)))

      (try
        (log/with-context {:error "test"}
          (throw (Exception. "Test exception")))
        (catch Exception _))

      (is (= original-context (get-context))
          "Context should be reset after exception"))))
