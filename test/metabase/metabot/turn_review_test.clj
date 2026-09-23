(ns metabase.metabot.turn-review-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.turn-review :as turn-review]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- tool-call
  [id function arguments output]
  [{:type :tool-input :id id :function function :arguments arguments}
   (merge {:type :tool-output :id id :function function :error nil} output)])

(def ^:private search-hits
  {:result {:output "Total results: 3" :structured-output {:result-type :search :total_count 3}}})

(def ^:private stop
  {:type :finish :finish-reason :stop})

(def ^:private silent-search-failure
  (conj (tool-call "1" "search" {:keyword_queries ["orders"]}
                   {:result {:output "Search failed: Search index unavailable"} :duration-ms 30000})
        stop))

(deftest turn-signals-test
  (doseq [[description parts opts expected]
          [["clean turn"
            (conj (tool-call "1" "search" {:keyword_queries ["orders"]} search-hits) stop)
            {}
            []]
           ["tool that threw"
            (conj (tool-call "1" "search" {:keyword_queries ["orders"]}
                             {:error {:message      "Search index unavailable"
                                      :error-class  "metabase.metabot.tools.search/index-unavailable"
                                      :agent-error? false}})
                  stop)
            {}
            [{:signal "tool_error" :tool "search" :error-class "metabase.metabot.tools.search/index-unavailable"}]]
           ["bad arguments"
            (conj (tool-call "1" "search" {:limit "lots"}
                             {:error {:message      "Invalid tool arguments: `limit` should be an integer."
                                      :error-class  "ExceptionInfo"
                                      :agent-error? true}})
                  stop)
            {}
            [{:signal "bad_arguments" :tool "search" :error-class "ExceptionInfo"}]]
           ["failure reported as normal output"
            (conj (tool-call "1" "search" {:keyword_queries ["orders"]}
                             {:result {:output "Search failed: Search index unavailable"}})
                  stop)
            {}
            [{:signal "silent_failure" :tool "search"}]]
           ["validation error inside normal output"
            (conj (tool-call "1" "read_resource" {:uris ["metabase://table/2/fields"]}
                             {:result {:resources [{:uri   "metabase://table/2/fields"
                                                    :error "Invalid input: [nil {:table-reference [\"Valid column metadata\"]}]"}]
                                       :output    (str "<resources>\n<resource uri=\"metabase://table/2/fields\">\n"
                                                       "**Error:** Invalid input: [nil {:table-reference [\"Valid column metadata\"]}]\n"
                                                       "</resource>\n</resources>")}})
                  stop)
            {}
            [{:signal "silent_failure" :tool "read_resource"}]]
           ["lookup failure reported as normal output"
            (conj (tool-call "1" "construct_notebook_query"
                             {:query {:stages [{:source-table ["Sample Database" "PUBLIC" "ORDERS"]}]}}
                             {:result {:output (str "No table found matching portable FK [\"Sample Database\" \"PUBLIC\" "
                                                    "\"ORDERS\"]. Call `read_resource` to list available tables.")}})
                  stop)
            {}
            [{:signal "silent_failure" :tool "construct_notebook_query"}]]
           ["empty search"
            (conj (tool-call "1" "search" {:keyword_queries ["orders"]}
                             {:result {:output            "Total results: 0"
                                       :structured-output {:result-type :search :total_count 0}}})
                  stop)
            {}
            [{:signal "empty_result" :tool "search"}]]
           ["same call repeated"
            (concat (tool-call "1" "search" {:keyword_queries ["orders"]} search-hits)
                    (tool-call "2" "search" {:keyword_queries ["orders"]} search-hits)
                    [stop])
            {}
            [{:signal "repeated_call" :tool "search"}]]
           ["answer cut off at the output limit"
            [{:type :text :text "The answer is"} {:type :finish :finish-reason :length}]
            {}
            [{:signal "output_truncated"}]]
           ["turn that errored"
            [{:type :error :error {:message "Provider unavailable"}}]
            {:error {:message "Provider unavailable"}}
            [{:signal "turn_error"}]]
           ["turn the client aborted"
            [{:type :text :text "Let me"}]
            {:finished? false}
            [{:signal "aborted"}]]]]
    (testing description
      (is (= expected (turn-review/turn-signals parts opts))))))

