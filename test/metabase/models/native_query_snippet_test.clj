(ns metabase.models.native-query-snippet-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Collection NativeQuerySnippet]]
             [test :as mt]]
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

(deftest snippet-collection-test
  (testing "Should be allowed to create snippets in a :snippet Collection"
    (mt/with-temp* [Collection         [{collection-id :id} {:type "snippet"}]
                    NativeQuerySnippet [{snippet-id :id} {:collection_id collection-id}]]
      (is (= collection-id
             (db/select-one-field :collection_id NativeQuerySnippet :id snippet-id)))))

  (doseq [[source dest] [[nil "snippet"]
                         ["snippet" "snippet"]
                         ["snippet" nil]]]
    (testing (format "Should be allowed to move snippets from %s to %s"
                     (if source "a :snippet Collection" "no Collection")
                     (if dest "a :snippet Collection" "no Collection"))
      (mt/with-temp* [Collection         [{source-collection-id :id} {:type source}]
                      Collection         [{dest-collection-id :id}   {:type dest}]
                      NativeQuerySnippet [{snippet-id :id} (when source
                                                             {:collection_id source-collection-id})]]
        (db/update! NativeQuerySnippet snippet-id :collection_id (when dest dest-collection-id))
        (is (= (when dest dest-collection-id)
               (db/select-one-field :collection_id NativeQuerySnippet :id snippet-id))))))

  (doseq [collection-type [nil "x"]]
    (testing (format "Should *not* be allowed to create snippets in a Collection of type %s" (pr-str collection-type))
      (mt/with-temp Collection [{collection-id :id} {:type collection-type}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections of type :snippet"
             (db/insert! NativeQuerySnippet
               {:name          (mt/random-name)
                :content       "1 = 1"
                :creator_id    (mt/user->id :rasta)
                :collection_id collection-id})))))

    (testing (format "Should *not* be allowed to move snippets into a Collection of type %s" (pr-str collection-type))
      (mt/with-temp* [Collection         [{source-collection-id :id} {:type "snippet"}]
                      NativeQuerySnippet [{snippet-id :id}           {:collection_id source-collection-id}]
                      Collection         [{dest-collection-id :id}   {:type collection-type}]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections of type :snippet"
             (db/update! NativeQuerySnippet snippet-id :collection_id dest-collection-id)))))))
