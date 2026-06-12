(ns metabase.metabot.quality.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.metabot.quality.extract :as quality.extract]
   [metabase.metabot.quality.schema :as quality.schema]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- finalize-once!
  "Helper: run start-turn! + finalize-assistant-turn! with a one-text-part
  body and no `:context` kwarg, so the resulting conversation carries no
  prompt-context block, no entity-usage, and no `terminal_state` part —
  none of the three foundation signals. Scoring it routes through the
  `pre-instrumentation` sentinel."
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

(defn- seed-error-turn-conversation!
  "Insert a conversation shaped like a provider/loop failure on an
  instrumented turn: the user row carries a prompt-context block with empty
  channels (a plain question — nothing viewed, no @-mentions), and the
  assistant row has the `error` column set but no tool parts and no
  `terminal_state` part (the pre-fix error path emitted none; aborted turns
  still produce this shape). Returns the conversation id."
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
                 :data            [{:role "user" :content "what were sales last month?"}
                                   {:type                 "prompt-context"
                                    :user_is_viewing      []
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
                 :error           (json/encode {:message "provider down"})
                 :data            []})
    conversation-id))

(defn- seed-pre-feature-error-conversation!
  "Insert a genuinely pre-feature failed conversation: no prompt-context
  block, no entity-usage, no terminal_state part — only an `error` column on
  the assistant row. Such rows exist in the backfill population and must
  stay sentineled; error/finished are not instrumentation signals. Returns
  the conversation id."
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
                 :data            [{:role "user" :content "hello"}]})
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :role            :assistant
                 :profile_id      "internal"
                 :external_id     (str (random-uuid))
                 :total_tokens    0
                 :ai_proxied      false
                 :finished        false
                 :error           (json/encode {:message "old failure"})
                 :data            []})
    conversation-id))

;;; ---------------------------------------------------------------------------
;;; Sentinel paths
;;; ---------------------------------------------------------------------------

(deftest score-conversation-pre-instrumentation-writes-sentinel-test
  (testing "a conversation with no entity-usage and no prompt-context routes to
            the pre-instrumentation sentinel — quality_score stays NULL"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            conversation              (t2/select-one :model/MetabotConversation
                                                     :id conversation-id)
            breakdown                 (:quality_breakdown conversation)]
        (is (nil? (:quality_score conversation))
            "pre-instrumentation leaves the composite NULL — there's nothing to score against")
        (is (= quality.constants/quality-score-version (:version breakdown)))
        (is (= "pre-instrumentation" (:unscoreable breakdown))
            "sentinel reason marks the row 'tried; do not retry tomorrow' for the backfill task")
        (is (nil? (mr/explain ::quality.schema/breakdown breakdown))
            "the persisted sentinel conforms to the breakdown schema")))))

(deftest score-conversation-pre-instrumentation-encoded-as-valid-json-test
  (testing "pre-instrumentation sentinel is JSON-encoded at the DB layer and decodes back into a Clojure map"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            raw-row                   (first (t2/query {:select [:quality_breakdown]
                                                        :from   [:metabot_conversation]
                                                        :where  [:= :id conversation-id]}))]
        (is (string? (:quality_breakdown raw-row))
            "column holds a JSON-encoded string at the DB layer")
        (is (= {:version     quality.constants/quality-score-version
                :unscoreable "pre-instrumentation"}
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
            "a real breakdown is written, not a pre-instrumentation sentinel")
        (is (= 1.0 (:quality_score breakdown))
            "composite surfaces as the headline quality_score inside the breakdown")
        (is (= 1.0 (get-in breakdown [:subscores :execution_health :value])))
        (is (nil? (get-in breakdown [:subscores :data_source_quality :value]))
            "no data sources touched → Data-Source Quality N/A (value nil)")
        (is (= "model_signaled_done" (get-in breakdown [:diagnostics :termination])))
        (is (nil? (mr/explain ::quality.schema/breakdown breakdown))
            "the persisted breakdown conforms to the breakdown schema")))))

