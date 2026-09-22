(ns metabase.metabot.tools.conversations-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.conversation-recall :as recall]
   [metabase.metabot.conversation-recall-index :as recall-index]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.conversations :as conversations]
   [metabase.metabot.tools.resources :as resources]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.content-store :as content-store]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(def ^:private past-id "11111111-1111-4111-8111-111111111111")
(def ^:private current-id "22222222-2222-4222-8222-222222222222")
(def ^:private foreign-id "33333333-3333-4333-8333-333333333333")

(defn- decoded [result]
  (json/decode (:output result) true))

(deftest ^:parallel search-validates-live-owned-excerpts-test
  (let [chunk {:message-id 2 :text "Heron sightings" :content-hash "current"}
        hit   {:conversation_id past-id :message_id 2 :content_hash "current"}]
    (binding [api/*current-user-id* 1
              shared/*memory-atom* (atom {:conversation-id current-id})]
      (mt/with-dynamic-fn-redefs [metabot.db/conversation (fn [id] {:id id :user_id (if (= id foreign-id) 2 1)})
                                  recall/chunks (constantly [chunk])
                                  recall-index/search
                                  (fn [owner excluded query within]
                                    (is (= [1 current-id "herons" nil] [owner excluded query within]))
                                    {:status :ok
                                     :results [(assoc hit :conversation_id foreign-id)
                                               (assoc hit :conversation_id current-id)
                                               (assoc hit :content_hash "stale") hit hit]})]
        (let [result (decoded (conversations/conversation-search-tool {:query "herons"}))]
          (is (= "ok" (:status result)))
          (is (= [{:conversation_id past-id :url (recall/conversation-url past-id)
                   :updated_at "" :page_token "2" :text "Heron sightings"}]
                 (:results result))))))))

(deftest ^:parallel read-conversation-pagination-test
  (let [text (str (apply str (repeat 26000 "h")) "heron nesting decision")
        turns [{:message-id 2 :text text} {:message-id 4 :text "Next exchange"}]]
    (binding [api/*current-user-id* 1]
      (mt/with-dynamic-fn-redefs [metabot.db/conversation (fn [id] {:id id :user_id 1})
                                  recall/conversation-turns (constantly turns)]
        (let [read-page #(decoded (conversations/read-conversation-tool
                                   (merge {:conversation_id past-id} %)))
              first-page (read-page {})
              next-page (read-page {:page_token (:next_page_token first-page)})]
          (is (= 24000 (count (:text first-page))))
          (is (= "2:24000" (:next_page_token first-page)))
          (is (str/includes? (:text next-page) "heron nesting decision"))
          (is (str/includes? (:text next-page) "Next exchange"))
          (is (nil? (:next_page_token next-page)))
          (is (= "heron nesting decision\n\nNext exchange" (:text (read-page {:page_token "2:26000"}))))
          (is (= "4" (:next_page_token (read-page {:page_token "2:26000" :max_turns 1})))))))))

(deftest ^:parallel cannot-read-another-users-conversation-test
  (binding [api/*current-user-id* 1]
    (mt/with-dynamic-fn-redefs [metabot.db/conversation (constantly {:id foreign-id :user_id 2})
                                recall/conversation-turns (fn [_] (throw (AssertionError. "Must check owner first")))]
      (is (= "unavailable" (:status (decoded (conversations/read-conversation-tool
                                              {:conversation_id foreign-id}))))))))

(deftest ^:parallel reopening-artifact-persists-fresh-state-test
  (let [query {:database 1}
        messages [{:id 2 :role :assistant :finished true :profile_id "nlq"
                   :state {:queries {"old-query" query}
                           :charts {"old-chart" {:query_id "old-query" :queries [query]
                                                 :visualization_settings {:chart_type "bar"}}}}}]
        memory-atom (atom (memory/initialize [] nil))]
    (binding [api/*current-user-id* 1 shared/*profile-id* :nlq shared/*memory-atom* memory-atom]
      (mt/with-dynamic-fn-redefs [metabot.db/conversation (constantly {:id past-id :user_id 1})
                                  metabot.db/live-messages (constantly messages)
                                  content-store/query-for-export (fn [query _] query)
                                  resources/export-state-query (fn [_ _] "Heron sightings query")]
        (let [result (resources/read-resource {:uris [(str "metabase://conversation/" past-id
                                                           "/message/2/chart/old-chart")]})
              state (memory/turn-state @memory-atom)
              [query-id] (keys (:queries state))
              [chart-id] (keys (:charts state))
              next-turn (memory/initialize [] state)]
          (is (not-any? :error (:resources result)))
          (is (and query-id (not= "old-query" query-id)))
          (is (and chart-id (not= "old-chart" chart-id)))
          (is (str/includes? (:output result) (str "metabase://query/" query-id)))
          (is (str/includes? (:output result) (str "metabase://chart/" chart-id)))
          (is (= query (memory/find-query next-turn query-id)))
          (is (= query-id (:query_id (memory/find-chart next-turn chart-id)))))))))

(deftest ^:parallel recall-profile-scope-test
  (doseq [[id profile] @@#'profiles/*profiles]
    (let [names (set (map (comp :tool-name meta) (:tools profile)))
          enabled? (contains? #{:internal :nlq :nlq-old :nlq-fallback} id)]
      (is (= enabled? (contains? names "conversation_search")) (str id))
      (is (= enabled? (contains? names "recent_chats")) (str id))
      (is (= enabled? (contains? names "read_conversation")) (str id)))))
