(ns metabase-enterprise.tenants.pulse-api-test
  "Tenant-isolation tests for `/api/pulse` endpoints."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro ^:private with-tenant-pulse-fixture!
  "Two tenants, a user in each, an internal non-superuser, and a dashboard subscription created by the
  tenant-A user in tenant A's collection whose email channel has all three users plus a raw address as
  recipients. A `dashboard_id` is set because the `creator_or_recipient` listing only returns dashboard
  subscriptions."
  [[binding] & body]
  `(mt/with-premium-features #{:tenants}
     (mt/with-temporary-setting-values [~'use-tenants true]
       (mt/with-temp [:model/Tenant {tenant-a-id# :id, tenant-a-coll-id# :tenant_collection_id}
                      {:name "Tenant A" :slug "tenant-a"}
                      :model/Tenant {tenant-b-id# :id} {:name "Tenant B" :slug "tenant-b"}
                      :model/User {alice-id# :id} {:tenant_id tenant-a-id#}
                      :model/User {dave-id# :id} {:tenant_id tenant-b-id#}
                      :model/User {jane-id# :id} {}
                      :model/Dashboard {dash-id# :id} {:collection_id tenant-a-coll-id#}
                      :model/Pulse {pulse-id# :id} {:creator_id    alice-id#
                                                    :collection_id tenant-a-coll-id#
                                                    :dashboard_id  dash-id#
                                                    :name          "Tenant A subscription"}
                      :model/PulseChannel {pc-id# :id} {:pulse_id pulse-id#
                                                        :details  {:emails ["external@vendor.example"]}}
                      :model/PulseChannelRecipient _# {:pulse_channel_id pc-id# :user_id alice-id#}
                      :model/PulseChannelRecipient _# {:pulse_channel_id pc-id# :user_id dave-id#}
                      :model/PulseChannelRecipient _# {:pulse_channel_id pc-id# :user_id jane-id#}]
         (let [~binding {:alice-id alice-id#, :dave-id dave-id#, :jane-id jane-id#
                         :dash-id dash-id#, :pulse-id pulse-id#, :pc-id pc-id#}]
           ~@body)))))

(defn- recipient-user-ids [pulse]
  (into #{} (comp (mapcat :recipients) (keep :id)) (:channels pulse)))

(deftest tenant-users-dont-see-slack-channels-in-form-input-test
  (testing "GET /api/pulse/form_input"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-id :id} {:name "Tenant" :slug "tenant-slug"}
                       :model/User {tenant-user-id :id} {:tenant_id tenant-id}
                       :model/User {internal-user-id :id} {}]
          (testing "a tenant user is not served the Slack channel type at all"
            (is (not (contains? (:channels (mt/user-http-request tenant-user-id :get 200 "pulse/form_input"))
                                :slack))))
          (testing "an internal user still is"
            (is (contains? (:channels (mt/user-http-request internal-user-id :get 200 "pulse/form_input"))
                           :slack))))))))

(deftest tenant-users-only-see-same-tenant-recipients-test
  (testing "GET /api/pulse & GET /api/pulse/:id filter recipients to the caller's tenant"
    (with-tenant-pulse-fixture! [{:keys [alice-id pulse-id]}]
      (testing "in the list endpoint"
        (let [pulse (->> (mt/user-http-request alice-id :get 200 "pulse" :creator_or_recipient true)
                         (filter #(= pulse-id (:id %)))
                         first)]
          (is (some? pulse))
          (is (= #{alice-id} (recipient-user-ids pulse)))))
      (testing "in the single-pulse endpoint"
        (let [pulse (mt/user-http-request alice-id :get 200 (str "pulse/" pulse-id))]
          (is (= #{alice-id} (recipient-user-ids pulse)))
          (testing "raw email recipients are preserved"
            (is (some #(= "external@vendor.example" (:email %))
                      (mapcat :recipients (:channels pulse))))))))))

(deftest internal-users-dont-see-tenant-recipients-test
  (testing "GET /api/pulse filters tenant users out of recipient lists for internal non-superusers"
    (with-tenant-pulse-fixture! [{:keys [alice-id dave-id jane-id]}]
      (mt/with-temp [:model/Dashboard {dash-id :id} {}
                     :model/Pulse {pulse-id :id} {:creator_id jane-id :dashboard_id dash-id :name "Internal subscription"}
                     :model/PulseChannel {pc-id :id} {:pulse_id pulse-id}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id jane-id}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id alice-id}
                     :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id dave-id}]
        (let [pulse (->> (mt/user-http-request jane-id :get 200 "pulse" :creator_or_recipient true)
                         (filter #(= pulse-id (:id %)))
                         first)]
          (is (some? pulse))
          (is (= #{jane-id} (recipient-user-ids pulse))))
        (testing "superusers still see everyone"
          (let [pulse (mt/user-http-request :crowberto :get 200 (str "pulse/" pulse-id))]
            (is (= #{jane-id alice-id dave-id} (recipient-user-ids pulse)))))))))

(deftest updating-a-pulse-preserves-hidden-recipients-test
  (testing "PUT /api/pulse/:id by a tenant user does not delete the recipients hidden from them"
    (with-tenant-pulse-fixture! [{:keys [alice-id dave-id jane-id pulse-id pc-id]}]
      (let [pulse (mt/user-http-request alice-id :get 200 (str "pulse/" pulse-id))]
        (is (= #{alice-id} (recipient-user-ids pulse)))
        ;; the ordinary edit round trip: PUT back the channels exactly as they were served
        (mt/user-http-request alice-id :put 200 (str "pulse/" pulse-id) {:channels (:channels pulse)})
        (is (= #{alice-id dave-id jane-id}
               (t2/select-fn-set :user_id :model/PulseChannelRecipient :pulse_channel_id pc-id)))))))
