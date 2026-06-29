(ns metabase.notification.api.admin-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest list-stub-returns-shape-test
  (testing "GET /api/notification/admin returns :data + :total shape for superuser"
    (let [resp (mt/user-http-request :crowberto :get 200 "notification/admin")]
      (is (contains? resp :data))
      (is (contains? resp :total))
      (is (sequential? (:data resp)))
      (is (integer? (:total resp))))))

(deftest requires-superuser-test
  (testing "GET /api/notification/admin returns 403 for non-superuser"
    (mt/user-http-request :rasta :get 403 "notification/admin")))

(deftest list-returns-only-card-notifications-test
  (testing "GET /api/notification/admin only returns :notification/card rows"
    (mt/with-temp [:model/Card             {card-id :id}  {}
                   :model/NotificationCard {ncard-id :id} {:card_id card-id}
                   :model/Notification     card-notif    {:payload_type :notification/card
                                                          :payload_id   ncard-id
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     sys-notif     {:payload_type :notification/system-event
                                                          :creator_id   (mt/user->id :crowberto)}]
      (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "notification/admin")
            ids                  (set (map :id data))]
        (is (contains? ids (:id card-notif)))
        (is (not (contains? ids (:id sys-notif))))
        (is (pos? total))))))

(deftest list-pagination-test
  (testing "limit + offset paginate the result"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc1 :id}     {:card_id card-id}
                   :model/NotificationCard {nc2 :id}     {:card_id card-id}
                   :model/Notification     _n1           {:payload_type :notification/card
                                                          :payload_id   nc1
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     _n2           {:payload_type :notification/card
                                                          :payload_id   nc2
                                                          :creator_id   (mt/user->id :crowberto)}]
      (let [resp (mt/user-http-request :crowberto :get 200 "notification/admin"
                                       :limit 1 :offset 0)]
        (is (= 1 (count (:data resp))))
        (is (>= (:total resp) 2)))
      (let [resp (mt/user-http-request :crowberto :get 200 "notification/admin"
                                       :limit 100 :offset 0)]
        (is (>= (count (:data resp)) 2))))))

(deftest filter-by-active-test
  (testing "?active=true|false filters on the notification.active boolean; omitted = both"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :active true)
              ids            (set (map :id data))]
          (is (contains? ids (:id active-notif)))
          (is (not (contains? ids (:id archived-notif))))))
      (testing "?active=false returns only archived"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :active false)
              ids            (set (map :id data))]
          (is (not (contains? ids (:id active-notif))))
          (is (contains? ids (:id archived-notif)))))
      (testing "omitting ?active returns both"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")
              ids            (set (map :id data))]
          (is (contains? ids (:id active-notif)))
          (is (contains? ids (:id archived-notif))))))))

(deftest filter-by-owner-test
  (testing "creator_id filters to notifications owned by that user"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :creator_id user-a)
            ids            (set (map :id data))]
        (is (contains? ids (:id notif-a)))
        (is (not (contains? ids (:id notif-b))))))))

(deftest owner-includes-is-active-test
  (testing "the hydrated :creator map carries :is_active so FE can render the deactivated-owner state"
    (mt/with-temp [:model/User             {active :id}      {:is_active true}
                   :model/User             {deactivated :id} {:is_active false}
                   :model/Card             {card-id :id}     {}
                   :model/NotificationCard {nc1 :id}         {:card_id card-id}
                   :model/NotificationCard {nc2 :id}         {:card_id card-id}
                   :model/Notification     {active-n :id}    {:payload_type :notification/card
                                                              :payload_id   nc1
                                                              :creator_id   active}
                   :model/Notification     {deact-n :id}     {:payload_type :notification/card
                                                              :payload_id   nc2
                                                              :creator_id   deactivated}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")
            by-id          (into {} (map (juxt :id identity) data))]
        (is (=? {:creator {:id active        :is_active true}}  (by-id active-n)))
        (is (=? {:creator {:id deactivated   :is_active false}} (by-id deact-n)))))))

(deftest filter-by-owner-active-test
  (testing "?creator_active=true|false filters on the creator user's is_active flag"
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
      (testing "creator_active=true keeps only notifications whose creator is active"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :creator_active true)
              ids            (set (map :id data))]
          (is (contains? ids (:id active-notif)))
          (is (not (contains? ids (:id deact-notif))))))
      (testing "creator_active=false keeps only notifications whose creator is deactivated"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :creator_active false)
              ids            (set (map :id data))]
          (is (contains? ids (:id deact-notif)))
          (is (not (contains? ids (:id active-notif)))))))))

(deftest filter-by-card-test
  (testing "card_id filters to notifications whose notification_card.card_id matches"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :card_id target-card)
            ids            (set (map :id data))]
        (is (contains? ids (:id notif-target)))
        (is (not (contains? ids (:id notif-other))))))))

(deftest filter-by-channel-test
  (testing "channel filters to notifications with a matching handler channel_type"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :channel "channel/email")
            ids            (set (map :id data))]
        (is (contains? ids (:id email-notif)))
        (is (not (contains? ids (:id slack-notif))))))))

(deftest filter-by-recipient-email-user-recipient-test
  (testing "recipient_email matches a user recipient via case-insensitive core_user.email"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :recipient_email target-email)
              ids            (set (map :id data))]
          (is (contains? ids (:id target-notif)))
          (is (not (contains? ids (:id other-notif))))))
      (testing "case-insensitive — uppercased query still matches a lowercased stored email"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :recipient_email (u/upper-case-en target-email))
              ids            (set (map :id data))]
          (is (contains? ids (:id target-notif))))))))

(deftest filter-by-recipient-email-raw-value-test
  (testing "recipient_email also matches raw-value (external) recipients via the JSON details column"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :recipient_email "external@example.com")
            ids            (set (map :id data))]
        (is (contains? ids (:id raw-notif)))
        (is (not (contains? ids (:id unrelated-notif))))))))

;; ---------------------------------------------------------------------------------------------
;; Fuzzy ?query= search — matches card name + owner name/email only (recipients no longer)
;; ---------------------------------------------------------------------------------------------

(deftest query-matches-card-name-test
  (testing "?query= substring-matches the card name (case-insensitive)"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :query "SALES")
            ids            (set (map :id data))]
        (is (contains? ids (:id sales-n)))
        (is (not (contains? ids (:id orders-n))))))))

