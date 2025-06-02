(ns metabase.util.log-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.properties :as prop]
   [malli.generator :as mg]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(deftest log-parse-args-test
  (is (= ["Must have at least one string in arguments" nil]
         (try (#'log/parse-args) (catch Exception e [(ex-message e) (ex-data e)]))))
  (is (= {:msg "a", :ctx nil, :e nil}
         (#'log/parse-args "a")))
  (is (= {:msg "a b", :ctx nil, :e nil}
         (#'log/parse-args "a" "b")))
  (is (= {:msg "a b", :ctx {:a 1}, :e nil}
         (#'log/parse-args "a" "b" {:a 1})))
  (is (= {:msg "a b 2", :ctx {:a 1}, :e {:ex-message "message", :ex-data {}}}
         (-> (#'log/parse-args (ex-info "message" {}) "a" "b" 2 {:a 1})
             (update :e (fn [e]
                          {:ex-message (ex-message e)
                           :ex-data (ex-data e)}))))))

(def oddity
  [:and
   {:gen/elements [(ex-info "woops" {:problem true})
                   (ex-info "uh o" {:problem :yea})
                   (ex-info "oops" {:problem :nope})]}
   (ms/InstanceOfClass Throwable)])

(def ^:private valid-args [:cat
                           [:? oddity]
                           ;; anything printable with at least 1 string.
                           [:* :any] :string [:* :any]
                           [:? :map]])

(defspec can-valid-log-args
  (prop/for-all [log-args (mg/generator valid-args)]
    (= #{:msg :ctx :e} (set (keys (apply #'log/parse-args log-args))))))

(defspec can-pick-out-ctx-maps
  (prop/for-all [log-args (mg/generator valid-args)]
    (if (map? (last log-args))
      (= (last log-args)
         (:ctx (apply #'log/parse-args log-args)))
      true)))

(defspec enforces-at-least-one-string
  (prop/for-all [log-args (mg/generator [:cat [:? oddity] [:* :string] [:? :map]])]
    (if (seq (filter string? log-args))
      true
      (try (apply #'log/parse-args log-args)
           (catch Exception e (= "Must have at least one string in arguments" (ex-message e)))))))

(defspec enforces-at-least-one-string-with-any
  (prop/for-all [log-args (mg/generator [:cat [:? oddity] [:* :any] [:? :map]])]
    (if (seq (filter string? log-args))
      true
      (try (apply #'log/parse-args log-args)
           (catch Exception e (= "Must have at least one string in arguments" (ex-message e)))))))

(defn- get-context
  []
  (ThreadContext/getImmutableContext))

(deftest with-context-test
  (testing "with-context should set and reset context correctly"
    (is (empty? (get-context)))  ; Initially context should be nil

    (log/with-context {:user-id 123 :action "test"}
      (is (= {"mb-user-id" "123" "mb-action" "test"}
             (get-context))
          "Context should be set inside macro"))

    (is (empty? (get-context))
        "Context should be reset to nil after macro"))

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
    (is (empty? (get-context)))

    (try
      (log/with-context {:error "test"}
        (throw (Exception. "Test exception")))
      (catch Exception _))

    (is (empty? (get-context))
        "Context should be reset after exception")))
