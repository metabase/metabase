(ns metabase-enterprise.notification-admin.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest list-stub-returns-shape-test
  (testing "GET /api/ee/notifications returns :data + :total shape for superuser with :audit-app"
    (mt/with-premium-features #{:audit-app}
      (let [resp (mt/user-http-request :crowberto :get 200 "ee/notifications")]
        (is (contains? resp :data))
        (is (contains? resp :total))
        (is (sequential? (:data resp)))
        (is (integer? (:total resp)))))))

(deftest requires-premium-feature-test
  (testing "GET /api/ee/notifications returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :get 402 "ee/notifications")))))

(deftest requires-superuser-test
  (testing "GET /api/ee/notifications returns 403 for non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :get 403 "ee/notifications"))))

(deftest list-returns-only-card-notifications-test
  (testing "GET /api/ee/notifications only returns :notification/card rows"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}  {}
                     :model/NotificationCard {ncard-id :id} {:card_id card-id}
                     :model/Notification     card-notif    {:payload_type :notification/card
                                                            :payload_id   ncard-id
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     sys-notif     {:payload_type :notification/system-event
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "ee/notifications")
              ids                  (set (map :id data))]
          (is (contains? ids (:id card-notif)))
          (is (not (contains? ids (:id sys-notif))))
          (is (pos? total)))))))

(deftest list-pagination-test
  (testing "limit + offset paginate the result"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/NotificationCard {nc2 :id}     {:card_id card-id}
                     :model/Notification     _n1           {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     _n2           {:payload_type :notification/card
                                                            :payload_id   nc2
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [resp (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                         :limit 1 :offset 0)]
          (is (= 1 (count (:data resp))))
          (is (>= (:total resp) 2)))
        (let [resp (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                         :limit 100 :offset 0)]
          (is (>= (count (:data resp)) 2)))))))

(deftest filter-by-active-test
  (testing "?active=true|false filters on the notification.active boolean; omitted = both"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}  {}
                     :model/NotificationCard {nc1 :id}      {:card_id card-id}
                     :model/NotificationCard {nc2 :id}      {:card_id card-id}
                     :model/Notification     active-notif   {:payload_type :notification/card
                                                             :payload_id   nc1
                                                             :active       true
                                                             :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     archived-notif {:payload_type :notification/card
                                                             :payload_id   nc2
                                                             :active       false
                                                             :creator_id   (mt/user->id :crowberto)}]
        (testing "?active=true returns only active"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :active true)
                ids            (set (map :id data))]
            (is (contains? ids (:id active-notif)))
            (is (not (contains? ids (:id archived-notif))))))
        (testing "?active=false returns only archived"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :active false)
                ids            (set (map :id data))]
            (is (not (contains? ids (:id active-notif))))
            (is (contains? ids (:id archived-notif)))))
        (testing "omitting ?active returns both"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")
                ids            (set (map :id data))]
            (is (contains? ids (:id active-notif)))
            (is (contains? ids (:id archived-notif)))))))))

(deftest filter-by-owner-test
  (testing "owner_id filters to notifications owned by that user"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {user-a :id}  {}
                     :model/User             {user-b :id}  {}
                     :model/Card             {card-id :id} {}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/NotificationCard {nc2 :id}     {:card_id card-id}
                     :model/Notification     notif-a       {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :creator_id   user-a}
                     :model/Notification     notif-b       {:payload_type :notification/card
                                                            :payload_id   nc2
                                                            :creator_id   user-b}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :owner_id user-a)
              ids            (set (map :id data))]
          (is (contains? ids (:id notif-a)))
          (is (not (contains? ids (:id notif-b)))))))))

(deftest filter-by-owner-active-test
  (testing "?owner_active=true|false filters on the owner user's is_active flag"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {active :id}     {:is_active true}
                     :model/User             {deactivated :id} {:is_active false}
                     :model/Card             {card-id :id}    {}
                     :model/NotificationCard {nc1 :id}        {:card_id card-id}
                     :model/NotificationCard {nc2 :id}        {:card_id card-id}
                     :model/Notification     active-notif     {:payload_type :notification/card
                                                               :payload_id   nc1
                                                               :creator_id   active}
                     :model/Notification     deact-notif      {:payload_type :notification/card
                                                               :payload_id   nc2
                                                               :creator_id   deactivated}]
        (testing "owner_active=true keeps only notifications whose owner is active"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :owner_active true)
                ids            (set (map :id data))]
            (is (contains? ids (:id active-notif)))
            (is (not (contains? ids (:id deact-notif))))))
        (testing "owner_active=false keeps only notifications whose owner is deactivated"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :owner_active false)
                ids            (set (map :id data))]
            (is (contains? ids (:id deact-notif)))
            (is (not (contains? ids (:id active-notif))))))))))

