(ns metabase.models.native-query-snippet-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Collection NativeQuerySnippet]]
            [metabase.models.serialization.hash :as serdes.hash]
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

(deftest snippet-collection-test
  (testing "Should be allowed to create snippets in a Collection in the :snippets namespace"
    (mt/with-temp* [Collection         [{collection-id :id} {:namespace "snippets"}]
                    NativeQuerySnippet [{snippet-id :id} {:collection_id collection-id}]]
      (is (= collection-id
             (db/select-one-field :collection_id NativeQuerySnippet :id snippet-id)))))

  (doseq [[source dest] [[nil "snippets"]
                         ["snippets" "snippets"]
                         ["snippets" nil]]]
    (testing (format "Should be allowed to move snippets from %s to %s"
                     (if source "a :snippets Collection" "no Collection")
                     (if dest "a :snippets Collection" "no Collection"))
      (mt/with-temp* [Collection         [{source-collection-id :id} {:namespace source}]
                      Collection         [{dest-collection-id :id}   {:namespace dest}]
                      NativeQuerySnippet [{snippet-id :id} (when source
                                                             {:collection_id source-collection-id})]]
        (db/update! NativeQuerySnippet snippet-id :collection_id (when dest dest-collection-id))
        (is (= (when dest dest-collection-id)
               (db/select-one-field :collection_id NativeQuerySnippet :id snippet-id))))))

  (doseq [collection-namespace [nil "x"]]
    (testing (format "Should *not* be allowed to create snippets in a Collection in the %s namespace"
                     (pr-str collection-namespace))
      (mt/with-temp Collection [{collection-id :id} {:namespace collection-namespace}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (db/insert! NativeQuerySnippet
               {:name          (mt/random-name)
                :content       "1 = 1"
                :creator_id    (mt/user->id :rasta)
                :collection_id collection-id})))))

    (testing (format "Should *not* be allowed to move snippets into a Collection in the namespace %s" (pr-str collection-namespace))
      (mt/with-temp* [Collection         [{source-collection-id :id} {:namespace "snippets"}]
                      NativeQuerySnippet [{snippet-id :id}           {:collection_id source-collection-id}]
                      Collection         [{dest-collection-id :id}   {:namespace collection-namespace}]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (db/update! NativeQuerySnippet snippet-id :collection_id dest-collection-id)))))))

(deftest normalize-template_tags-test
  (testing ":template_tags should get normalized when coming out of the DB"
    (mt/with-temp NativeQuerySnippet [{snippet-id :id} {:template_tags {"text"         {:display-name "Text-1"
                                                                                        :id           "random-id-1"
                                                                                        :name         "text-1"
                                                                                        :type         "text"}
                                                                        "field-filter" {:default      nil
                                                                                        :dimension    ["field" 1 nil]
                                                                                        :id           "random-id-2"
                                                                                        :display-name "Field Filter"
                                                                                        :name         "field-filter"
                                                                                        :type         "dimension"
                                                                                        :widget-type  "string/="}}}]
      (is (= {"field-filter" {:default      nil,
                              :dimension    [:field 1 nil],
                              :display-name "Field Filter",
                              :id           "random-id-2",
                              :name         "field-filter",
                              :type         :dimension,
                              :widget-type  :string/=},
              "text" {:display-name "Text-1",
                      :id           "random-id-1",
                      :name         "text",
                      :type         :text}}
            (db/select-one-field :template_tags NativeQuerySnippet :id snippet-id))))))

(deftest identity-hash-test
  (testing "Native query snippet hashes are composed of the name and the collection's hash"
    (mt/with-temp* [Collection         [coll    {:name "field-db" :namespace :snippets :location "/"}]
                    NativeQuerySnippet [snippet {:name "my snippet" :collection_id (:id coll)}]]
      (is (= "0e4562b1"
             (serdes.hash/raw-hash ["my snippet" (serdes.hash/identity-hash coll)])
             (serdes.hash/identity-hash snippet))))))
