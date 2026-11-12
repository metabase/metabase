(ns metabase.models.batched-lookups-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [metabase.notification.models :as models.notification]
   [metabase.request.core :as request]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- check-cost
  "The answers of `check` for the rows `select` returns for the first `n` of `ids` in one request as Rasta, and the
  number of queries the checks ran."
  [select ids check n]
  (request/with-current-user (mt/user->id :rasta)
    (let [rows (select (take n ids))]
      (t2/with-call-count [call-count]
        [(mapv check rows) (call-count)]))))

(defn- cost-is-flat
  "Checks that `check` of the first two rows `select` returns for `ids` costs as many queries as of all of them, after one
  run that fills the caches that live longer than a request."
  [select ids check]
  (check-cost select ids check 2)
  (let [[two two-count] (check-cost select ids check 2)
        [all all-count] (check-cost select ids check (count ids))]
    (is (= two (take 2 all)))
    (is (= (count ids) (count all)))
    (is (= two-count all-count))))

(defn- select-by-ids
  [model]
  (fn [ids] (t2/select model :id [:in ids] {:order-by [[:id :asc]]})))

(deftest pulse-checks-cost-test
  (testing "read checks of subscriptions Rasta receives and of alerts cost the same for two Pulses as for three"
    (mt/with-temp [:model/Collection            c1 {}
                   :model/Collection            c2 {}
                   :model/Collection            c3 {}
                   :model/Dashboard             d1 {:collection_id (:id c1)}
                   :model/Dashboard             d2 {:collection_id (:id c2)}
                   :model/Dashboard             d3 {:collection_id (:id c3)}
                   :model/Pulse                 s1 {:dashboard_id (:id d1) :collection_id (:id c1) :creator_id (mt/user->id :crowberto)}
                   :model/Pulse                 s2 {:dashboard_id (:id d2) :collection_id (:id c2) :creator_id (mt/user->id :crowberto)}
                   :model/Pulse                 s3 {:dashboard_id (:id d3) :collection_id (:id c3) :creator_id (mt/user->id :crowberto)}
                   :model/PulseChannel          ch1 {:pulse_id (:id s1)}
                   :model/PulseChannel          ch3 {:pulse_id (:id s3)}
                   :model/PulseChannelRecipient _ {:pulse_channel_id (:id ch1) :user_id (mt/user->id :rasta)}
                   :model/PulseChannelRecipient _ {:pulse_channel_id (:id ch3) :user_id (mt/user->id :rasta)}
                   :model/Card                  k1 {:collection_id (:id c1)}
                   :model/Card                  k2 {:collection_id (:id c2)}
                   :model/Card                  k3 {:collection_id (:id c3)}
                   :model/Pulse                 a1 {:alert_condition "rows" :creator_id (mt/user->id :rasta)}
                   :model/Pulse                 a2 {:alert_condition "rows" :creator_id (mt/user->id :rasta)}
                   :model/Pulse                 a3 {:alert_condition "rows" :creator_id (mt/user->id :rasta)}
                   :model/PulseCard             _ {:pulse_id (:id a1) :card_id (:id k1)}
                   :model/PulseCard             _ {:pulse_id (:id a2) :card_id (:id k2)}
                   :model/PulseCard             _ {:pulse_id (:id a3) :card_id (:id k3)}]
      (testing "subscriptions"
        (is (= [true false true]
               (first (check-cost (select-by-ids :model/Pulse) (map :id [s1 s2 s3]) mi/can-read? 3))))
        (cost-is-flat (select-by-ids :model/Pulse) (map :id [s1 s2 s3]) mi/can-read?))
      (testing "alerts"
        (doseq [check [mi/can-read? mi/can-write?]]
          (cost-is-flat (select-by-ids :model/Pulse) (map :id [a1 a2 a3]) check))))))

(deftest notification-checks-cost-test
  (testing "checks of Notifications cost the same for two Notifications as for three"
    (mt/with-model-cleanup [:model/Notification]
      (mt/with-temp [:model/Collection c1 {}
                     :model/Collection c2 {}
                     :model/Collection c3 {}
                     :model/Card       k1 {:collection_id (:id c1)}
                     :model/Card       k2 {:collection_id (:id c2)}
                     :model/Card       k3 {:collection_id (:id c3)}]
        (let [create!  (fn [creator card recipient?]
                         (:id (models.notification/create-notification!
                               {:payload_type :notification/card :active true :creator_id (mt/user->id creator)
                                :payload      {:card_id (:id card) :send_condition :has_result}}
                               []
                               [{:channel_type :channel/email
                                 :recipients   (if recipient?
                                                 [{:type :notification-recipient/user :user_id (mt/user->id :rasta)}]
                                                 [])}])))
              received (mapv #(create! :crowberto %1 %2) [k1 k2 k3] [true false true])
              own      (mapv #(create! :rasta % false) [k1 k2 k3])]
          (testing "Rasta is a recipient of some"
            (is (= [true false true]
                   (first (check-cost (select-by-ids :model/Notification) received mi/can-read? 3)))))
          (cost-is-flat (select-by-ids :model/Notification) received mi/can-read?)
          (testing "Rasta created them, with their payloads hydrated"
            (cost-is-flat (fn [ids] (t2/hydrate ((select-by-ids :model/Notification) ids) :payload))
                          own mi/can-write?)))))))

(deftest metabot-conversation-checks-cost-test
  (testing "read checks of conversations Rasta did not start cost the same for two conversations as for three"
    (mt/with-model-cleanup [:model/MetabotConversation]
      (let [ids (vec (for [_ (range 3)]
                       (let [id (str (random-uuid))]
                         (t2/insert! :model/MetabotConversation {:id id :user_id (mt/user->id :crowberto)})
                         id)))]
        (cost-is-flat (select-by-ids :model/MetabotConversation) ids mi/can-read?)))))