(deftest query-matches-owner-name-test
  (testing "?query= substring-matches owner first/last/email"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "alic")
              ids            (set (map :id data))]
          (is (contains? ids (:id alice-n)))
          (is (not (contains? ids (:id bob-n))))))
      (testing "by last_name"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "stone")
              ids            (set (map :id data))]
          (is (contains? ids (:id alice-n)))
          (is (not (contains? ids (:id bob-n))))))
      (testing "by email"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "bob@example")
              ids            (set (map :id data))]
          (is (contains? ids (:id bob-n)))
          (is (not (contains? ids (:id alice-n)))))))))

(deftest query-does-not-match-recipients-test
  (testing "?query= no longer descends into recipient emails or slack channels — only card + owner"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "unique-domain")
              ids            (set (map :id data))]
          (is (not (contains? ids (:id user-recipient-n))))))
      (testing "raw-value email recipient is NOT matched by ?query="
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "fuzzy-target")
              ids            (set (map :id data))]
          (is (not (contains? ids (:id raw-recipient-n))))))
      (testing "slack-channel raw-value recipient is NOT matched by ?query="
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :query "fuzzy-channel")
              ids            (set (map :id data))]
          (is (not (contains? ids (:id slack-recipient-n)))))))))

(deftest query-and-other-filters-and-together-test
  (testing "?query= AND'd with other filters; structured filters narrow the fuzzy result"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :query "fizzbuzz"
                                                 :active true)
            ids            (set (map :id data))]
        (is (contains? ids (:id active-match)))
        (is (not (contains? ids (:id archived-match))))))))

(defn- find-row-by-id [data id]
  (some #(when (= id (:id %)) %) data))

;; ---------------------------------------------------------------------------------------------
;; :last_check / :last_send shape
;; ---------------------------------------------------------------------------------------------

(deftest last-send-from-channel-send-task-history-test
  (testing ":last_send reflects the latest channel-send task_history row (any outcome)"
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
                   :model/TaskRun          {run-id :id}    {:run_type        :alert
                                                            :entity_type     :card
                                                            :entity_id       card-a
                                                            :notification_id n-sent
                                                            :status          :success
                                                            :started_at      (t/instant)
                                                            :ended_at        (t/instant)}
                   :model/TaskHistory      _th             {:task         "channel-send"
                                                            :run_id       run-id
                                                            :status       :success
                                                            :started_at   (t/instant)
                                                            :ended_at     (t/instant)
                                                            :task_details {:channel_type "channel/email"
                                                                           :notification_id (:id n-sent)}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")
            by-id          (into {} (map (juxt :id identity) data))]
        (is (=? {:last_send {:at     some?
                             :status "successful"
                             :error  nil}}
                (by-id n-sent)))
        (is (=? {:last_send nil}
                (by-id n-unsent)))))))

(deftest last-send-failing-channel-send-surfaces-status-and-error-test
  (testing ":last_send on the list shows :failing status AND the channel-send error message
   when the latest send-tick had a channel failure"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _th           {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:message         "SMTP connection refused"
                                                                         :channel_type    "channel/email"
                                                                         :notification_id nid}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_send {:at     some?
                             :status "failing"
                             :error  "SMTP connection refused"}}
                (find-row-by-id data nid)))))))

(deftest last-check-shape-success-test
  (testing ":last_check on a successful run reports status=successful with no error"
    (mt/with-temp [:model/Card             {card-id :id}    {:archived false}
                   :model/NotificationCard {nc :id}         {:card_id card-id}
                   :model/Notification     {nid :id}        {:payload_type :notification/card
                                                             :payload_id   nc
                                                             :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          _run             {:run_type        :alert
                                                             :entity_type     :card
                                                             :entity_id       card-id
                                                             :notification_id nid
                                                             :status          :success
                                                             :started_at      (t/instant)
                                                             :ended_at        (t/instant)}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check {:at     some?
                              :status "successful"
                              :error  nil}}
                (find-row-by-id data nid)))))))

(deftest last-check-shape-failing-includes-error-test
  (testing ":last_check on a failed run reports status=failing and pulls the error from task_history"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _th           {:task         "notification-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:message "SMTP host unreachable"}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check {:at     some?
                              :status "failing"
                              :error  "SMTP host unreachable"}}
                (find-row-by-id data nid)))))))

(deftest last-send-shape-failing-includes-error-test
  (testing ":last_send on the list endpoint surfaces the channel-send error message (not just status=failing)"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   ;; Outer notification-send succeeded; only the channel-send failed.
                   :model/TaskHistory      _ns-th        {:task         "notification-send"
                                                          :run_id       run-id
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:notification_id nid}}
                   :model/TaskHistory      _cs-th        {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:status        :failed
                                                                         :message       "Slack token invalid"
                                                                         :original-info {:channel_type    "channel/slack"
                                                                                         :notification_id nid}}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_send {:at     some?
                             :status "failing"
                             :error  "Slack token invalid"}}
                (find-row-by-id data nid)))))))

(deftest last-check-abandoned-folds-into-failing-test
  (testing ":abandoned (heartbeat-killed) runs surface as last_check.status=failing"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          _run          {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :abandoned
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check {:status "failing"}}
                (find-row-by-id data nid)))
        (testing "abandoned runs have no task_history message, so we synthesize a reason"
          (is (re-find #"abandoned"
                       (get-in (find-row-by-id data nid) [:last_check :error]))))))))

(deftest last-check-skips-in-flight-runs-test
  (testing "an :started in-flight run is invisible to the admin list — last_check stays nil"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          _run          {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :started
                                                          :started_at      (t/instant)}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check nil
                 :last_send  nil}
                (find-row-by-id data nid)))))))

(deftest list-attributes-run-per-notification-no-bleed-test
  (testing "a run is shown only on the notification it was stamped for, never bled onto a sibling
   notification that shares the same card (the original bug)"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc-ran :id}  {:card_id card-id}
                   :model/NotificationCard {nc-idle :id} {:card_id card-id}
                   :model/Notification     {ran :id}     {:payload_type :notification/card
                                                          :payload_id   nc-ran
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     {idle :id}    {:payload_type :notification/card
                                                          :payload_id   nc-idle
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          _run          {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id ran
                                                          :status          :success
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")
            by-id          (into {} (map (juxt :id identity) data))]
        (is (=? {:last_check {:status "successful"}} (by-id ran))
            "the run shows on the notification it was stamped for")
        (is (=? {:last_check nil} (by-id idle))
            "the sibling notification on the same card, with no run of its own, shows no last_check")))))

