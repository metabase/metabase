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
  prompt-context block, no entity-usage, and no `terminal_state` part —
  none of the three foundation signals. Scoring it routes through the
  `pre-foundation` sentinel."
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
  "Insert a minimal but real conversation that carries enough foundation
  signal (a prompt-context block on the user row + a tool-event with
  `:entity-usage`) for the full pipeline to run. Returns the conversation
  id."
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

(defn- seed-pure-chat-conversation!
  "Insert a real conversation that ran the instrumented loop but touched no
  data: a user row with no prompt-context block and an assistant row whose
  only parts are text and a `terminal_state` data part — no entity-usage.
  Returns the conversation id."
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
                 :data            [{:role "user" :content "what can you help me with?"}]})
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :role            :assistant
                 :profile_id      "internal"
                 :external_id     (str (random-uuid))
                 :total_tokens    0
                 :ai_proxied      false
                 :finished        true
                 :data            [{:type "text" :text "I can help you explore your data."}
                                   {:type      "data"
                                    :data-type "terminal_state"
                                    :version   1
                                    :data      {:reason "model_signaled_done"}}]})
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

(deftest score-conversation-instrumented-pure-chat-is-scoreable-test
  (testing "a pure-chat turn that ran the instrumented loop — a terminal_state
            part but no entity-usage and no prompt-context — is scored, not
            sentinelled; with no data sources Data-Source Quality is N/A and the
            composite equals a clean Execution Health of 1.0"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-pure-chat-conversation!)
            score           (quality.core/score-conversation! conversation-id)
            row             (t2/select-one :model/MetabotConversation :id conversation-id)
            breakdown       (:quality_breakdown row)]
        (is (= 1.0 score))
        (is (= 1.0 (:quality_score row)))
        (is (nil? (:unscoreable breakdown))
            "a real breakdown is written, not a pre-foundation sentinel")
        (is (= 1.0 (:composite (:subscores breakdown))))
        (is (= 1.0 (:execution_health (:subscores breakdown))))
        (is (nil? (:data_source_quality (:subscores breakdown)))
            "no data sources touched → Data-Source Quality N/A")
        (is (= ["data_source_quality"] (:subscore_na breakdown)))
        (is (= "model_signaled_done" (:termination breakdown)))))))

(deftest score-conversation-extract-error-writes-sentinel-test
  (testing "if extract/normalize throws, the pipeline writes the extract-error
            sentinel rather than nil'ing out — defense in depth for malformed rows"
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
            composite + breakdown — the authored table was surfaced (grounding
            1.0) but its synthetic id doesn't resolve in governance, so it reads
            non-canonical (authoring share 0.0); Data-Source Quality blends the
            two to 0.5, execution is clean (1.0), and the composite is their
            geometric mean ≈ 0.707"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-scoreable-conversation!)
            score           (quality.core/score-conversation! conversation-id)
            row             (t2/select-one :model/MetabotConversation :id conversation-id)
            breakdown       (:quality_breakdown row)]
        (testing "score is a number and matches the persisted composite"
          (is (number? score))
          (is (< 0.7071 score 0.7072))
          (is (= score (:quality_score row))))
        (testing "persisted breakdown shape"
          (is (= quality.constants/composite-version (:version breakdown)))
          (is (= "final_response" (:termination breakdown)))
          (is (= 0.5 (:data_source_quality (:subscores breakdown))))
          (is (= 1.0 (:execution_health (:subscores breakdown))))
          (is (< 0.7071 (:composite (:subscores breakdown)) 0.7072))
          (is (= [] (:subscore_na breakdown))
              "both subscores applicable on this fixture")
          (is (= {:canonical_authoring_share 0.0
                  :canonical_bypass_rate     nil
                  :unproductive_search_rate  nil
                  :grounding                 1.0
                  :tool_call_failure_rate    0.0
                  :termination_signal        0.0}
                 (:metrics breakdown))
              "authored table is grounded but non-canonical → authoring share 0.0;
               nothing discovered and a single search-free turn leave bypass and
               unproductive-search N/A (null)")
          (is (= {:prompt_context 1 :discovered 0 :authored 1 :inspected 0 :hallucinated 0}
                 (:set_cardinalities breakdown))
              "the user_is_viewing table lands in prompt-context; the authoring-tool input
               lands in authored; authored ⊆ prompt-context so nothing is hallucinated")
          (is (= {:iterations 1 :tool_calls 1 :errors 0}
                 (:context breakdown))
              "single tool call, single iteration, no errors"))
        (testing "per-turn quality_attribution lands on the assistant row"
          (let [msgs            (t2/select :model/MetabotMessage
                                           :conversation_id conversation-id
                                           {:order-by [[:created_at :asc] [:id :asc]]})
                user-row        (first (filter #(= :user      (:role %)) msgs))
                assistant-row   (first (filter #(= :assistant (:role %)) msgs))
                attribution     (:quality_attribution assistant-row)
                prefix          (:prefix_subscores attribution)]
            (is (nil? (:quality_attribution user-row))
                "user rows never carry attribution — the column stays NULL")
            (is (= quality.constants/composite-version (:version attribution)))
            (is (= [] (:observables attribution))
                "clean conversation → no observables on the only assistant turn")
            (testing "last (and only) assistant turn's prefix_subscores match the conversation-level subscores"
              (is (= 0.5 (:data-source-quality prefix)))
              (is (= 1.0 (:execution-health prefix)))
              (is (< 0.7071 (:composite prefix) 0.7072)))))))))
