(ns metabase.users.task.invitation-reminder-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.core :as events]
   [metabase.notification.test-util :as notification.tu]
   [metabase.task.core :as task]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.users.task.invitation-reminder :as task.invitation-reminder]
   [metabase.util.random :as u.random]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :once
  (fixtures/initialize :test-users-personal-collections :web-server :plugins :notifications))

(defn- create-user-invited-days-ago
  "Create a user invited N days ago who hasn't logged in yet."
  [days-ago]
  (let [today          (t/local-date)
        target-date    (t/minus today (t/days days-ago))
        date-joined    (t/zoned-date-time target-date (t/local-time 12 0 0) (t/zone-id "UTC"))]
    (first
     (t2/insert-returning-instances! :model/User
                                     {:first_name  "Test"
                                      :last_name   "User"
                                      :email       (u.random/random-email)
                                      :password    "password123"
                                      :is_active   true
                                      :last_login  nil
                                      :date_joined date-joined}))))

(deftest users-invited-3-days-ago-test
  (mt/with-model-cleanup [:model/User]
    (testing "finds users invited exactly 3 days ago"
      (let [user-3-days (#'task.invitation-reminder/users-invited-3-days-ago)]
        (testing "initially no users"
          (is (empty? user-3-days)))

        (let [user-3 (create-user-invited-days-ago 3)
              _user-2 (create-user-invited-days-ago 2)
              _user-4 (create-user-invited-days-ago 4)]
          (testing "only returns users invited exactly 3 days ago"
            (let [found-users (#'task.invitation-reminder/users-invited-3-days-ago)]
              (is (= 1 (count found-users)))
              (is (= (:id user-3) (:id (first found-users)))))))

        (testing "excludes users who have already logged in"
          (let [user-logged-in (create-user-invited-days-ago 3)]
            (t2/update! :model/User (:id user-logged-in) {:last_login (t/zoned-date-time)})
            (let [found-users (#'task.invitation-reminder/users-invited-3-days-ago)
                  found-ids (set (map :id found-users))]
              (is (not (contains? found-ids (:id user-logged-in)))))))

        (testing "excludes inactive users"
          (let [user-inactive (create-user-invited-days-ago 3)]
            (t2/update! :model/User (:id user-inactive) {:is_active false})
            (let [found-users (#'task.invitation-reminder/users-invited-3-days-ago)
                  found-ids (set (map :id found-users))]
              (is (not (contains? found-ids (:id user-inactive)))))))))))

(deftest send-invitation-reminder!-test
  (testing "publishes the correct event"
    (mt/with-model-cleanup [:model/User]
      (let [user (first (t2/insert-returning-instances! :model/User
                                                        {:first_name "Test"
                                                         :last_name  "User"
                                                         :email      (u.random/random-email)
                                                         :password   "password123"
                                                         :is_active  true}))
            published-events (atom [])]
        (with-redefs [events/publish-event! (fn [topic event-data]
                                              (swap! published-events conj {:topic topic :data event-data})
                                              event-data)]
          (#'task.invitation-reminder/send-invitation-reminder! user)
          (is (= 1 (count @published-events)))
          (is (= :event/user-invitation-reminder (:topic (first @published-events))))
          (is (= {:id (:id user) :email (:email user)}
                 (get-in (first @published-events) [:data :object]))))))))

(deftest send-invitation-reminders!-test
  (testing "with no users to remind"
    (mt/with-model-cleanup [:model/User]
      (let [published-events (atom [])]
        (with-redefs [events/publish-event! (fn [topic event-data]
                                              (swap! published-events conj {:topic topic :data event-data})
                                              event-data)]
          (#'task.invitation-reminder/send-invitation-reminders!)
          (is (empty? @published-events))))))

  (testing "with multiple users to remind"
    (mt/with-model-cleanup [:model/User]
      (let [user-1 (create-user-invited-days-ago 3)
            user-2 (create-user-invited-days-ago 3)
            published-events (atom [])]
        (with-redefs [events/publish-event! (fn [topic event-data]
                                              (swap! published-events conj {:topic topic :data event-data})
                                              event-data)]
          (#'task.invitation-reminder/send-invitation-reminders!)
          (is (= 2 (count @published-events)))
          (let [event-user-ids (set (map #(get-in % [:data :object :id]) @published-events))]
            (is (contains? event-user-ids (:id user-1)))
            (is (contains? event-user-ids (:id user-2))))))))

  (testing "handles errors gracefully"
    (mt/with-model-cleanup [:model/User]
      (let [_user-1 (create-user-invited-days-ago 3)
            _user-2 (create-user-invited-days-ago 3)
            published-events (atom [])
            call-count (atom 0)]
        (with-redefs [events/publish-event! (fn [topic event-data]
                                              (swap! call-count inc)
                                              (when (= @call-count 1)
                                                (throw (Exception. "Test error")))
                                              (swap! published-events conj {:topic topic :data event-data})
                                              event-data)]
          (#'task.invitation-reminder/send-invitation-reminders!)
          (testing "continues processing after error"
            (is (= 1 (count @published-events)))
            (is (= 2 @call-count))))))))

(deftest task-initialization-test
  (testing "task is properly initialized"
    (mt/with-temp-scheduler!
      (task/init! ::task.invitation-reminder/InvitationReminder)
      (let [job-info (task/job-info "metabase.task.invitation-reminder.job")]
        (testing "job exists"
          (is (some? job-info)))

        (testing "has correct trigger"
          (let [triggers (:triggers job-info)
                trigger (first (filter #(= "metabase.task.invitation-reminder.trigger" (:key %)) triggers))]
            (is (some? trigger))
            (testing "has correct cron schedule (10 AM daily)"
              (is (= "0 0 10 * * ? *" (:schedule trigger))))))))))

(deftest invitation-reminder-e2e-test
  (testing "end-to-end invitation reminder flow"
    (notification.tu/with-notification-testing-setup!
      (mt/with-model-cleanup [:model/User]
        (let [user (create-user-invited-days-ago 3)
              captured-events (notification.tu/with-captured-channel-send!
                                (#'task.invitation-reminder/send-invitation-reminders!))]
          (testing "sends email notification"
            (is (= 1 (count (:channel/email captured-events))))
            (let [email (first (:channel/email captured-events))]
              (is (= #{(:email user)} (set (:recipients email))))
              (is (re-find #"Reminder.*waiting.*join" (:subject email))))))))))
