(ns metabase-enterprise.notification-admin.api-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest list-stub-returns-shape-test
  (testing "GET /api/ee/admin/notifications returns :data + :total shape for superuser with :audit-app"
    (mt/with-premium-features #{:audit-app}
      (let [resp (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")]
        (is (contains? resp :data))
        (is (contains? resp :total))
        (is (sequential? (:data resp)))
        (is (integer? (:total resp)))))))

(deftest requires-premium-feature-test
  (testing "GET /api/ee/admin/notifications returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :get 402 "ee/admin/notifications")))))

(deftest requires-superuser-test
  (testing "GET /api/ee/admin/notifications returns 403 for non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :get 403 "ee/admin/notifications"))))

(deftest list-returns-only-card-notifications-test
  (testing "GET /api/ee/admin/notifications only returns :notification/card rows"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}  {}
                     :model/NotificationCard {ncard-id :id} {:card_id card-id}
                     :model/Notification     card-notif    {:payload_type :notification/card
                                                            :payload_id   ncard-id
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     sys-notif     {:payload_type :notification/system-event
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data total]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
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
        (let [resp (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                         :limit 1 :offset 0)]
          (is (= 1 (count (:data resp))))
          (is (>= (:total resp) 2)))
        (let [resp (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                         :limit 100 :offset 0)]
          (is (>= (count (:data resp)) 2)))))))

(deftest filter-by-status-test
  (testing "status=active returns only active notifications (default)"
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
        (testing "default is active-only"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
                ids            (set (map :id data))]
            (is (contains? ids (:id active-notif)))
            (is (not (contains? ids (:id archived-notif))))))
        (testing "status=archived returns only archived"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :status "archived")
                ids            (set (map :id data))]
            (is (not (contains? ids (:id active-notif))))
            (is (contains? ids (:id archived-notif)))))
        (testing "status=all returns both"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :status "all")
                ids            (set (map :id data))]
            (is (contains? ids (:id active-notif)))
            (is (contains? ids (:id archived-notif)))))))))

(deftest filter-by-creator-test
  (testing "creator_id filters to notifications owned by that user"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                   :creator_id user-a)
              ids            (set (map :id data))]
          (is (contains? ids (:id notif-a)))
          (is (not (contains? ids (:id notif-b)))))))))

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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                   :channel "channel/email")
              ids            (set (map :id data))]
          (is (contains? ids (:id email-notif)))
          (is (not (contains? ids (:id slack-notif)))))))))

(deftest filter-by-recipient-email-test
  (testing "recipient_email matches a user recipient by core_user.email"
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
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                   :recipient_email target-email)
              ids            (set (map :id data))]
          (is (contains? ids (:id target-notif)))
          (is (not (contains? ids (:id other-notif)))))))))

(deftest filter-by-recipient-email-raw-value-test
  (testing "recipient_email also matches a raw-value recipient's details.value"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card                  {card-id :id}        {}
                     :model/NotificationCard      {nc1 :id}            {:card_id card-id}
                     :model/NotificationCard      {nc2 :id}            {:card_id card-id}
                     :model/Notification          target-notif         {:payload_type :notification/card
                                                                        :payload_id   nc1
                                                                        :creator_id   (mt/user->id :crowberto)}
                     :model/Notification          other-notif          {:payload_type :notification/card
                                                                        :payload_id   nc2
                                                                        :creator_id   (mt/user->id :crowberto)}
                     :model/NotificationHandler   {target-handler :id} {:notification_id (:id target-notif)
                                                                        :channel_type    :channel/email}
                     :model/NotificationHandler   {other-handler :id}  {:notification_id (:id other-notif)
                                                                        :channel_type    :channel/email}
                     :model/NotificationRecipient _target-r            {:notification_handler_id target-handler
                                                                        :type                    :notification-recipient/raw-value
                                                                        :details                 {:value "external@example.com"}}
                     :model/NotificationRecipient _other-r             {:notification_handler_id other-handler
                                                                        :type                    :notification-recipient/raw-value
                                                                        :details                 {:value "someone-else@example.com"}}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                   :recipient_email "external@example.com")
              ids            (set (map :id data))]
          (is (contains? ids (:id target-notif)))
          (is (not (contains? ids (:id other-notif)))))))))

(defn- find-row-by-id [data id]
  (some #(when (= id (:id %)) %) data))

(deftest health-healthy-test
  (testing "health=:healthy when card exists, creator is active, no failed task_history"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}    {:archived false}
                     :model/NotificationCard {nc :id}         {:card_id card-id}
                     :model/Notification     {nid :id :as _n} {:payload_type :notification/card
                                                               :payload_id   nc
                                                               :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
              row            (find-row-by-id data nid)]
          (is (some? row))
          (is (= "healthy" (:health row))))))))

