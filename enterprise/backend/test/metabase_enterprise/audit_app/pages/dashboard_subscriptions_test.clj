(ns metabase-enterprise.audit-app.pages.dashboard-subscriptions-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.pages.dashboard-subscriptions :as audit.dashboard-subscriptions]
   [metabase.models :refer [Collection Dashboard Pulse PulseChannel PulseChannelRecipient]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- dashboard-subscriptions [dashboard-name]
  (mt/with-test-user :crowberto
    (premium-features-test/with-premium-features #{:audit-app}
      (qp/process-query
       {:type :internal
        :fn   (u/qualified-name ::audit.dashboard-subscriptions/table)
        :args [dashboard-name]}))))

(deftest table-test
  (is (= []
         (mt/rows (dashboard-subscriptions (mt/random-name)))))
  (let [dashboard-name (mt/random-name)]

    (t2.with-temp/with-temp [Collection {collection-id :id, collection-name :name}]
      ;; test with both the Root Collection and a non-Root Collection
      (doseq [{:keys [collection-id collection-name]} [{:collection-id   collection-id
                                                        :collection-name collection-name}
                                                       {:collection-id   nil
                                                        :collection-name "Our analytics"}]]
        (testing (format "Collection = %d %s" collection-id collection-name)
          (mt/with-temp* [Dashboard             [{dashboard-id :id} {:name          dashboard-name
                                                                     :collection_id collection-id}]
                          Pulse                 [{pulse-id :id}     {:dashboard_id  dashboard-id
                                                                     :collection_id collection-id}]
                          PulseChannel          [{channel-id :id}   {:pulse_id       pulse-id
                                                                     :channel_type   "email"
                                                                     :details        {:emails ["amazing@fake.com"]}
                                                                     :schedule_type  "monthly"
                                                                     :schedule_frame "first"
                                                                     :schedule_day   "mon"
                                                                     :schedule_hour  8}]
                          PulseChannelRecipient [_                  {:pulse_channel_id channel-id
                                                                     :user_id          (mt/user->id :rasta)}]
                          PulseChannel          [{channel-2-id :id} {:pulse_id      pulse-id
                                                                     :channel_type  "slack"
                                                                     :details       {:channel "#wow"}
                                                                     :schedule_type "hourly"}]]
            (is (= {:columns ["dashboard_id"
                              "dashboard_name"
                              "pulse_id"
                              "recipients"
                              "subscription_type"
                              "collection_id"
                              "collection_name"
                              "frequency"
                              "creator_id"
                              "creator_name"
                              "created_at"
                              "num_filters"]
                    ;; sort by newest first.
                    :rows    [[dashboard-id
                               dashboard-name
                               pulse-id
                               nil
                               "Slack"
                               collection-id
                               collection-name
                               "Every hour"
                               (mt/user->id :rasta)
                               "Rasta Toucan"
                               (t2/select-one-fn :created_at PulseChannel :id channel-2-id)
                               0]
                              [dashboard-id
                               dashboard-name
                               pulse-id
                               2
                               "Email"
                               collection-id
                               collection-name
                               "At 8:00 AM, on the first Tuesday of the month"
                               (mt/user->id :rasta)
                               "Rasta Toucan"
                               (t2/select-one-fn :created_at PulseChannel :id channel-id)
                               0]]}
                   (mt/rows+column-names
                    (dashboard-subscriptions (str/join (rest (butlast dashboard-name)))))))))))))