(deftest filter-by-card-test
  (testing "card_id filters to notifications whose notification_card.card_id matches"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {target-card :id} {}
                     :model/Card             {other-card :id}  {}
                     :model/NotificationCard {nc-target :id}   {:card_id target-card}
                     :model/NotificationCard {nc-other :id}    {:card_id other-card}
                     :model/Notification     notif-target      {:payload_type :notification/card
                                                                :payload_id   nc-target
                                                                :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     notif-other       {:payload_type :notification/card
                                                                :payload_id   nc-other
                                                                :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :card_id target-card)
              ids            (set (map :id data))]
          (is (contains? ids (:id notif-target)))
          (is (not (contains? ids (:id notif-other)))))))))

(deftest filter-by-channel-test
  (testing "channel filters to notifications with a matching handler channel_type"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card                {card-id :id}    {}
                     :model/NotificationCard    {nc1 :id}        {:card_id card-id}
                     :model/NotificationCard    {nc2 :id}        {:card_id card-id}
                     :model/Notification        email-notif      {:payload_type :notification/card
                                                                  :payload_id   nc1
                                                                  :creator_id   (mt/user->id :crowberto)}
                     :model/Notification        slack-notif      {:payload_type :notification/card
                                                                  :payload_id   nc2
                                                                  :creator_id   (mt/user->id :crowberto)}
                     :model/NotificationHandler _email-handler   {:notification_id (:id email-notif)
                                                                  :channel_type    :channel/email}
                     :model/NotificationHandler _slack-handler   {:notification_id (:id slack-notif)
                                                                  :channel_type    :channel/slack}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :channel "channel/email")
              ids            (set (map :id data))]
          (is (contains? ids (:id email-notif)))
          (is (not (contains? ids (:id slack-notif)))))))))

(deftest filter-by-recipient-email-user-recipient-test
  (testing "recipient_email matches a user recipient via case-insensitive core_user.email"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User                  {target-user :id
                                                   target-email :email} {}
                     :model/User                  {other-user :id}      {}
                     :model/Card                  {card-id :id}         {}
                     :model/NotificationCard      {nc1 :id}             {:card_id card-id}
                     :model/NotificationCard      {nc2 :id}             {:card_id card-id}
                     :model/Notification          target-notif          {:payload_type :notification/card
                                                                         :payload_id   nc1
                                                                         :creator_id   (mt/user->id :crowberto)}
                     :model/Notification          other-notif           {:payload_type :notification/card
                                                                         :payload_id   nc2
                                                                         :creator_id   (mt/user->id :crowberto)}
                     :model/NotificationHandler   {target-handler :id}  {:notification_id (:id target-notif)
                                                                         :channel_type    :channel/email}
                     :model/NotificationHandler   {other-handler :id}   {:notification_id (:id other-notif)
                                                                         :channel_type    :channel/email}
                     :model/NotificationRecipient _target-r             {:notification_handler_id target-handler
                                                                         :type                    :notification-recipient/user
                                                                         :user_id                 target-user}
                     :model/NotificationRecipient _other-r              {:notification_handler_id other-handler
                                                                         :type                    :notification-recipient/user
                                                                         :user_id                 other-user}]
        (testing "exact (case-sensitive original)"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :recipient_email target-email)
                ids            (set (map :id data))]
            (is (contains? ids (:id target-notif)))
            (is (not (contains? ids (:id other-notif))))))
        (testing "case-insensitive — uppercased query still matches a lowercased stored email"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :recipient_email (u/upper-case-en target-email))
                ids            (set (map :id data))]
            (is (contains? ids (:id target-notif)))))))))

