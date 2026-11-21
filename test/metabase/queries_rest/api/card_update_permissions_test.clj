(ns metabase.queries-rest.api.card-update-permissions-test
  "A user-by-change table of the answers and statuses of `PUT /api/card/:id`."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- grant!
  [level collection]
  (case level
    :write (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    :read  (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
    :none  nil))

(deftest move-card-between-collections-test
  (doseq [[user old-level new-level expected-status]
          [[:rasta     :write :write 200]
           [:rasta     :write :read  403]
           [:rasta     :write :none  403]
           [:rasta     :read  :write 403]
           [:rasta     :none  :write 403]
           [:crowberto :none  :none  200]]]
    (testing (str user " moves a card out of a collection with " old-level " into one with " new-level)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection old-collection {}
                       :model/Collection new-collection {}
                       :model/Card       card           {:collection_id (:id old-collection)}]
          (grant! old-level old-collection)
          (grant! new-level new-collection)
          (let [response (mt/user-http-request user :put expected-status (str "card/" (:id card))
                                               {:collection_id (:id new-collection)})]
            (if (= 200 expected-status)
              (is (= (:id new-collection) (t2/select-one-fn :collection_id :model/Card :id (:id card))))
              (do (is (= "You don't have permissions to do that." response))
                  (is (= (:id old-collection) (t2/select-one-fn :collection_id :model/Card :id (:id card)))))))))))
  (testing "rasta moves a card from a writable collection to the root collection, which no group writes"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection old-collection {}
                     :model/Card       card           {:collection_id (:id old-collection)}]
        (grant! :write old-collection)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "card/" (:id card)) {:collection_id nil}))))))
  (testing "rasta moves a card from the root collection into a writable collection, which no group writes"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection new-collection {}
                     :model/Card       card           {}]
        (grant! :write new-collection)
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "card/" (:id card)) {:collection_id (:id new-collection)}))))))
  (testing "a request that repeats the stored collection needs no access to a second one"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card       {:collection_id (:id collection)}]
        (grant! :write collection)
        (mt/user-http-request :rasta :put 200 (str "card/" (:id card)) {:collection_id (:id collection) :name "Renamed"})
        (is (= "Renamed" (t2/select-one-fn :name :model/Card :id (:id card))))))))

(deftest move-card-out-of-dashboards-test
  (doseq [[user dashboard-level expected-status]
          [[:rasta     :write 400]
           [:rasta     :read  403]
           [:rasta     :none  403]
           [:crowberto :none  400]]]
    (testing (str user " moves a card shown on a dashboard in a collection with " dashboard-level " into a dashboard")
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection card-collection      {}
                       :model/Collection dashboard-collection {}
                       :model/Dashboard  shown-on             {:collection_id (:id dashboard-collection)}
                       :model/Dashboard  target               {:collection_id (:id card-collection)}
                       :model/Card       card                 {:collection_id (:id card-collection)}
                       :model/DashboardCard _                 {:dashboard_id (:id shown-on) :card_id (:id card)}]
          (grant! :write card-collection)
          (grant! dashboard-level dashboard-collection)
          (let [response (mt/user-http-request user :put expected-status (str "card/" (:id card))
                                               {:dashboard_id (:id target)})]
            (is (= (if (= 403 expected-status)
                     "You don't have permissions to do that."
                     "Can't move question into dashboard. Questions saved in dashboards can't appear in other dashboards.")
                   response))
            (is (nil? (t2/select-one-fn :dashboard_id :model/Card :id (:id card)))))))))
  (testing "a card in no dashboard moves into one without a check of dashboards"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {}
                     :model/Dashboard  target     {:collection_id (:id collection)}
                     :model/Card       card       {:collection_id (:id collection)}]
        (grant! :write collection)
        (mt/user-http-request :rasta :put 200 (str "card/" (:id card)) {:dashboard_id (:id target)})
        (is (= (:id target) (t2/select-one-fn :dashboard_id :model/Card :id (:id card))))))))

(deftest move-card-onto-shared-dashboard-timeline-test
  (doseq [[user timeline-readable? expected-status]
          [[:rasta     true  200]
           [:rasta     false 403]
           [:crowberto false 200]]]
    (testing (str user " moves a card selecting a timeline into a public dashboard, timeline readable " timeline-readable?)
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection          {}
                       :model/Collection timeline-collection {}
                       :model/Timeline   timeline            {:collection_id (:id timeline-collection)}
                       :model/Dashboard  target              {:collection_id (:id collection)
                                                              :public_uuid   (str (random-uuid))}
                       :model/Card       card                {:collection_id (:id collection)
                                                              :display       :line
                                                              :visualization_settings
                                                              {:timeline.selected_timeline_ids [(:id timeline)]}}]
          (grant! :write collection)
          (when timeline-readable? (grant! :read timeline-collection))
          (let [response (mt/user-http-request user :put expected-status (str "card/" (:id card))
                                               {:dashboard_id (:id target)})]
            (if (= 200 expected-status)
              (is (= (:id target) (t2/select-one-fn :dashboard_id :model/Card :id (:id card))))
              (is (= "You don't have permissions to do that." response)))))))))
