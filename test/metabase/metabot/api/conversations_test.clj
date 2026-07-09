(ns metabase.metabot.api.conversations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.metabot.api :as metabot.api]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- seconds-ago [n]
  (t/minus (t/offset-date-time) (t/seconds n)))

(defn- conversation-row [user-id & {:as row}]
  (merge {:user_id user-id} row))

(defn- message-row [conversation-id user-id created-at & {:as row}]
  (merge {:conversation_id conversation-id
          :user_id         user-id
          :created_at      created-at}
         row))

(deftest list-conversations-authentication-test
  (testing "GET /api/metabot/conversations requires auth"
    (is (= "Unauthenticated"
           (mt/client :get 401 "metabot/conversations")))))

(deftest list-conversations-returns-only-conversations-user-participated-in-test
  (testing "GET /api/metabot/conversations returns only conversations the caller participated in"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {rasta-convo :id} {:user_id rasta-id :title "rasta's"}
                     :model/MetabotConversation {lucky-convo :id} {:user_id lucky-id :title "lucky's"}
                     :model/MetabotMessage _ {:conversation_id rasta-convo :user_id rasta-id}
                     :model/MetabotMessage _ {:conversation_id lucky-convo :user_id lucky-id}]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (set (map :conversation_id (:data response)))]
          (is (contains? ids rasta-convo))
          (is (not (contains? ids lucky-convo))))))))

(deftest list-conversations-includes-legacy-originator-conversations-test
  (testing "GET /api/metabot/conversations keeps legacy originator conversations visible"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :title "legacy"}
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
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id rasta-id :title "shared"}
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
    (let [user-id (mt/user->id :rasta)
          t1      (seconds-ago 30)
          t2      (seconds-ago 20)
          t3      (seconds-ago 10)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} (conversation-row user-id :title "hi")
                     :model/MetabotMessage _ (message-row convo-id user-id t1 :role "user")
                     :model/MetabotMessage {live-id :id} (message-row convo-id user-id t2 :role "assistant")
                     :model/MetabotMessage _ (message-row convo-id user-id t3
                                                          :role       "assistant"
                                                          :deleted_at (t/offset-date-time))]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              found    (first (filter #(= convo-id (:conversation_id %)) (:data response)))]
          (is (some? found))
          (is (= 2 (:message_count found)))
          (is (= (t/instant (t2/select-one-fn :created_at :model/MetabotMessage live-id))
                 (t/instant (t/offset-date-time (:last_message_at found))))))))))

(deftest list-conversations-orders-by-latest-conversation-or-message-created-at-test
  (testing "GET /api/metabot/conversations orders by the latest conversation or live message timestamp"
    (let [user-id        (mt/user->id :rasta)
          oldest         (seconds-ago 400)
          old            (seconds-ago 300)
          recent         (seconds-ago 100)
          most-recent    (seconds-ago 50)]
      (mt/with-temp [:model/MetabotConversation {old-convo :id}
                     (conversation-row user-id :title "old" :created_at oldest)
                     :model/MetabotMessage _ (message-row old-convo user-id old :profile_id "default")

                     :model/MetabotConversation {message-created-convo :id}
                     (conversation-row user-id :title "message-created" :created_at oldest)
                     :model/MetabotMessage _ (message-row message-created-convo user-id recent :profile_id "default")

                     :model/MetabotConversation {conversation-created-convo :id}
                     (conversation-row user-id :title "conversation-created" :created_at most-recent)
                     :model/MetabotMessage _ (message-row conversation-created-convo user-id old :profile_id "default")]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations")
              ids      (->> (:data response)
                            (map :conversation_id)
                            (filter #{old-convo message-created-convo conversation-created-convo})
                            vec)]
          (is (= [conversation-created-convo message-created-convo old-convo] ids)))))))

