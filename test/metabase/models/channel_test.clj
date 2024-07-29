(ns metabase.models.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.channel-test :as api.channel-test]
   [metabase.models.channel :as models.channel]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [toucan2.core :as t2]))

(comment
 ;; to register the :metabase-test channel implementation
 api.channel-test/keepme)

(deftest channel-details-is-encrypted
  (encryption-test/with-secret-key "secret"
    (mt/with-model-cleanup [:model/Channel]
      (let [channel (t2/insert-returning-instance! :model/Channel {:name    "Test channel"
                                                                   :type    "channel/metabase-test"
                                                                   :details {:return-type  "return-value"
                                                                             :return-value true}
                                                                   :active  true})]
        (is (encryption/possibly-encrypted-string? (t2/select-one-fn :details :channel (:id channel))))))))


(deftest toggle-channel-active-will-update-pulse-channel-test
  (mt/with-temp
    [:model/Channel      {id :id}       {:name    "Test channel"
                                         :type    "channel/metabase-test"
                                         :details {:return-type  "return-value"
                                                   :return-value true}
                                         :active  true}
     :model/Pulse        {pulse-id :id} {:name "Test pulse"}
     :model/PulseChannel {pc-id :id}    {:pulse_id pulse-id
                                         :channel_id id
                                         :channel_type "metabase-test"
                                         :enabled true}]

    (testing "deactivate channel will delete pulse channels"
      (t2/update! :model/Channel id {:active false})
      (is (not (t2/exists? :model/PulseChannel pc-id))))

    (testing "do not try to update pulse-channel if active doesn't change"
      (mt/with-dynamic-redefs
        [models.channel/delete-pulse-channels (fn [_] (throw (ex-info "Should not be called" {})))]
        (is (pos? (t2/update! :model/Channel id {:name "New name"})))))))
