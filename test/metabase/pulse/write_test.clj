(ns metabase.pulse.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.models.pulse-channel-test :as pulse-channel-test]
   [metabase.pulse.task.send-pulses :as task.send-pulses]
   [metabase.pulse.write :as pulse.write]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-pulse-publishes-update-event-test
  (mt/with-temp [:model/Pulse {id :id} {:name "Pulse"}]
    (let [events (notification.tu/published-events!
                  #{:model/Pulse}
                  #(mt/with-test-user :crowberto
                     (pulse.write/update-pulse! id {:name "Renamed Pulse"} {})))]
      (testing "one update event with the row before and after the update"
        (is (=? [{:operation       :update
                  :id              id
                  :user-id         (mt/user->id :crowberto)
                  :previous-object {:name "Pulse"}
                  :object          {:name "Renamed Pulse"}}]
                events))))))

(deftest update-pulse-channel-publishes-update-event-test
  (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                 :model/PulseChannel {id :id}       {:pulse_id pulse-id :channel_type :email :enabled true
                                                     :schedule_type :hourly}]
    (let [events (notification.tu/published-events!
                  #{:model/PulseChannel}
                  #(mt/with-test-user :crowberto
                     (pulse.write/update-pulse-channel! id {:enabled false} {})))]
      (testing "one update event with the row before and after the update"
        (is (=? [{:operation       :update
                  :id              id
                  :user-id         (mt/user->id :crowberto)
                  :previous-object {:enabled true}
                  :object          {:enabled false}}]
                events))))))

(deftest update-pulse-card-publishes-update-event-test
  (mt/with-temp [:model/Pulse     {pulse-id :id} {}
                 :model/Card      {card-id :id}  {}
                 :model/PulseCard {id :id}       {:pulse_id pulse-id :card_id card-id :position 0 :include_csv false}]
    (let [events (notification.tu/published-events!
                  #{:model/PulseCard}
                  #(mt/with-test-user :crowberto
                     (pulse.write/update-pulse-card! id {:include_csv true} {})))]
      (testing "one update event with the row before and after the update"
        (is (=? [{:operation       :update
                  :id              id
                  :user-id         (mt/user->id :crowberto)
                  :previous-object {:include_csv false}
                  :object          {:include_csv true}}]
                events))))))

