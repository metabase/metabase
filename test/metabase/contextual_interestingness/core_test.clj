(ns metabase.contextual-interestingness.core-test
  (:require
   [clojure.string :as str]
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

(defn- call
  "Invoke `score-and-describe-chart` with sensible defaults."
  [overrides]
  (contextual-interestingness/score-and-describe-chart
   (merge {:chart-config   chart-config
           :context-string "Why is revenue down this month?"}
          overrides)))

(deftest score-and-describe-blank-context-test
  (testing "blank or nil context returns nil without invoking the LLM"
    (let [calls (atom 0)]
      (with-redefs [metabot.self/call-llm-structured
                    (fn [& _] (swap! calls inc) {:score 1.0 :chart_description "c" :reasoning "x"})]
        (with-llm-configured!
          (fn []
            (is (nil? (call {:context-string nil})))
            (is (nil? (call {:context-string ""})))
            (is (nil? (call {:context-string "   "})))
            (is (zero? @calls) "LLM must not be called when context is blank")))))))

(deftest score-and-describe-nil-config-test
  (testing "nil chart-config returns nil without invoking the LLM"
    (let [calls (atom 0)]
      (with-redefs [metabot.self/call-llm-structured
                    (fn [& _] (swap! calls inc) {:score 1.0 :chart_description "c" :reasoning "x"})]
        (with-llm-configured!
          (fn []
            (is (nil? (call {:chart-config nil})))
            (is (zero? @calls))))))))

(deftest score-and-describe-unconfigured-llm-test
  (testing "returns nil and skips the LLM call when no provider is configured"
    (let [calls (atom 0)]
      (with-redefs [metabot.settings/llm-metabot-configured? (constantly false)
                    metabot.self/call-llm-structured
                    (fn [& _] (swap! calls inc) {:score 1.0 :chart_description "c" :reasoning "x"})]
        (is (nil? (call {})))
        (is (zero? @calls))))))

(deftest score-and-describe-happy-path-test
  (testing "valid LLM response returns score + descriptions; metric description is generated when card-description is blank"
    (with-redefs [metabot.self/call-llm-structured
                  (constantly {:score              0.85
                               :chart_description  "Monthly revenue trend over the past year"
                               :metric_description "Total monthly revenue from completed orders"
                               :reasoning          "directly addresses revenue trend"})]
      (with-llm-configured!
        (fn []
          (let [out (call {})]
            (is (= 0.85 (:score out)))
            (is (= "Monthly revenue trend over the past year" (:chart-description out)))
            (is (= "Total monthly revenue from completed orders" (:metric-description out)))))))))

(deftest score-and-describe-with-card-description-test
  (testing "When card-description is provided, the schema does not require metric_description and parse-response surfaces it as nil"
    (with-redefs [metabot.self/call-llm-structured
                  (constantly {:score             0.6
                               :chart_description "Monthly revenue"
                               :reasoning         "related"})]
      (with-llm-configured!
        (fn []
          (let [out (call {:card-description "Sum of completed order totals"})]
            (is (= 0.6 (:score out)))
            (is (= "Monthly revenue" (:chart-description out)))
            (is (nil? (:metric-description out)))))))))

(deftest score-and-describe-clamping-test
  (testing "scores outside [0,1] are clamped"
    (with-llm-configured!
      (fn []
        (with-redefs [metabot.self/call-llm-structured
                      (constantly {:score 1.5 :chart_description "c" :reasoning "over"})]
          (is (= 1.0 (:score (call {})))))
        (with-redefs [metabot.self/call-llm-structured
                      (constantly {:score -0.2 :chart_description "c" :reasoning "under"})]
          (is (= 0.0 (:score (call {})))))))))

(deftest score-and-describe-malformed-response-test
  (testing "missing or non-numeric :score → nil (caller-visible failure mode)"
    (with-llm-configured!
      (fn []
        (with-redefs [metabot.self/call-llm-structured
                      (constantly {:chart_description "c" :reasoning "no score"})]
          (is (nil? (call {}))))
        (with-redefs [metabot.self/call-llm-structured
                      (constantly {:score "not a number" :chart_description "c" :reasoning "wrong type"})]
          (is (nil? (call {}))))))))

(deftest score-and-describe-empty-descriptions-test
  (testing "blank/whitespace descriptions parse to nil"
    (with-redefs [metabot.self/call-llm-structured
                  (constantly {:score              0.5
                               :chart_description  "   "
                               :metric_description ""
                               :reasoning          "x"})]
      (with-llm-configured!
        (fn []
          (let [out (call {})]
            (is (= 0.5 (:score out)))
            (is (nil? (:chart-description out)))
            (is (nil? (:metric-description out)))))))))

(deftest score-and-describe-llm-throws-test
  (testing "transport / API errors are caught and surfaced as nil — never thrown"
    (with-redefs [metabot.self/call-llm-structured (fn [& _] (throw (ex-info "boom" {:status 503})))]
      (with-llm-configured!
        (fn []
          (is (nil? (call {}))))))))

(deftest score-and-describe-sql-input-routes-into-prompt-test
  (testing "Provided :sql shows up in the user message handed to the LLM"
    (let [captured (atom nil)]
      (with-redefs [metabot.self/call-llm-structured
                    (fn [_model messages _schema _temp _max-tokens _opts]
                      (reset! captured (-> messages first :content))
                      {:score 0.7 :chart_description "c" :reasoning "x"})]
        (with-llm-configured!
          (fn []
            (call {:sql "SELECT count(*) FROM orders WHERE status='completed'"})
            (is (some? @captured))
            (is (str/includes? @captured "COMPILED SQL"))
            (is (str/includes? @captured "WHERE status='completed'"))))))))
