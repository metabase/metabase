(ns metabase.contextual-interestingness.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]))

(def ^:private chart-config
  "A minimal but well-formed time-series chart-config the lego will accept."
  {:display_type "line"
   :title        "Revenue by month"
   :series       {"Revenue"
                  {:x            {:name "month" :type "datetime"}
                   :y            {:name "Revenue" :type "number"}
                   :x_values     ["2024-01-01" "2024-02-01" "2024-03-01"]
                   :y_values     [100 120 90]
                   :display_name "Revenue"}}})

(defn- with-llm-configured! [thunk]
  (with-redefs [metabot.settings/llm-metabot-configured? (constantly true)]
    (thunk)))

(deftest contextual-chart-interestingness-blank-context-test
  (testing "blank or nil context returns nil without invoking the LLM"
    (let [calls (atom 0)]
      (with-redefs [metabot.self/call-llm-structured (fn [& _] (swap! calls inc) {:score 1.0 :reasoning "x"})]
        (with-llm-configured!
          (fn []
            (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config nil)))
            (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "")))
            (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "   ")))
            (is (zero? @calls) "LLM must not be called when context is blank")))))))

(deftest contextual-chart-interestingness-nil-config-test
  (testing "nil chart-config returns nil without invoking the LLM"
    (let [calls (atom 0)]
      (with-redefs [metabot.self/call-llm-structured (fn [& _] (swap! calls inc) {:score 1.0 :reasoning "x"})]
        (with-llm-configured!
          (fn []
            (is (nil? (contextual-interestingness/contextual-chart-interestingness nil "What is revenue doing?")))
            (is (zero? @calls))))))))

(deftest contextual-chart-interestingness-unconfigured-llm-test
  (testing "returns nil and skips the LLM call when no provider is configured"
    (let [calls (atom 0)]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)
                    metabot.self/call-llm-structured        (fn [& _] (swap! calls inc) {:score 1.0 :reasoning "x"})]
        (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "Why is revenue down?")))
        (is (zero? @calls))))))

(deftest contextual-chart-interestingness-happy-path-test
  (testing "valid LLM response returns the score as a double"
    (with-redefs [metabot.self/call-llm-structured (constantly {:score 0.85 :reasoning "directly addresses revenue trend"})]
      (with-llm-configured!
        (fn []
          (let [s (contextual-interestingness/contextual-chart-interestingness chart-config "Why is revenue down this month?")]
            (is (double? s))
            (is (= 0.85 s))))))))

(deftest contextual-chart-interestingness-clamping-test
  (testing "scores outside [0,1] are clamped"
    (with-llm-configured!
      (fn []
        (with-redefs [metabot.self/call-llm-structured (constantly {:score 1.5 :reasoning "over"})]
          (is (= 1.0 (contextual-interestingness/contextual-chart-interestingness chart-config "q"))))
        (with-redefs [metabot.self/call-llm-structured (constantly {:score -0.2 :reasoning "under"})]
          (is (= 0.0 (contextual-interestingness/contextual-chart-interestingness chart-config "q"))))))))

(deftest contextual-chart-interestingness-malformed-response-test
  (testing "missing or non-numeric :score → nil (caller-visible failure mode)"
    (with-llm-configured!
      (fn []
        (with-redefs [metabot.self/call-llm-structured (constantly {:reasoning "no score"})]
          (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "q"))))
        (with-redefs [metabot.self/call-llm-structured (constantly {:score "not a number" :reasoning "wrong type"})]
          (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "q"))))))))

(deftest contextual-chart-interestingness-llm-throws-test
  (testing "transport / API errors are caught and surfaced as nil — never thrown"
    (with-redefs [metabot.self/call-llm-structured (fn [& _] (throw (ex-info "boom" {:status 503})))]
      (with-llm-configured!
        (fn []
          (is (nil? (contextual-interestingness/contextual-chart-interestingness chart-config "q"))))))))
