(ns metabase.metabot.quality.core-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.quality.constants :as quality.constants]
   [metabase.metabot.quality.core :as quality.core]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- finalize-once!
  "Helper: run start-turn! + finalize-assistant-turn! with a one-text-part
  body. Returns `{:conversation-id :assistant-msg-id}` so tests can read
  back both the conversation- and message-level rows."
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

(deftest score-conversation-stub-writes-sentinel-breakdown-test
  (testing "Phase 1 stub: writes a {version, unscoreable: \"stub\"} breakdown
            and leaves quality_score NULL"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            conversation              (t2/select-one :model/MetabotConversation
                                                     :id conversation-id)
            breakdown                 (:quality_breakdown conversation)]
        (is (nil? (:quality_score conversation))
            "stub leaves the composite score NULL — only real compute populates it")
        (is (= quality.constants/composite-version (:version breakdown)))
        (is (= "stub" (:unscoreable breakdown))
            "sentinel reason is \"stub\" so the backfill task recognizes the row
             as 'tried, do not retry tomorrow'")))))

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

(deftest score-conversation-encodes-sentinel-as-valid-json-test
  (testing "sentinel breakdown is JSON-encoded; the deftransform decodes back
            into a Clojure map with keyword keys"
    (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
      (let [{:keys [conversation-id]} (finalize-once!)
            raw-row                   (first (t2/query {:select [:quality_breakdown]
                                                        :from   [:metabot_conversation]
                                                        :where  [:= :id conversation-id]}))]
        ;; Stored as JSON text so the value round-trips through
        ;; `mi/transform-json` on read.
        (is (string? (:quality_breakdown raw-row))
            "column holds a JSON-encoded string at the DB layer")
        (is (= {:version     quality.constants/composite-version
                :unscoreable "stub"}
               (json/decode+kw (:quality_breakdown raw-row))))))))
