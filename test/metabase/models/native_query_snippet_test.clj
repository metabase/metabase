(ns metabase.models.native-query-snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest disallow-updating-creator-id-test
  (testing "You shouldn't be allowed to update the creator_id of a NativeQuerySnippet"
    (t2.with-temp/with-temp [:model/NativeQuerySnippet {snippet-id :id} {:name "my-snippet", :content "wow", :creator_id (mt/user->id :lucky)}]
      (is (thrown-with-msg?
           Exception
           #"You cannot update the creator_id of a NativeQuerySnippet\."
           (t2/update! :model/NativeQuerySnippet snippet-id {:creator_id (mt/user->id :rasta)})))
      (is (= (mt/user->id :lucky)
             (t2/select-one-fn :creator_id :model/NativeQuerySnippet :id snippet-id))))))

(deftest snippet-collection-test
  (testing "Should be allowed to create snippets in a Collection in the :snippets namespace"
    (mt/with-temp [:model/Collection         {collection-id :id} {:namespace "snippets"}
                   :model/NativeQuerySnippet {snippet-id :id} {:collection_id collection-id}]
      (is (= collection-id
             (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id snippet-id)))))

  (doseq [[source dest] [[nil "snippets"]
                         ["snippets" "snippets"]
                         ["snippets" nil]]]
    (testing (format "Should be allowed to move snippets from %s to %s"
                     (if source "a :snippets Collection" "no Collection")
                     (if dest "a :snippets Collection" "no Collection"))
      (mt/with-temp [:model/Collection         {source-collection-id :id} {:namespace source}
                     :model/Collection         {dest-collection-id :id}   {:namespace dest}
                     :model/NativeQuerySnippet {snippet-id :id} (when source
                                                                  {:collection_id source-collection-id})]
        (t2/update! :model/NativeQuerySnippet snippet-id {:collection_id (when dest dest-collection-id)})
        (is (= (when dest dest-collection-id)
               (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id snippet-id))))))

  (doseq [collection-namespace [nil "x"]]
    (testing (format "Should *not* be allowed to create snippets in a Collection in the %s namespace"
                     (pr-str collection-namespace))
      (t2.with-temp/with-temp [:model/Collection {collection-id :id} {:namespace collection-namespace}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (t2/insert! :model/NativeQuerySnippet
                         {:name          (mt/random-name)
                          :content       "1 = 1"
                          :creator_id    (mt/user->id :rasta)
                          :collection_id collection-id})))))

    (testing (format "Should *not* be allowed to move snippets into a Collection in the namespace %s" (pr-str collection-namespace))
      (mt/with-temp [:model/Collection         {source-collection-id :id} {:namespace "snippets"}
                     :model/NativeQuerySnippet {snippet-id :id}           {:collection_id source-collection-id}
                     :model/Collection         {dest-collection-id :id}   {:namespace collection-namespace}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A NativeQuerySnippet can only go in Collections in the :snippets namespace"
             (t2/update! :model/NativeQuerySnippet snippet-id {:collection_id dest-collection-id})))))))

(deftest identity-hash-test
  (testing "Native query snippet hashes are composed of the name and the collection's hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [:model/Collection         coll    {:name "field-db" :namespace :snippets :location "/" :created_at now}
                     :model/NativeQuerySnippet snippet {:name "my snippet" :collection_id (:id coll) :created_at now}]
        (is (= "7ac51ad0"
               (serdes/raw-hash ["my snippet" (serdes/identity-hash coll) now])
               (serdes/identity-hash snippet)))))))
