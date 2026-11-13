(ns metabase.help-assistant.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.help-assistant.core :as help-assistant]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private test-docs
  {"troubleshooting-guide/timezones.md"
   {:path    "troubleshooting-guide/timezones.md"
    :title   "Troubleshooting timezones"
    :content "# Troubleshooting timezones\n\nCheck the report timezone."
    :lower   "# troubleshooting timezones\n\ncheck the report timezone."}})

(def ^:private test-skills
  [{:id "troubleshoot-timezones", :title "Timezones", :description "Dates are off.", :body "Ask which timezone."}])

(def ^:private request
  {:messages [{:role "user", :content "Why are my dates off?"}]})

(defmacro ^:private with-stubbed-llm
  "Run `body` with the model replaced by `respond`, a fn of the tools that returns the parts for one step."
  [respond & body]
  `(with-redefs [help-assistant/docs (delay test-docs)]
     (mt/with-dynamic-fn-redefs [help-assistant/load-skills               (constantly test-skills)
                                 metabot.self/llm-call-unavailable-reason (constantly nil)
                                 metabot.settings/llm-metabot-provider    (constantly "anthropic/claude-test")
                                 metabot.self/call-llm                    (fn [_model# _system# _history# tools# _opts#]
                                                                            (~respond tools#))]
       ~@body)))

(defn- answer-using-tools
  "A model that loads a skill, searches and reads a page, then answers."
  [tools]
  (doseq [[tool args] [["load_skill" {:id "troubleshoot-timezones"}]
                       ["search_docs" {:query "timezone"}]
                       ["read_doc" {:path "troubleshooting-guide/timezones.md"}]]]
    ((get-in tools [tool :fn]) args))
  [{:type :text, :id "final", :text "Check the report timezone."}])

(defn- stream-events
  "The `data:` lines of a streamed response, with JSON events decoded and the `[DONE]` line kept as a string."
  [response]
  (->> (str/split-lines response)
       (filter #(str/starts-with? % "data: "))
       (mapv (fn [line]
               (let [data (subs line 6)]
                 (if (= "[DONE]" data) data (json/decode+kw data)))))))

(deftest chat-stream-test
  (with-stubbed-llm answer-using-tools
    (let [url    (help-assistant/doc-url "troubleshooting-guide/timezones.md")
          steps  [{:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones"}
                  {:type "search", :label "timezone"}
                  {:type "read", :label "Troubleshooting timezones", :url url}]
          events (stream-events (mt/user-http-request :crowberto :post 202 "help-assistant/chat/stream" request))]
      (testing "each step is streamed as it happens, then the answer, then [DONE]"
        (is (= (concat (for [step steps] {:type "step", :step step})
                       [{:type    "answer"
                         :reply   "Check the report timezone."
                         :sources [{:title "Troubleshooting timezones", :url url}]
                         :steps   steps}
                        "[DONE]"])
               events)))
      (testing "the answer is the same as the non-streaming endpoint's"
        (is (= (dissoc (nth events 3) :type)
               (mt/user-http-request :crowberto :post 200 "help-assistant/chat" request)))))))

(deftest chat-stream-earlier-skills-test
  (testing "skills loaded earlier in the conversation are streamed first"
    (with-stubbed-llm (constantly [{:type :text, :id "final", :text "Which timezone?"}])
      (is (= {:type "step"
              :step {:type "skill", :label "Timezones", :skill_id "troubleshoot-timezones", :earlier true}}
             (first (stream-events (mt/user-http-request :crowberto :post 202 "help-assistant/chat/stream"
                                                         (assoc request :loaded_skills ["troubleshoot-timezones"])))))))))

(deftest chat-stream-error-test
  (testing "errors are streamed as an error event with the same message and status code as POST /chat"
    (doseq [[description reason respond]
            [["AI connection unavailable" :no-llm nil]
             ["AI provider error"         nil     (constantly [{:type :error, :error {:message "Overloaded"}}])]]]
      (testing description
        (with-stubbed-llm (or respond answer-using-tools)
          (mt/with-dynamic-fn-redefs [metabot.self/llm-call-unavailable-reason (constantly reason)]
            (let [non-streaming (mt/user-http-request :crowberto :post "help-assistant/chat" request)
                  status-code   (if reason 503 502)]
              (is (= [{:type "error", :message non-streaming, :status_code status-code}
                      "[DONE]"]
                     (stream-events (mt/user-http-request :crowberto :post 202 "help-assistant/chat/stream"
                                                          request)))))))))))

(deftest chat-stream-admins-only-test
  (testing "only admins can use the assistant, and nothing is streamed to anyone else"
    (with-stubbed-llm answer-using-tools
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "help-assistant/chat/stream" request))))))
