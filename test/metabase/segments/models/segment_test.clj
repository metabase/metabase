(ns metabase.segments.models.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest update-test
  (testing "Updating"
    (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :rasta)}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment id {:creator_id nil}))))

      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 1
               (t2/update! :model/Segment id {:creator_id (mt/user->id :rasta)})))))))

(deftest identity-hash-test
  (testing "Segment hashes are composed of the segment name and table identity-hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [:model/Database db      {:name "field-db" :engine :h2}
                     :model/Table    table   {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     :model/Segment  segment {:name "big customers" :table_id (:id table) :created_at now}]
        (is (= "be199b7c"
               (serdes/raw-hash ["big customers" (serdes/identity-hash table) now])
               (serdes/identity-hash segment)))))))

(deftest definition-description-missing-definition-test
  (testing "Do not hydrate definition description if definition is nil"
    (mt/with-temp [:model/Segment segment {:name     "Segment"
                                           :table_id (mt/id :users)}]
      (is (=? {:definition_description nil}
              (t2/hydrate segment :definition_description))))))

(deftest ^:parallel definition-description-test
  (mt/with-temp [:model/Segment segment {:name       "Expensive BBQ Spots"
                                         :definition (:query (mt/mbql-query venues
                                                               {:filter
                                                                [:and
                                                                 [:= $price 4]
                                                                 [:= $category_id->categories.name "BBQ"]]}))}]
    (is (= "Filtered by Price is equal to 4 and Category → Name is BBQ"
           (:definition_description (t2/hydrate segment :definition_description))))
    (testing "Segments that reference other Segments (inception)"
      (mt/with-temp [:model/Segment segment-2 {:name "Segment 2"
                                               :definition (:query (mt/mbql-query categories
                                                                     {:filter
                                                                      [:and
                                                                       [:segment (:id segment)]
                                                                       [:not-null $id]]}))}]
        (is (= "Filtered by Expensive BBQ Spots and ID is not empty"
               (:definition_description (t2/hydrate segment-2 :definition_description))))))))

(deftest definition-description-missing-source-table-test
  (testing "Should work if `:definition` does not include `:source-table`"
    (mt/with-temp [:model/Segment segment {:name       "Expensive BBQ Spots"
                                           :definition (mt/$ids venues
                                                         {:filter
                                                          [:= $price 4]})}]
      (is (= "Filtered by Price is equal to 4"
             (:definition_description (t2/hydrate segment :definition_description)))))))

(deftest definition-description-invalid-query-test
  (testing "Should return `nil` if query is invalid"
    (mt/with-temp [:model/Segment segment {:name       "Expensive BBQ Spots"
                                           :definition (:query (mt/mbql-query venues
                                                                 {:filter
                                                                  [:= [:field Integer/MAX_VALUE nil] 4]}))}]
      (is (nil? (:definition_description (t2/hydrate segment :definition_description)))))))