(deftest list-and-detail-agree-on-last-check-test
  (testing "the list and the detail endpoint report the SAME last_check for a notification, including
   an abandoned run — which is attributed via task_run.notification_id and has no task_history
   (this is the list-vs-detail mismatch from the bug report)"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          _run          {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :abandoned
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}]
      (let [list-row (-> (mt/user-http-request :crowberto :get 200 "notification/admin")
                         :data (find-row-by-id nid))
            detail   (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))]
        (is (=? {:last_check {:status "failing"}} list-row))
        (is (= (:last_check list-row) (:last_check detail))
            "list and detail must agree on last_check, abandoned run included")))))

(deftest response-shape-includes-pagination-metadata-test
  (testing "GET / response shape echoes the {:data :total :limit :offset} pagination convention"
    (let [resp (mt/user-http-request :crowberto :get 200 "notification/admin")]
      (is (contains? resp :data))
      (is (contains? resp :total))
      (is (contains? resp :limit))
      (is (contains? resp :offset)))))

(deftest response-shape-does-not-include-counts-test
  (testing "GET / response does NOT include a :counts key — tab counts are dropped"
    (let [resp (mt/user-http-request :crowberto :get 200 "notification/admin")]
      (is (not (contains? resp :counts))))))

(deftest filter-by-last-send-status-test
  (testing "?last_send_status=successful|failing filters by the latest channel-send outcome"
    (mt/with-temp [:model/Card             {success-card :id} {:archived false}
                   :model/Card             {fail-card :id}    {:archived false}
                   :model/Card             {no-send-card :id} {:archived false}
                   :model/NotificationCard {nc-success :id}   {:card_id success-card}
                   :model/NotificationCard {nc-fail :id}      {:card_id fail-card}
                   :model/NotificationCard {nc-no-send :id}   {:card_id no-send-card}
                   :model/Notification     success-n          {:payload_type :notification/card
                                                               :payload_id   nc-success
                                                               :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     fail-n             {:payload_type :notification/card
                                                               :payload_id   nc-fail
                                                               :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     no-send-n          {:payload_type :notification/card
                                                               :payload_id   nc-no-send
                                                               :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {ok-run :id}       {:run_type        :alert
                                                               :entity_type     :card
                                                               :entity_id       success-card
                                                               :notification_id (:id success-n)
                                                               :status          :success
                                                               :started_at      (t/instant)
                                                               :ended_at        (t/instant)}
                   :model/TaskRun          {fail-run :id}     {:run_type        :alert
                                                               :entity_type     :card
                                                               :entity_id       fail-card
                                                               :notification_id (:id fail-n)
                                                               :status          :failed
                                                               :started_at      (t/instant)
                                                               :ended_at        (t/instant)}
                   ;; channel-send rows drive the filter
                   :model/TaskHistory      _ok-th             {:task         "channel-send"
                                                               :run_id       ok-run
                                                               :status       :success
                                                               :started_at   (t/instant)
                                                               :ended_at     (t/instant)
                                                               :task_details {:channel_type "channel/email"}}
                   :model/TaskHistory      _fail-th           {:task         "channel-send"
                                                               :run_id       fail-run
                                                               :status       :failed
                                                               :started_at   (t/instant)
                                                               :ended_at     (t/instant)
                                                               :task_details {:channel_type "channel/email"}}]
      (testing "successful"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :last_send_status "successful")
              ids            (set (map :id data))]
          (is (contains? ids (:id success-n)))
          (is (not (contains? ids (:id fail-n))))
          (is (not (contains? ids (:id no-send-n))))))
      (testing "failing"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :last_send_status "failing")
              ids            (set (map :id data))]
          (is (contains? ids (:id fail-n)))
          (is (not (contains? ids (:id success-n))))
          (is (not (contains? ids (:id no-send-n)))))))))

(deftest filter-by-last-check-status-test
  (testing "?last_check_status=failing catches run failures the send filter misses (abandoned, query failures)"
    (mt/with-temp [:model/Card             {ok-card :id}         {:archived false}
                   :model/Card             {abandoned-card :id}  {:archived false}
                   :model/Card             {query-fail-card :id} {:archived false}
                   :model/NotificationCard {nc-ok :id}           {:card_id ok-card}
                   :model/NotificationCard {nc-abandoned :id}    {:card_id abandoned-card}
                   :model/NotificationCard {nc-query-fail :id}   {:card_id query-fail-card}
                   :model/Notification     ok-n                  {:payload_type :notification/card
                                                                  :payload_id   nc-ok
                                                                  :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     abandoned-n           {:payload_type :notification/card
                                                                  :payload_id   nc-abandoned
                                                                  :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     query-fail-n          {:payload_type :notification/card
                                                                  :payload_id   nc-query-fail
                                                                  :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {ok-run :id}          {:run_type        :alert
                                                                  :entity_type     :card
                                                                  :entity_id       ok-card
                                                                  :notification_id (:id ok-n)
                                                                  :status          :success
                                                                  :started_at      (t/instant)
                                                                  :ended_at        (t/instant)}
                   ;; heartbeat-killed run that never reached the channel-send step
                   :model/TaskRun          _abandoned-run        {:run_type        :alert
                                                                  :entity_type     :card
                                                                  :entity_id       abandoned-card
                                                                  :notification_id (:id abandoned-n)
                                                                  :status          :abandoned
                                                                  :started_at      (t/instant)
                                                                  :ended_at        (t/instant)}
                   ;; query failure: notification-send failed, never produced a channel-send row
                   :model/TaskRun          {qf-run :id}          {:run_type        :alert
                                                                  :entity_type     :card
                                                                  :entity_id       query-fail-card
                                                                  :notification_id (:id query-fail-n)
                                                                  :status          :failed
                                                                  :started_at      (t/instant)
                                                                  :ended_at        (t/instant)}
                   :model/TaskHistory      _ok-th                {:task         "channel-send"
                                                                  :run_id       ok-run
                                                                  :status       :success
                                                                  :started_at   (t/instant)
                                                                  :ended_at     (t/instant)
                                                                  :task_details {:channel_type "channel/email"}}
                   :model/TaskHistory      _qf-th                {:task         "notification-send"
                                                                  :run_id       qf-run
                                                                  :status       :failed
                                                                  :started_at   (t/instant)
                                                                  :ended_at     (t/instant)
                                                                  :task_details {:message "Query timed out"}}]
      (testing "last_check_status=failing surfaces abandoned + query failures"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :last_check_status "failing")
              ids            (set (map :id data))]
          (is (contains? ids (:id abandoned-n)))
          (is (contains? ids (:id query-fail-n)))
          (is (not (contains? ids (:id ok-n))))))
      (testing "last_send_status=failing misses them — no channel-send failure exists (the original bug)"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :last_send_status "failing")
              ids            (set (map :id data))]
          (is (not (contains? ids (:id abandoned-n))))
          (is (not (contains? ids (:id query-fail-n))))))
      (testing "last_check_status=successful matches only the healthy run"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :last_check_status "successful")
              ids            (set (map :id data))]
          (is (contains? ids (:id ok-n)))
          (is (not (contains? ids (:id abandoned-n))))
          (is (not (contains? ids (:id query-fail-n)))))))))

