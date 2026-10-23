(ns metabase.help-assistant.core-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.help-assistant.core :as help-assistant]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(def ^:private test-docs
  {"configuring-metabase/timezones.md"
   {:path    "configuring-metabase/timezones.md"
    :title   "Timezones"
    :content "# Timezones\n\nSet the report timezone to change how dates show."
    :lower   "# timezones\n\nset the report timezone to change how dates show."}

   "troubleshooting-guide/timezones.md"
   {:path    "troubleshooting-guide/timezones.md"
    :title   "Troubleshooting timezones"
    :content "# Troubleshooting timezones\n\nDates are off by a few hours. Check the report timezone and the timezone of the database."
    :lower   "# troubleshooting timezones\n\ndates are off by a few hours. check the report timezone and the timezone of the database."}

   "dashboards/start.md"
   {:path    "dashboards/start.md"
    :title   "Dashboards"
    :content "# Dashboards\n\nAdd questions to a dashboard."
    :lower   "# dashboards\n\nadd questions to a dashboard."}})

(defmacro ^:private with-test-docs [& body]
  `(with-redefs [help-assistant/docs (delay test-docs)]
     ~@body))

(deftest search-docs-test
  (with-test-docs
    (testing "pages that match more of the words rank first"
      (is (= ["troubleshooting-guide/timezones.md" "configuring-metabase/timezones.md"]
             (map :path (help-assistant/search-docs "timezone database")))))
    (testing "results have a matching line"
      (is (= "Set the report timezone to change how dates show."
             (:snippet (first (help-assistant/search-docs "dates show"))))))
    (testing "stop words and short words alone match nothing"
      (is (nil? (help-assistant/search-docs "how to do it in metabase"))))))

(deftest find-doc-test
  (with-test-docs
    (doseq [path ["dashboards/start.md" "dashboards/start" "docs/dashboards/start.md" "/dashboards/start.md"]]
      (testing path
        (is (= "Dashboards" (:title (#'help-assistant/find-doc path))))))
    (is (nil? (#'help-assistant/find-doc "dashboards/missing.md")))))

(defn- conversation
  "An alternating conversation of `n` messages that ends with a question."
  [n]
  (vec (for [i (range n)]
         {:role (if (even? i) "user" "assistant"), :content (str "message " i)})))

(deftest trim-history-test
  (testing "short conversations are kept as they are"
    (is (= (conversation 5) (#'help-assistant/trim-history (conversation 5)))))
  (testing "answers before the first question are dropped"
    (is (= (conversation 3)
           (#'help-assistant/trim-history (into [{:role "assistant", :content "hi"}] (conversation 3))))))
  (testing "long conversations keep the first question and the most recent messages"
    (let [trimmed (#'help-assistant/trim-history (conversation 41))]
      (is (= 19 (count trimmed)))
      (is (= "message 0" (:content (first trimmed))))
      (is (= "message 40" (:content (last trimmed))))
      (testing "and the turns still alternate"
        (is (= (map :role (conversation 19))
               (map :role trimmed)))))))

(defn- do-with-stubbed-llm
  "Run `thunk` with `call-llm` replaced by `(respond call-number system-prompt tools)`, which returns the parts for one
  step. Returns the result of `thunk` and the number of calls."
  [respond thunk]
  (let [calls (atom 0)]
    (mt/with-dynamic-fn-redefs [metabot.self/llm-call-unavailable-reason (constantly nil)
                                metabot.settings/llm-metabot-provider    (constantly "anthropic/claude-test")
                                metabot.self/call-llm                    (fn [_model system _history tools _opts]
                                                                           (respond (swap! calls inc) system tools))]
      {:result (thunk), :calls @calls})))

(defn- tool-call [n]
  [{:type :text, :id (str "t" n), :text "Let me check the docs."}
   {:type :tool-input, :id (str "c" n), :function "search_docs", :arguments {:query "timezone"}}
   {:type :tool-output, :id (str "c" n), :result {:output "- path: troubleshooting-guide/timezones.md"}}])

(def ^:private question [{:role "user", :content "Why are my dates off?"}])

(deftest chat-last-step-test
  (testing "when the model keeps calling tools, the last step asks for an answer instead of more tool calls"
    (let [{:keys [result calls]} (do-with-stubbed-llm
                                  (fn [n system _tools]
                                    (if (str/includes? system "This is your last step.")
                                      [{:type :text, :id "final", :text "Check the report timezone."}]
                                      (tool-call n)))
                                  #(help-assistant/chat {:messages question}))]
      (is (= 8 calls))
      (is (= "Check the report timezone." (:reply result)))))
  (doseq [[description last-step] {"a tool call at the last step" tool-call
                                   "a blank last step"            (constantly [{:type :text, :id "final", :text " "}])}]
    (testing (str description " gives a reply that says what to do next, not the preamble of a tool call")
      (let [{:keys [result]} (do-with-stubbed-llm (fn [n system _tools]
                                                    (if (str/includes? system "This is your last step.")
                                                      (last-step n)
                                                      (tool-call n)))
                                                  #(help-assistant/chat {:messages question}))]
        (is (str/starts-with? (:reply result) "I couldn't finish looking this up."))
        (is (= [] (:sources result)))))))

(deftest chat-sources-test
  (with-test-docs
    (let [read-docs (fn [tools]
                      (doseq [path ["configuring-metabase/timezones.md" "troubleshooting-guide/timezones.md"]]
                        ((get-in tools ["read_doc" :fn]) {:path path})))
          url       (help-assistant/doc-url "troubleshooting-guide/timezones.md")
          chat      (fn [reply]
                      (:result (do-with-stubbed-llm
                                (fn [_n _system tools]
                                  (read-docs tools)
                                  [{:type :text, :id "final", :text reply}])
                                #(help-assistant/chat {:messages question}))))]
      (testing "only the pages the answer links to are listed"
        (is (= [{:title "Troubleshooting timezones", :url url}]
               (:sources (chat (str "See [Troubleshooting timezones](" url ")."))))))
      (testing "when the answer links no page, every page read is listed"
        (is (= 2 (count (:sources (chat "Which database do you use?")))))))))

(deftest chat-unavailable-test
  (doseq [[reason status-code] {:no-llm 503, :metabot-disabled 503, :permission-denied 403}]
    (testing reason
      (mt/with-dynamic-fn-redefs [metabot.self/llm-call-unavailable-reason (constantly reason)]
        (is (= status-code
               (try
                 (help-assistant/chat {:messages question})
                 nil
                 (catch clojure.lang.ExceptionInfo e
                   (:status-code (ex-data e))))))))))