(deftest score-conversation-error-turn-with-empty-context-block-is-scored-test
  (testing "a failed instrumented turn — error column set, no terminal_state
            part, prompt-context block present with empty channels — is scored
            with termination :error, not sentineled as pre-instrumentation"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-error-turn-conversation!)
            score           (quality.core/score-conversation! conversation-id)
            row             (t2/select-one :model/MetabotConversation :id conversation-id)
            breakdown       (:quality_breakdown row)]
        (is (= 0.5 score)
            "execution health = mean(1.0 tool success, 0.0 termination) with no other applicable subscore")
        (is (nil? (:unscoreable breakdown))
            "a real breakdown is written — the empty-channel block proves instrumentation")
        (is (= "error" (get-in breakdown [:diagnostics :termination])))
        (is (nil? (mr/explain ::quality.schema/breakdown breakdown)))))))

(deftest score-conversation-pre-feature-error-row-still-sentinel-test
  (testing "a pre-feature failed conversation — error column and finished=false
            but no prompt-context block, no entity-usage, no terminal_state part
            — still routes to the pre-instrumentation sentinel (error/finished
            are not instrumentation signals)"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-pre-feature-error-conversation!)
            result          (quality.core/score-conversation! conversation-id)
            row             (t2/select-one :model/MetabotConversation :id conversation-id)]
        (is (= :sentinel result))
        (is (nil? (:quality_score row)))
        (is (= "pre-instrumentation" (:unscoreable (:quality_breakdown row))))))))

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
          (is (= "extract-error" (:unscoreable (:quality_breakdown row))))
          (is (nil? (mr/explain ::quality.schema/breakdown (:quality_breakdown row)))
              "the persisted extract-error sentinel conforms to the breakdown schema"))))))

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

(deftest score-conversation-ignores-soft-deleted-messages-test
  (testing "soft-deleted messages contribute no evidence to the score — an
            errored tool call stops counting once its message is deleted"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-scoreable-conversation!)
            errored-msg-id  (t2/insert-returning-pk!
                             :model/MetabotMessage
                             {:conversation_id conversation-id
                              :role            :assistant
                              :profile_id      "internal"
                              :external_id     (str (random-uuid))
                              :total_tokens    0
                              :ai_proxied      false
                              :finished        true
                              :data            [{:type "tool-input" :id "c2"
                                                 :function "search" :arguments {}}
                                                {:type     "tool-output" :id "c2"
                                                 :function "search"
                                                 :error    "simulated tool failure"
                                                 :result   {:structured-output
                                                            {:entity-usage {:input [] :output []}}}}]})
            failure-rate    (fn []
                              (quality.core/score-conversation! conversation-id)
                              (-> (t2/select-one :model/MetabotConversation :id conversation-id)
                                  :quality_breakdown
                                  (get-in [:subscores :execution_health :metrics :tool_call_failure_rate])))]
        (is (= 0.5 (failure-rate))
            "one of two tool calls errored — failure rate counts the errored call")
        (t2/update! :model/MetabotMessage errored-msg-id {:deleted_at :%now})
        (is (= 0.0 (failure-rate))
            "after soft-deleting the errored message, the failure no longer counts")))))

(deftest scoring-sql-failure-does-not-roll-back-message-update-test
  (testing "a SQL-level failure inside the scoring UPDATEs cannot take the
            user-visible message UPDATE with it — scoring runs after the
            finalize transaction commits"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (str (random-uuid))
            orig-update!    t2/update!]
        (mt/with-current-user (mt/user->id :rasta)
          (let [{:keys [assistant-msg-id]}
                (metabot.persistence/start-turn!
                 conversation-id "metabot-1"
                 {:role "user" :content "go"})]
            (mt/with-log-level [metabase.metabot.quality.core :fatal]
              (with-redefs [t2/update! (fn [& args]
                                         ;; fail only the scoring writes — the
                                         ;; conversation-row update is the only one
                                         ;; whose changes carry :quality_breakdown
                                         (let [changes (last args)]
                                           (if (and (map? changes) (contains? changes :quality_breakdown))
                                             (throw (java.sql.SQLException. "simulated scoring SQL failure"))
                                             (apply orig-update! args))))]
                (metabot.persistence/finalize-assistant-turn!
                 conversation-id assistant-msg-id
                 [{:type :text :text "Hello"}])))
            (let [row (t2/select-one :model/MetabotMessage assistant-msg-id)]
              (is (= [{:type "text" :text "Hello"}] (:data row))
                  "message data UPDATE committed despite the scoring SQL failure")
              (is (true? (:finished row))
                  "finished flag flipped from NULL placeholder to true"))
            (is (nil? (:quality_breakdown (t2/select-one :model/MetabotConversation :id conversation-id)))
                "the failed scoring write left no partial breakdown behind")))))))

