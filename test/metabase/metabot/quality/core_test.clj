(ns metabase.metabot.quality.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.metabot.quality.extract :as quality.extract]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- finalize-once!
  "Helper: run start-turn! + finalize-assistant-turn! with a one-text-part
  body and no `:context` kwarg, so the resulting conversation carries no
  prompt-context block and no entity-usage anywhere. With Phase 6 wired
  up, scoring this routes through the `pre-foundation` sentinel."
  []
  (let [conversation-id (str (random-uuid))]
    (mt/with-current-user (mt/user->id :rasta)
      (let [{:keys [assistant-msg-id]}
            (metabot.persistence/start-turn!
             conversation-id "metabot-1"
             {:role "user" :content "go"})]
        (metabot.persistence/finalize-assistant-turn!
         conversation-id assistant-msg-id
         [{:type :text :text "x"}])
        {:conversation-id  conversation-id
         :assistant-msg-id assistant-msg-id}))))

(defn- seed-scoreable-conversation!
  "Insert a minimal but real conversation that carries enough BOT-1569
  Layer-0 atoms (a prompt-context block on the user row + a tool-event
  with `:entity-usage`) for the full pipeline to run. Returns the
  conversation id."
  []
  (let [conversation-id (str (random-uuid))
        user-id         (mt/user->id :rasta)]
    (t2/insert! :model/MetabotConversation
                {:id      conversation-id
                 :user_id user-id})
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :user_id         user-id
                 :role            :user
                 :profile_id      "internal"
                 :external_id     (str (random-uuid))
                 :total_tokens    0
                 :ai_proxied      false
                 :data            [{:role "user" :content "build a query against the orders table"}
                                   {:type                 "prompt-context"
                                    :user_is_viewing      [{:type "table" :id 999001}]
                                    :user_recently_viewed []
                                    :mentioned_refs       []}]})
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :role            :assistant
                 :profile_id      "internal"
                 :external_id     (str (random-uuid))
                 :total_tokens    0
                 :ai_proxied      false
                 :finished        true
                 :data            [{:type "tool-input" :id "c1"
                                    :function "construct_notebook_query" :arguments {}}
                                   {:type   "tool-output" :id "c1"
                                    :function "construct_notebook_query"
                                    :result {:structured-output
                                             {:entity-usage {:input  [{:type "table" :id 999001}]
                                                             :output []}}}}
                                   {:type      "data"
                                    :data-type "terminal_state"
                                    :version   1
                                    :data      {:reason "final_response"}}]})
    conversation-id))

;;; ---------------------------------------------------------------------------
;;; Sentinel paths
;;; ---------------------------------------------------------------------------

(deftest score-conversation-pre-foundation-writes-sentinel-test
  (testing "a conversation with no entity-usage and no prompt-context routes to
            the pre-foundation sentinel — quality_score stays NULL"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            conversation              (t2/select-one :model/MetabotConversation
                                                     :id conversation-id)
            breakdown                 (:quality_breakdown conversation)]
        (is (nil? (:quality_score conversation))
            "pre-foundation leaves the composite NULL — there's nothing to score against")
        (is (= quality.constants/composite-version (:version breakdown)))
        (is (= "pre-foundation" (:unscoreable breakdown))
            "sentinel reason marks the row 'tried; do not retry tomorrow' for the backfill task")))))

(deftest score-conversation-pre-foundation-encoded-as-valid-json-test
  (testing "pre-foundation sentinel is JSON-encoded at the DB layer and decodes back into a Clojure map"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            raw-row                   (first (t2/query {:select [:quality_breakdown]
                                                        :from   [:metabot_conversation]
                                                        :where  [:= :id conversation-id]}))]
        (is (string? (:quality_breakdown raw-row))
            "column holds a JSON-encoded string at the DB layer")
        (is (= {:version     quality.constants/composite-version
                :unscoreable "pre-foundation"}
               (json/decode+kw (:quality_breakdown raw-row))))))))

(deftest score-conversation-extract-error-writes-sentinel-test
  (testing "if extract/normalize throws, the pipeline writes the extract-error
            sentinel rather than nil'ing out — defense in depth for malformed
            post-BOT-1569 rows"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)]
        (mt/with-log-level [metabase.metabot.quality.core :fatal]
          (with-redefs [quality.extract/normalize (fn [_] (throw (ex-info "boom" {})))]
            (is (= :sentinel (quality.core/score-conversation! conversation-id))
                "extract throw routes through compute-conversation-score's catch, not the outer guard")))
        (let [row (t2/select-one :model/MetabotConversation :id conversation-id)]
          (is (nil? (:quality_score row)))
          (is (= "extract-error" (:unscoreable (:quality_breakdown row)))))))))

