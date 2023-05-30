(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.events.view-log :as view-log]
   [metabase.models :refer [Card Dashboard Table User ViewLog]]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest card-create-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :card-create
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest card-read-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]

    (view-log/handle-view-event! {:topic :card-read
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest card-query-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]

    (view-log/handle-view-event! {:topic :card-query
                                  :item  (assoc card :cached false :ignore_cache true)})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)
            :metadata {:cached false :ignore_cache true :context nil}}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id :metadata], :user_id (:id user)))))))

(deftest table-read-test
  (mt/with-temp* [User  [user]
                  Table [table]]

    (view-log/handle-view-event! {:topic :table-read
                                  :item  (assoc table :actor_id (:id user))})
    (is (= {:user_id  (:id user)
            :model    "table"
            :model_id (:id table)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest dashboard-read-test
  (mt/with-temp* [User      [user]
                  Dashboard [dashboard {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :dashboard-read
                                  :item  dashboard})
    (is (= {:user_id  (:id user)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest user-recent-views-test
  (mt/with-temp* [Card      [card1 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
                  Card      [archived  {:name                   "archived-card"
                                        :creator_id             (mt/user->id :crowberto)
                                        :display                "table"
                                        :archived               true
                                        :visualization_settings {}}]
                  Dashboard [dash {:name        "rand-name2"
                                   :description "rand-name2"
                                   :creator_id  (mt/user->id :crowberto)}]
                  Table     [table1 {:name "rand-name"}]
                  Table     [hidden-table {:name            "hidden table"
                                           :visibility_type "hidden"}]
                  Card      [dataset {:name                   "rand-name"
                                      :dataset                true
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :visualization_settings {}}]]
    (mt/with-model-cleanup [ViewLog]
      (testing "User's recent views are updated when card/dashboard/table-read events occur."
        (mt/with-test-user :crowberto
          (view-log/user-recent-views! []) ;; ensure no views from any other tests/temp items exist
          (doseq [event [{:topic :card-query :item dataset} ;; oldest view
                         {:topic :card-query :item dataset}
                         {:topic :card-query :item card1}
                         {:topic :card-query :item card1}
                         {:topic :card-query :item card1}
                         {:topic :dashboard-read :item dash}
                         {:topic :card-query :item card1}
                         {:topic :dashboard-read :item dash}
                         {:topic :table-read :item table1}
                         {:topic :card-query :item archived}
                         {:topic :table-read :item hidden-table}]]
            (view-log/handle-view-event!
             ;; view log entries look for the `:actor_id` in the item being viewed to set that view's :user_id
             (assoc-in event [:item :actor_id] (mt/user->id :crowberto))))
          (let [recent-views (mt/with-test-user :crowberto (view-log/user-recent-views))]
            (is (=
                 [{:model "table" :model_id (u/the-id hidden-table)}
                  {:model "card" :model_id (u/the-id archived)}
                  {:model "table" :model_id (u/the-id table1)}
                  {:model "dashboard" :model_id (u/the-id dash)}
                  {:model "card" :model_id (u/the-id card1)}
                  {:model "card" :model_id (u/the-id dataset)}]
                 recent-views))))))))

(deftest user-dismissed-toasts-setting-test
  (testing "user-dismissed-toasts! updates user-dismissed-toasts"
    (binding [metabase.models.setting/*user-local-values* (delay (atom {:user_dismissed_toasts []}))]
      (is (= false (:custom_homepage_changed (view-log/user-dismissed-toasts))))
      (view-log/user-dismissed-toasts! [:add :custom_homepage_changed])
      (is (= true (:custom_homepage_changed (view-log/user-dismissed-toasts))))
      (view-log/user-dismissed-toasts! [:remove :custom_homepage_changed])
      (is (= false (:custom_homepage_changed (view-log/user-dismissed-toasts)))))))

(deftest user-dismissed-toasts-api-test
  (testing "User's dismissed toasts are updated when POSTs are sent to api/user/:id/dismissed/:toast-name"
    (mt/with-test-user :crowberto
      (view-log/user-dismissed-toasts! [:remove :custom_homepage_changed]))
    (is (false? (-> (mt/user-http-request :crowberto :get 200 "user/current")
                    (get-in [:dismissed_toasts :custom_homepage_changed]))))
    (is (= {:success true}
           (mt/user-http-request :crowberto :post 200
                                 (str "user/" (mt/user->id :crowberto) "/dismissed/custom_homepage_changed"))))
    (is (true? (-> (mt/user-http-request :crowberto :get 200 "user/current")
                   (get-in [:dismissed_toasts :custom_homepage_changed]))))))

(deftest user-dismissed-toasts-for-other-users-test
  (testing "User cannot affect another's dismissed toasts."
    (mt/user-http-request :crowberto :post 403
                          (str "user/" (mt/user->id :rasta) "/dismissed/custom_homepage_changed"))
        (mt/user-http-request :crowberto :post 403
                              (str "user/" (+ (mt/user->id :crowberto) (rand-int 100) 1) "/dismissed/custom_homepage_changed"))))

(deftest most-recently-viewed-dashboard-test
  (t2.with-temp/with-temp [Dashboard dash {:name "Look at this Distinguished Dashboard!"}]
    (mt/with-model-cleanup [ViewLog]
      (testing "When a user views a dashboard, most-recently-viewed-dashboard is updated with that id."
        (mt/with-test-user :crowberto (setting/set-value-of-type! :json :most-recently-viewed-dashboard nil))
        (view-log/handle-view-event! {:topic :dashboard-read
                                      :metadata {:context "question"}
                                      :item  (assoc dash :actor_id (mt/user->id :crowberto))})
        (is (= (u/the-id dash) (mt/with-test-user :crowberto (view-log/most-recently-viewed-dashboard)))))
      (testing "When the user's most recent dashboard view is older than 24 hours, return `nil`."
        (mt/with-test-user :crowberto
          (setting/set-value-of-type! :json :most-recently-viewed-dashboard
                                      {:id        (u/the-id dash)
                                       :timestamp (t/minus (t/zoned-date-time) (t/hours 25))}))
        (is (= nil (mt/with-test-user :crowberto (view-log/most-recently-viewed-dashboard))))))))
