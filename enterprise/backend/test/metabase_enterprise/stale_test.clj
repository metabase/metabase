(ns metabase-enterprise.stale-test
  (:require [clojure.test :refer [deftest is are testing]]
            [metabase-enterprise.stale :as stale]
            [metabase-enterprise.test :as met]
            [metabase.models.collection :as collection]
            [metabase.models.moderation-review :as moderation-review]
            [metabase.stale-test :refer [with-stale-items
                                         stale-dashboard
                                         stale-card
                                         date-months-ago
                                         datetime-months-ago]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan2.core :as t2])
  (:import (java.time LocalDate)))

(set! *warn-on-reflection* true)

(deftest can-find-stale-dashboards
  (mt/with-temp [:model/Dashboard {id :id} (stale-dashboard
                                            {:name "My Stale Dashboard"
                                             :collection_id nil})]
    (is (= [{:id id :model :model/Dashboard}]
           (:rows
            (stale/find-candidates
             {:collection-ids #{nil}
              :cutoff-date    (date-months-ago 6)
              :limit          10
              :offset         0
              :sort-column    :name
              :sort-direction :asc}))))))

(deftest can-find-stale-cards
  (with-stale-items [:model/Card {id :id} {:name "My Stale Card"
                                           :collection_id nil}]
    (is (= [{:id id :model :model/Card}]
           (:rows
            (stale/find-candidates
             {:collection-ids #{nil}
              :cutoff-date    (date-months-ago 6)
              :limit          10
              :offset         0
              :sort-column    :name
              :sort-direction :asc}))))))

(deftest results-can-be-sorted
  (mt/with-temp [:model/Dashboard {id1 :id} {:name "Z"
                                             :last_viewed_at (datetime-months-ago 10)}
                 :model/Dashboard {id2 :id} {:name "Y"
                                             :last_viewed_at (datetime-months-ago 11)}
                 :model/Dashboard {id3 :id} {:name "X"
                                             :last_viewed_at (datetime-months-ago 12)}]
    (testing "by name"
      (testing "ascending"
        (is (= [{:id id3 :model :model/Dashboard}
                {:id id2 :model :model/Dashboard}
                {:id id1 :model :model/Dashboard}]
               (:rows
                (stale/find-candidates
                 {:collection-ids #{nil}
                  :cutoff-date    (date-months-ago 6)
                  :limit          10
                  :offset         0
                  :sort-column    :name
                  :sort-direction :asc})))))
      (testing "descending"
        (is (= [{:id id1 :model :model/Dashboard}
                {:id id2 :model :model/Dashboard}
                {:id id3 :model :model/Dashboard}]
               (:rows
                (stale/find-candidates
                 {:collection-ids #{nil}
                  :cutoff-date    (date-months-ago 6)
                  :limit          10
                  :offset         0
                  :sort-column    :name
                  :sort-direction :desc}))))))
    (testing "by last_used_at"
      (testing "ascending"
        (is (= [{:id id3 :model :model/Dashboard}
                {:id id2 :model :model/Dashboard}
                {:id id1 :model :model/Dashboard}]
               (:rows
                (stale/find-candidates
                 {:collection-ids #{nil}
                  :cutoff-date    (date-months-ago 6)
                  :limit          10
                  :offset         0
                  :sort-column    :last_used_at
                  :sort-direction :asc})))))
      (testing "descending"
        (is (= [{:id id1 :model :model/Dashboard}
                {:id id2 :model :model/Dashboard}
                {:id id3 :model :model/Dashboard}]
               (:rows
                (stale/find-candidates
                 {:collection-ids #{nil}
                  :cutoff-date    (date-months-ago 6)
                  :limit          10
                  :offset         0
                  :sort-column    :last_used_at
                  :sort-direction :desc}))))))))

(deftest limits-and-offset-work
  (with-stale-items [:model/Dashboard {id1 :id} {:name "A"}
                     :model/Dashboard {id2 :id} {:name "B"}]
    (testing "limits"
      (is (= [{:id id1 :model :model/Dashboard}]
             (:rows
              (stale/find-candidates
               {:collection-ids #{nil}
                :cutoff-date    (date-months-ago 6)
                :limit          1
                :offset         0
                :sort-column    :name
                :sort-direction :asc})))))
    (testing "offsets"
      (is (= [{:id id2 :model :model/Dashboard}]
             (:rows
              (stale/find-candidates
               {:collection-ids #{nil}
                :cutoff-date    (date-months-ago 6)
                :limit          1
                :offset         1
                :sort-column    :name
                :sort-direction :asc})))))
    (testing "total"
      (is (= 2 (:total
                (stale/find-candidates
                 {:collection-ids #{nil}
                  :cutoff-date    (date-months-ago 6)
                  :limit          1
                  :offset         0
                  :sort-column    :name
                  :sort-direction :asc})))))))