(deftest delete-last-pulse-channel-recipient-publishes-delete-events-test
  (mt/with-temp [:model/Pulse                  {pulse-id :id}   {}
                 :model/PulseChannel           {channel-id :id} {:pulse_id pulse-id :channel_type :email
                                                                 :schedule_type :hourly}
                 :model/PulseChannelRecipient  {id :id}         {:pulse_channel_id channel-id
                                                                 :user_id          (mt/user->id :rasta)}]
    (let [events (notification.tu/published-events!
                  #{:model/PulseChannel :model/PulseChannelRecipient :model/Pulse}
                  #(mt/with-test-user :crowberto
                     (pulse.write/delete-pulse-channel-recipients! [id] {})))]
      (testing "the recipient and its channel are deleted, and the pulse is archived"
        (is (= #{[:model/PulseChannelRecipient :delete]
                 [:model/PulseChannel :delete]
                 [:model/Pulse :update]}
               (into #{} (map (juxt :model :operation)) events)))
        (is (not (t2/exists? :model/PulseChannel :id channel-id)))
        (is (true? (t2/select-one-fn :archived :model/Pulse :id pulse-id)))))))

(deftest update-pulse-query-count-test
  (mt/with-temp [:model/Pulse {id :id} {:name "Pulse"}]
    (mt/with-test-user :crowberto
      (binding [search.ingestion/*disable-updates* true]
        (pulse.write/update-pulse! id {:name "Warm Pulse"} {})
        (t2/with-call-count [call-count]
          (pulse.write/update-pulse! id {:name "Renamed Pulse"} {})
          (is (<= (call-count) 2)))))))

(deftest update-pulse-channel-query-count-test
  (mt/with-temp-scheduler!
    (task/init! ::task.send-pulses/SendPulses)
    (mt/with-temp [:model/Pulse        {pulse-id :id} {}
                   :model/PulseChannel {id :id}       {:pulse_id pulse-id :channel_type :email :enabled true
                                                       :schedule_type :daily :schedule_hour 7}]
      (mt/with-test-user :crowberto
        (binding [search.ingestion/*disable-updates* true]
          (pulse.write/update-pulse-channel! id {:enabled false} {})
          (t2/with-call-count [call-count]
            (pulse.write/update-pulse-channel! id {:enabled true} {})
            (is (<= (call-count) 2))))))))

(deftest delete-pulse-leaves-same-rows-triggers-events-and-audit-as-master-test
  (testing "deleting Pulse with two enabled channels, card and recipient: master's result, measured on master by its plain delete"
    (let [published (atom [])]
      (events/register-owned-consumer! ::pulse-delete
                                       (fn [{:keys [model]}]
                                         (when (#{:model/Pulse :model/PulseChannel :model/PulseChannelRecipient :model/PulseCard} model)
                                           :pulse))
                                       (fn [_owner evs _all] (swap! published into evs)))
      (try
        (pulse-channel-test/with-send-pulse-setup!
          (mt/with-premium-features #{:audit-app}
            (mt/with-temp [:model/Card                  {card-id :id}  {}
                           :model/Pulse                 {pulse-id :id} {:name "Pulse"}
                           :model/PulseCard             _              {:pulse_id pulse-id :card_id card-id :position 0}
                           :model/PulseChannel          {pc-1 :id}     (merge {:pulse_id pulse-id :channel_type :email :enabled true}
                                                                              pulse-channel-test/daily-at-6pm)
                           :model/PulseChannel          {pc-2 :id}     (merge {:pulse_id pulse-id :channel_type :slack :enabled true
                                                                               :details {:channel "#general"}}
                                                                              pulse-channel-test/daily-at-7pm)
                           :model/PulseChannelRecipient _              {:pulse_channel_id pc-1 :user_id (mt/user->id :rasta)}]
              (let [audit-before (or (t2/select-one-fn :id :model/AuditLog {:order-by [[:id :desc]]}) 0)]
                (is (= 2 (count (pulse-channel-test/send-pulse-triggers pulse-id))))
                (reset! published [])
                (mt/with-test-user :crowberto
                  (is (= 1 (pulse.write/delete-pulses! [pulse-id] {}))))
                (testing "rows and Quartz triggers"
                  (is (= {:pulse? false :channels 0 :recipients 0 :pulse-cards 0 :triggers 0}
                         {:pulse?      (t2/exists? :model/Pulse :id pulse-id)
                          :channels    (t2/count :model/PulseChannel :pulse_id pulse-id)
                          :recipients  (t2/count :model/PulseChannelRecipient :pulse_channel_id [:in [pc-1 pc-2]])
                          :pulse-cards (t2/count :model/PulseCard :pulse_id pulse-id)
                          :triggers    (count (pulse-channel-test/send-pulse-triggers pulse-id))})))
                (testing "one delete event per Pulse and channel, with rows as they were before delete"
                  (is (= #{[:model/Pulse pulse-id :delete {:archived false}]
                           [:model/PulseChannel pc-1 :delete {:enabled true}]
                           [:model/PulseChannel pc-2 :delete {:enabled true}]}
                         (into #{}
                               (map (fn [{:keys [model id operation previous-object]}]
                                      [model id operation (select-keys previous-object [:archived :enabled])]))
                               @published)))
                  (is (= 3 (count @published))))
                (testing "no audit rows"
                  (is (empty? (t2/select :model/AuditLog :id [:> audit-before]))))))))
        (finally
          (events.tu/unregister! ::pulse-delete))))))