(deftest health-orphaned-card-test
  (testing "health=:orphaned_card when the associated card is archived"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}    {:archived true}
                     :model/NotificationCard {nc :id}         {:card_id card-id}
                     :model/Notification     {nid :id :as _n} {:payload_type :notification/card
                                                               :payload_id   nc
                                                               :creator_id   (mt/user->id :crowberto)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
              row            (find-row-by-id data nid)]
          (is (some? row))
          (is (= "orphaned_card" (:health row))))))))

(deftest health-orphaned-creator-test
  (testing "health=:orphaned_creator when the creator user is deactivated"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {creator :id}    {:is_active false}
                     :model/Card             {card-id :id}    {:archived false}
                     :model/NotificationCard {nc :id}         {:card_id card-id}
                     :model/Notification     {nid :id :as _n} {:payload_type :notification/card
                                                               :payload_id   nc
                                                               :creator_id   creator}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
              row            (find-row-by-id data nid)]
          (is (some? row))
          (is (= "orphaned_creator" (:health row))))))))

(deftest health-failing-test
  (testing "health=:failing when the latest notification-send task_history row has status=:failed"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}    {:archived false}
                     :model/NotificationCard {nc :id}         {:card_id card-id}
                     :model/Notification     {nid :id :as _n} {:payload_type :notification/card
                                                               :payload_id   nc
                                                               :creator_id   (mt/user->id :crowberto)}
                     :model/TaskHistory      _th              {:task         "notification-send"
                                                               :task_details {:notification_id nid}
                                                               :status       :failed
                                                               :started_at   (t/instant)
                                                               :ended_at     (t/instant)}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
              row            (find-row-by-id data nid)]
          (is (some? row))
          (is (= "failing" (:health row))))))))

(deftest last-sent-at-test
  (testing "last_sent_at is populated from the latest successful task_history, and sort is desc"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id}   {:archived false}
                     :model/NotificationCard {nc1 :id}       {:card_id card-id}
                     :model/NotificationCard {nc2 :id}       {:card_id card-id}
                     :model/NotificationCard {nc3 :id}       {:card_id card-id}
                     :model/Notification     {n-early :id}   {:payload_type :notification/card
                                                              :payload_id   nc1
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     {n-recent :id}  {:payload_type :notification/card
                                                              :payload_id   nc2
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     {n-unsent :id}  {:payload_type :notification/card
                                                              :payload_id   nc3
                                                              :creator_id   (mt/user->id :crowberto)}
                     :model/TaskHistory      _th-early       {:task         "notification-send"
                                                              :task_details {:notification_id n-early}
                                                              :status       :success
                                                              :started_at   (t/instant "2020-01-01T00:00:00Z")
                                                              :ended_at     (t/instant "2020-01-01T00:00:01Z")}
                     :model/TaskHistory      _th-recent      {:task         "notification-send"
                                                              :task_details {:notification_id n-recent}
                                                              :status       :success
                                                              :started_at   (t/instant "2024-01-01T00:00:00Z")
                                                              :ended_at     (t/instant "2024-01-01T00:00:01Z")}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications")
              by-id          (into {} (map (juxt :id identity) data))]
          (is (some? (:last_sent_at (by-id n-early))))
          (is (some? (:last_sent_at (by-id n-recent))))
          (is (nil? (:last_sent_at (by-id n-unsent))))
          (testing "rows are sorted by last_sent_at desc, nulls last"
            (let [our-ids  [n-early n-recent n-unsent]
                  filtered (filter (fn [r] (some #{(:id r)} our-ids)) data)
                  ordered  (map :id filtered)]
              (is (= [n-recent n-early n-unsent] ordered)))))))))