(deftest filter-by-recipient-email-raw-value-test
  (testing "recipient_email also matches raw-value (external) recipients via the JSON details column"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card                  {card-id :id}      {}
                     :model/NotificationCard      {nc1 :id}          {:card_id card-id}
                     :model/NotificationCard      {nc2 :id}          {:card_id card-id}
                     :model/Notification          raw-notif          {:payload_type :notification/card
                                                                      :payload_id   nc1
                                                                      :creator_id   (mt/user->id :crowberto)}
                     :model/Notification          unrelated-notif    {:payload_type :notification/card
                                                                      :payload_id   nc2
                                                                      :creator_id   (mt/user->id :crowberto)}
                     :model/NotificationHandler   {raw-handler :id}  {:notification_id (:id raw-notif)
                                                                      :channel_type    :channel/email}
                     :model/NotificationHandler   {un-handler :id}   {:notification_id (:id unrelated-notif)
                                                                      :channel_type    :channel/email}
                     :model/NotificationRecipient _raw-r             {:notification_handler_id raw-handler
                                                                      :type                    :notification-recipient/raw-value
                                                                      :details                 {:value "external@example.com"}}
                     :model/NotificationRecipient _other-raw         {:notification_handler_id un-handler
                                                                      :type                    :notification-recipient/raw-value
                                                                      :details                 {:value "someone-else@example.com"}}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :recipient_email "external@example.com")
              ids            (set (map :id data))]
          (is (contains? ids (:id raw-notif)))
          (is (not (contains? ids (:id unrelated-notif)))))))))

;; ---------------------------------------------------------------------------------------------
;; Fuzzy ?query= search — matches card name + owner name/email only (recipients no longer)
;; ---------------------------------------------------------------------------------------------

(deftest query-matches-card-name-test
  (testing "?query= substring-matches the card name (case-insensitive)"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {sales :id}    {:name "Sales report"}
                     :model/Card             {orders :id}   {:name "Orders dashboard"}
                     :model/NotificationCard {nc-sales :id} {:card_id sales}
                     :model/NotificationCard {nc-orders :id} {:card_id orders}
                     :model/Notification     sales-n        {:payload_type :notification/card
                                                             :payload_id   nc-sales
                                                             :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     orders-n       {:payload_type :notification/card
                                                             :payload_id   nc-orders
                                                             :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :query "SALES")
              ids            (set (map :id data))]
          (is (contains? ids (:id sales-n)))
          (is (not (contains? ids (:id orders-n)))))))))

(deftest query-matches-owner-name-test
  (testing "?query= substring-matches owner first/last/email"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {alice :id}    {:first_name "Alice" :last_name "Stone"
                                                             :email "alice@example.com"}
                     :model/User             {bob :id}      {:first_name "Bob" :last_name "Jones"
                                                             :email "bob@example.com"}
                     :model/Card             {card :id}     {}
                     :model/NotificationCard {nc-a :id}     {:card_id card}
                     :model/NotificationCard {nc-b :id}     {:card_id card}
                     :model/Notification     alice-n        {:payload_type :notification/card
                                                             :payload_id   nc-a
                                                             :creator_id   alice}
                     :model/Notification     bob-n          {:payload_type :notification/card
                                                             :payload_id   nc-b
                                                             :creator_id   bob}]
        (testing "by first_name"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "alic")
                ids            (set (map :id data))]
            (is (contains? ids (:id alice-n)))
            (is (not (contains? ids (:id bob-n))))))
        (testing "by last_name"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "stone")
                ids            (set (map :id data))]
            (is (contains? ids (:id alice-n)))
            (is (not (contains? ids (:id bob-n))))))
        (testing "by email"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "bob@example")
                ids            (set (map :id data))]
            (is (contains? ids (:id bob-n)))
            (is (not (contains? ids (:id alice-n))))))))))

