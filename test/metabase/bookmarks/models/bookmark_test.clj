(ns metabase.bookmarks.models.bookmark-test
  (:require
   [clojure.test :refer :all]
   [metabase.bookmarks.models.bookmark :as bookmark]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel bookmarks-for-user-test
  (testing "Sanity check: just make sure the bookmarks-for-user DB query actually works"
    (is (some? (bookmark/bookmarks-for-user (mt/user->id :rasta))))))

(deftest bookmarks-for-user-uses-target-users-permissions-test
  (testing "bookmarks-for-user filters by the passed user's read perms"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {coll-id :id :as coll} {}
                     :model/Card       {card-id :id} {:collection_id coll-id}]
        ;; rasta has no read access to coll; crowberto (an admin) can read everything.
        (t2/insert! :model/CardBookmark {'user_id (mt/user->id :rasta) 'card_id card-id})
        (testing "querying as an admin current-user still filters using rasta's (empty) permissions"
          (mt/with-current-user (mt/user->id :crowberto)
            (is (empty? (bookmark/bookmarks-for-user (mt/user->id :rasta))))))
        (testing "granting rasta read access makes the bookmark visible regardless of current-user"
          (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
          (mt/with-current-user (mt/user->id :crowberto)
            (is (= [card-id]
                   (map :item_id (bookmark/bookmarks-for-user (mt/user->id :rasta)))))))))))

(deftest ^:parallel normalize-bookmark-result-test
  (testing "collection properties don't shadow other properties"
    (let [row {:report_card.archived         nil
               :report_dashboard.description "Dashboard description"
               :item_id                      853
               :report_dashboard.name        "Test Dashboard"
               :report_card.description      nil
               :report_card.display          nil
               :type                         "dashboard"
               :report_card.name             nil
               :report_dashboard.archived    false
               :collection.description       "Collection description"
               :collection.archived          true
               :report_card.card_type        nil
               :created_at                   #t "2022-09-14T17:45:13.444716Z"
               :collection.name              "Test Collection"}]
      (is (= {:item_id     853
              :name        "Test Dashboard"
              :type        "dashboard"
              :description "Dashboard description"
              :id          "dashboard-853"}
             (#'bookmark/normalize-bookmark-result row))))))