(deftest filter-compound-test
  (testing "multiple filters AND together (active + owner_id)"
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
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :active true
                                                 :creator_id target-user)
            ids            (set (map :id data))]
        (is (contains? ids (:id matching)))
        (is (not (contains? ids (:id wrong-active))))
        (is (not (contains? ids (:id wrong-owner))))))))

;; ---------------------------------------------------------------------------------------------
;; Sort
;; ---------------------------------------------------------------------------------------------

(deftest sort-by-last-send-test
  (testing "?sort_column=last_send orders rows by the latest channel-send started_at"
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
                   :model/TaskRun          {old-run :id}    {:run_type        :alert
                                                             :entity_type     :card
                                                             :entity_id       card-old
                                                             :notification_id old-id
                                                             :status          :success
                                                             :started_at      (t/minus (t/instant) (t/days 5))
                                                             :ended_at        (t/minus (t/instant) (t/days 5))}
                   :model/TaskRun          {new-run :id}    {:run_type        :alert
                                                             :entity_type     :card
                                                             :entity_id       card-new
                                                             :notification_id new-id
                                                             :status          :success
                                                             :started_at      (t/instant)
                                                             :ended_at        (t/instant)}
                   :model/TaskHistory      _old-th          {:task         "channel-send"
                                                             :run_id       old-run
                                                             :status       :success
                                                             :started_at   (t/minus (t/instant) (t/days 5))
                                                             :ended_at     (t/minus (t/instant) (t/days 5))
                                                             :task_details {:channel_type "channel/email"}}
                   :model/TaskHistory      _new-th          {:task         "channel-send"
                                                             :run_id       new-run
                                                             :status       :success
                                                             :started_at   (t/instant)
                                                             :ended_at     (t/instant)
                                                             :task_details {:channel_type "channel/email"}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :sort_column "last_send"
                                                 :sort_direction "desc")
            ids            (->> data (map :id) (filter #{old-id new-id never-id}) vec)]
        (is (= [new-id old-id never-id] ids)
            "newest-sent first, oldest-sent next, never-sent last (desc + null-trailing)")))))

(deftest sort-by-updated-at-test
  (testing "?sort_column=updated_at orders rows by notification.updated_at"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :sort_column "updated_at"
                                                   :sort_direction "desc")
              seen           (->> data (map :id) (filter #{(:id n-older) (:id n-newer)}) vec)]
          (is (= [(:id n-newer) (:id n-older)] seen))))
      (testing "asc puts older first"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :sort_column "updated_at"
                                                   :sort_direction "asc")
              seen           (->> data (map :id) (filter #{(:id n-older) (:id n-newer)}) vec)]
          (is (= [(:id n-older) (:id n-newer)] seen)))))))

(deftest sort-rejects-unknown-column-test
  (testing "?sort_column=<unknown> is rejected with 400 by the malli enum"
    (mt/user-http-request :crowberto :get 400 "notification/admin"
                          :sort_column "name; DROP TABLE notification")))

(deftest default-sort-is-last-send-test
  (testing "default sort_column is :last_send (null-trailing desc), driven by channel-send rows"
    (mt/with-temp [:model/Card             {card-sent :id}   {:archived false}
                   :model/Card             {card-unsent :id} {:archived false}
                   :model/NotificationCard {nc-sent :id}     {:card_id card-sent}
                   :model/NotificationCard {nc-unsent :id}   {:card_id card-unsent}
                   :model/Notification     {sent-id :id}     {:payload_type :notification/card
                                                              :payload_id   nc-sent
                                                              :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     {unsent-id :id}   {:payload_type :notification/card
                                                              :payload_id   nc-unsent
                                                              :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}      {:run_type        :alert
                                                              :entity_type     :card
                                                              :entity_id       card-sent
                                                              :notification_id sent-id
                                                              :status          :success
                                                              :started_at      (t/instant)
                                                              :ended_at        (t/instant)}
                   :model/TaskHistory      _th               {:task         "channel-send"
                                                              :run_id       run-id
                                                              :status       :success
                                                              :started_at   (t/instant)
                                                              :ended_at     (t/instant)
                                                              :task_details {:channel_type "channel/email"}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")
            ids            (->> data (map :id) (filter #{sent-id unsent-id}) vec)]
        (is (= [sent-id unsent-id] ids)
            "notification with a last_send appears before the never-sent one under the default sort")))))

;; ---------------------------------------------------------------------------------------------
;; POST /bulk
;; ---------------------------------------------------------------------------------------------

(deftest bulk-archive-test
  (testing "POST /bulk with action=archive flips :active to false for each id"
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
      (mt/with-premium-features #{:audit-app}
        (let [resp (mt/user-http-request :crowberto :post 200 "notification/admin/bulk"
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

(deftest bulk-change-owner-test
  (testing "POST /bulk with action=change-creator sets :creator_id to creator_id for each id"
    (mt/with-temp [:model/User             {new-owner :id} {}
                   :model/Card             {card-id :id}   {}
                   :model/NotificationCard {nc1 :id}       {:card_id card-id}
                   :model/Notification     n1              {:payload_type :notification/card
                                                            :payload_id   nc1
                                                            :creator_id   (mt/user->id :rasta)}]
      (mt/user-http-request :crowberto :post 200 "notification/admin/bulk"
                            {:notification_ids [(:id n1)]
                             :action           "change-creator"
                             :creator_id       new-owner})
      (is (= new-owner (t2/select-one-fn :creator_id :model/Notification (:id n1)))))))

(deftest bulk-change-owner-requires-owner-id-test
  (testing "POST /bulk with action=change-creator and no creator_id returns 400"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc1 :id}     {:card_id card-id}
                   :model/Notification     n1            {:payload_type :notification/card
                                                          :payload_id   nc1
                                                          :creator_id   (mt/user->id :crowberto)}]
      (mt/user-http-request :crowberto :post 400 "notification/admin/bulk"
                            {:notification_ids [(:id n1)]
                             :action           "change-creator"}))))

;; ---------------------------------------------------------------------------------------------
;; Auth + feature-flag gating for POST /bulk (mirrors the GET triad above)
;; ---------------------------------------------------------------------------------------------
(deftest bulk-requires-superuser-test
  (testing "POST /api/notification/admin/bulk returns 403 for non-superuser"
    (mt/user-http-request :rasta :post 403 "notification/admin/bulk"
                          {:notification_ids [1]
                           :action           "archive"})))

(deftest bulk-happy-path-test
  (testing "POST /api/notification/admin/bulk returns 200 + :updated for superuser"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     n             {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :active       true
                                                          :creator_id   (mt/user->id :crowberto)}]
      (let [resp (mt/user-http-request :crowberto :post 200 "notification/admin/bulk"
                                       {:notification_ids [(:id n)]
                                        :action           "archive"})]
        (is (= 1 (:updated resp)))))))

;; ---------------------------------------------------------------------------------------------
;; GET /:id detail endpoint
;; ---------------------------------------------------------------------------------------------

(deftest detail-returns-notification-with-run-summaries-test
  (testing "GET /:id returns the hydrated notification with :last_check / :last_send slots and creator_id"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}]
      (is (=? {:id        nid
               :creator_id (mt/user->id :crowberto)
               :last_check any?
               :last_send  any?}
              (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid)))))))

(deftest detail-404-for-missing-id-test
  (testing "GET /:id returns 404 for a non-existent notification id"
    (let [max-id (or (t2/select-one-fn :id :model/Notification {:order-by [[:id :desc]]}) 0)]
      (mt/user-http-request :crowberto :get 404
                            (str "notification/admin/" (+ max-id 100000))))))

(deftest detail-404-for-non-card-notification-test
  (testing "GET /:id returns 404 when the notification exists but isn't a :notification/card"
    (mt/with-temp [:model/Notification {nid :id} {:payload_type :notification/system-event
                                                  :creator_id   (mt/user->id :crowberto)}]
      (mt/user-http-request :crowberto :get 404 (str "notification/admin/" nid)))))

(deftest detail-requires-superuser-test
  (testing "GET /:id returns 403 for a non-superuser"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}]
      (mt/user-http-request :rasta :get 403 (str "notification/admin/" nid)))))