(deftest query-does-not-match-recipients-test
  (testing "?query= no longer descends into recipient emails or slack channels — only card + owner"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User                  {recipient :id}     {:email "carol@unique-domain.test"}
                     :model/Card                  {card :id}          {:name "Innocuous card"}
                     :model/NotificationCard      {nc-user :id}       {:card_id card}
                     :model/NotificationCard      {nc-raw :id}        {:card_id card}
                     :model/NotificationCard      {nc-slack :id}      {:card_id card}
                     :model/Notification          user-recipient-n    {:payload_type :notification/card
                                                                       :payload_id   nc-user
                                                                       :creator_id   (mt/user->id :crowberto)}
                     :model/Notification          raw-recipient-n     {:payload_type :notification/card
                                                                       :payload_id   nc-raw
                                                                       :creator_id   (mt/user->id :crowberto)}
                     :model/Notification          slack-recipient-n   {:payload_type :notification/card
                                                                       :payload_id   nc-slack
                                                                       :creator_id   (mt/user->id :crowberto)}
                     :model/NotificationHandler   {h-user :id}        {:notification_id (:id user-recipient-n)
                                                                       :channel_type    :channel/email}
                     :model/NotificationHandler   {h-raw :id}         {:notification_id (:id raw-recipient-n)
                                                                       :channel_type    :channel/email}
                     :model/NotificationHandler   {h-slack :id}       {:notification_id (:id slack-recipient-n)
                                                                       :channel_type    :channel/slack}
                     :model/NotificationRecipient _r-user             {:notification_handler_id h-user
                                                                       :type                    :notification-recipient/user
                                                                       :user_id                 recipient}
                     :model/NotificationRecipient _r-raw              {:notification_handler_id h-raw
                                                                       :type                    :notification-recipient/raw-value
                                                                       :details                 {:value "fuzzy-target@external.test"}}
                     :model/NotificationRecipient _r-slack            {:notification_handler_id h-slack
                                                                       :type                    :notification-recipient/raw-value
                                                                       :details                 {:value "#fuzzy-channel"}}]
        (testing "user-recipient email is NOT matched by ?query="
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "unique-domain")
                ids            (set (map :id data))]
            (is (not (contains? ids (:id user-recipient-n))))))
        (testing "raw-value email recipient is NOT matched by ?query="
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "fuzzy-target")
                ids            (set (map :id data))]
            (is (not (contains? ids (:id raw-recipient-n))))))
        (testing "slack-channel raw-value recipient is NOT matched by ?query="
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :query "fuzzy-channel")
                ids            (set (map :id data))]
            (is (not (contains? ids (:id slack-recipient-n))))))))))

(deftest query-and-other-filters-and-together-test
  (testing "?query= AND'd with other filters; structured filters narrow the fuzzy result"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card :id}      {:name "Quarterly fizzbuzz"}
                     :model/NotificationCard {nc-a :id}      {:card_id card}
                     :model/NotificationCard {nc-b :id}      {:card_id card}
                     :model/Notification     active-match    {:payload_type :notification/card
                                                              :payload_id   nc-a
                                                              :active       true
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     archived-match  {:payload_type :notification/card
                                                              :payload_id   nc-b
                                                              :active       false
                                                              :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :query "fizzbuzz"
                                                   :active true)
              ids            (set (map :id data))]
          (is (contains? ids (:id active-match)))
          (is (not (contains? ids (:id archived-match)))))))))

(defn- find-row-by-id [data id]
  (some #(when (= id (:id %)) %) data))

;; ---------------------------------------------------------------------------------------------
;; :last_check / :last_sent shape
;; ---------------------------------------------------------------------------------------------

(deftest last-sent-shape-test
  (testing ":last_sent reflects the latest successful TaskRun for the card; nil when none"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-a :id}    {:archived false}
                     :model/Card             {card-b :id}    {:archived false}
                     :model/NotificationCard {nc-a :id}      {:card_id card-a}
                     :model/NotificationCard {nc-b :id}      {:card_id card-b}
                     :model/Notification     {n-sent :id}    {:payload_type :notification/card
                                                              :payload_id   nc-a
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     {n-unsent :id}  {:payload_type :notification/card
                                                              :payload_id   nc-b
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _run            {:run_type    :alert
                                                              :entity_type :card
                                                              :entity_id   card-a
                                                              :status      :success
                                                              :started_at  (t/instant)
                                                              :ended_at    (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")
              by-id          (into {} (map (juxt :id identity) data))]
          (is (=? {:last_sent {:at     some?
                               :status "successful"
                               :error  nil}}
                  (by-id n-sent)))
          (is (=? {:last_sent nil}
                  (by-id n-unsent))))))))

(deftest last-check-shape-success-test
  (testing ":last_check on a successful run reports status=successful with no error"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}    {:archived false}
                     :model/NotificationCard {nc :id}         {:card_id card-id}
                     :model/Notification     {nid :id}        {:payload_type :notification/card
                                                               :payload_id   nc
                                                               :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _run             {:run_type    :alert
                                                               :entity_type :card
                                                               :entity_id   card-id
                                                               :status      :success
                                                               :started_at  (t/instant)
                                                               :ended_at    (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")]
          (is (=? {:last_check {:at     some?
                                :status "successful"
                                :error  nil}}
                  (find-row-by-id data nid))))))))

