(ns metabase.api.activity-test
  "Tests for /api/activity endpoints."
  (:require [clojure.test :refer :all]
            [metabase.api.activity :as activity-api]
            [metabase.db :as mdb]
            [metabase.models.activity :refer [Activity]]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.view-log :refer [ViewLog]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;; GET /

;; Things we are testing for:
;;  1. ordered by timestamp DESC
;;  2. :user and :model_exists are hydrated

(def ^:private activity-defaults
  {:model_exists false
   :database_id  nil
   :database     nil
   :table_id     nil
   :table        nil
   :custom_id    nil})

(defn- activity-user-info [user-kw]
  (merge
   {:id (mt/user->id user-kw)}
   (select-keys
    (mt/fetch-user user-kw)
    [:common_name :date_joined :email :first_name :is_qbnewb :is_superuser :last_login :last_name :locale])))

;; NOTE: timestamp matching was being a real PITA so I cheated a bit.  ideally we'd fix that
(deftest activity-list-test
  (testing "GET /api/activity"
    (mt/with-temp* [Activity [activity1 {:topic     "install"
                                         :details   {}
                                         :timestamp #t "2015-09-09T12:13:14.888Z[UTC]"}]
                    Activity [activity2 {:topic     "dashboard-create"
                                         :user_id   (mt/user->id :crowberto)
                                         :model     "dashboard"
                                         :model_id  1234
                                         :details   {:description "Because I can!"
                                                     :name        "Bwahahaha"}
                                         :timestamp #t "2015-09-10T18:53:01.632Z[UTC]"}]
                    Activity [activity3 {:topic     "user-joined"
                                         :user_id   (mt/user->id :rasta)
                                         :model     "user"
                                         :details   {}
                                         :timestamp #t "2015-09-10T05:33:43.641Z[UTC]"}]]
      (letfn [(fetch-activity [activity]
                (merge
                 activity-defaults
                 (db/select-one [Activity :id :user_id :details :model :model_id] :id (u/the-id activity))))]
        (is (= [(merge
                 (fetch-activity activity2)
                 {:topic "dashboard-create"
                  :user  (activity-user-info :crowberto)})
                (merge
                 (fetch-activity activity3)
                 {:topic "user-joined"
                  :user  (activity-user-info :rasta)})
                (merge
                 (fetch-activity activity1)
                 {:topic   "install"
                  :user_id nil
                  :user    nil})]
               ;; remove other activities from the API response just in case -- we're not interested in those
               (let [these-activity-ids (set (map u/the-id [activity1 activity2 activity3]))]
                 (for [activity (mt/user-http-request :crowberto :get 200 "activity")
                       :when    (contains? these-activity-ids (u/the-id activity))]
                   (dissoc activity :timestamp)))))))))

;;; GET /recent_views

;; Things we are testing for:
;;  1. ordering is sorted by most recent
;;  2. results are filtered to current user
;;  3. `:model_object` is hydrated in each result
;;  4. we filter out entries where `:model_object` is nil (object doesn't exist)

(defn- create-view! [user model model-id]
  (db/insert! ViewLog
    :user_id  user
    :model    model
    :model_id model-id
    :timestamp :%now)
  ;; we sleep a bit to ensure no events have the same timestamp
  ;; sadly, MySQL doesn't support milliseconds so we have to wait a second
  ;; otherwise our records are out of order and this test fails :(
  (Thread/sleep (if (= (mdb/db-type) :mysql)
                  1000
                  10)))

(deftest recent-views-test
  (mt/with-temp* [Card      [card1 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
                  Dashboard [dash1 {:name        "rand-name"
                                    :description "rand-name"
                                    :creator_id  (mt/user->id :crowberto)}]
                  Card      [card2 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]]
    (create-view! (mt/user->id :crowberto) "card"      (:id card2))
    (create-view! (mt/user->id :crowberto) "dashboard" (:id dash1))
    (create-view! (mt/user->id :crowberto) "card"      (:id card1))
    (create-view! (mt/user->id :crowberto) "card"      36478)
    (create-view! (mt/user->id :rasta)     "card"      (:id card1))
    (is (= [{:cnt          1
             :user_id      (mt/user->id :crowberto)
             :model        "card"
             :model_id     (:id card1)
             :model_object {:id            (:id card1)
                            :name          (:name card1)
                            :collection_id nil
                            :description   (:description card1)
                            :display       (name (:display card1))}}
            {:cnt          1
             :user_id      (mt/user->id :crowberto)
             :model        "dashboard"
             :model_id     (:id dash1)
             :model_object {:id            (:id dash1)
                            :name          (:name dash1)
                            :collection_id nil
                            :description   (:description dash1)}}
            {:cnt          1
             :user_id      (mt/user->id :crowberto)
             :model        "card"
             :model_id     (:id card2)
             :model_object {:id            (:id card2)
                            :name          (:name card2)
                            :collection_id nil
                            :description   (:description card2)
                            :display       (name (:display card2))}}]
           (for [recent-view (mt/user-http-request :crowberto :get 200 "activity/recent_views")]
             (dissoc recent-view :max_ts))))))


;;; activities->referenced-objects, referenced-objects->existing-objects, add-model-exists-info

(def ^:private fake-activities
  [{:model "dashboard", :model_id  43, :topic :dashboard-create,    :details {}}
   {:model "dashboard", :model_id  42, :topic :dashboard-create,    :details {}}
   {:model "card",      :model_id 114, :topic :card-create,         :details {}}
   {:model "card",      :model_id 113, :topic :card-create,         :details {}}
   {:model "card",      :model_id 112, :topic :card-create,         :details {}}
   {:model "card",      :model_id 111, :topic :card-create,         :details {}}
   {:model "dashboard", :model_id  41, :topic :dashboard-add-cards, :details {:dashcards [{:card_id 109}]}}
   {:model "card",      :model_id 109, :topic :card-create,         :details {}}
   {:model "dashboard", :model_id  41, :topic :dashboard-add-cards, :details {:dashcards [{:card_id 108}]}}
   {:model "dashboard", :model_id  41, :topic :dashboard-create,    :details {}}
   {:model "card",      :model_id 108, :topic :card-create,         :details {}}
   {:model "user",      :model_id  90, :topic :user-joined,         :details {}}
   {:model nil,         :model_id nil, :topic :install,             :details {}}])

(deftest activities->referenced-objects-test
  (is (= {"dashboard" #{41 43 42}
          "card"      #{113 108 109 111 112 114}
          "user"      #{90}}
         (#'activity-api/activities->referenced-objects fake-activities))))


(deftest referenced-objects->existing-objects-test
  (mt/with-temp Dashboard [{dashboard-id :id}]
    (is (= {"dashboard" #{dashboard-id}, "card" nil}
           (#'activity-api/referenced-objects->existing-objects {"dashboard" #{dashboard-id 0}
                                                                 "card"      #{0}})))))
(deftest add-model-exists-info-test
  (mt/with-temp* [Dashboard [{dashboard-id :id}]
                  Card      [{card-id :id}]]
    (is (= [{:model "dashboard", :model_id dashboard-id, :model_exists true}
            {:model "card", :model_id 0, :model_exists false}
            {:model        "dashboard"
             :model_id     0
             :model_exists false
             :topic        :dashboard-remove-cards
             :details      {:dashcards [{:card_id card-id, :exists true}
                                        {:card_id 0, :exists false}]}}]
           (#'activity-api/add-model-exists-info [{:model "dashboard", :model_id dashboard-id}
                                                  {:model "card", :model_id 0}
                                                  {:model    "dashboard"
                                                   :model_id 0
                                                   :topic    :dashboard-remove-cards
                                                   :details  {:dashcards [{:card_id card-id}
                                                                          {:card_id 0}]}}])))))

(defn- user-can-see-user-joined-activity? [user]
  ;; clear out all existing Activity entries
  (db/delete! Activity)
  (-> (mt/with-temp Activity [activity {:topic     "user-joined"
                                        :details   {}
                                        :timestamp #t "2019-02-15T11:55:00.000Z"}]
        (mt/user-http-request user :get 200 "activity"))
      seq
      boolean))

(deftest activity-visibility-test
  (testing "Only admins should get to see user-joined activities"
    (testing "admin should see `:user-joined` activities"
      (is (= true
             (user-can-see-user-joined-activity? :crowberto))))
    (testing "non-admin should *not* see `:user-joined` activities"
      (is (= false
             (user-can-see-user-joined-activity? :rasta))))))