;; ---------------------------------------------------------------------------------------------
;; B. Ownerless filter
;; ---------------------------------------------------------------------------------------------

(deftest filter-by-ownerless-true-test
  (testing "?creatorless=true includes notifications with a deactivated creator and excludes active owners"
    (mt/with-temp [:model/User             {active-user :id}   {:is_active true}
                   :model/User             {deact-user :id}    {:is_active false}
                   :model/Card             {card-id :id}       {}
                   :model/NotificationCard {nc1 :id}           {:card_id card-id}
                   :model/NotificationCard {nc2 :id}           {:card_id card-id}
                   :model/Notification     active-owner-n      {:payload_type :notification/card
                                                                :payload_id   nc1
                                                                :creator_id   active-user}
                   :model/Notification     deact-owner-n       {:payload_type :notification/card
                                                                :payload_id   nc2
                                                                :creator_id   deact-user}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :creatorless true)
            ids            (set (map :id data))]
        (is (contains? ids (:id deact-owner-n))
            "deactivated creator = ownerless")
        (is (not (contains? ids (:id active-owner-n)))
            "active owner is excluded")))))

(deftest filter-by-ownerless-false-test
  (testing "?creatorless=false includes only notifications with an active owner"
    (mt/with-temp [:model/User             {active-user :id}    {:is_active true}
                   :model/User             {deact-user :id}     {:is_active false}
                   :model/Card             {card-id :id}        {}
                   :model/NotificationCard {nc1 :id}            {:card_id card-id}
                   :model/NotificationCard {nc2 :id}            {:card_id card-id}
                   :model/Notification     active-owner-n       {:payload_type :notification/card
                                                                 :payload_id   nc1
                                                                 :creator_id   active-user}
                   :model/Notification     deact-owner-n        {:payload_type :notification/card
                                                                 :payload_id   nc2
                                                                 :creator_id   deact-user}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :creatorless false)
            ids            (set (map :id data))]
        (is (contains? ids (:id active-owner-n))
            "active owner is included")
        (is (not (contains? ids (:id deact-owner-n)))
            "deactivated owner is excluded")))))

;; ---------------------------------------------------------------------------------------------
;; C. Multi-value channel filter
;; ---------------------------------------------------------------------------------------------

(deftest filter-by-channel-multi-value-test
  (testing "?channel= accepts multiple values (OR semantics across channel types)"
    (mt/with-temp [:model/Card                {card-id :id}    {}
                   :model/NotificationCard    {nc1 :id}        {:card_id card-id}
                   :model/NotificationCard    {nc2 :id}        {:card_id card-id}
                   :model/NotificationCard    {nc3 :id}        {:card_id card-id}
                   :model/Notification        email-notif      {:payload_type :notification/card
                                                                :payload_id   nc1
                                                                :creator_id   (mt/user->id :crowberto)}
                   :model/Notification        slack-notif      {:payload_type :notification/card
                                                                :payload_id   nc2
                                                                :creator_id   (mt/user->id :crowberto)}
                   :model/Notification        other-notif      {:payload_type :notification/card
                                                                :payload_id   nc3
                                                                :creator_id   (mt/user->id :crowberto)}
                   :model/NotificationHandler _email-handler   {:notification_id (:id email-notif)
                                                                :channel_type    :channel/email}
                   :model/NotificationHandler _slack-handler   {:notification_id (:id slack-notif)
                                                                :channel_type    :channel/slack}]
      (testing "single channel still works"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :channel "channel/email")
              ids            (set (map :id data))]
          (is (contains? ids (:id email-notif)))
          (is (not (contains? ids (:id slack-notif))))
          (is (not (contains? ids (:id other-notif))))))
      (testing "multiple channels (vector) returns union"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :channel ["channel/email" "channel/slack"])
              ids            (set (map :id data))]
          (is (contains? ids (:id email-notif)))
          (is (contains? ids (:id slack-notif)))
          (is (not (contains? ids (:id other-notif)))))))))

;; ---------------------------------------------------------------------------------------------
;; D. New sort columns + default sort
;; ---------------------------------------------------------------------------------------------

