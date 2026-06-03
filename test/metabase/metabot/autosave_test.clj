(ns metabase.metabot.autosave-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.autosave :as autosave]
   [metabase.metabot.persistence :as persistence]
   [metabase.metabot.used-tables :as used-tables]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- orders-count-query
  "A runnable `count` query over the Orders table, as an MLv2 query — the same shape Metabot puts in an `adhoc_viz`."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/aggregate (lib/count)))))

(defn- adhoc-viz-part
  [query & {:keys [title display]}]
  {:type      :data
   :data-type "adhoc_viz"
   :version   1
   :data      (cond-> {:query query :link "/question#abc"}
                title   (assoc :title title)
                display (assoc :display display))})

(defn- with-message!
  "Create a fresh user (clean personal collection) + conversation + assistant message, then call `(f user-id msg-id)`.

  Mirrors the web UI: the originator's `user_id` is on the *conversation*, and the assistant message's `user_id` stays
  NULL. `slack?` stamps slack markers (conversation `slack_channel_id` + message `channel_id`). Cards created during the
  body are cleaned up afterwards."
  [{:keys [slack?]} f]
  (mt/with-model-cleanup [:model/Card]
    (mt/with-temp [:model/User {uid :id} {}
                   :model/MetabotConversation {conv-id :id} (cond-> {:user_id uid}
                                                              slack? (assoc :slack_channel_id "C123"))
                   :model/MetabotMessage {msg-id :id} (cond-> {:conversation_id conv-id
                                                               :profile_id      "test"
                                                               :role            :assistant
                                                               :data            []
                                                               :total_tokens    0}
                                                        slack? (assoc :channel_id "C123"))]
      (f uid msg-id))))

(defn- save!
  [msg-id parts]
  ;; crowberto (superuser) is current-user only so the metadata query create-card! runs has data permissions; the
  ;; saved card's creator/owner is the message's own user.
  (mt/with-current-user (mt/user->id :crowberto)
    (binding [autosave/*run-synchronously?* true]
      (autosave/record-autosaved-cards! msg-id parts))))

(defn- personal-cards
  "Cards authored by `user-id` sitting in their personal collection."
  [user-id]
  (t2/select :model/Card
             :collection_id (:id (collection/user->personal-collection user-id))
             :creator_id    user-id))

(deftest interactive-turn-saves-one-card-test
  (testing "an interactive turn with one adhoc_viz saves one card in the user's personal collection"
    (with-message! {}
      (fn [user-id msg-id]
        (save! msg-id [(adhoc-viz-part (orders-count-query) :title "Orders count" :display "bar")])
        (let [cards (personal-cards user-id)]
          (is (= 1 (count cards)))
          (let [card (first cards)]
            (is (= "Orders count" (:name card)))
            (is (= :bar (:display card)))
            (is (true? (:ai_generated card)))
            (is (= (mt/id :orders)
                   ;; stored shape may be legacy (:query) or pMBQL (:stages) depending on card normalization
                   (or (get-in card [:dataset_query :query :source-table])
                       (get-in card [:dataset_query :stages 0 :source-table]))))))))))

(deftest every-adhoc-viz-is-saved-test
  (testing "every adhoc_viz part in a turn becomes its own card (no dedup)"
    (with-message! {}
      (fn [user-id msg-id]
        (save! msg-id [(adhoc-viz-part (orders-count-query) :title "First")
                       (adhoc-viz-part (orders-count-query) :title "Second")])
        (is (= #{"First" "Second"}
               (into #{} (map :name) (personal-cards user-id))))))))

(deftest slack-turn-saves-nothing-test
  (testing "a Slack turn (slack markers set) saves no cards"
    (with-message! {:slack? true}
      (fn [user-id msg-id]
        (save! msg-id [(adhoc-viz-part (orders-count-query) :title "Nope")])
        (is (empty? (personal-cards user-id)))))))

(deftest no-personal-collection-saves-nothing-test
  (testing "no card is saved (and nothing throws) when the user has no personal collection"
    (with-message! {}
      (fn [user-id msg-id]
        (mt/with-dynamic-fn-redefs [collection/user->personal-collection (constantly nil)]
          (is (nil? (save! msg-id [(adhoc-viz-part (orders-count-query) :title "Nope")]))))
        (is (empty? (personal-cards user-id)))))))

(deftest malformed-query-is-skipped-test
  (testing "an unconvertible query is skipped without aborting sibling saves"
    (with-message! {}
      (fn [user-id msg-id]
        (save! msg-id [(adhoc-viz-part {:totally "broken"} :title "Broken")
                       (adhoc-viz-part (orders-count-query) :title "Good")])
        (is (= ["Good"] (map :name (personal-cards user-id))))))))

(deftest finalize-assistant-turn-triggers-autosave-test
  (testing "finalizing a real web-UI turn (assistant user_id NULL, originator on the conversation) saves the card"
    (mt/with-model-cleanup [:model/Card]
      (mt/with-temp [:model/User {uid :id} {}
                     :model/MetabotConversation {conv-id :id} {:user_id uid}
                     ;; assistant placeholder with user_id left NULL, exactly as the web UI creates it
                     :model/MetabotMessage {msg-id :id} {:conversation_id conv-id
                                                         :profile_id      "test"
                                                         :role            :assistant
                                                         :data            []
                                                         :total_tokens    0
                                                         :finished        nil}]
        (mt/with-current-user (mt/user->id :crowberto)
          (binding [autosave/*run-synchronously?*     true
                    used-tables/*run-synchronously?*  true]
            (persistence/finalize-assistant-turn!
             conv-id msg-id
             [{:type :text :text "Here's your chart"}
              (adhoc-viz-part (orders-count-query) :title "Wired up")]
             :profile-id "test")))
        (is (= ["Wired up"] (map :name (personal-cards uid))))))))
