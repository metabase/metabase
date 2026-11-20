(ns metabase.bookmarks.models.bookmark-test
  (:require
   [clojure.test :refer :all]
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.bookmarks.models.bookmark :as bookmark]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
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
        (t2/insert! :model/CardBookmark {:user_id (mt/user->id :rasta) :card_id card-id})
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
               :collection.authority_level   nil
               :collection.is_remote_synced  nil
               :report_card.card_type        nil
               :created_at                   #t "2022-09-14T17:45:13.444716Z"
               :collection.name              "Test Collection"
               :document.name                nil
               :document.archived            nil
               :exploration.name             nil
               :exploration.description      nil
               :exploration.archived         nil}]
      (is (= {:item_id     853
              :name        "Test Dashboard"
              :type        "dashboard"
              :description "Dashboard description"
              :id          "dashboard-853"}
             (#'bookmark/normalize-bookmark-result row))))))

(deftest ^:parallel ordering-type-schema-test
  (testing "BookmarkOrdering type is bookmarkable model"
    (is (mr/validate ::bookmarks.schema/bookmark-ordering.update {:type "dashboard"}))
    (is (not (mr/validate ::bookmarks.schema/bookmark-ordering.update {:type "table"})))))

(defn- orderings
  "The type, item id and position of each BookmarkOrdering of `user-id`, by position."
  [user-id]
  (t2/select-fn-vec (juxt :type :item_id :ordering) :model/BookmarkOrdering
                    :user_id user-id {:order-by [[:ordering :asc]]}))

(deftest save-ordering-keeps-bookmarked-items-only-test
  (mt/with-temp [:model/Card {card-id :id}           {}
                 :model/Dashboard {dashboard-id :id} {}
                 :model/Card {unbookmarked-id :id}   {}]
    (mt/with-model-cleanup [:model/BookmarkOrdering :model/CardBookmark :model/DashboardBookmark]
      (let [rasta    (mt/user->id :rasta)
            crowberto (mt/user->id :crowberto)]
        (t2/insert! :model/CardBookmark {:user_id rasta :card_id card-id})
        (t2/insert! :model/DashboardBookmark {:user_id rasta :dashboard_id dashboard-id})
        (t2/insert! :model/BookmarkOrdering {:user_id crowberto :type "card" :item_id card-id :ordering 0})
        (testing "stale orderings are replaced and unbookmarked items get none"
          (bookmark/save-ordering! rasta [{:type "card" :item_id unbookmarked-id}
                                          {:type "dashboard" :item_id dashboard-id}
                                          {:type "card" :item_id card-id}])
          (is (= [["dashboard" dashboard-id 0] ["card" card-id 1]]
                 (orderings rasta))))
        (testing "orderings of other users are untouched"
          (is (= [["card" card-id 0]] (orderings crowberto))))))))

(deftest save-ordering-is-atomic-test
  (mt/with-temp [:model/Card {card-id :id}           {}
                 :model/Dashboard {dashboard-id :id} {}]
    (mt/with-model-cleanup [:model/BookmarkOrdering :model/CardBookmark :model/DashboardBookmark]
      (let [rasta (mt/user->id :rasta)]
        (t2/insert! :model/CardBookmark {:user_id rasta :card_id card-id})
        (t2/insert! :model/DashboardBookmark {:user_id rasta :dashboard_id dashboard-id})
        (bookmark/save-ordering! rasta [{:type "card" :item_id card-id}
                                        {:type "dashboard" :item_id dashboard-id}])
        (testing "a failed insert keeps the previous ordering"
          (mt/with-dynamic-fn-redefs [bookmarks.db/insert-bookmark-orderings! (fn [_rows] (throw (ex-info "Insert failed" {})))]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Insert failed"
                                  (bookmark/save-ordering! rasta [{:type "dashboard" :item_id dashboard-id}
                                                                  {:type "card" :item_id card-id}]))))
          (is (= [["card" card-id 0] ["dashboard" dashboard-id 1]]
                 (orderings rasta))))))))