(deftest sort-by-last-check-test
  (testing "?sort_column=last_check orders rows by the latest task_run started_at"
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
                   :model/TaskRun          _old-run         {:run_type        :alert
                                                             :entity_type     :card
                                                             :entity_id       card-old
                                                             :notification_id old-id
                                                             :status          :failed
                                                             :started_at      (t/minus (t/instant) (t/days 5))
                                                             :ended_at        (t/minus (t/instant) (t/days 5))}
                   :model/TaskRun          _new-run         {:run_type        :alert
                                                             :entity_type     :card
                                                             :entity_id       card-new
                                                             :notification_id new-id
                                                             :status          :failed
                                                             :started_at      (t/instant)
                                                             :ended_at        (t/instant)}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                 :sort_column "last_check"
                                                 :sort_direction "desc")
            ids            (->> data (map :id) (filter #{old-id new-id never-id}) vec)]
        (is (= [new-id old-id never-id] ids)
            "newest-checked first, oldest-checked next, never-checked last (nulls trailing)")))))

(deftest sort-by-id-test
  (testing "?sort_column=id orders rows by notification.id"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc1 :id}     {:card_id card-id}
                   :model/NotificationCard {nc2 :id}     {:card_id card-id}
                   :model/Notification     {n1 :id}      {:payload_type :notification/card
                                                          :payload_id   nc1
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     {n2 :id}      {:payload_type :notification/card
                                                          :payload_id   nc2
                                                          :creator_id   (mt/user->id :crowberto)}]
      (testing "asc puts smaller id first"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :sort_column "id"
                                                   :sort_direction "asc")
              seen           (->> data (map :id) (filter #{n1 n2}) vec)]
          (is (= [(min n1 n2) (max n1 n2)] seen))))
      (testing "desc puts larger id first"
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin"
                                                   :sort_column "id"
                                                   :sort_direction "desc")
              seen           (->> data (map :id) (filter #{n1 n2}) vec)]
          (is (= [(max n1 n2) (min n1 n2)] seen)))))))

;; ---------------------------------------------------------------------------------------------
;; E. check_history / send_history in the detail endpoint
;; ---------------------------------------------------------------------------------------------

(deftest detail-includes-check-history-test
  (testing "GET /:id includes :check_history — up to 10 most-recent terminal runs for THIS notification, newest first"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {r1 :id}      {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :success
                                                          :started_at      (t/minus (t/instant) (t/hours 2))
                                                          :ended_at        (t/minus (t/instant) (t/hours 2))}
                   :model/TaskRun          {r2 :id}      {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/minus (t/instant) (t/hours 1))
                                                          :ended_at        (t/minus (t/instant) (t/hours 1))}
                   ;; notification-send rows with notification_id — required for per-notification filter
                   :model/TaskHistory      _th1          {:task         "notification-send"
                                                          :run_id       r1
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 2))
                                                          :ended_at     (t/minus (t/instant) (t/hours 2))
                                                          :task_details {:notification_id nid}}
                   :model/TaskHistory      _th2          {:task         "notification-send"
                                                          :run_id       r2
                                                          :status       :failed
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:notification_id nid
                                                                         :message         "Connection refused"}}]
      (let [resp           (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))
            check-history  (:check_history resp)]
        (is (sequential? check-history))
        (is (= 2 (count check-history))
            "two terminal runs for this notification, newest first")
        (is (=? {:status "failing" :error "Connection refused"} (first check-history))
            "most-recent (the failed one) is first")
        (is (=? {:status "successful" :error nil} (second check-history))
            "older successful run is second")))))

(deftest detail-includes-send-history-test
  (testing "GET /:id includes :send_history — per-tick rollup, newest tick first, with :channels breakdown"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-ok :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :success
                                                          :started_at      (t/minus (t/instant) (t/hours 2))
                                                          :ended_at        (t/minus (t/instant) (t/hours 2))}
                   :model/TaskRun          {run-fail :id} {:run_type        :alert
                                                           :entity_type     :card
                                                           :entity_id       card-id
                                                           :notification_id nid
                                                           :status          :failed
                                                           :started_at      (t/minus (t/instant) (t/hours 1))
                                                           :ended_at        (t/minus (t/instant) (t/hours 1))}
                   :model/TaskHistory      _ok-th        {:task         "channel-send"
                                                          :run_id       run-ok
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 2))
                                                          :ended_at     (t/minus (t/instant) (t/hours 2))
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id nid}}
                   :model/TaskHistory      _fail-th      {:task         "channel-send"
                                                          :run_id       run-fail
                                                          :status       :failed
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:channel_type    "channel/slack"
                                                                         :message         "Slack token invalid"
                                                                         :notification_id nid}}]
      (let [resp         (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))
            send-history (:send_history resp)]
        (is (sequential? send-history))
        (is (= 2 (count send-history))
            "two ticks (one channel-send each)")
        (testing "most-recent tick (failed slack) is first"
          (is (=? {:status   "failing"
                   :error    "Slack token invalid"
                   :channels [{:channel_type "channel/slack"
                               :status       "failing"
                               :error        "Slack token invalid"}]}
                  (first send-history))))
        (testing "older successful email tick is second"
          (is (=? {:status   "successful"
                   :error    nil
                   :channels [{:channel_type "channel/email"
                               :status       "successful"
                               :error        nil}]}
                  (second send-history))))))))

(deftest detail-surfaces-history-when-task-details-failure-wrapped-test
  (testing "GET /:id surfaces last_check/last_send/error for ticks whose task_details is wrapped by with-task-history's failure handler"
    ;; Regression: `metabase.task_history/do-with-task-history` rewrites task_details on exception as
    ;; `{:status :failed :message ... :original-info <caller-task_details>}`. The per-notification
    ;; filter has to look in both the top level (success rows) and `:original-info` (failure rows),
    ;; or failing ticks silently disappear from the detail histories and `last_check`/`last_send`
    ;; come back nil — even though the list endpoint shows the notification as failing.
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   ;; notification-send: failure-wrapped (notification_id only under :original-info)
                   :model/TaskHistory      _ns-th        {:task         "notification-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:status        :failed
                                                                         :message       "Notification handler exploded"
                                                                         :original-info {:notification_id nid}}}
                   ;; channel-send: failure-wrapped (channel_type + notification_id only under :original-info)
                   :model/TaskHistory      _cs-th        {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:status        :failed
                                                                         :message       "Slack token invalid"
                                                                         :original-info {:channel_type    "channel/slack"
                                                                                         :notification_id nid}}}]
      (let [resp (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))]
        (testing "check_history surfaces the failed notification-send tick + its error"
          (is (=? [{:status "failing" :error "Notification handler exploded"}]
                  (:check_history resp))))
        (testing "send_history surfaces the failed channel-send tick + its error and channel type"
          (is (=? [{:status   "failing"
                    :error    "Slack token invalid"
                    :channels [{:channel_type "channel/slack"
                                :status       "failing"
                                :error        "Slack token invalid"}]}]
                  (:send_history resp))))
        (testing "last_check and last_send are derived from those histories"
          (is (=? {:status "failing" :error "Notification handler exploded"}
                  (:last_check resp)))
          (is (=? {:status "failing" :error "Slack token invalid"}
                  (:last_send resp))))))))

