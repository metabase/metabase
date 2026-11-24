(ns metabase.bookmarks.models.bookmark-test
  (:require
   [clojure.test :refer :all]
   [metabase.bookmarks.models.bookmark :as bookmark]
   [metabase.bookmarks.schema :as bookmarks.schema]
   [metabase.events.test-util :as events.tu]
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
    (is (mr/validate ::bookmarks.schema/bookmark-ordering {:id 1 :type "dashboard"}))
    (is (not (mr/validate ::bookmarks.schema/bookmark-ordering {:id 1 :type "table"})))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-model-cleanup [:model/Card :model/Collection :model/CardBookmark :model/CollectionBookmark :model/BookmarkOrdering]
    (let [user-id (mt/user->id :rasta)
          rows    (fn [n]
                    (let [card-ids       (t2/insert-returning-pks! :model/Card (mapv (fn [_] (mt/with-temp-defaults :model/Card)) (range n)))
                          collection-ids (t2/insert-returning-pks! :model/Collection (mapv (fn [_] (mt/with-temp-defaults :model/Collection)) (range n)))]
                      (bookmark/create-bookmarks! (map (fn [id] {:type "card" :item_id id :user_id user-id}) (take-nth 2 card-ids)))
                      (into (mapv (fn [id] {:type "card" :item_id id :user_id user-id}) card-ids)
                            (map (fn [id] {:type "collection" :item_id id :user_id user-id}))
                            collection-ids)))
          create! (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(bookmark/create-bookmarks! rows))))
          delete! (fn [n] (let [rows (rows n)]
                            (bookmark/create-bookmarks! rows)
                            (events.tu/statement-count! #(bookmark/delete-bookmarks! rows))))]
      (testing "creating bookmarks, some of them already there"
        (create! 1)
        (is (= (create! 2) (create! 6))))
      (testing "deleting bookmarks"
        (delete! 1)
        (is (= (delete! 2) (delete! 6))))
      (testing "saving the ordering of bookmarks"
        (let [order! (fn [n] (let [rows (take n (rows 6))]
                               (bookmark/create-bookmarks! rows)
                               (events.tu/statement-count! (fn [] (bookmark/save-ordering! user-id (map (fn [row] (select-keys row [:type :item_id])) rows))))))]
          (order! 1)
          (is (= (order! 2) (order! 6))))))))