;;; ---------------------------------------------------------------------------
;;; Safety guards
;;; ---------------------------------------------------------------------------

(deftest score-conversation-throw-does-not-roll-back-message-update-test
  (testing "if score-conversation! throws and the outer guard catches it, the
            user-visible message UPDATE still commits — a scoring bug must never
            wipe the row a user is about to read"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id]}
                (metabot.persistence/start-turn!
                 conversation-id "metabot-1"
                 {:role "user" :content "go"})]
            (mt/with-log-level [metabase.metabot.persistence :fatal]
              (with-redefs [quality.core/score-conversation!
                            (fn [_] (throw (ex-info "simulated scoring failure" {})))]
                (metabot.persistence/finalize-assistant-turn!
                 conversation-id assistant-msg-id
                 [{:type :text :text "Hello"}])))
            (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
              (is (= [{:type "text" :text "Hello"}] (:data row))
                  "message data UPDATE committed despite scoring throw")
              (is (true? (:finished row))
                  "finished flag flipped from NULL placeholder to true"))))))))

(deftest score-conversation-inner-guard-swallows-throw-returns-nil-test
  (testing "inner try/catch in score-conversation! returns nil rather than
            re-throwing, so the outer guard never sees the throw"
    (mt/with-log-level [metabase.metabot.quality.core :fatal]
      (with-redefs [t2/update! (fn [& _] (throw (ex-info "simulated update failure" {})))]
        (is (nil? (quality.core/score-conversation! 0))
            "Throwable inside the inner guard returns nil — never re-thrown")))))

;;; ---------------------------------------------------------------------------
;;; End-to-end pipeline
;;; ---------------------------------------------------------------------------

(deftest score-conversation-pipeline-end-to-end-test
  (testing "a scoreable conversation runs the full pipeline and persists a real
            composite + breakdown — every signal at zero here, so all applicable
            subscores are 1.0 and composite = 1.0"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-scoreable-conversation!)
            score           (quality.core/score-conversation! conversation-id)
            row             (t2/select-one :model/MetabotConversation :id conversation-id)
            breakdown       (:quality_breakdown row)]
        (testing "score is a number and matches the persisted composite"
          (is (number? score))
          (is (= 1.0 score))
          (is (= 1.0 (:quality_score row))))
        (testing "breakdown shape per §Storage formats"
          (is (= quality.constants/composite-version (:version breakdown)))
          (is (= "final_response" (:termination breakdown)))
          (is (= {:A 1.0 :B nil :C 1.0 :D 1.0 :composite 1.0}
                 (:subscores breakdown))
              "Subscore B is N/A — no non-field discovery; A/C/D all healthy")
          (is (= ["B"] (:subscore_na breakdown))
              "subscore_na is a sorted vector of N/A letter codes")
          (is (= {:selection-quality      0.0
                  :grounding              0.0
                  :discovery-efficiency   0.0
                  :execution-health       0.0
                  :conversational-economy 0.0
                  :termination            0.0}
                 (:concern_signals breakdown))
              "every concern signal at 0 on this clean fixture")
          (is (= {:P 1 :D 0 :Q 1 :I 0 :H 0}
                 (:set_cardinalities breakdown))
              "the user_is_viewing table lands in P; the authoring-tool input lands in Q;
               Q ⊆ P so H is empty")
          (is (= {:iterations 1 :tool_calls 1 :errors 0}
                 (:context breakdown))
              "single tool call, single iteration, no errors"))
        (testing "Phase 7 — per-turn quality_attribution lands on the assistant row
                  with the same shape the conversation breakdown uses"
          (let [msgs            (t2/select :model/MetabotMessage
                                           :conversation_id conversation-id
                                           {:order-by [[:created_at :asc] [:id :asc]]})
                user-row        (first (filter #(= :user      (:role %)) msgs))
                assistant-row   (first (filter #(= :assistant (:role %)) msgs))
                attribution     (:quality_attribution assistant-row)]
            (is (nil? (:quality_attribution user-row))
                "user rows never carry attribution — the column stays NULL")
            (is (= quality.constants/composite-version (:version attribution)))
            (is (= [] (:observables attribution))
                "healthy clean conversation → no observables on the only assistant turn")
            (is (= {:A 1.0 :B nil :C 1.0 :D 1.0 :composite 1.0}
                   (:prefix_subscores attribution))
                "last (and only) assistant turn's prefix_subscores match the conversation-level subscores")))))))
