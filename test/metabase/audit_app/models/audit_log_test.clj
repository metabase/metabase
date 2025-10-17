(ns metabase.audit-app.models.audit-log-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [malli.generator :as mg]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(derive :event/test-event :metabase/event)

(def topic-generator (gen/fmap (fn [k] (keyword "event" (name k))) (mg/generator :keyword)))

(defspec topic-gets-unqualified 2000
  (prop/for-all [ns-kw topic-generator]
    (= (keyword (name ns-kw))
       (:unqualified-topic (audit-log/construct-event ns-kw {} nil)))))

(defspec user-id-params-take-precedence 1000
  (prop/for-all [topic topic-generator
                 event-params (mg/generator ::audit-log/event-params)
                 user-id (mg/generator [:maybe pos-int?])]
    (let [constructed-event (audit-log/construct-event topic event-params user-id)]
      (= (cond
           (:user-id event-params) (:user-id event-params)
           user-id user-id
           :else nil)
         (:user-id constructed-event)))))

(defspec model-id-params-take-precedence 1000
  (prop/for-all [topic topic-generator
                 event-params (mg/generator ::audit-log/event-params)
                 user-id (mg/generator [:maybe pos-int?])]
    (let [object (:object event-params)
          constructed-event (audit-log/construct-event topic event-params user-id)]
      (= (cond
           (:model-id event-params) (:model-id event-params)
           (u/id object) (u/id object)
           :else nil)
         (:model-id constructed-event)))))

(deftest basic-record-event-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :rasta
      (testing "Test that `record-event!` succesfully records basic card events"
        (mt/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (audit-log/record-event! :event/card-create {:object card})
          ;; Not an exhaustive match since we're mainly testing that the event is recorded
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model "Card" :model_id card-id)))))

      (testing "Test that `record-event!` succesfully records basic card events with the user, model, and model ID specified"
        (mt/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (audit-log/record-event! :event/card-create
                                   {:object card
                                    :user-id (mt/user->id :rasta)
                                    :model :model/Card
                                    :model-id card-id})
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model "Card" :model_id card-id)))))

      (testing "Test that `record-event!` records an event with arbitrary data and no model specified"
        (audit-log/record-event! :event/test-event {:details {:foo "bar"}})
        (is (partial=
             {:topic :test-event
              :user_id (mt/user->id :rasta)
              :model nil
              :model_id nil
              :details {:foo "bar"}}
             (t2/select-one :model/AuditLog :topic :test-event)))))))

(deftest record-events-bulk-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :rasta
      (testing "Test that `record-events!` records multiple events in one call"
        (mt/with-temp [:model/Card {card1-id :id :as card1} {:name "Card 1"}
                       :model/Card {card2-id :id :as card2} {:name "Card 2"}
                       :model/Card {card3-id :id :as card3} {:name "Card 3"}]
          (let [result (audit-log/record-events! :event/card-create
                                                 [{:object card1}
                                                  {:object card2}
                                                  {:object card3}])]
            (testing "Returns count of inserted rows"
              (is (= 3 result)))

            (testing "All events are recorded correctly"
              (is (partial=
                   {:topic :card-create
                    :user_id (mt/user->id :rasta)
                    :model "Card"
                    :model_id card1-id
                    :details {:name "Card 1"}}
                   (t2/select-one :model/AuditLog :model "Card" :model_id card1-id)))
              (is (partial=
                   {:topic :card-create
                    :user_id (mt/user->id :rasta)
                    :model "Card"
                    :model_id card2-id
                    :details {:name "Card 2"}}
                   (t2/select-one :model/AuditLog :model "Card" :model_id card2-id)))
              (is (partial=
                   {:topic :card-create
                    :user_id (mt/user->id :rasta)
                    :model "Card"
                    :model_id card3-id
                    :details {:name "Card 3"}}
                   (t2/select-one :model/AuditLog :model "Card" :model_id card3-id)))))))

      (testing "Test that `record-events!` handles mixed user IDs"
        (mt/with-temp [:model/Card {card1-id :id :as card1} {:name "Card A"}
                       :model/Card {card2-id :id :as card2} {:name "Card B"}]
          (audit-log/record-events! :event/card-create
                                    [{:object card1 :user-id (mt/user->id :crowberto)}
                                     {:object card2}])
          (is (partial=
               {:topic :card-create
                :user_id (mt/user->id :crowberto)
                :model_id card1-id}
               (t2/select-one :model/AuditLog :model "Card" :model_id card1-id)))
          (is (partial=
               {:topic :card-create
                :user_id (mt/user->id :rasta)
                :model_id card2-id}
               (t2/select-one :model/AuditLog :model "Card" :model_id card2-id)))))

      (testing "Test that `record-events!` handles empty input"
        (is (nil? (audit-log/record-events! :event/card-create []))))

      (testing "Test that single `record-event!` delegates to bulk version correctly"
        (mt/with-temp [:model/Card {card-id :id :as card} {:name "Single card"}]
          (audit-log/record-event! :event/card-create {:object card})
          (is (partial=
               {:topic :card-create
                :user_id (mt/user->id :rasta)
                :model "Card"
                :model_id card-id
                :details {:name "Single card"}}
               (t2/select-one :model/AuditLog :model "Card" :model_id card-id))))))))
