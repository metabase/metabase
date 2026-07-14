(ns metabase.contextual-interestingness.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.contextual-interestingness.core :as contextual-interestingness]
   [metabase.contextual-interestingness.llm :as contextual-interestingness.llm]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as usage]))

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
  ;; the LLM gate checks usage limits and user permissions in addition to the settings,
  ;; so stub all four for tests that want the gate open.
  (with-redefs [metabot.settings/metabot-enabled?        (constantly true)
                metabot.settings/llm-metabot-configured? (constantly true)
                usage/check-usage-limits!                (constantly nil)
                scope/resolve-user-permissions           (constantly scope/all-yes-permissions)]
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

(deftest score-and-describe-gate-closed-test
  (testing "returns nil and never invokes the LLM when the shared metabot.core pre-flight gate is closed"
    (doseq [[label redefs]
            [["Metabot disabled"   {#'metabot.settings/metabot-enabled? (constantly false)}]
             ["no provider"        {#'metabot.settings/llm-metabot-configured? (constantly false)}]
             ["over usage limit"   {#'usage/check-usage-limits! (constantly "You've used all your tokens")}]
             ["missing permission" {#'scope/resolve-user-permissions
                                    (constantly (assoc scope/all-yes-permissions
                                                       :permission/metabot-other-tools :no))}]]]
      (testing label
        (let [calls (atom 0)]
          (with-redefs-fn (merge {#'metabot.settings/metabot-enabled?        (constantly true)
                                  #'metabot.settings/llm-metabot-configured? (constantly true)
                                  #'usage/check-usage-limits!                (constantly nil)
                                  #'scope/resolve-user-permissions           (constantly scope/all-yes-permissions)
                                  #'metabot.self/call-llm-structured
                                  (fn [& _] (swap! calls inc) {:score 1.0 :chart_description "c" :reasoning "x"})}
                                 redefs)
            (fn []
              (is (nil? (call {})))
              (is (zero? @calls) "the LLM must not be called when the gate is closed"))))))))

(deftest score-and-describe-gate-throws-test
  (testing "returns nil (never throws) when a pre-flight gate dependency itself throws"
    (doseq [[label redefs]
            [["check-usage-limits! throws"     {#'usage/check-usage-limits!
                                                (fn [] (throw (ex-info "boom in usage check" {})))}]
             ["resolve-user-permissions throws" {#'scope/resolve-user-permissions
                                                 (fn [_] (throw (ex-info "boom in perms" {})))}]]]
      (testing label
        (with-redefs-fn (merge {#'metabot.settings/metabot-enabled?        (constantly true)
                                #'metabot.settings/llm-metabot-configured? (constantly true)
                                #'usage/check-usage-limits!                (constantly nil)
                                #'scope/resolve-user-permissions           (constantly scope/all-yes-permissions)
                                #'metabot.self/call-llm-structured
                                (fn [& _] {:score 1.0 :chart_description "c" :reasoning "x"})}
                               redefs)
          (fn []
            (is (nil? (call {})) "must swallow the exception and return nil per its \"Never throws\" contract")))))))

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

(deftest parse-response-retains-reasoning-test
  (testing "parse-response surfaces the model's :reasoning field (asked for in the schema, previously dropped)"
    (let [parsed (#'contextual-interestingness.llm/parse-response
                  {:score 0.8 :chart_description "c" :reasoning "  directly answers the question  "})]
      (is (= 0.8 (:score parsed)))
      (is (= "directly answers the question" (:reasoning parsed))
          "reasoning should be trimmed and surfaced"))
    (testing "blank/whitespace reasoning parses to nil"
      (is (nil? (:reasoning (#'contextual-interestingness.llm/parse-response
                             {:score 0.3 :chart_description "c" :reasoning "   "})))))))

(deftest score-and-describe-surfaces-reasoning-test
  (testing "the LLM's reasoning flows all the way through to the public result map"
    (with-redefs [metabot.self/call-llm-structured
                  (constantly {:score 0.7 :chart_description "c" :reasoning "because revenue"})]
      (with-llm-configured!
        (fn []
          (is (= "because revenue" (:reasoning (call {})))))))))

(deftest score-and-describe-prompt-describes-chart-not-data-test
  (testing "The describer is told to describe what the chart IS, not narrate the data's shape"
    ;; exercise the prompt builder directly — gate-independent
    (let [msg (#'contextual-interestingness.llm/build-user-message
               {:chart-config   chart-config
                :context-string "Why is revenue down this month?"})]
      (is (str/includes? msg "Describe the chart, not the data")))))

(deftest score-and-describe-slicing-routes-into-prompt-test
  (testing "An explicit :chart-slicing is surfaced to the describer, which is told to name it"
    (let [msg (#'contextual-interestingness.llm/build-user-message
               {:chart-config   chart-config
                :context-string "Why is revenue down this month?"
                :chart-slicing  "top 10 values, remainder grouped as Other; filtered to segment \"Standard Surveys\""})]
      (is (str/includes? msg "Slicing (this chart is a specific cut"))
      (is (str/includes? msg "filtered to segment \"Standard Surveys\""))
      ;; the rubric directs the model to fold the slicing into chart_description
      (is (str/includes? msg "fold it in")))))

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
