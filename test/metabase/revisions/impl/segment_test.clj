(ns metabase.revisions.impl.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]))

(deftest ^:parallel serialize-segment-test
  (mt/with-temp [:model/Database {database-id :id} {}
                 :model/Table    {table-id :id} {:db_id database-id}
                 :model/Segment  segment        {:table_id   table-id
                                                 :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]
    (is (=? {:id                      true
             :table_id                true
             :creator_id              (mt/user->id :rasta)
             :name                    "Toucans in the rainforest"
             :description             "Lookin' for a blueberry"
             :show_in_getting_started false
             :caveats                 nil
             :points_of_interest      nil
             :entity_id               (:entity_id segment)
             :definition              {:lib/type :mbql/query
                                       :stages [{:lib/type :mbql.stage/mbql
                                                 :source-table table-id
                                                 :filters [[:> {} [:field {} 4] "2014-10-19"]]}]
                                       :database database-id}
             :archived                false}
            (into {} (-> (revision/serialize-instance :model/Segment (:id segment) segment)
                         (update :id boolean)
                         (update :table_id boolean)))))
    (testing "excluded columns are not present"
      (is (not-any? #{:created_at :updated_at :dependency_analysis_version}
                    (keys (revision/serialize-instance :model/Segment (:id segment) segment)))))))

(deftest ^:parallel diff-segments-test
  (mt/with-temp [:model/Database {database-id :id} {}
                 :model/Table    {table-id :id} {:db_id database-id}
                 :model/Segment  segment        {:table_id   table-id
                                                 :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]
    (is (=? {:definition  {:before {:lib/type :mbql/query
                                    :stages [{:lib/type :mbql.stage/mbql
                                              :source-table table-id
                                              :filters [[:> {} [:field {} 4] "2014-10-19"]]}]
                                    :database database-id}
                           :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
             :description {:before "Lookin' for a blueberry"
                           :after  "BBB"}
             :name        {:before "Toucans in the rainforest"
                           :after  "Something else"}}
            (revision/diff-map
             :model/Segment
             segment
             (assoc segment
                    :name        "Something else"
                    :description "BBB"
                    :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}))))))

(deftest ^:parallel diff-segments-test-2
  (testing "test case where definition doesn't change"
    (is (= {:name {:before "A"
                   :after  "B"}}
           (revision/diff-map
            :model/Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}
            {:name        "B"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))

(deftest ^:parallel diff-segments-test-3
  (testing "first version so comparing against nil"
    (is (= {:name        {:after "A"}
            :description {:after "Unchanged"}
            :definition  {:after {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (revision/diff-map
            :model/Segment
            nil
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))

(deftest ^:parallel diff-segments-test-4
  (testing "removals only"
    (is (= {:definition {:before {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}
                         :after  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (revision/diff-map
            :model/Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}}
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))
