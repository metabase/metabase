(ns metabase.channel.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.write :as channel.write]
   [metabase.notification.test-util :as notification.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private template-details
  {:type    :email/handlebars-text
   :subject "Subject"
   :body    "Body"})

(deftest update-channel-publishes-update-event-test
  (mt/with-temp [:model/Channel {id :id} notification.tu/default-can-connect-channel]
    (let [events (notification.tu/published-events!
                  #{:model/Channel}
                  #(mt/with-test-user :crowberto
                     (channel.write/update-channel! id {:name "Renamed Channel"} {})))]
      (testing "one update event with the row before and after the update"
        (is (=? [{:operation       :update
                  :id              id
                  :user-id         (mt/user->id :crowberto)
                  :previous-object {:name (:name notification.tu/default-can-connect-channel)}
                  :object          {:name "Renamed Channel"}}]
                events))))))

(deftest update-channel-template-publishes-update-event-test
  (mt/with-temp [:model/ChannelTemplate {id :id} {:channel_type :channel/email
                                                  :name         "Template"
                                                  :details      template-details}]
    (let [events (notification.tu/published-events!
                  #{:model/ChannelTemplate}
                  #(mt/with-test-user :crowberto
                     (channel.write/update-channel-template! id {:name "Renamed Template"} {})))]
      (testing "one update event with the row before and after the update"
        (is (=? [{:operation       :update
                  :id              id
                  :user-id         (mt/user->id :crowberto)
                  :previous-object {:name "Template"}
                  :object          {:name "Renamed Template"}}]
                events))))))

(deftest update-channel-query-count-test
  (mt/with-temp [:model/Channel {id :id} notification.tu/default-can-connect-channel]
    (mt/with-test-user :crowberto
      (binding [search.ingestion/*disable-updates* true]
        (channel.write/update-channel! id {:name "Warm Channel"} {})
        (t2/with-call-count [call-count]
          (channel.write/update-channel! id {:name "Renamed Channel"} {})
          (is (<= (call-count) 2)))))))

(deftest update-channel-template-query-count-test
  (mt/with-temp [:model/ChannelTemplate {id :id} {:channel_type :channel/email
                                                  :name         "Template"
                                                  :details      template-details}]
    (mt/with-test-user :crowberto
      (binding [search.ingestion/*disable-updates* true]
        (channel.write/update-channel-template! id {:name "Warm Template"} {})
        (t2/with-call-count [call-count]
          (channel.write/update-channel-template! id {:name "Renamed Template"} {})
          (is (<= (call-count) 4)))))))