(deftest list-last-check-surfaces-channel-error-when-outer-send-succeeded-test
  (testing "list endpoint last_check.error surfaces the channel-send error when the outer notification-send succeeded but a channel failed"
    ;; Regression: `complete-task-run!` derives task_run.status as :failed when ANY child task is
    ;; not :success — so a tick where notification-send succeeded but a channel-send failed has
    ;; task_run.status = :failed. `error-by-run-id` must surface the channel-send's message in
    ;; that case (no notification-send failure row exists). If it filtered to notification-send
    ;; only, last_check would show status:failing error:nil for the Failing tab.
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   ;; Outer notification-send: succeeded
                   :model/TaskHistory      _ns-th        {:task         "notification-send"
                                                          :run_id       run-id
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:notification_id nid}}
                   ;; Channel-send: failed (failure-wrapped task_details)
                   :model/TaskHistory      _cs-th        {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:status        :failed
                                                                         :message       "Slack token invalid"
                                                                         :original-info {:channel_type    "channel/slack"
                                                                                         :notification_id nid}}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check {:status "failing" :error "Slack token invalid"}}
                (find-row-by-id data nid)))))))

(deftest list-last-check-prefers-outer-notification-send-error-test
  (testing "when both notification-send and channel-send failed in one run, last_check.error prefers the outer notification-send message"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :failed
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _ns-th        {:task         "notification-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:message "Payload generation failed"}}
                   :model/TaskHistory      _cs-th        {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:message "Slack token invalid"}}]
      (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "notification/admin")]
        (is (=? {:last_check {:status "failing" :error "Payload generation failed"}}
                (find-row-by-id data nid))
            "outer notification-send error wins over inner channel-send error")))))

(deftest detail-send-history-multi-channel-tick-test
  (testing "GET /:id: one tick with email+slack both succeeding → ONE send entry, status successful"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :success
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _email-th     {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id nid}}
                   :model/TaskHistory      _slack-th     {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:channel_type    "channel/slack"
                                                                         :notification_id nid}}]
      (let [resp         (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))
            send-history (:send_history resp)]
        (is (= 1 (count send-history))
            "two channels in the same tick collapse to ONE send entry")
        (is (=? {:status   "successful"
                 :error    nil
                 :channels [{:channel_type "channel/email" :status "successful"}
                            {:channel_type "channel/slack" :status "successful"}]}
                (first send-history)))))))

(deftest detail-send-history-mixed-channels-test
  (testing "GET /:id: one tick with email success + slack failure → failing, :channels shows both"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/TaskRun          {run-id :id}  {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id nid
                                                          :status          :success
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _email-th     {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id nid}}
                   :model/TaskHistory      _slack-th     {:task         "channel-send"
                                                          :run_id       run-id
                                                          :status       :failed
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:channel_type    "channel/slack"
                                                                         :message         "Rate limited"
                                                                         :notification_id nid}}]
      (let [resp  (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))
            entry (first (:send_history resp))]
        (is (= 1 (count (:send_history resp)))
            "two channels in the same tick → ONE send entry")
        (is (=? {:status "failing" :error "Rate limited"} entry))
        (is (= 2 (count (:channels entry)))
            "channels breakdown has one entry per channel-send row")
        (let [by-type (into {} (map (juxt :channel_type identity) (:channels entry)))]
          (is (=? {:status "successful"} (get by-type "channel/email")))
          (is (=? {:status "failing" :error "Rate limited"} (get by-type "channel/slack"))))))))

(deftest detail-check-history-empty-when-no-runs-test
  (testing "GET /:id returns :check_history as empty vector when no terminal runs exist"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}]
      (let [resp (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))]
        (is (= [] (:check_history resp)))
        (is (= [] (:send_history resp)))))))

(deftest detail-check-history-respects-limit-test
  (testing "GET /:id returns at most 10 runs in :check_history"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}]
      ;; create 12 runs, each with a matching notification-send row so the per-notification filter passes
      (doseq [i (range 12)]
        (let [run-id (t2/insert-returning-pk! :model/TaskRun
                                              {:run_type        "alert"
                                               :entity_type     "card"
                                               :entity_id       card-id
                                               :notification_id nid
                                               :status          "success"
                                               :started_at   (t/minus (t/instant) (t/hours (inc i)))
                                               :ended_at     (t/minus (t/instant) (t/hours (inc i)))
                                               :process_uuid "test"})]
          (t2/insert! :model/TaskHistory
                      {:task         "notification-send"
                       :run_id       run-id
                       :status       "success"
                       :started_at   (t/minus (t/instant) (t/hours (inc i)))
                       :ended_at     (t/minus (t/instant) (t/hours (inc i)))
                       :task_details (str "{\"notification_id\":" nid "}")})))
      (let [resp (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))]
        (is (<= (count (:check_history resp)) 10))))))

;; ---------------------------------------------------------------------------------------------
;; F. creator_id (owner) cannot be reassigned via the public PUT endpoint — only via POST /bulk
;; ---------------------------------------------------------------------------------------------

(deftest put-creator-id-superuser-only-test
  (testing "PUT /api/notification/:id: superusers can reassign owner; non-superusers get a 400"
    (mt/with-temp [:model/Card             {card-id :id} {}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :rasta)}]
      (testing "non-superuser (the current owner) is forbidden from reassigning (403 from mi/can-update?)"
        (let [notification (mt/user-http-request :rasta :get 200 (format "notification/%d" nid))]
          (mt/user-http-request :rasta :put 403 (format "notification/%d" nid)
                                (assoc notification :creator_id (mt/user->id :lucky)))
          (is (= (mt/user->id :rasta)
                 (t2/select-one-fn :creator_id :model/Notification nid))
              "owner unchanged after non-superuser attempt")))
      (testing "superuser can reassign owner"
        (let [notification (mt/user-http-request :crowberto :get 200 (format "notification/%d" nid))]
          (mt/user-http-request :crowberto :put 200 (format "notification/%d" nid)
                                (assoc notification :creator_id (mt/user->id :lucky)))
          (is (= (mt/user->id :lucky)
                 (t2/select-one-fn :creator_id :model/Notification nid))
              "owner reassigned after superuser PUT"))))))

;; ---------------------------------------------------------------------------------------------
;; Per-notification isolation — two notifications on the same card
;; ---------------------------------------------------------------------------------------------