(deftest last-check-shape-failing-includes-error-test
  (testing ":last_check on a failed run reports status=failing and pulls the error from task_history"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          {run-id :id}  {:run_type    :alert
                                                            :entity_type :card
                                                            :entity_id   card-id
                                                            :status      :failed
                                                            :started_at  (t/instant)
                                                            :ended_at    (t/instant)}
                     :model/TaskHistory      _th           {:task         "send-notification"
                                                            :run_id       run-id
                                                            :status       :failed
                                                            :started_at   (t/instant)
                                                            :ended_at     (t/instant)
                                                            :task_details {:message "SMTP host unreachable"}}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")]
          (is (=? {:last_check {:at     some?
                                :status "failing"
                                :error  "SMTP host unreachable"}}
                  (find-row-by-id data nid))))))))

(deftest last-check-abandoned-folds-into-failing-test
  (testing ":abandoned (heartbeat-killed) runs surface as last_check.status=failing"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _run          {:run_type    :alert
                                                            :entity_type :card
                                                            :entity_id   card-id
                                                            :status      :abandoned
                                                            :started_at  (t/instant)
                                                            :ended_at    (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")]
          (is (=? {:last_check {:status "failing"}}
                  (find-row-by-id data nid))))))))

(deftest last-check-skips-in-flight-runs-test
  (testing "an :started in-flight run is invisible to the admin list — last_check stays nil"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _run          {:run_type    :alert
                                                            :entity_type :card
                                                            :entity_id   card-id
                                                            :status      :started
                                                            :started_at  (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications")]
          (is (=? {:last_check nil
                   :last_sent  nil}
                  (find-row-by-id data nid))))))))

(deftest response-shape-includes-pagination-metadata-test
  (testing "GET / response shape echoes the {:data :total :limit :offset} pagination convention"
    (mt/with-premium-features #{:audit-app}
      (let [resp (mt/user-http-request :crowberto :get 200 "ee/notifications")]
        (is (contains? resp :data))
        (is (contains? resp :total))
        (is (contains? resp :limit))
        (is (contains? resp :offset))))))

(deftest filter-by-last-sent-status-test
  (testing "?last_sent_status=successful|failing filters by the latest task_run outcome"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {success-card :id} {:archived false}
                     :model/Card             {fail-card :id}    {:archived false}
                     :model/NotificationCard {nc-success :id}   {:card_id success-card}
                     :model/NotificationCard {nc-fail :id}      {:card_id fail-card}
                     :model/Notification     success-n          {:payload_type :notification/card
                                                                 :payload_id   nc-success
                                                                 :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     fail-n             {:payload_type :notification/card
                                                                 :payload_id   nc-fail
                                                                 :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _success-run       {:run_type    :alert
                                                                 :entity_type :card
                                                                 :entity_id   success-card
                                                                 :status      :success
                                                                 :started_at  (t/instant)
                                                                 :ended_at    (t/instant)}
                     :model/TaskRun          _fail-run          {:run_type    :alert
                                                                 :entity_type :card
                                                                 :entity_id   fail-card
                                                                 :status      :failed
                                                                 :started_at  (t/instant)
                                                                 :ended_at    (t/instant)}]
        (testing "successful"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :last_sent_status "successful")
                ids            (set (map :id data))]
            (is (contains? ids (:id success-n)))
            (is (not (contains? ids (:id fail-n))))))
        (testing "failing"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :last_sent_status "failing")
                ids            (set (map :id data))]
            (is (contains? ids (:id fail-n)))
            (is (not (contains? ids (:id success-n))))))))))

(deftest filter-compound-test
  (testing "multiple filters AND together (active + owner_id)"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {target-user :id} {}
                     :model/User             {other-user :id}  {}
                     :model/Card             {card-id :id}     {}
                     :model/NotificationCard {nc1 :id}         {:card_id card-id}
                     :model/NotificationCard {nc2 :id}         {:card_id card-id}
                     :model/NotificationCard {nc3 :id}         {:card_id card-id}
                     :model/Notification     matching          {:payload_type :notification/card
                                                                :payload_id   nc1
                                                                :active       true
                                                                :creator_id   target-user}
                     :model/Notification     wrong-active      {:payload_type :notification/card
                                                                :payload_id   nc2
                                                                :active       false
                                                                :creator_id   target-user}
                     :model/Notification     wrong-owner       {:payload_type :notification/card
                                                                :payload_id   nc3
                                                                :active       true
                                                                :creator_id   other-user}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :active true
                                                   :owner_id target-user)
              ids            (set (map :id data))]
          (is (contains? ids (:id matching)))
          (is (not (contains? ids (:id wrong-active))))
          (is (not (contains? ids (:id wrong-owner)))))))))