(deftest papercut-report-test
  (let [turn    {:message-id      110
                 :conversation-id "e51dd991"
                 :profile-id      "internal"
                 :reporter        "andreis.metabot"
                 :machine         "mbp21"
                 :ui-url          "http://localhost:3000"}
        report  (fn [parts opts verdict]
                  (turn-review/papercut-report (assoc turn :parts parts :signals (turn-review/turn-signals parts opts))
                                               verdict))]
    (testing "a model verdict on a tool"
      (let [verdict {:papercut    true
                     :category    "silent_tool_failure"
                     :tool        "search"
                     :title       "Search hides index failures from Metabot"
                     :severity    "high"
                     :summary     "Search failed and the agent gave up."
                     :confidence  0.9
                     :reviewed_by "model"}]
        (is (= {:repository   "metabase"
                :reporter     "andreis.metabot"
                :machine      "mbp21"
                :agent        "metabot"
                :session      "e51dd991"
                :report_id    "metabot:e51dd991:110"
                :fingerprint  "metabot:search:silent_failure"
                :category     "agent-trap"
                :owner        "repo-code"
                :severity     "high"
                :title        "Search hides index failures from Metabot"
                :description  (str "Search failed and the agent gave up.\n\n"
                                   "Signals: silent_failure\n\n"
                                   "## Links\n\n"
                                   "- Conversation: http://localhost:3000/monitor/ai-auditing/conversations/e51dd991\n"
                                   "- Conversation id: e51dd991\n"
                                   "- Message id: 110")
                :path         "src/metabase/metabot/tools/search.clj"
                :area         "metabot/search"
                :cost_minutes 0.5
                :details      {:signals     ["silent_failure"]
                               :error_class nil
                               :profile     "internal"
                               :verdict     verdict}}
               (report silent-search-failure {} verdict)))))
    (testing "a heuristics verdict on the whole turn"
      (let [parts   [{:type :error :error {:message "Provider unavailable"}}]
            opts    {:error {:message "Provider unavailable"}}
            verdict (#'turn-review/heuristic-verdict (turn-review/turn-signals parts opts))]
        (is (=? {:fingerprint "metabot:turn:turn_error"
                 :category    "tooling"
                 :title       "Metabot turn ends in an error"
                 :path        "src/metabase/metabot/agent/core.clj"
                 :area        "metabot/agent"}
                (report parts opts verdict)))))
    (testing "the path is the source of the tool the profile uses"
      (let [parts   (conj (tool-call "1" "construct_notebook_query" {} {:result {:output "No table found"}}) stop)
            signals (turn-review/turn-signals parts {})
            path    (fn [profile-id]
                      (:path (turn-review/papercut-report
                              (assoc turn :profile-id profile-id :parts parts :signals signals)
                              (#'turn-review/heuristic-verdict signals))))]
        (is (= "src/metabase/metabot/tools/construct.clj" (path "internal")))
        (is (= "src/metabase/metabot/tools/slackbot_query.clj" (path "slackbot")))))))

(deftest instance-name-test
  (testing "an unnamed instance goes by its site URL's host, then its site name"
    (mt/with-temporary-setting-values [metabot-papercuts-instance-name nil
                                       site-url                        "https://metabase.example.com"]
      (is (= "metabase.example.com" (#'turn-review/instance-name))))
    (mt/with-temporary-setting-values [metabot-papercuts-instance-name nil
                                       site-url                        nil
                                       site-name                       "Acme Analytics"]
      (is (= "Acme Analytics" (#'turn-review/instance-name))))))

(deftest review-turn-posts-papercuts-test
  (mt/with-temporary-setting-values [metabot-turn-review-enabled  true
                                     metabot-papercuts-server-url "http://papercuts.test"
                                     metabot-papercuts-token      "secret"
                                     metabot-papercuts-reporter   "tester"
                                     metabot-papercuts-instance-name "test-instance"
                                     metabot-papercuts-ui-url     "http://metabase.test"]
    (t2/with-transaction [_conn nil {:rollback-only true}]
      (mt/with-current-user (mt/user->id :rasta)
        (let [conversation-id            (str (random-uuid))
              {:keys [assistant-msg-id]} (metabot.persistence/start-turn!
                                          conversation-id "internal" {:role "user" :content "How many orders?"})
              model-calls                (atom 0)
              model-error                (atom (ex-info "Model unavailable" {}))
              posts                      (atom [])
              failures                   (atom {})
              review!                    (fn [parts]
                                           (reset! posts [])
                                           (turn-review/review-turn! assistant-msg-id parts {:profile-id "internal"})
                                           (mapv (fn [[url request]]
                                                   (assoc (json/decode+kw (:body request))
                                                          :url           url
                                                          :authorization (get-in request [:headers "Authorization"])))
                                                 @posts))]
          (binding [turn-review/*run-synchronously?*  true
                    turn-review/*post-retry-delay-ms* 0]
            (mt/with-dynamic-fn-redefs [metabot.self/call-llm-structured (fn [& _]
                                                                           (swap! model-calls inc)
                                                                           (throw @model-error))
                                        http/post                        (fn [url request]
                                                                           (swap! posts conj [url request])
                                                                           (when-let [e (first (@failures url))]
                                                                             (swap! failures update url rest)
                                                                             (throw e))
                                                                           {:status 201})]
              (testing "a clean turn posts nothing and never calls the model"
                (is (= [] (review! [{:type :text :text "There are 18,760 orders."} stop])))
                (is (zero? @model-calls)))
              (testing "a flagged turn falls back to heuristics when the model call fails"
                (is (=? [{:url           "http://papercuts.test/api/reports"
                          :authorization "Bearer secret"
                          :reporter      "tester"
                          :machine       "test-instance"
                          :report_id     (str "metabot:" conversation-id ":" assistant-msg-id)
                          :fingerprint   "metabot:search:silent_failure"
                          :title         "Metabot search reports a failure as success"
                          :description   #(str/includes? % (str "- Conversation: http://metabase.test/monitor/"
                                                                "ai-auditing/conversations/" conversation-id))
                          :details       {:verdict {:reviewed_by "heuristics"}}}]
                        (review! silent-search-failure)))
                (is (= 1 @model-calls)))
              (testing "a verdict the model writes as JSON text instead of calling the tool still counts"
                (reset! model-error (ex-info "LLM returned no tool call in structured response"
                                             {:parts [{:type :text
                                                       :text (str "```json\n{\"papercut\": true, \"category\": "
                                                                  "\"silent_tool_failure\", \"tool\": \"search\", "
                                                                  "\"title\": \"Search failures look like results\", "
                                                                  "\"severity\": \"high\", \"summary\": \"Search "
                                                                  "failed.\", \"confidence\": 0.9}\n```")}]}))
                (is (=? [{:title    "Search failures look like results"
                          :severity "high"
                          :details  {:verdict {:confidence 0.9 :reviewed_by "model"}}}]
                        (review! silent-search-failure))))
              (testing "each server in the list gets the papercut, and a rejected post is logged, not thrown"
                (reset! failures {"http://down.test/api/reports"
                                  [(ex-info "clj-http: status 401" {:status 401 :body "Unauthorized"})]})
                (mt/with-temporary-setting-values [metabot-papercuts-server-url
                                                   "http://down.test, http://papercuts.test"]
                  (log.capture/with-log-messages-for-level [logs [metabase.metabot.turn-review :warn]]
                    (is (= ["http://down.test/api/reports" "http://papercuts.test/api/reports"]
                           (map :url (review! silent-search-failure))))
                    (is (some #(re-find #"Posting Metabot papercut .* to http://down.test failed: Unauthorized"
                                        (:message %))
                              (logs))))))
              (testing "a connection error or a 5xx is retried once"
                (doseq [e [(java.net.ConnectException. "Connection refused")
                           (ex-info "clj-http: status 503" {:status 503})]]
                  (reset! failures {"http://papercuts.test/api/reports" [e e e]})
                  (is (= 2 (count (review! silent-search-failure)))))))))))))
