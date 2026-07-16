(ns metabase.metabot.api.conversations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.api :as metabot.api]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- seconds-ago [n]
  (t/minus (t/offset-date-time) (t/seconds n)))

(defn- venues-query []
  (lib/query (mt/metadata-provider)
             (lib.metadata/table (mt/metadata-provider) (mt/id :venues))))

(deftest list-conversations-authentication-test
  (testing "GET /api/metabot/conversations requires auth"
    (is (= "Unauthenticated"
           (mt/client :get 401 "metabot/conversations")))))

(deftest list-conversations-returns-only-conversations-user-participated-in-test
  (testing "GET /api/metabot/conversations returns only conversations the caller participated in"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {rasta-convo :id} {:user_id rasta-id :summary "rasta's"}
                     :model/MetabotConversation {lucky-convo :id} {:user_id lucky-id :summary "lucky's"}
                     :model/MetabotMessage _ {:conversation_id rasta-convo :user_id rasta-id}
                     :model/MetabotMessage _ {:conversation_id lucky-convo :user_id lucky-id}]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (set (map :conversation_id (:data response)))]
          (is (contains? ids rasta-convo))
          (is (not (contains? ids lucky-convo))))))))

(deftest list-conversations-includes-legacy-originator-conversations-test
  (testing "GET /api/metabot/conversations keeps legacy originator conversations visible"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "legacy"}
                     ;; No :user_id on the message — simulates a legacy row from before user_id stamping.
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :data            [{:type "text" :text "hello from before user_id stamping"}]}]
        (let [ids (set (map :conversation_id
                            (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
          (is (contains? ids convo-id)))))))

(deftest list-conversations-includes-shared-multi-user-conversations-test
  (testing "GET /api/metabot/conversations includes conversations with multiple participants for each participant"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id rasta-id :summary "shared"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id rasta-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id lucky-id}]
        (testing "originator sees it"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :rasta :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))
        (testing "non-originator participant sees it too"
          (let [ids (set (map :conversation_id
                              (:data (mt/user-http-request :lucky :get 200 "metabot/conversations"))))]
            (is (contains? ids convo-id))))))))

(deftest list-conversations-includes-message-count-test
  (testing "GET /api/metabot/conversations counts and timestamps live messages only"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "hi"}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "user"
                                              :created_at      (seconds-ago 30)}
                     :model/MetabotMessage {live-id :id} {:conversation_id convo-id
                                                          :user_id         user-id
                                                          :role            "assistant"
                                                          :created_at      (seconds-ago 20)}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "assistant"
                                              :created_at      (seconds-ago 10)
                                              :deleted_at      (t/offset-date-time)}]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              found    (first (filter #(= convo-id (:conversation_id %)) (:data response)))]
          (is (some? found))
          (is (= 2 (:message_count found)))
          (is (= (t/instant (t2/select-one-fn :created_at :model/MetabotMessage live-id))
                 (t/instant (t/offset-date-time (:last_message_at found))))))))))

(deftest get-conversation-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to any participant"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :summary "mine"}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "user"
                                              :data            [{:type "text" :text "hello"}]}]
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:summary response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))))))

(deftest get-conversation-second-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id is readable by any participant, not just the originator"
    (let [originator-id (mt/user->id :rasta)
          other-id      (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id originator-id :summary "shared"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id originator-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id other-id}]
        (let [response (mt/user-http-request :lucky :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= originator-id (:user_id response))))))))

(deftest get-conversation-superuser-can-read-test
  (testing "GET /api/metabot/conversations/:id is accessible to superusers even if they don't participate"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id :summary "rasta's"}]
        (let [response (mt/user-http-request :crowberto :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= owner-id (:user_id response))))))))

(deftest get-conversation-non-participant-forbidden-test
  (testing "GET /api/metabot/conversations/:id returns 403 for a non-participant non-admin"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id owner-id}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403 (str "metabot/conversations/" convo-id))))))))

