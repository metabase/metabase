(ns metabase-enterprise.public-link-passwords.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.public-link-passwords.core :as public-link-passwords]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.common :as api]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- latest-audit-topic [model-id]
  (t2/select-one-fn :topic :model/AuditLog :model_id model-id {:order-by [[:id :desc]]}))

(defn- snowplow-event-data! []
  (map :data (snowplow-test/pop-event-data-and-user-id!)))

(defn- assert-tracked!
  "Run `thunk` (a password action) and assert it recorded both the expected audit-log event and Snowplow event."
  [model-id entity-type audit-suffix snowplow-event thunk]
  (binding [api/*current-user-id* (mt/user->id :crowberto)]
    (snowplow-test/with-fake-snowplow-collector
      (thunk)
      (testing "records an audit-log event"
        (is (= (keyword (str entity-type "-public-pwd-" audit-suffix))
               (latest-audit-topic model-id))))
      (testing "records a Snowplow event"
        (is (contains? (set (snowplow-event-data!))
                       {"event" snowplow-event "event_detail" entity-type}))))))

(deftest public-link-password-actions-are-tracked-test
  (testing "set/reveal/delete each record an audit-log event and a Snowplow event, on the backend"
    (mt/with-premium-features #{:public-link-passwords :audit-app}
      (testing "card"
        (mt/with-temp [:model/Card {card-id :id} {:public_uuid          (str (random-uuid))
                                                  :public_link_password "secret123"}]
          (assert-tracked! card-id "card" "set" "public_link_password_set"
                           #(public-link-passwords/set-public-link-password! :model/Card card-id "newsecret"))
          (assert-tracked! card-id "card" "revealed" "public_link_password_revealed"
                           #(public-link-passwords/get-public-link-password-value :model/Card card-id))
          (assert-tracked! card-id "card" "deleted" "public_link_password_removed"
                           #(public-link-passwords/delete-public-link-password! :model/Card card-id))))
      (testing "dashboard"
        (mt/with-temp [:model/Dashboard {dashboard-id :id} {:public_uuid          (str (random-uuid))
                                                            :public_link_password "secret123"}]
          (assert-tracked! dashboard-id "dashboard" "set" "public_link_password_set"
                           #(public-link-passwords/set-public-link-password! :model/Dashboard dashboard-id "newsecret"))
          (assert-tracked! dashboard-id "dashboard" "revealed" "public_link_password_revealed"
                           #(public-link-passwords/get-public-link-password-value :model/Dashboard dashboard-id))
          (assert-tracked! dashboard-id "dashboard" "deleted" "public_link_password_removed"
                           #(public-link-passwords/delete-public-link-password! :model/Dashboard dashboard-id)))))))