(deftest sentinel-clears-stale-attribution-test
  (testing "when a re-score routes to a sentinel, attribution written by an
            earlier clean score is nulled out — an unscoreable conversation's
            messages must not carry stale scores"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [conversation-id (seed-scoreable-conversation!)]
        (quality.core/score-conversation! conversation-id)
        (is (some? (t2/select-one-fn :quality_attribution :model/MetabotMessage
                                     :conversation_id conversation-id
                                     :role :assistant))
            "clean score writes attribution on the assistant row")
        (mt/with-log-level [metabase.metabot.quality.core :fatal]
          (with-redefs [quality.extract/normalize (fn [_] (throw (ex-info "boom" {})))]
            (is (= :sentinel (quality.core/score-conversation! conversation-id)))))
        (is (every? nil? (t2/select-fn-vec :quality_attribution :model/MetabotMessage
                                           :conversation_id conversation-id))
            "sentinel write nulls attribution on every message row")
        (is (= "extract-error"
               (-> (t2/select-one :model/MetabotConversation :id conversation-id)
                   :quality_breakdown
                   :unscoreable)))))))

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
          (is (= quality.constants/quality-score-version (:version breakdown)))
          (is (= "final_response" (get-in breakdown [:diagnostics :termination])))
          (is (= 0.5 (get-in breakdown [:subscores :data_source_quality :value])))
          (is (= 1.0 (get-in breakdown [:subscores :execution_health :value])))
          (is (< 0.7071 (:quality_score breakdown) 0.7072)
              "composite surfaces as the headline quality_score inside the breakdown")
          (is (= {:canonical_source_share 0.0
                  :search_efficiency      nil
                  :grounded_source_share  1.0}
                 (get-in breakdown [:subscores :data_source_quality :metrics]))
              "authored table is grounded but non-canonical → canonical-source share 0.0;
               a single search-free turn leaves search-efficiency N/A (null)")
          (is (= {:tool_call_failure_rate 0.0
                  :termination_health     1.0}
                 (get-in breakdown [:subscores :execution_health :metrics]))
              "no tool errors → failure rate 0.0; a clean final_response exit → termination health 1.0")
          (is (= {:prompt_context 1 :discovered 0 :authored 1 :inspected 0 :hallucinated 0}
                 (get-in breakdown [:diagnostics :entity_counts]))
              "the user_is_viewing table lands in prompt-context; the authoring-tool input
               lands in authored; authored ⊆ prompt-context so nothing is hallucinated")
          (is (= {:n_iterations 1 :n_tool_calls 1 :n_errors 0}
                 (select-keys (:diagnostics breakdown) [:n_iterations :n_tool_calls :n_errors]))
              "single tool call, single iteration, no errors")
          (is (nil? (mr/explain ::quality.schema/breakdown breakdown))
              "the persisted breakdown conforms to the breakdown schema"))
        (testing "per-turn quality_attribution lands on the assistant row"
          (let [msgs            (t2/select :model/MetabotMessage
                                           :conversation_id conversation-id
                                           {:order-by [[:created_at :asc] [:id :asc]]})
                user-row        (first (filter #(= :user      (:role %)) msgs))
                assistant-row   (first (filter #(= :assistant (:role %)) msgs))
                attribution     (:quality_attribution assistant-row)
                subscores       (:subscores attribution)]
            (is (nil? (:quality_attribution user-row))
                "user rows never carry attribution — the column stays NULL")
            (is (= quality.constants/quality-score-version (:version attribution)))
            (is (nil? (mr/explain ::quality.schema/attribution attribution))
                "the persisted per-message attribution conforms to the attribution schema")
            (is (= [] (:observables attribution))
                "clean conversation → no observables on the only assistant turn")
            (testing "last (and only) assistant turn's score matches the conversation-level score"
              (is (= 0.5 (get-in subscores [:data_source_quality :value])))
              (is (= 1.0 (get-in subscores [:execution_health :value])))
              (is (< 0.7071 (:quality_score attribution) 0.7072)))))))))
