(ns metabase.metabot.conversation-recall-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.metabot.conversation-recall :as recall]
   [metabase.metabot.db :as metabot.db]
   [metabase.test :as mt]))

(def ^:private messages
  [{:id 1 :role :user :profile_id "nlq" :created_at "2026-09-01T12:00:00Z"
    :data [{:type "text" :text "Show heron sightings by month"}]}
   {:id 2 :role :assistant :profile_id "nlq" :finished true :created_at "2026-09-01T12:00:01Z"
    :data [{:type "data-generated_entity"
            :data {:type "card" :id "chart-1" :title "Monthly heron sightings" :display "bar"
                   :query {:id "query-1" :query {:database 1}}}}
           {:type "tool-conversation_search" :state "output-available"
            :output {:output "Recursive recall must not be indexed"}}]}])

(deftest ^:parallel transcript-artifacts-test
  (let [[turn] (recall/turns "conversation-1" messages [])]
    (is (re-find #"Show heron sightings" (:text turn)))
    (is (re-find #"Monthly heron sightings" (:text turn)))
    (is (re-find #"metabase://conversation/conversation-1/message/2/chart/chart-1" (:text turn)))
    (is (not (re-find #"Recursive recall" (:text turn))))))

(deftest ^:parallel completed-turns-only-test
  (is (empty? (recall/turns "c" (update messages 1 assoc :finished nil) [])))
  (is (empty? (recall/turns "c" (update messages 1 assoc :error "failed") [])))
  (is (empty? (recall/turns "c" (map #(assoc % :profile_id "sql") messages) []))))

(deftest ^:parallel artifact-state-test
  (let [state (recall/state-at messages 2)]
    (is (= {:database 1} (get-in state [:queries "query-1"])))
    (is (= "bar" (get-in state [:charts "chart-1" :visualization_settings :chart_type])))))

(deftest recent-owned-conversations-test
  (let [now (t/offset-date-time)]
    (mt/with-temp [:model/User {owner :id} {}
                   :model/User {other :id} {}
                   :model/MetabotConversation {past :id} {:user_id owner}
                   :model/MetabotConversation {current :id} {:user_id owner}
                   :model/MetabotConversation {foreign :id} {:user_id other}
                   :model/MetabotMessage _ {:conversation_id past :role :assistant :user_id owner
                                            :profile_id "nlq" :finished true :created_at now}
                   :model/MetabotMessage _ {:conversation_id current :role :assistant :user_id owner
                                            :profile_id "internal" :finished true :created_at now}
                   :model/MetabotMessage _ {:conversation_id foreign :role :assistant :user_id other
                                            :profile_id "nlq" :finished true :created_at now}]
      (is (= [past] (mapv :id (metabot.db/recall-conversations owner current {:n 3}))))
      (is (empty? (metabot.db/recall-conversations owner current {:before (t/minus now (t/days 1))})))
      (is (empty? (metabot.db/recall-conversations owner current {:after (t/plus now (t/days 1))})))
      (is (= #{past current} (set (map :id (metabot.db/recall-backfill-page {:user-id owner}))))))))