;; ---------------------------------------------------------------------------------------------
;; Sort
;; ---------------------------------------------------------------------------------------------

(deftest sort-by-last-sent-test
  (testing "?sort_column=last_sent orders rows by the latest successful TaskRun ended_at"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-old :id}   {:archived false}
                     :model/Card             {card-new :id}   {:archived false}
                     :model/Card             {card-never :id} {:archived false}
                     :model/NotificationCard {nc-old :id}     {:card_id card-old}
                     :model/NotificationCard {nc-new :id}     {:card_id card-new}
                     :model/NotificationCard {nc-never :id}   {:card_id card-never}
                     :model/Notification     {old-id :id}     {:payload_type :notification/card
                                                               :payload_id   nc-old
                                                               :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     {new-id :id}     {:payload_type :notification/card
                                                               :payload_id   nc-new
                                                               :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     {never-id :id}   {:payload_type :notification/card
                                                               :payload_id   nc-never
                                                               :creator_id   (mt/user->id :crowberto)}
                     :model/TaskRun          _old             {:run_type    :alert
                                                               :entity_type :card
                                                               :entity_id   card-old
                                                               :status      :success
                                                               :started_at  (t/minus (t/instant) (t/days 5))
                                                               :ended_at    (t/minus (t/instant) (t/days 5))}
                     :model/TaskRun          _new             {:run_type    :alert
                                                               :entity_type :card
                                                               :entity_id   card-new
                                                               :status      :success
                                                               :started_at  (t/instant)
                                                               :ended_at    (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                   :sort_column "last_sent"
                                                   :sort_direction "desc")
              ids            (->> data (map :id) (filter #{old-id new-id never-id}) vec)]
          (is (= [new-id old-id never-id] ids)
              "newest-sent first, oldest-sent next, never-sent last (desc + null-trailing)"))))))

(deftest sort-by-updated-at-test
  (testing "?sort_column=updated_at orders rows by notification.updated_at"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/NotificationCard {nc2 :id}     {:card_id card-id}
                     :model/Notification     n-older       {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :creator_id   (mt/user->id :crowberto)
                                                            :updated_at   (t/minus (t/instant) (t/days 2))}
                     :model/Notification     n-newer       {:payload_type :notification/card
                                                            :payload_id   nc2
                                                            :creator_id   (mt/user->id :crowberto)
                                                            :updated_at   (t/instant)}]
        (testing "desc puts newer first"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :sort_column "updated_at"
                                                     :sort_direction "desc")
                seen           (->> data (map :id) (filter #{(:id n-older) (:id n-newer)}) vec)]
            (is (= [(:id n-newer) (:id n-older)] seen))))
        (testing "asc puts older first"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/notifications"
                                                     :sort_column "updated_at"
                                                     :sort_direction "asc")
                seen           (->> data (map :id) (filter #{(:id n-older) (:id n-newer)}) vec)]
            (is (= [(:id n-older) (:id n-newer)] seen))))))))

(deftest sort-rejects-unknown-column-test
  (testing "?sort_column=<unknown> is rejected with 400 by the malli enum"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :crowberto :get 400 "ee/notifications"
                            :sort_column "name; DROP TABLE notification"))))

;; ---------------------------------------------------------------------------------------------
;; POST /bulk
;; ---------------------------------------------------------------------------------------------

(deftest bulk-archive-test
  (testing "POST /bulk with action=archive flips :active to false for each id"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/NotificationCard {nc2 :id}     {:card_id card-id}
                     :model/Notification     n1            {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :active       true
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     n2            {:payload_type :notification/card
                                                            :payload_id   nc2
                                                            :active       true
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/notifications/bulk"
                                         {:notification_ids [(:id n1) (:id n2)]
                                          :action           "archive"})]
          (is (= 2 (:updated resp)))
          (is (false? (t2/select-one-fn :active :model/Notification (:id n1))))
          (is (false? (t2/select-one-fn :active :model/Notification (:id n2))))
          (testing "publishes :event/notification-update per notification so the admin action is audited"
            (doseq [n [n1 n2]]
              (is (= {:topic    :notification-update
                      :user_id  (mt/user->id :crowberto)
                      :model    "Notification"
                      :model_id (:id n)
                      :details  {:previous {:active true}
                                 :new      {:active false}}}
                     (mt/latest-audit-log-entry :notification-update (:id n)))))))))))