(deftest get-conversation-404-test
  (testing "GET /api/metabot/conversations/:id returns 404 when the conversation does not exist"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metabot/conversations/" (random-uuid)))))))

(deftest check-conversation-access-test
  (testing "check-conversation-access!"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          check!   @#'metabot.api/check-conversation-access!]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id}]
        (testing "allows the originator to continue a legacy conversation with no stamped message authors"
          (binding [api/*current-user-id* owner-id]
            (is (some? (check! convo-id)))))
        (testing "throws 403 when a non-participant tries to continue the conversation"
          (binding [api/*current-user-id* other-id]
            (is (thrown-with-msg? Exception #"permissions"
                                  (check! convo-id)))))
        (testing "allows any user to start a brand-new conversation (no row yet)"
          (binding [api/*current-user-id* other-id]
            (is (nil? (check! (str (random-uuid)))))))))))

(def ^:private check-turn!* @#'metabot.api/check-turn!)
(def ^:private make-out-of-sync-fn @#'metabot.api/make-out-of-sync-fn)

(defn- check-turn!
  "Shim over the 4-arg impl: reads live messages and builds `out-of-sync!` from `conversation-id`."
  [conversation-id parent-message-id retry-message-id]
  (check-turn!* (metabot.persistence/live-messages conversation-id)
                parent-message-id retry-message-id
                (make-out-of-sync-fn conversation-id parent-message-id retry-message-id)))

(defn- rejection! [& args]
  (try (apply check-turn! args)
       (catch clojure.lang.ExceptionInfo e (ex-data e))))

(deftest check-turn-test
  (testing "check-turn! parent_message_id branches"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage _leaf {:conversation_id convo-id
                                                :role            "assistant"
                                                :external_id     "leaf-ext"}]
      (testing "nil parent_message_id starts a turn on a brand-new conversation"
        (is (= {:action :start} (check-turn! (str (random-uuid)) nil nil))))
      (testing "nil parent_message_id is rejected once the conversation has a leaf message"
        (is (= {:status-code 409 :reason :parent-message-missing}
               (rejection! convo-id nil nil))))
      (testing "a parent_message_id matching the current leaf starts a turn"
        (is (= {:action :start} (check-turn! convo-id "leaf-ext" nil))))
      (testing "a parent_message_id that does not exist at all is rejected"
        (is (=? {:reason :parent-message-not-found}
                (rejection! convo-id (str (random-uuid)) nil))))
      (mt/with-temp [:model/MetabotMessage _earlier
                     {:conversation_id convo-id
                      :role            "assistant"
                      :external_id     "earlier-ext"
                      :created_at      (seconds-ago 60)}]
        (testing "a parent_message_id for an earlier (non-leaf) message with a clean tail is rejected"
          (is (=? {:reason :parent-message-stale}
                  (rejection! convo-id "earlier-ext" nil)))))
      (mt/with-temp [:model/MetabotConversation {other-convo-id :id} {:user_id (mt/user->id :rasta)}
                     :model/MetabotMessage _other {:conversation_id other-convo-id
                                                   :role            "assistant"
                                                   :external_id     "other-ext"}]
        (testing "a parent_message_id belonging to a different conversation is not found in these messages"
          (is (=? {:reason :parent-message-not-found}
                  (rejection! convo-id "other-ext" nil)))))
      (mt/with-temp [:model/MetabotMessage _user-msg {:conversation_id convo-id
                                                      :role            "user"
                                                      :external_id     "user-ext"}]
        (testing "a parent_message_id pointing at a user message is rejected"
          (is (=? {:reason :parent-message-not-agent-role}
                  (rejection! convo-id "user-ext" nil))))))))

(deftest check-turn-retry-test
  (testing "check-turn! retry_message_id branches"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage _u1 {:conversation_id convo-id
                                              :role            "user"
                                              :external_id     "u1"
                                              :created_at      (seconds-ago 40)}
                   :model/MetabotMessage _a1 {:conversation_id convo-id
                                              :role            "assistant"
                                              :external_id     "a1"
                                              :created_at      (seconds-ago 30)}]
      (testing "retrying the last live user message is allowed"
        (is (=? {:action :retry} (check-turn! convo-id nil "u1"))))
      (testing "parent_message_id is ignored when retry_message_id is present"
        (is (=? {:action :retry} (check-turn! convo-id "stale-or-anything" "u1"))))
      (testing "a retry_message_id that does not exist is rejected"
        (is (=? {:reason :retry-message-not-found}
                (rejection! convo-id nil (str (random-uuid))))))
      (testing "a retry_message_id pointing at an assistant message is rejected"
        (is (=? {:reason :retry-message-not-user-role}
                (rejection! convo-id nil "a1"))))
      (mt/with-temp [:model/MetabotConversation {other-convo-id :id} {:user_id (mt/user->id :rasta)}
                     :model/MetabotMessage _other-u {:conversation_id other-convo-id
                                                     :role            "user"
                                                     :external_id     "other-u"}]
        (testing "a retry_message_id belonging to a different conversation is not found in these messages"
          (is (=? {:reason :retry-message-not-found}
                  (rejection! convo-id nil "other-u")))))
      (mt/with-temp [:model/MetabotMessage _u2 {:conversation_id convo-id
                                                :role            "user"
                                                :external_id     "u2"
                                                :created_at      (seconds-ago 20)}
                     :model/MetabotMessage _a2 {:conversation_id convo-id
                                                :role            "assistant"
                                                :external_id     "a2"
                                                :created_at      (seconds-ago 10)}]
        (testing "retrying an earlier (non-last) user message is rejected"
          (is (=? {:reason :retry-message-not-last}
                  (rejection! convo-id nil "u1"))))
        (testing "the last user message is still retryable"
          (is (=? {:action :retry} (check-turn! convo-id nil "u2"))))))))

(deftest check-turn-replace-failed-turn-test
  (testing "check-turn! replaces trailing failed turns when the parent points before them"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage _u1 {:conversation_id convo-id
                                              :role            "user"
                                              :external_id     "u1"
                                              :created_at      (seconds-ago 60)}
                   :model/MetabotMessage _a1 {:conversation_id convo-id
                                              :role            "assistant"
                                              :external_id     "a1"
                                              :created_at      (seconds-ago 50)}
                   :model/MetabotMessage {u2-id :id} {:conversation_id convo-id
                                                      :role            "user"
                                                      :external_id     "u2"
                                                      :created_at      (seconds-ago 40)}
                   :model/MetabotMessage {a2-id :id} {:conversation_id convo-id
                                                      :role            "assistant"
                                                      :external_id     "a2"
                                                      :error           "{\"message\":\"boom\"}"
                                                      :created_at      (seconds-ago 30)}]
      (testing "one trailing errored pair after the claimed parent"
        (is (= {:action :replace-failed-turn :message-ids [u2-id a2-id]}
               (check-turn! convo-id "a1" nil))))
      (mt/with-temp [:model/MetabotMessage {u3-id :id} {:conversation_id convo-id
                                                        :role            "user"
                                                        :external_id     "u3"
                                                        :created_at      (seconds-ago 20)}
                     :model/MetabotMessage {a3-id :id} {:conversation_id convo-id
                                                        :role            "assistant"
                                                        :external_id     "a3"
                                                        :error           "{\"message\":\"boom again\"}"
                                                        :created_at      (seconds-ago 10)}]
        (testing "two consecutive trailing errored turns are replaced together"
          (is (= {:action :replace-failed-turn :message-ids [u2-id a2-id u3-id a3-id]}
                 (check-turn! convo-id "a1" nil))))))))

(deftest check-turn-replace-failed-first-turn-test
  (testing "a whole-conversation failed first turn is replaced on a nil-parent resubmit"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage {u1-id :id} {:conversation_id convo-id
                                                      :role            "user"
                                                      :external_id     "u1"
                                                      :created_at      (seconds-ago 20)}
                   :model/MetabotMessage {a1-id :id} {:conversation_id convo-id
                                                      :role            "assistant"
                                                      :external_id     "a1"
                                                      :error           "{\"message\":\"boom\"}"
                                                      :created_at      (seconds-ago 10)}]
      (is (= {:action :replace-failed-turn :message-ids [u1-id a1-id]}
             (check-turn! convo-id nil nil))))))

(deftest check-turn-rejects-non-failed-tails-test
  (testing "tails that are not all-errored are still rejected"
    (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id (mt/user->id :rasta)}
                   :model/MetabotMessage _a1 {:conversation_id convo-id
                                              :role            "assistant"
                                              :external_id     "a1"
                                              :created_at      (seconds-ago 60)}
                   :model/MetabotMessage _u2 {:conversation_id convo-id
                                              :role            "user"
                                              :external_id     "u2"
                                              :created_at      (seconds-ago 50)}]
      (testing "an in-flight placeholder (finished nil, no error) in the tail"
        (mt/with-temp [:model/MetabotMessage _a2 {:conversation_id convo-id
                                                  :role            "assistant"
                                                  :external_id     "a2"
                                                  :finished        nil
                                                  :created_at      (seconds-ago 40)}]
          (is (=? {:reason :parent-message-stale}
                  (rejection! convo-id "a1" nil)))))
      (testing "a mixed tail (errored turn followed by a clean turn)"
        (mt/with-temp [:model/MetabotMessage _a2 {:conversation_id convo-id
                                                  :role            "assistant"
                                                  :external_id     "a2"
                                                  :error           "{\"message\":\"boom\"}"
                                                  :created_at      (seconds-ago 40)}
                       :model/MetabotMessage _u3 {:conversation_id convo-id
                                                  :role            "user"
                                                  :external_id     "u3"
                                                  :created_at      (seconds-ago 30)}
                       :model/MetabotMessage _a3 {:conversation_id convo-id
                                                  :role            "assistant"
                                                  :external_id     "a3"
                                                  :created_at      (seconds-ago 20)}]
          (is (=? {:reason :parent-message-stale}
                  (rejection! convo-id "a1" nil))))))))

(deftest originator-not-overwritten-by-second-writer-test
  (testing "metabot_conversation.user_id is set once on insert and never overwritten"
    (let [owner-id (mt/user->id :rasta)
          other-id (mt/user->id :lucky)
          convo-id (str (random-uuid))
          msg      {:role "user" :content "hello"}]
      (try
        (binding [api/*current-user-id* owner-id]
          (metabot.persistence/start-turn! convo-id "slackbot" msg :user-id owner-id))
        (binding [api/*current-user-id* other-id]
          (metabot.persistence/start-turn! convo-id "slackbot" msg :user-id other-id))
        (is (= owner-id
               (:user_id (t2/select-one :model/MetabotConversation :id convo-id)))
            "originator user_id must not be overwritten when a second user writes to the same conversation")
        (finally
          (t2/delete! :model/MetabotMessage :conversation_id convo-id)
          (t2/delete! :model/MetabotConversation :id convo-id))))))

(deftest record-saved-entity-test
  (testing "POST /api/metabot/conversations/:id/saved-entity creates the card with its origin stamped"
    (let [user-id (mt/user->id :crowberto)]
      (mt/with-model-cleanup [:model/Card]
        (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id}
                       :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id :role "user"}]
          (let [created (mt/user-http-request :crowberto :post 200
                                              (str "metabot/conversations/" convo-id "/saved-entity")
                                              {:chart_id "chart-1"
                                               :card      {:name          "Venues by price"
                                                           :dataset_query (venues-query)
                                                           :display       "bar"}})]
            (is (= "Venues by price" (:name created)))
            (is (= {:metabot_conversation_id convo-id
                    :metabot_chart_id        "chart-1"
                    :display                 :bar}
                   (t2/select-one [:model/Card :metabot_conversation_id :metabot_chart_id :display]
                                  :id (:id created))))
            (testing "the conversation detail lists the saved entity"
              (is (= [{:card_id (:id created) :chart_id "chart-1" :name "Venues by price"}]
                     (:saved_entities
                      (mt/user-http-request :crowberto :get 200
                                            (str "metabot/conversations/" convo-id))))))))))))

(deftest record-saved-entity-permissions-test
  (let [user-id (mt/user->id :crowberto)
        body    {:chart_id "chart-1"
                 :card      {:name          "x"
                             :dataset_query (venues-query)
                             :display       "bar"}}]
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id :role "user"}]
        (testing "a non-participant cannot save into the conversation, and no card is created"
          (mt/user-http-request :lucky :post 403
                                (str "metabot/conversations/" convo-id "/saved-entity")
                                body)
          (is (zero? (t2/count :model/Card :metabot_conversation_id convo-id))))
        (testing "a nonexistent conversation 404s"
          (mt/user-http-request :crowberto :post 404
                                (str "metabot/conversations/" (random-uuid) "/saved-entity")
                                body))))))
