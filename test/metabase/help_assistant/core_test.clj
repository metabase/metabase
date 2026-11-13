(ns metabase.help-assistant.core-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.help-assistant.core :as help-assistant]
   [metabase.help-assistant.instance :as instance]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

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
      (is (= "Check the report timezone." (:reply result)))
      (testing "and the steps say it ran out of steps"
        (is (= {:type "limit", :label "8"} (last (:steps result)))))))
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

(def ^:private test-skills
  [{:id "troubleshoot-timezones", :title "Timezones", :description "Dates are off.", :body "Ask which timezone."}
   {:id "howto-dashboards", :title "Dashboards", :description "Building dashboards.", :body "Add a question."}])

(deftest instructions-test
  (testing "the instructions come from resources/help_assistant/instructions.md, without the notes for people at the top"
    (let [text (#'help-assistant/instructions)]
      (is (str/starts-with? text "You are the Metabase Help assistant."))
      (is (not (str/includes? text "<!--")))
      (is (str/starts-with? (#'help-assistant/system-prompt {:skills []}) text))
      (testing "they name the checkbox for checking this instance exactly as the Help page labels it"
        (is (str/includes? text "\"Let the assistant check logs and settings\""))))))

(deftest system-prompt-test
  (let [prompt #(#'help-assistant/system-prompt {:skills test-skills, :loaded-skills %})]
    (testing "every skill is listed, without its instructions"
      (is (str/includes? (prompt []) "- troubleshoot-timezones: Timezones. When to use: Dates are off."))
      (is (str/includes? (prompt []) "- howto-dashboards: Dashboards. When to use: Building dashboards."))
      (is (not (str/includes? (prompt []) "Ask which timezone."))))
    (testing "skills loaded earlier in the conversation are included in full"
      (is (str/includes? (prompt [(first test-skills)]) "Ask which timezone."))
      (is (not (str/includes? (prompt [(first test-skills)]) "Add a question."))))))

(deftest chat-steps-test
  (with-test-docs
    (mt/with-dynamic-fn-redefs [help-assistant/load-skills (constantly test-skills)]
      (let [url     (help-assistant/doc-url "troubleshooting-guide/timezones.md")
            outputs (atom [])
            chat    (fn [request]
                      (:result (do-with-stubbed-llm
                                (fn [_n _system tools]
                                  (doseq [[tool args] [["load_skill" {:id "troubleshoot-timezones"}]
                                                       ["load_skill" {:id "no-such-skill"}]
                                                       ["search_docs" {:query "timezone"}]
                                                       ["read_doc" {:path "troubleshooting-guide/timezones.md"}]]]
                                    (swap! outputs conj (:output ((get-in tools [tool :fn]) args))))
                                  [{:type :text, :id "final", :text (str "See [Troubleshooting timezones](" url ").")}])
                                #(help-assistant/chat (merge {:messages question} request)))))]
        (testing "each answer says which skills it loaded, what it searched for and which pages it read"
          (is (= [{:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones"}
                  {:type "search", :label "timezone"}
                  {:type "read", :label "Troubleshooting timezones", :url url}]
                 (:steps (chat {})))))
        (testing "load_skill returns the skill's instructions, or says the id is wrong"
          (is (str/includes? (first @outputs) "Ask which timezone."))
          (is (str/includes? (first @outputs) "How to use this skill when troubleshooting"))
          (is (str/starts-with? (second @outputs) "No skill with id \"no-such-skill\"")))
        (testing "a skill loaded earlier is marked as earlier, and loading it again isn't a new step"
          (let [steps (:steps (chat {:loaded-skills ["troubleshoot-timezones" "no-such-skill"]}))]
            (is (= {:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones", :earlier true}
                   (first steps)))
            (is (= 3 (count steps)))))))))

(def ^:private instance-tool-names #{"check_recent_logs" "check_databases" "check_email_and_sign_in"})

(deftest chat-instance-access-test
  (let [chat (fn [request respond]
               (:result (do-with-stubbed-llm respond #(help-assistant/chat (merge {:messages question} request)))))
        seen (atom nil)
        look (fn [_n system tools]
               (reset! seen {:system system, :tools (set (keys tools))})
               [{:type :text, :id "final", :text "Done."}])]
    (testing "when the admin hasn't allowed it, the tools that check the instance aren't offered"
      (doseq [request [{} {:instance-access? false}]]
        (chat request look)
        (is (empty? (filter instance-tool-names (:tools @seen))))
        (is (str/includes? (:system @seen) "Checking this instance: off."))))
    (testing "when they have, they are"
      (chat {:instance-access? true} look)
      (is (= instance-tool-names (into #{} (filter instance-tool-names) (:tools @seen))))
      (is (str/includes? (:system @seen) "Checking this instance: on.")))
    (testing "each check is a step, without what it returned"
      (mt/with-dynamic-fn-redefs [instance/recent-logs (constantly "ERROR password=[redacted]")]
        (is (= [{:type "check", :check "logs", :label "ssl"}
                {:type "check", :check "email_sso", :label ""}]
               (:steps (chat {:instance-access? true}
                             (fn [_n _system tools]
                               ((get-in tools ["check_recent_logs" :fn]) {:keyword " ssl "})
                               ((get-in tools ["check_email_and_sign_in" :fn]) {})
                               [{:type :text, :id "final", :text "Done."}])))))))))

(deftest chat-on-step-test
  (with-test-docs
    (mt/with-dynamic-fn-redefs [help-assistant/load-skills (constantly test-skills)]
      (let [streamed (atom [])
            {:keys [result]} (do-with-stubbed-llm
                              (fn [n _system tools]
                                (if (= 1 n)
                                  (do ((get-in tools ["search_docs" :fn]) {:query "timezone"})
                                      ;; the same search again isn't a new step
                                      ((get-in tools ["search_docs" :fn]) {:query "timezone"})
                                      (tool-call n))
                                  [{:type :text, :id "final", :text "Check the report timezone."}]))
                              #(help-assistant/chat {:messages      question
                                                     :loaded-skills ["troubleshoot-timezones"]
                                                     :on-step       (fn [step] (swap! streamed conj step))}))]
        (testing "on-step gets each new step as it happens, starting with skills loaded earlier"
          (is (= [{:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones", :earlier true}
                  {:type "search", :label "timezone"}]
                 @streamed)))
        (testing "and they are the same steps the answer has"
          (is (= @streamed (:steps result))))))))

(deftest chat-canceled-test
  (testing "once canceled? is true, the model isn't called again and chat returns nil"
    (let [canceled? (atom false)
          {:keys [result calls]} (do-with-stubbed-llm
                                  (fn [n _system _tools]
                                    (reset! canceled? true)
                                    (tool-call n))
                                  #(help-assistant/chat {:messages  question
                                                         :canceled? (fn [] @canceled?)}))]
      (is (nil? result))
      (is (= 1 calls))))
  (testing "the call in progress is cut off: the model's response isn't read past the cancel"
    (let [canceled? (atom false)
          read      (atom 0)
          ;; three parts, and the admin clicks Stop while the second one arrives
          parts     (eduction (map-indexed (fn [i part]
                                             (swap! read inc)
                                             (when (= i 1) (reset! canceled? true))
                                             part))
                              (tool-call 1))
          {:keys [result]} (do-with-stubbed-llm (constantly parts)
                                                #(help-assistant/chat {:messages  question
                                                                       :canceled? (fn [] @canceled?)}))]
      (is (nil? result))
      (is (= 2 @read))))
  (testing "canceled before it starts: the model is never called"
    (let [{:keys [result calls]} (do-with-stubbed-llm (fn [n _ _] (tool-call n))
                                                      #(help-assistant/chat {:messages  question
                                                                             :canceled? (constantly true)}))]
      (is (nil? result))
      (is (zero? calls)))))

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

(defn- feedback-log-messages!
  "The INFO and DEBUG messages that [[help-assistant/log-feedback!]] writes for `feedback`."
  [feedback]
  (mt/with-log-messages-for-level [messages [metabase.help-assistant.core :debug]]
    (help-assistant/log-feedback! feedback)
    (update-vals (group-by :level (messages)) #(mapv :message %))))

(deftest log-feedback-test
  (testing "the rating and the sources are logged at INFO, and what people typed only at DEBUG"
    (is (= {:info  ["Help assistant feedback: not helpful. Sources: https://example.com/timezones"]
            :debug ["Help assistant feedback content:\nQuestion: Why are my dates off?\nComment: The steps are wrong\nAnswer: Check the report timezone."]}
           (feedback-log-messages! {:positive false
                                    :comment  "The steps are wrong"
                                    :question "Why are my dates off?"
                                    :answer   "Check the report timezone."
                                    :sources  [{:title "Timezones", :url "https://example.com/timezones"}]}))))
  (testing "no sources and a blank comment"
    (is (= {:info  ["Help assistant feedback: helpful. Sources: (none)"]
            :debug ["Help assistant feedback content:\nQuestion: Why are my dates off?\nComment: (none)\nAnswer: Check the report timezone."]}
           (feedback-log-messages! {:positive true
                                    :comment  " "
                                    :question "Why are my dates off?"
                                    :answer   "Check the report timezone."})))))

(deftest save-flag-test
  (testing "flagging is off when no folder is set"
    (mt/with-dynamic-fn-redefs [help-assistant/flags-dir (constantly nil)]
      (is (= 404 (try
                   (help-assistant/save-flag! {:note "x", :messages question})
                   nil
                   (catch clojure.lang.ExceptionInfo e
                     (:status-code (ex-data e))))))))
  (testing "a flagged chat is saved as a YAML file named after the question, with the text as it is"
    (let [dir (str (java.nio.file.Files/createTempDirectory "help-flags" (make-array java.nio.file.attribute.FileAttribute 0)))]
      (mt/with-dynamic-fn-redefs [help-assistant/flags-dir (constantly dir)]
        (let [file (help-assistant/save-flag!
                    {:note     "Should ask about the recipients first"
                     :messages [{:role "user", :content "Why are my dates off?"}
                                {:role    "assistant"
                                 :content "Check: the \"report timezone\".\r\n\r\n- one\n- two"
                                 :steps   [{:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones"}]}]})
              text (slurp (io/file dir file))]
          (is (re-matches #"\d{4}-\d\d-\d\d_\d{6}_why-are-my-dates-off\.yaml" file))
          (is (str/includes? text "note: |-\n  Should ask about the recipients first\n"))
          (is (str/includes? text "  - user: |-\n      Why are my dates off?\n"))
          (is (str/includes? text "  - assistant: |-\n      Check: the \"report timezone\".\n\n      - one\n      - two\n"))
          (is (str/includes? text "    steps: [{\"type\":\"skill\",\"label\":\"Timezones\"")))))))
