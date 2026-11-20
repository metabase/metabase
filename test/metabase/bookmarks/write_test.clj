(ns metabase.bookmarks.write-test
  (:require
   [clojure.test :refer :all]
   [metabase.bookmarks.write :as bookmarks.write]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest update-collection-bookmark-test
  (mt/with-temp [:model/Collection         {from-id :id} {}
                 :model/Collection         {to-id :id}   {}
                 :model/CollectionBookmark {id :id}      {:collection_id from-id :user_id (mt/user->id :rasta)}]
    (testing "an update that changes nothing writes nothing"
      (is (= 0 (bookmarks.write/update-collection-bookmark! id {:collection_id from-id} {}))))
    (testing "the bookmark moves to a Collection that can hold it"
      (is (= 1 (bookmarks.write/update-collection-bookmark! id {:collection_id to-id} {})))
      (is (= to-id (t2/select-one-fn :collection_id :model/CollectionBookmark :id id))))))