(deftest bulk-unarchive-test
  (testing "POST /bulk with action=unarchive flips :active to true for each id"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/NotificationCard {nc2 :id}     {:card_id card-id}
                     :model/Notification     n1            {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :active       false
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     n2            {:payload_type :notification/card
                                                            :payload_id   nc2
                                                            :active       false
                                                            :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :crowberto :post 200 "ee/notifications/bulk"
                              {:notification_ids [(:id n1) (:id n2)]
                               :action           "unarchive"})
        (is (true? (t2/select-one-fn :active :model/Notification (:id n1))))
        (is (true? (t2/select-one-fn :active :model/Notification (:id n2))))))))

(deftest bulk-change-owner-test
  (testing "POST /bulk with action=change-owner sets :creator_id to owner_id for each id"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {new-owner :id} {}
                     :model/Card             {card-id :id}   {}
                     :model/NotificationCard {nc1 :id}       {:card_id card-id}
                     :model/Notification     n1              {:payload_type :notification/card
                                                              :payload_id   nc1
                                                              :creator_id   (mt/user->id :rasta)}]
        (mt/user-http-request :crowberto :post 200 "ee/notifications/bulk"
                              {:notification_ids [(:id n1)]
                               :action           "change-owner"
                               :owner_id         new-owner})
        (is (= new-owner (t2/select-one-fn :creator_id :model/Notification (:id n1))))))))

(deftest bulk-change-owner-requires-owner-id-test
  (testing "POST /bulk with action=change-owner and no owner_id returns 400"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc1 :id}     {:card_id card-id}
                     :model/Notification     n1            {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :crowberto :post 400 "ee/notifications/bulk"
                              {:notification_ids [(:id n1)]
                               :action           "change-owner"})))))

;; ---------------------------------------------------------------------------------------------
;; Auth + feature-flag gating for POST /bulk (mirrors the GET triad above)
;; ---------------------------------------------------------------------------------------------

(deftest bulk-requires-premium-feature-test
  (testing "POST /api/ee/notifications/bulk returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :post 402 "ee/notifications/bulk"
                             {:notification_ids [1]
                              :action           "archive"})))))

(deftest bulk-requires-superuser-test
  (testing "POST /api/ee/notifications/bulk returns 403 for non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :post 403 "ee/notifications/bulk"
                            {:notification_ids [1]
                             :action           "archive"}))))

(deftest bulk-happy-path-test
  (testing "POST /api/ee/notifications/bulk returns 200 + :updated for superuser with premium"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     n             {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :active       true
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/notifications/bulk"
                                         {:notification_ids [(:id n)]
                                          :action           "archive"})]
          (is (= 1 (:updated resp))))))))

;; ---------------------------------------------------------------------------------------------
;; GET /:id detail endpoint
;; ---------------------------------------------------------------------------------------------

(deftest detail-returns-notification-with-run-summaries-test
  (testing "GET /:id returns the hydrated notification with :last_check / :last_sent slots and owner_id"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}]
        (is (=? {:id        nid
                 :owner_id  (mt/user->id :crowberto)
                 :last_check any?
                 :last_sent  any?}
                (mt/user-http-request :crowberto :get 200 (str "ee/notifications/" nid))))))))

(deftest detail-404-for-missing-id-test
  (testing "GET /:id returns 404 for a non-existent notification id"
    (mt/with-premium-features #{:audit-app}
      (let [max-id (or (t2/select-one-fn :id :model/Notification {:order-by [[:id :desc]]}) 0)]
        (mt/user-http-request :crowberto :get 404
                              (str "ee/notifications/" (+ max-id 100000)))))))

(deftest detail-404-for-non-card-notification-test
  (testing "GET /:id returns 404 when the notification exists but isn't a :notification/card"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Notification {nid :id} {:payload_type :notification/system-event
                                                    :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :crowberto :get 404 (str "ee/notifications/" nid))))))

(deftest detail-requires-premium-feature-test
  (testing "GET /:id returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :get 402 "ee/notifications/1")))))

(deftest detail-requires-superuser-test
  (testing "GET /:id returns 403 for a non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :rasta :get 403 (str "ee/notifications/" nid))))))