(deftest filter-by-health-test
  (testing "?health=<state> returns only rows matching that computed health state"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/User             {inactive :id} {:is_active false}
                     :model/Card             {ok-card :id}  {:archived false}
                     :model/Card             {bad-card :id} {:archived true}
                     :model/NotificationCard {nc-ok :id}    {:card_id ok-card}
                     :model/NotificationCard {nc-bad :id}   {:card_id bad-card}
                     :model/NotificationCard {nc-orph :id}  {:card_id ok-card}
                     :model/NotificationCard {nc-fail :id}  {:card_id ok-card}
                     :model/Notification     healthy-n      {:payload_type :notification/card
                                                             :payload_id   nc-ok
                                                             :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     orph-card-n    {:payload_type :notification/card
                                                             :payload_id   nc-bad
                                                             :creator_id   (mt/user->id :crowberto)}
                     :model/Notification     orph-user-n    {:payload_type :notification/card
                                                             :payload_id   nc-orph
                                                             :creator_id   inactive}
                     :model/Notification     failing-n      {:payload_type :notification/card
                                                             :payload_id   nc-fail
                                                             :creator_id   (mt/user->id :crowberto)}
                     :model/TaskHistory      _th            {:task         "notification-send"
                                                             :task_details {:notification_id (:id failing-n)}
                                                             :status       :failed
                                                             :started_at   (t/instant)
                                                             :ended_at     (t/instant)}]
        (testing "health=healthy"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :health "healthy")
                ids            (set (map :id data))]
            (is (contains? ids (:id healthy-n)))
            (is (not (contains? ids (:id orph-card-n))))
            (is (not (contains? ids (:id orph-user-n))))
            (is (not (contains? ids (:id failing-n))))))
        (testing "health=orphaned_card"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :health "orphaned_card")
                ids            (set (map :id data))]
            (is (contains? ids (:id orph-card-n)))
            (is (not (contains? ids (:id healthy-n))))
            (is (not (contains? ids (:id orph-user-n))))
            (is (not (contains? ids (:id failing-n))))))
        (testing "health=orphaned_creator"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :health "orphaned_creator")
                ids            (set (map :id data))]
            (is (contains? ids (:id orph-user-n)))
            (is (not (contains? ids (:id healthy-n))))
            (is (not (contains? ids (:id orph-card-n))))
            (is (not (contains? ids (:id failing-n))))))
        (testing "health=failing"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                     :health "failing")
                ids            (set (map :id data))]
            (is (contains? ids (:id failing-n)))
            (is (not (contains? ids (:id healthy-n))))
            (is (not (contains? ids (:id orph-card-n))))
            (is (not (contains? ids (:id orph-user-n))))))))))

(deftest filter-compound-test
  (testing "multiple filters AND together (status + creator_id)"
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
                     :model/Notification     wrong-status      {:payload_type :notification/card
                                                                :payload_id   nc2
                                                                :active       false
                                                                :creator_id   target-user}
                     :model/Notification     wrong-creator     {:payload_type :notification/card
                                                                :payload_id   nc3
                                                                :active       true
                                                                :creator_id   other-user}]
        (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "ee/admin/notifications"
                                                   :status "active"
                                                   :creator_id target-user)
              ids            (set (map :id data))]
          (is (contains? ids (:id matching)))
          (is (not (contains? ids (:id wrong-status))))
          (is (not (contains? ids (:id wrong-creator)))))))))

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
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/admin/notifications/bulk"
                                         {:notification_ids [(:id n1) (:id n2)]
                                          :action           "archive"})]
          (is (= 2 (:updated resp)))
          (is (false? (t2/select-one-fn :active :model/Notification (:id n1))))
          (is (false? (t2/select-one-fn :active :model/Notification (:id n2)))))))))

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
        (mt/user-http-request :crowberto :post 200 "ee/admin/notifications/bulk"
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
        (mt/user-http-request :crowberto :post 200 "ee/admin/notifications/bulk"
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
        (mt/user-http-request :crowberto :post 400 "ee/admin/notifications/bulk"
                              {:notification_ids [(:id n1)]
                               :action           "change-owner"})))))

;; ---------------------------------------------------------------------------------------------
;; Auth + feature-flag gating for POST /bulk (Task B8 — mirrors the GET triad above)
;; ---------------------------------------------------------------------------------------------

(deftest bulk-requires-premium-feature-test
  (testing "POST /api/ee/admin/notifications/bulk returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :post 402 "ee/admin/notifications/bulk"
                             {:notification_ids [1]
                              :action           "archive"})))))

(deftest bulk-requires-superuser-test
  (testing "POST /api/ee/admin/notifications/bulk returns 403 for non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/user-http-request :rasta :post 403 "ee/admin/notifications/bulk"
                            {:notification_ids [1]
                             :action           "archive"}))))

(deftest bulk-happy-path-test
  (testing "POST /api/ee/admin/notifications/bulk returns 200 + :updated for superuser with premium"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     n             {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :active       true
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/admin/notifications/bulk"
                                         {:notification_ids [(:id n)]
                                          :action           "archive"})]
          (is (= 1 (:updated resp))))))))

;; ---------------------------------------------------------------------------------------------
;; GET /:id (Task B9 — detail endpoint)
;; ---------------------------------------------------------------------------------------------

