(ns metabase.models.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.database :refer [Database]]
   [metabase.models.revision :as revision]
   [metabase.models.segment :as segment :refer [Segment]]
   [metabase.models.serialization :as serdes]
   [metabase.models.table :refer [Table]]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest update-test
  (testing "Updating"
    (t2.with-temp/with-temp [Segment {:keys [id]} {:creator_id (mt/user->id :rasta)}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! Segment id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! Segment id {:creator_id nil}))))

      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 1
               (t2/update! Segment id {:creator_id (mt/user->id :rasta)})))))))

(deftest serialize-segment-test
  (mt/with-temp [Database {database-id :id} {}
                 Table    {table-id :id} {:db_id database-id}
                 Segment  segment        {:table_id   table-id
                                          :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]
    (is (= {:id                      true
            :table_id                true
            :creator_id              (mt/user->id :rasta)
            :name                    "Toucans in the rainforest"
            :description             "Lookin' for a blueberry"
            :show_in_getting_started false
            :caveats                 nil
            :points_of_interest      nil
            :entity_id               (:entity_id segment)
            :definition              {:filter [:> [:field 4 nil] "2014-10-19"]}
            :archived                false}
           (into {} (-> (revision/serialize-instance Segment (:id segment) segment)
                        (update :id boolean)
                        (update :table_id boolean)))))))

(deftest diff-segments-test
  (mt/with-temp [Database {database-id :id} {}
                 Table    {table-id :id} {:db_id database-id}
                 Segment  segment        {:table_id   table-id
                                          :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]
    (is (= {:definition  {:before {:filter [:> [:field 4 nil] "2014-10-19"]}
                          :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
            :description {:before "Lookin' for a blueberry"
                          :after  "BBB"}
            :name        {:before "Toucans in the rainforest"
                          :after  "Something else"}}
           (revision/diff-map
            Segment
            segment
            (assoc segment
                   :name        "Something else"
                   :description "BBB"
                   :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]})))))

  (testing "test case where definition doesn't change"
    (is (= {:name {:before "A"
                   :after  "B"}}
           (revision/diff-map
            Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}
            {:name        "B"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}))))

  (testing "first version so comparing against nil"
    (is (= {:name        {:after "A"}
            :description {:after "Unchanged"}
            :definition  {:after {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (revision/diff-map
            Segment
            nil
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}))))

  (testing "removals only"
    (is (= {:definition {:before {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}
                         :after  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (revision/diff-map
            Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}}
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))

(deftest identity-hash-test
  (testing "Segment hashes are composed of the segment name and table identity-hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp [Database db      {:name "field-db" :engine :h2}
                     Table    table   {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     Segment  segment {:name "big customers" :table_id (:id table) :created_at now}]
        (is (= "be199b7c"
               (serdes/raw-hash ["big customers" (serdes/identity-hash table) now])
               (serdes/identity-hash segment)))))))

(deftest definition-description-missing-definition-test
  (testing "Do not hydrate definition description if definition is nil"
    (t2.with-temp/with-temp [Segment segment {:name     "Segment"
                                              :table_id (mt/id :users)}]
      (is (=? {:definition_description nil}
              (t2/hydrate segment :definition_description))))))

(deftest ^:parallel definition-description-test
  (t2.with-temp/with-temp [Segment segment {:name       "Expensive BBQ Spots"
                                            :definition (:query (mt/mbql-query venues
                                                                  {:filter
                                                                   [:and
                                                                    [:= $price 4]
                                                                    [:= $category_id->categories.name "BBQ"]]}))}]
    (is (= "Filtered by Price is equal to 4 and Category → Name is BBQ"
           (:definition_description (t2/hydrate segment :definition_description))))
    (testing "Segments that reference other Segments (inception)"
      (t2.with-temp/with-temp [Segment segment-2 {:name "Segment 2"
                                                  :definition (:query (mt/mbql-query categories
                                                                        {:filter
                                                                         [:and
                                                                          [:segment (:id segment)]
                                                                          [:not-null $id]]}))}]
        (is (= "Filtered by Expensive BBQ Spots and ID is not empty"
               (:definition_description (t2/hydrate segment-2 :definition_description))))))))

(deftest definition-description-missing-source-table-test
  (testing "Should work if `:definition` does not include `:source-table`"
    (t2.with-temp/with-temp [Segment segment {:name       "Expensive BBQ Spots"
                                              :definition (mt/$ids venues
                                                            {:filter
                                                             [:= $price 4]})}]
      (is (= "Filtered by Price is equal to 4"
             (:definition_description (t2/hydrate segment :definition_description)))))))

(deftest definition-description-invalid-query-test
  (testing "Should return `nil` if query is invalid"
    (t2.with-temp/with-temp [Segment segment {:name       "Expensive BBQ Spots"
                                              :definition (:query (mt/mbql-query venues
                                                                    {:filter
                                                                     [:= [:field Integer/MAX_VALUE nil] 4]}))}]
      (is (nil? (:definition_description (t2/hydrate segment :definition_description)))))))