(deftest detail-per-notification-isolation-test
  (testing "Two notifications on the same card each see only their own ticks in check_history and send_history"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   ;; Two distinct notifications sharing the same card
                   :model/Notification     {n1 :id}      {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     {n2 :id}      {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   ;; tick-A: fires for n1 only
                   :model/TaskRun          {run-a :id}   {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id n1
                                                          :status          :success
                                                          :started_at      (t/minus (t/instant) (t/hours 2))
                                                          :ended_at        (t/minus (t/instant) (t/hours 2))}
                   :model/TaskHistory      _ns-a         {:task         "notification-send"
                                                          :run_id       run-a
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 2))
                                                          :ended_at     (t/minus (t/instant) (t/hours 2))
                                                          :task_details {:notification_id n1}}
                   :model/TaskHistory      _cs-a         {:task         "channel-send"
                                                          :run_id       run-a
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 2))
                                                          :ended_at     (t/minus (t/instant) (t/hours 2))
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id n1}}
                   ;; tick-B: fires for n2 only
                   :model/TaskRun          {run-b :id}   {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id n2
                                                          :status          :success
                                                          :started_at      (t/minus (t/instant) (t/hours 1))
                                                          :ended_at        (t/minus (t/instant) (t/hours 1))}
                   :model/TaskHistory      _ns-b         {:task         "notification-send"
                                                          :run_id       run-b
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:notification_id n2}}
                   :model/TaskHistory      _cs-b         {:task         "channel-send"
                                                          :run_id       run-b
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:channel_type    "channel/slack"
                                                                         :notification_id n2}}]
      ;; suppress unused-var warnings
      (let [_ [run-a run-b]]
        (testing "detail for n1 sees only tick-A in check_history and send_history"
          (let [resp-n1 (mt/user-http-request :crowberto :get 200 (str "notification/admin/" n1))]
            (is (= 1 (count (:check_history resp-n1)))
                "n1 check_history has exactly 1 tick (tick-A)")
            (is (= 1 (count (:send_history resp-n1)))
                "n1 send_history has exactly 1 tick (tick-A)")
            (is (=? {:channels [{:channel_type "channel/email"}]}
                    (first (:send_history resp-n1))))))
        (testing "detail for n2 sees only tick-B in check_history and send_history"
          (let [resp-n2 (mt/user-http-request :crowberto :get 200 (str "notification/admin/" n2))]
            (is (= 1 (count (:check_history resp-n2)))
                "n2 check_history has exactly 1 tick (tick-B)")
            (is (= 1 (count (:send_history resp-n2)))
                "n2 send_history has exactly 1 tick (tick-B)")
            (is (=? {:channels [{:channel_type "channel/slack"}]}
                    (first (:send_history resp-n2))))))))))

(deftest detail-goal-not-met-tick-absent-from-send-history-test
  (testing "A tick where the goal was not met (no channel-send rows) appears in check_history but NOT send_history"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {nid :id}     {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   ;; tick-1: goal not met — notification-send row exists but no channel-send
                   :model/TaskRun          {run-skip :id} {:run_type        :alert
                                                           :entity_type     :card
                                                           :entity_id       card-id
                                                           :notification_id nid
                                                           :status          :success
                                                           :started_at      (t/minus (t/instant) (t/hours 2))
                                                           :ended_at        (t/minus (t/instant) (t/hours 2))}
                   :model/TaskHistory      _ns-skip      {:task         "notification-send"
                                                          :run_id       run-skip
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 2))
                                                          :ended_at     (t/minus (t/instant) (t/hours 2))
                                                          :task_details {:notification_id nid
                                                                         :skip_reason     "goal-not-met"}}
                   ;; tick-2: goal met — has channel-send
                   :model/TaskRun          {run-sent :id} {:run_type        :alert
                                                           :entity_type     :card
                                                           :entity_id       card-id
                                                           :notification_id nid
                                                           :status          :success
                                                           :started_at      (t/minus (t/instant) (t/hours 1))
                                                           :ended_at        (t/minus (t/instant) (t/hours 1))}
                   :model/TaskHistory      _ns-sent      {:task         "notification-send"
                                                          :run_id       run-sent
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:notification_id nid}}
                   :model/TaskHistory      _cs-sent      {:task         "channel-send"
                                                          :run_id       run-sent
                                                          :status       :success
                                                          :started_at   (t/minus (t/instant) (t/hours 1))
                                                          :ended_at     (t/minus (t/instant) (t/hours 1))
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id nid}}]
      ;; suppress unused-var warnings
      (let [_ [run-skip run-sent]
            resp (mt/user-http-request :crowberto :get 200 (str "notification/admin/" nid))]
        (is (= 2 (count (:check_history resp)))
            "both ticks appear in check_history")
        (is (= 1 (count (:send_history resp)))
            "only the goal-met tick appears in send_history — goal-not-met tick is absent")
        (is (=? {:channels [{:channel_type "channel/email" :status "successful"}]}
                (first (:send_history resp))))))))

(deftest detail-last-check-and-last-send-derived-from-histories-test
  (testing "GET /:id: last_check and last_send are derived per-notification from histories, not from card-level join"
    (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                   :model/NotificationCard {nc :id}      {:card_id card-id}
                   :model/Notification     {n1 :id}      {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   :model/Notification     {n2 :id}      {:payload_type :notification/card
                                                          :payload_id   nc
                                                          :creator_id   (mt/user->id :crowberto)}
                   ;; Only n2 has ever fired
                   :model/TaskRun          {run2 :id}    {:run_type        :alert
                                                          :entity_type     :card
                                                          :entity_id       card-id
                                                          :notification_id n2
                                                          :status          :success
                                                          :started_at      (t/instant)
                                                          :ended_at        (t/instant)}
                   :model/TaskHistory      _ns2          {:task         "notification-send"
                                                          :run_id       run2
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:notification_id n2}}
                   :model/TaskHistory      _cs2          {:task         "channel-send"
                                                          :run_id       run2
                                                          :status       :success
                                                          :started_at   (t/instant)
                                                          :ended_at     (t/instant)
                                                          :task_details {:channel_type    "channel/email"
                                                                         :notification_id n2}}]
      (let [_ run2
            resp-n1 (mt/user-http-request :crowberto :get 200 (str "notification/admin/" n1))]
        (testing "n1 has nil last_check and nil last_send because it has never fired"
          (is (nil? (:last_check resp-n1))
              "n1 last_check is nil — the card-level task_run is for n2 only")
          (is (nil? (:last_send resp-n1))
              "n1 last_send is nil — the channel-send belongs to n2"))))))
