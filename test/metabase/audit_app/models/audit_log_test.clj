(ns metabase.audit-app.models.audit-log-test
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [malli.generator :as mg]
   [metabase.audit-app.models.audit-log :as audit-log]
   [metabase.events.core :as events]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(events/derive! :event/test-event :metabase/event)

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

(defn- record-event!
  "Insert the row that [[audit-log/audit-row]] builds for `topic` and `params`."
  [topic params]
  (audit-log/record-rows! [(audit-log/audit-row topic params)]))

(deftest basic-record-event-test
  (mt/with-premium-features #{:audit-app}
    (mt/with-test-user :rasta
      (testing "Test that `record-rows!` succesfully records basic card events"
        (mt/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (record-event! :event/card-create {:object card :details {:name "Test card"}})
          ;; Not an exhaustive match since we're mainly testing that the event is recorded
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model_id card-id)))))
      (testing "Test that `record-rows!` succesfully records basic card events with the user, model, and model ID specified"
        (mt/with-temp [:model/Card {card-id :id :as card} {:name "Test card"}]
          (record-event! :event/card-create
                         {:object card
                          :user-id (mt/user->id :rasta)
                          :model :model/Card
                          :model-id card-id
                          :details {:name "Test card"}})
          (is (partial=
               {:topic    :card-create
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id card-id
                :details  {:name "Test card"}}
               (t2/select-one :model/AuditLog :model_id card-id)))))
      (testing "Test that `record-rows!` records an event with arbitrary data and no model specified"
        (record-event! :event/test-event {:details {:foo "bar"}})
        (is (partial=
             {:topic :test-event
              :user_id (mt/user->id :rasta)
              :model nil
              :model_id nil
              :details {:foo "bar"}}
             (t2/select-one :model/AuditLog :topic :test-event)))))))
