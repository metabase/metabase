(ns metabase.models.native-query-snippet-test
  (:require [clojure.test :refer :all]
            [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest disallow-updating-creator-id-test
  (testing "You shouldn't be allowed to update the creator_id of a NativeQuerySnippet"
    (mt/with-temp NativeQuerySnippet [{snippet-id :id} {:name "my-snippet", :content "wow", :creator_id (mt/user->id :lucky)}]
      (is (thrown-with-msg?
           UnsupportedOperationException
           #"You cannot update the creator_id of a NativeQuerySnippet\."
           (db/update! NativeQuerySnippet snippet-id :creator_id (mt/user->id :rasta))))
      (is (= (mt/user->id :lucky)
             (db/select-one-field :creator_id NativeQuerySnippet :id snippet-id))))))