(deftest collection-set-is-taken-into-account
  (mt/with-temp [:model/Collection {col-id-1 :id :as col-1} {}
                 :model/Collection {col-id-2 :id} {:location (collection/children-location col-1)}
                 :model/Dashboard {id-1 :id} (stale-dashboard {:collection_id col-id-1
                                                               :name "A"})
                 :model/Dashboard {id-2 :id} (stale-dashboard {:collection_id col-id-2
                                                               :name "B"})]
    (is (= []
           (:rows
            (stale/find-candidates
             {:collection-ids #{nil}
              :cutoff-date    (date-months-ago 6)
              :limit          10
              :offset         0
              :sort-column    :name
              :sort-direction :asc})))
        "should not include dashboards from the collection")
    (is (= {:rows [{:model :model/Dashboard :id id-1}]
            :total 1}
           (stale/find-candidates
            {:collection-ids #{col-id-1}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc})))
    (is (= {:rows [{:model :model/Dashboard :id id-2}]
            :total 1}
           (stale/find-candidates
            {:collection-ids #{col-id-2}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc})))
    (is (= {:rows [{:model :model/Dashboard :id id-1}
                   {:model :model/Dashboard :id id-2}]
            :total 2}
           (stale/find-candidates
            {:collection-ids #{col-id-1 col-id-2}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc})))))

(deftest cutoff-date-is-taken-into-account
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/Dashboard _ {:name           "A"
                                     :collection_id  col-id
                                     :last_viewed_at #t "2024-02-15T00:01:00Z"}
                 :model/Card _      {:collection_id col-id
                                     :last_used_at  #t "2024-02-15T00:01:00Z"}
                 :model/Dashboard _ {:name           "B"
                                     :collection_id  col-id
                                     :last_viewed_at #t "2024-02-14T23:59:00Z"}
                 :model/Card _      {:collection_id col-id
                                     :last_used_at  #t "2024-02-14T23:59:00Z"}]
    (testing "Items viewed after midnight on the morning of the cutoff date are returned."
      (are [expected cutoff-date]
           (= expected
              (:total
               (stale/find-candidates
                {:collection-ids #{col-id}
                 :cutoff-date    (LocalDate/parse cutoff-date)
                 :limit          10
                 :offset         0
                 :sort-column    :name
                 :sort-direction :asc})))
        ;; At midnight the morning of 2-16, all items are included
        4 "2024-02-16"
        ;; At midnight the morning of 2-15, only the items viewed just before midnight are included
        2 "2024-02-15"
        ;; at midnight the morning of 2-14, no items are included
        0 "2024-02-14"))))

(deftest verified-cards-are-excluded
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/User {user-id :id} {}
                 :model/Card {id1 :id} (stale-card {:name "A" :collection_id col-id})
                 :model/Card {id2 :id} (stale-card {:name "B" :collection_id col-id})]
    ;; card 1 is verified, then unverified - it should be included
    (moderation-review/create-review! {:moderated_item_id   id1
                                       :moderator_id        user-id
                                       :moderated_item_type "card"
                                       :status              "verified"})
    (moderation-review/create-review! {:moderated_item_id   id1
                                       :moderator_id        user-id
                                       :moderated_item_type "card"
                                       :status              nil})
    ;; card 2 is unverified, then verified - it should NOT be included.
    (moderation-review/create-review! {:moderated_item_id   id2
                                       :moderator_id        user-id
                                       :moderated_item_type "card"
                                       :status              nil})
    (moderation-review/create-review! {:moderated_item_id   id2
                                       :moderator_id        user-id
                                       :moderated_item_type "card"
                                       :status              "verified"})
    (is (= {:rows  [{:id id1 :model :model/Card}]
            :total 1}
           (stale/find-candidates
            {:collection-ids #{col-id}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc}))
        "should not include verified dashboards or cards")))

(deftest public-and-embedded-content-is-excluded
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/Card {card-id1 :id} (stale-card {:name          "Acard"
                                                         :collection_id col-id
                                                         :public_uuid   (str (random-uuid))
                                                         :creator_id (mt/user->id :rasta)})
                 :model/Card {card-id2 :id} (stale-card {:name             "Bcard"
                                                         :collection_id    col-id
                                                         :enable_embedding true
                                                         :creator_id       (mt/user->id :rasta)})
                 :model/Card {card-id3 :id} (stale-card {:name          "Ccard"
                                                         :collection_id col-id
                                                         :creator_id   (mt/user->id :rasta)})
                 :model/Dashboard {dash-id1 :id} (stale-dashboard {:name          "Adash"
                                                                   :collection_id col-id
                                                                   :public_uuid   (str (random-uuid))
                                                                   :creator_id    (mt/user->id :rasta)})
                 :model/Dashboard {dash-id2 :id} (stale-dashboard {:name             "Bdash"
                                                                   :collection_id    col-id
                                                                   :enable_embedding true
                                                                   :creator_id       (mt/user->id :rasta)})
                 :model/Dashboard {dash-id3 :id} (stale-dashboard {:name          "Cdash"
                                                                   :collection_id col-id
                                                                   :creator_id    (mt/user->id :rasta)})]
    (testing "If public sharing and embedding are disabled, everything is returned"
      (mt/with-temporary-setting-values [enable-public-sharing false
                                         enable-embedding      false]
        (is (= {:rows  [{:id card-id1 :model :model/Card}
                        {:id dash-id1 :model :model/Dashboard}
                        {:id card-id2 :model :model/Card}
                        {:id dash-id2 :model :model/Dashboard}
                        {:id card-id3 :model :model/Card}
                        {:id dash-id3 :model :model/Dashboard}]
                :total 6}
               (stale/find-candidates
                {:collection-ids #{col-id}
                 :cutoff-date    (date-months-ago 6)
                 :limit          10
                 :offset         0
                 :sort-column    :name
                 :sort-direction :asc})))))
    (testing "If they are enabled, publicy shared or embedded content is excluded"
      (mt/with-temporary-setting-values [enable-public-sharing true
                                         enable-embedding      true]
        (is (= {:rows [{:id card-id3 :model :model/Card}
                       {:id dash-id3 :model :model/Dashboard}]
                :total 2}
               (stale/find-candidates
                {:collection-ids #{col-id}
                 :cutoff-date    (date-months-ago 6)
                 :limit          10
                 :offset         0
                 :sort-column    :name
                 :sort-direction :asc})))))))

(deftest questions-with-alerts-are-excluded
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/Card {card-id :id} (stale-card {:name          "A"
                                                        :collection_id col-id})
                 :model/Card {card-2-id :id} (stale-card {:name "B"
                                                          :collection_id col-id})
                 :model/Pulse pulse {:alert_condition  "rows"
                                     :alert_first_only false
                                     :creator_id       (mt/user->id :rasta)
                                     :name             nil}
                 :model/PulseCard _ {:pulse_id (u/the-id pulse)
                                     :card_id  card-id
                                     :position 0}]
    (is (= {:rows  [{:model :model/Card :id card-2-id}]
            :total 1}
           (stale/find-candidates
            {:collection-ids #{col-id}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc}))
        "should not include cards with alerts")))

(deftest dashboards-with-subscriptions-are-excluded
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/Dashboard {dash-id :id} (stale-dashboard {:name          "A"
                                                                  :collection_id col-id})
                 :model/Pulse _ {:alert_condition "rows"
                                 :alert_first_only false
                                 :creator_id (mt/user->id :rasta)
                                 :name nil
                                 :dashboard_id dash-id}]
    (is (= {:rows []
            :total 0}
           (stale/find-candidates
            {:collection-ids #{col-id}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc})))))

(deftest questions-used-as-data-source-for-sandboxes-are-excluded
  (met/with-gtaps! {:gtaps {:categories {:query (mt/mbql-query categories {:filter [:< $id 3]})}}}
    (let [gtap-card-id (:id (t2/query-one {:select [:c.id]
                                           :from   [[:report_card :c]]
                                           :left-join [[:sandboxes :s] [:= :s.card_id :c.id]]
                                           :where     [:= :s.group_id (:id &group)]}))]
      (t2/update! :model/Card :id gtap-card-id {:last_used_at (datetime-months-ago 7)})
      (is (= {:rows []
              :total 0}
             (stale/find-candidates
              {:collection-ids #{nil}
               :cutoff-date    (date-months-ago 6)
               :limit          10
               :offset         0
               :sort-column    :name
               :sort-direction :asc})))
      (t2/delete! :model/GroupTableAccessPolicy :card_id gtap-card-id)
      (is (= {:rows [{:model :model/Card :id gtap-card-id}]
              :total 1}
             (stale/find-candidates
              {:collection-ids #{nil}
               :cutoff-date    (date-months-ago 6)
               :limit          10
               :offset         0
               :sort-column    :name
               :sort-direction :asc}))))))

(deftest things-that-are-already-archived-do-not-appear
  (mt/with-temp [:model/Collection {col-id :id} {}
                 :model/Dashboard _ (stale-dashboard {:name          "A"
                                                      :collection_id col-id
                                                      :archived       true})
                 :model/Card _ (stale-card {:name          "B"
                                            :collection_id col-id
                                            :archived       true})]
    (is (= {:rows []
            :total 0}
           (stale/find-candidates
            {:collection-ids #{col-id}
             :cutoff-date    (date-months-ago 6)
             :limit          10
             :offset         0
             :sort-column    :name
             :sort-direction :asc})))))