(deftest list-conversations-filters-by-last-message-profile-test
  (testing "GET /api/metabot/conversations?profile_id= filters by the last live message profile"
    (let [rasta-id (mt/user->id :rasta)
          lucky-id (mt/user->id :lucky)
          old      (seconds-ago 60)
          new      (seconds-ago 30)]
      (mt/with-temp [:model/MetabotConversation {nlq-convo :id} (conversation-row rasta-id)
                     :model/MetabotMessage _ (message-row nlq-convo rasta-id old :profile_id "default")
                     :model/MetabotMessage _ (message-row nlq-convo rasta-id new :profile_id "nlq")

                     :model/MetabotConversation {default-convo :id} (conversation-row rasta-id)
                     :model/MetabotMessage _ (message-row default-convo rasta-id old :profile_id "nlq")
                     :model/MetabotMessage _ (message-row default-convo rasta-id new :profile_id "default")

                     :model/MetabotConversation {lucky-convo :id} (conversation-row lucky-id)
                     :model/MetabotMessage _ (message-row lucky-convo lucky-id new :profile_id "nlq")]
        (let [response (mt/user-http-request :rasta :get 200 "metabot/conversations?profile_id=nlq")
              ids      (set (map :conversation_id (:data response)))]
          (is (= #{nlq-convo} ids))
          (is (= 1 (:total response)))
          (is (= "nlq" (-> response :data first :profile_id))))))))

(deftest get-conversation-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id returns the conversation to any participant"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :title "mine"}
                     :model/MetabotMessage _ {:conversation_id convo-id
                                              :user_id         user-id
                                              :role            "user"
                                              :data            [{:type "text" :text "hello"}]}]
        (let [response (mt/user-http-request :rasta :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= "mine" (:title response)))
          (is (= user-id (:user_id response)))
          (is (= 1 (count (:chat_messages response)))))))))

(deftest get-conversation-second-participant-can-read-test
  (testing "GET /api/metabot/conversations/:id is readable by any participant, not just the originator"
    (let [originator-id (mt/user->id :rasta)
          other-id      (mt/user->id :lucky)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id originator-id :title "shared"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id originator-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id other-id}]
        (let [response (mt/user-http-request :lucky :get 200
                                             (str "metabot/conversations/" convo-id))]
          (is (= convo-id (:conversation_id response)))
          (is (= originator-id (:user_id response))))))))

(deftest get-conversation-superuser-can-read-test
  (testing "GET /api/metabot/conversations/:id is accessible to superusers even if they don't participate"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id :title "rasta's"}]
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

(deftest get-conversation-title-status-404-test
  (testing "GET /api/metabot/conversations/:id/title returns 404 when the conversation does not exist"
    (is (= "Not found."
           (mt/user-http-request :rasta :get 404
                                 (str "metabot/conversations/" (random-uuid) "/title"))))))

(deftest get-conversation-title-status-test
  (testing "GET /api/metabot/conversations/:id/title returns ready when a title exists"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id :title "Orders by Month"}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id}]
        (is (= {:status "ready" :title "Orders by Month"}
               (mt/user-http-request :rasta :get 200
                                     (str "metabot/conversations/" convo-id "/title")))))))
  (testing "GET /api/metabot/conversations/:id/title returns missing when no title job is running"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id}]
        (is (= {:status "missing" :title nil}
               (mt/user-http-request :rasta :get 200
                                     (str "metabot/conversations/" convo-id "/title")))))))
  (testing "GET /api/metabot/conversations/:id/title returns pending for an in-flight title job"
    (let [user-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id user-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id user-id}]
        (mt/with-dynamic-fn-redefs [conversation-title/title-status (constantly {:status "pending" :title nil})]
          (is (= {:status "pending" :title nil}
                 (mt/user-http-request :rasta :get 200
                                       (str "metabot/conversations/" convo-id "/title")))))))))

(deftest get-conversation-title-status-non-participant-forbidden-test
  (testing "GET /api/metabot/conversations/:id/title returns 403 for a non-participant"
    (let [owner-id (mt/user->id :rasta)]
      (mt/with-temp [:model/MetabotConversation {convo-id :id} {:user_id owner-id}
                     :model/MetabotMessage _ {:conversation_id convo-id :user_id owner-id}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :lucky :get 403
                                     (str "metabot/conversations/" convo-id "/title"))))
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :crowberto :get 403
                                     (str "metabot/conversations/" convo-id "/title"))))))))

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
