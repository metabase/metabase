(ns metabase.pulse.models.pulse-channel-recipient-test
  (:require
   [clojure.test :refer :all]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- recipient-users!
  "`user-count` Users, each the only recipient of a PulseChannel of a Pulse of its own."
  [user-count]
  (let [users  (t2/insert-returning-instances! :model/User
                                               (vec (repeatedly user-count
                                                                #(assoc (mt/with-temp-defaults :model/User)
                                                                        :email (mt/random-email)))))
        pulses (t2/insert-returning-instances! :model/Pulse
                                               (vec (repeatedly user-count #(mt/with-temp-defaults :model/Pulse))))
        channels (t2/insert-returning-instances! :model/PulseChannel
                                                 (vec (for [{:keys [id]} pulses]
                                                        (assoc (mt/with-temp-defaults :model/PulseChannel)
                                                               :pulse_id id
                                                               :channel_type :email
                                                               :enabled false))))]
    (t2/insert! :model/PulseChannelRecipient
                (vec (map (fn [user channel] {:user_id (:id user) :pulse_channel_id (:id channel)}) users channels)))
    {:user-ids  (mapv :id users)
     :pulse-ids (mapv :id pulses)}))

(defn- delete-recipients-statement-count!
  [user-count]
  (let [{:keys [user-ids pulse-ids]} (recipient-users! user-count)]
    (try
      (t2/with-call-count [call-count]
        (models.pulse/delete-pulse-channel-recipients-for-users! user-ids)
        (let [statements (call-count)]
          (testing "the recipients and the channels they were the last of are gone, and the pulses are archived"
            (is (not (t2/exists? :model/PulseChannelRecipient :user_id [:in user-ids])))
            (is (not (t2/exists? :model/PulseChannel :pulse_id [:in pulse-ids])))
            (is (every? true? (t2/select-fn-vec :archived :model/Pulse :id [:in pulse-ids]))))
          statements))
      (finally
        (t2/delete! :model/Pulse :id [:in pulse-ids])
        (t2/delete! :model/User :id [:in user-ids])))))

(deftest delete-pulse-channel-recipients-for-users-statement-count-test
  (testing "deleting the recipients of Users makes the same number of statements for 2 and for 6 of them"
    (is (= (delete-recipients-statement-count! 2) (delete-recipients-statement-count! 6)))))
