(ns metabase.jev.apps.conversations-test
  (:require
   [clojure.test :refer :all]
   [metabase.jev.apps.conversations :as conversations]
   [metabase.jev.client :as jev]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- user-row [id text]
  {:id id :role "user" :data [{:type "text" :text text}] :finished true})

(defn- assistant-row [id parts & {:as extra}]
  (merge {:id id :role "assistant" :data parts :finished true} extra))

(deftest normalize-message-encodings-test
  (testing "v2 parts: text, tools, tool errors, produced artifacts"
    (is (= {:assistant [{:say "Here you go."}
                        {:tool "read_resource" :tool_error "**Error:** Invalid id `x` in URI."}
                        {:tool "create_sql_query" :tool_error "No code editor found"}
                        {:produced "navigate_to"}]}
           (conversations/normalize-message
            (assistant-row 1 [{:type "step-start"}
                              {:type "text" :text "Here you go."}
                              {:type "tool-read_resource" :state "output-available"
                               :output "<resources>\n**Error:** Invalid id `x` in URI.\n</resources>"}
                              {:type "tool-create_sql_query" :state "output-error" :errorText "No code editor found"}
                              {:type "data-navigate_to"}])))))
  (testing "v1 ai-service parts, as a JSON string"
    (is (= {:assistant [{:say "Done"} {:tool "construct_notebook_query"}
                        {:tool_error "An error occurred while executing the tool 'construct_notebook_query': boom"}]}
           (conversations/normalize-message
            (assistant-row 1 (json/encode
                              [{:role "assistant" :_type "TEXT" :content "Done"}
                               {:role "assistant" :_type "TOOL_CALL" :tool_calls [{:id "c" :name "construct_notebook_query"}]}
                               {:role "tool" :_type "TOOL_RESULT" :tool_call_id "c"
                                :content "An error occurred while executing the tool 'construct_notebook_query': boom"}]))))))
  (testing "v1 streaming parts and a row-level error"
    (is (= {:assistant [{:tool "edit_sql_query"} {:tool_error "Unsupported query format"} {:agent_error "Overloaded"}]}
           (conversations/normalize-message
            (assistant-row 1 [{:type "tool-input" :function "edit_sql_query"}
                              {:type "tool-output" :error {:message "Unsupported query format"}}]
                           :error "Overloaded")))))
  (testing "UI-generated prompts are marked, including when they carry context"
    (is (= {:user "Fix this SQL query" :ui_button true}
           (conversations/normalize-message (user-row 1 "Fix this SQL query"))))
    (is (=? {:ui_button true}
            (conversations/normalize-message (user-row 1 "Fix this SQL query\n\nThe database returned this error: boom"))))))

(deftest transcript-drops-deleted-and-stopped-requests-test
  (let [rows [(user-row 1 "q1")
              (assistant-row 2 [{:type "text" :text "old attempt."}] :deleted_at "2026-01-01")
              (assistant-row 3 [{:type "text" :text "a1."}])
              (user-row 4 "q2")
              (assistant-row 5 [{:type "text" :text "partial"}] :finished false)]]
    (is (= [{:user "q1"} {:assistant [{:say "a1."}]}]
           (conversations/transcript rows)))
    (is (=? {:dropped_requests 0 :regenerations 1 :aborted_requests 1 :truncated false}
            (conversations/flags rows (conversations/transcript rows))))))

(deftest flags-test
  (testing "an unanswered resend and a reply that stops mid-sentence"
    (let [rows [(user-row 1 "top pages")
                (user-row 2 "top pages")
                (assistant-row 3 [{:type "text" :text "Good! The Page"}])]]
      (is (=? {:dropped_requests 1 :truncated true :user_turns 2 :assistant_turns 1}
              (conversations/flags rows (conversations/transcript rows))))))
  (testing "a request that never got a reply"
    (let [rows [(user-row 1 "hello")]]
      (is (=? {:dropped_requests 1 :last_turn_by "user"}
              (conversations/flags rows (conversations/transcript rows)))))))

(deftest turn-states-test
  (let [t [{:user "retention cohorts"}
           {:assistant [{:say "Here."}]}
           {:user "Fix this SQL query" :ui_button true}
           {:assistant [{:say "Fixed."}]}
           {:user "still 100% everywhere"}
           {:user "hello?"}
           {:assistant [{:say "Sorry."}]}]]
    (testing "skips the opener, UI-generated prompts, and resends after an unanswered message"
      (is (= [4] (map :index (conversations/turn-states t)))))))

(deftest turn-features-test
  (is (=? {:corrections 2 :confident_corrections 1 :error_reports 1 :max_tone 2.5 :last_reaction "error_report"
           :first_correction_at 2}
          (conversations/turn-features
           [{:index 2 :reaction {:choice "correction" :confidence 0.95} :tone {:score 0.5}}
            {:index 4 :reaction {:choice "correction" :confidence 0.7} :tone {:score 1.0}}
            {:index 6 :reaction {:choice "refinement" :confidence 0.9} :tone {:score 0.2}}
            {:index 8 :reaction {:choice "error_report" :confidence 0.9} :tone {:score 2.5}}]))))

(def ^:private clean-flags
  {:dropped_requests 0 :agent_errors 0 :tool_errors 0 :artifacts_shown 1 :truncated false})

(def ^:private fulfilled
  {:outcome {:choice "fulfilled" :confidence 0.95} :ending {:choice "neutral_stop" :confidence 0.9}
   :frustration {:score 0.1 :confidence 0.9} :refusal 0.05 :wrong_action 0.05 :silent_scope_reduction 0.05
   :request_ambiguous 0.1 :honest_about_limits 0.5})

(deftest classify-test
  (testing "a clean conversation"
    (is (= {:label "ok" :issues [] :review false}
           (conversations/classify clean-flags {} fulfilled))))
  (testing "system failures are hard failures without Jev"
    (is (=? {:label "failed" :issues ["system-failure"]}
            (conversations/classify (assoc clean-flags :dropped_requests 1) {} nil))))
  (testing "corrections and a tense tone make friction"
    (is (=? {:label "friction" :issues ["did-not-follow-request" "high-frustration"]}
            (conversations/classify clean-flags {:confident_corrections 1 :corrections 1 :max_tone 2.2} fulfilled))))
  (testing "a tool failure papered over by pasting SQL"
    (is (=? {:label "friction" :issues ["degraded-delivery"]}
            (conversations/classify (assoc clean-flags :tool_errors 2) {}
                                    (assoc fulfilled :silent_scope_reduction 0.9)))))
  (testing "moderate conversation-level frustration alone is not flagged"
    (is (=? {:label "ok" :issues []}
            (conversations/classify clean-flags {:max_tone 1.1}
                                    (assoc fulfilled :frustration {:score 1.6 :confidence 0.6})))))
  (testing "an unanswered follow-up question from the assistant is not a problem"
    (is (=? {:label "ok" :issues []}
            (conversations/classify clean-flags {}
                                    (assoc fulfilled
                                           :outcome {:choice "unclear" :confidence 0.9}
                                           :ending {:choice "mid_task" :confidence 0.99})))))
  (testing "an honest answer to an impossible request is not a problem"
    (is (=? {:label "ok" :issues ["impossible-request"]}
            (conversations/classify clean-flags {}
                                    (assoc fulfilled
                                           :outcome {:choice "not_possible" :confidence 0.99}
                                           :honest_about_limits 0.95)))))
  (testing "an uncertain unfulfilled outcome is flagged for review"
    (is (=? {:label "ok" :review true}
            (conversations/classify clean-flags {}
                                    (assoc fulfilled :outcome {:choice "unfulfilled" :confidence 0.55}))))))

(defn- fake-ask
  "Answers every question like Jev would for a smooth conversation."
  [_state questions]
  {:ok      true
   :answers (update-vals questions
                         (fn [{:keys [type criteria]}]
                           (case type
                             "choice" {:type "choice" :choice (name (first (keys criteria))) :confidence 0.9}
                             "score"  {:type "score" :score 0.1 :confidence 0.9}
                             "noul"   {:type "noul" :noul 0.05})))})

(deftest score!-test
  (mt/with-temp [:model/User                {user-id :id} {}
                 :model/MetabotConversation {conv-id :id} {:id (str (random-uuid)) :user_id user-id}]
    (let [insert! (fn [role data]
                    (t2/insert-returning-pk! :model/MetabotMessage
                                             {:conversation_id conv-id :role role :profile_id "internal"
                                              :data data :data_version 2 :total_tokens 0 :finished true
                                              :external_id (str (random-uuid))}))]
      (insert! "user" [{:type "text" :text "orders over time"}])
      (insert! "assistant" [{:type "text" :text "Here is the chart."}])
      (mt/with-dynamic-fn-redefs [jev/ask fake-ask]
        (testing "scores a conversation with no review"
          (is (= [conv-id] (filter #{conv-id} (conversations/pending-conversation-ids nil 1000))))
          (is (=? {:status :scored :label "ok"} (conversations/score! conv-id)))
          (is (=? {:label "ok" :issues [] :version conversations/question-set-version}
                  (t2/select-one :model/MetabotConversationReview :conversation_id conv-id)))
          (is (empty? (filter #{conv-id} (conversations/pending-conversation-ids nil 1000)))))
        (testing "a new message makes the review stale"
          (insert! "user" [{:type "text" :text "and by week?"}])
          (insert! "assistant" [{:type "text" :text "Here it is by week."}])
          (is (= [conv-id] (filter #{conv-id} (conversations/pending-conversation-ids nil 1000)))))
        (testing "marking all stale keeps the label but queues a re-score"
          (conversations/score! conv-id)
          (conversations/mark-all-stale!)
          (is (=? {:label "ok" :version "stale"}
                  (t2/select-one :model/MetabotConversationReview :conversation_id conv-id)))
          (is (= [conv-id] (filter #{conv-id} (conversations/pending-conversation-ids nil 1000)))))
        (testing "a failed Jev call leaves the conversation pending"
          (mt/with-dynamic-fn-redefs [jev/ask (constantly {:ok false :error "Jev returned HTTP 500"})]
            (is (=? {:status :failed :error "Jev returned HTTP 500"} (conversations/score! conv-id)))))))))