(deftest detail-returns-notification-with-health-test
  (testing "GET /:id returns the hydrated notification with :health and :last_sent_at"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/admin/notifications/" nid))]
          (is (= nid (:id resp)))
          (is (contains? resp :health))
          (is (contains? resp :last_sent_at))
          (testing "send history is loaded separately and is not on the detail response"
            (is (not (contains? resp :send_history)))))))))

(deftest send-history-endpoint-paginates-test
  (testing "GET /:id/send-history returns {:data :total} ordered newest-first and respects limit/offset"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}
                     :model/TaskHistory      _older        {:task         "notification-send"
                                                            :task_details {:notification_id nid}
                                                            :status       :success
                                                            :started_at   (t/instant "2026-04-19T10:00:00Z")
                                                            :ended_at     (t/instant "2026-04-19T10:00:01Z")
                                                            :duration     1000}
                     :model/TaskHistory      _newer        {:task         "notification-send"
                                                            :task_details {:notification_id nid}
                                                            :status       :failed
                                                            :started_at   (t/instant "2026-04-20T10:00:00Z")
                                                            :ended_at     (t/instant "2026-04-20T10:00:02Z")
                                                            :duration     2000}]
        (testing "first page returns both rows newest-first"
          (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/admin/notifications/" nid "/send-history"))]
            (is (= 2 (:total resp)))
            (is (= 2 (count (:data resp))))
            (is (= "failed" (:status (first (:data resp)))))
            (is (= "success" (:status (second (:data resp)))))))
        (testing "limit + offset paginate correctly"
          (let [page-1 (mt/user-http-request :crowberto :get 200
                                             (str "ee/admin/notifications/" nid "/send-history")
                                             :limit 1 :offset 0)
                page-2 (mt/user-http-request :crowberto :get 200
                                             (str "ee/admin/notifications/" nid "/send-history")
                                             :limit 1 :offset 1)]
            (is (= 2 (:total page-1)))
            (is (= 2 (:total page-2)))
            (is (= 1 (count (:data page-1))))
            (is (= 1 (count (:data page-2))))
            (is (= "failed" (:status (first (:data page-1)))))
            (is (= "success" (:status (first (:data page-2)))))))))))

(deftest detail-404-for-missing-id-test
  (testing "GET /:id returns 404 for a non-existent notification id"
    (mt/with-premium-features #{:audit-app}
      (let [max-id (or (t2/select-one-fn :id :model/Notification {:order-by [[:id :desc]]}) 0)]
        (mt/user-http-request :crowberto :get 404
                              (str "ee/admin/notifications/" (+ max-id 100000)))))))

(deftest detail-404-for-non-card-notification-test
  (testing "GET /:id returns 404 when the notification exists but isn't a :notification/card"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Notification {nid :id} {:payload_type :notification/system-event
                                                    :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :crowberto :get 404 (str "ee/admin/notifications/" nid))))))

(deftest detail-requires-premium-feature-test
  (testing "GET /:id returns 402 without :audit-app premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Audit app"
       (mt/user-http-request :crowberto :get 402 "ee/admin/notifications/1")))))

(deftest detail-requires-superuser-test
  (testing "GET /:id returns 403 for a non-superuser"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}]
        (mt/user-http-request :rasta :get 403 (str "ee/admin/notifications/" nid))))))

(deftest send-history-defaults-to-20-per-page-test
  (testing "GET /:id/send-history defaults to 20 entries per page, newest first"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp [:model/Card             {card-id :id} {:archived false}
                     :model/NotificationCard {nc :id}      {:card_id card-id}
                     :model/Notification     {nid :id}     {:payload_type :notification/card
                                                            :payload_id   nc
                                                            :creator_id   (mt/user->id :crowberto)}]
        (let [inserted-ids (doall
                            (for [i (range 25)]
                              (let [started (t/plus (t/instant "2026-04-01T00:00:00Z") (t/minutes i))
                                    ended   (t/plus started (t/seconds 1))]
                                (first
                                 (t2/insert-returning-pks! :model/TaskHistory
                                                           {:task         "notification-send"
                                                            :task_details {:notification_id nid :idx i}
                                                            :status       :success
                                                            :started_at   started
                                                            :ended_at     ended
                                                            :duration     1000})))))]
          (try
            (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/admin/notifications/" nid "/send-history"))]
              (is (= 25 (:total resp)))
              (is (= 20 (count (:data resp))))
              (testing "sorted newest-first"
                (let [timestamps (map :timestamp (:data resp))]
                  (is (= timestamps (reverse (sort timestamps)))))))
            (finally
              (t2/delete! :model/TaskHistory :id [:in inserted-ids]))))))))
