(ns metabase.revisions.specs.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]))

(defn- segment-definition
  "A full query on `table-id` filtered by `field-id` greater than `value`."
  [table-id field-id value]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                (lib/> (lib.metadata/field mp field-id) value))))

(deftest ^:parallel serialize-segment-test
  (mt/with-temp [:model/Segment segment {:definition (segment-definition (mt/id :venues) (mt/id :venues :price) 4)}]
    (is (=? {:table_id                true
             :name                    "Toucans in the rainforest"
             :description             "Lookin' for a blueberry"
             :show_in_getting_started false
             :caveats                 nil
             :points_of_interest      nil
             :definition              {:lib/type :mbql/query
                                       :stages [{:lib/type :mbql.stage/mbql
                                                 :source-table (mt/id :venues)
                                                 :filters [[:> {} [:field {} (mt/id :venues :price)] 4]]}]
                                       :database (mt/id)}
             :archived                false}
            (into {} (-> (revision/snapshot :model/Segment segment)
                         (update :table_id boolean)))))
    (testing "skipped columns are not present"
      (is (not-any? #{:id :creator_id :entity_id :created_at :updated_at}
                    (keys (revision/snapshot :model/Segment segment)))))))

(deftest ^:parallel diff-segments-test
  (mt/with-temp [:model/Segment segment {:definition (segment-definition (mt/id :venues) (mt/id :venues :price) 4)}]
    (is (=? {:definition  {:before {:lib/type :mbql/query
                                    :stages [{:lib/type :mbql.stage/mbql
                                              :source-table (mt/id :venues)
                                              :filters [[:> {} [:field {} (mt/id :venues :price)] 4]]}]
                                    :database (mt/id)}
                           :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
             :description {:before "Lookin' for a blueberry"
                           :after  "BBB"}
             :name        {:before "Toucans in the rainforest"
                           :after  "Something else"}}
            (revision/diff
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
           (revision/diff
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
           (revision/diff
            :model/Segment
            nil
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))

(deftest ^:parallel diff-segments-test-4
  (testing "removals only"
    (is (= {:definition {:before {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}
                         :after  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (revision/diff
            :model/Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}}
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))
