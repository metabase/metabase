(ns metabase.models.segment-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.segment :as segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- user-details
  [username]
  (dissoc (mt/fetch-user username) :date_joined :last_login))

(deftest update-test
  (testing "Updating"
    (mt/with-temp Segment [{:keys [id]} {:creator_id (mt/user->id :rasta)}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown?
             UnsupportedOperationException
             (db/update! Segment id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown?
             UnsupportedOperationException
             (db/update! Segment id {:creator_id nil}))))

      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= true
               (db/update! Segment id {:creator_id (mt/user->id :rasta)})))))))

(deftest retrieve-segments-test
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id-1 :id}    {:db_id database-id}]
                  Table    [{table-id-2 :id}    {:db_id database-id}]
                  Segment  [{segement-id-1 :id} {:table_id table-id-1, :name "Segment 1", :description nil}]
                  Segment  [{segment-id-2 :id}  {:table_id table-id-2}]
                  Segment  [{segment-id3 :id}   {:table_id table-id-1, :archived true}]]
    (is (= [{:creator_id              (mt/user->id :rasta)
             :creator                 (user-details :rasta)
             :name                    "Segment 1"
             :description             nil
             :show_in_getting_started false
             :caveats                 nil
             :points_of_interest      nil
             :archived                false
             :definition              nil
             :entity_id               nil}]
           (for [segment (u/prog1 (segment/retrieve-segments table-id-1)
                           (assert (= 1 (count <>))))]
             (-> (dissoc (into {} segment) :id :table_id :created_at :updated_at)
                 (update :creator #(dissoc % :date_joined :last_login))))))))

(deftest serialize-segment-test
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Segment  [segment        {:table_id   table-id
                                            :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]]
    (is (= {:id                      true
            :table_id                true
            :creator_id              (mt/user->id :rasta)
            :name                    "Toucans in the rainforest"
            :description             "Lookin' for a blueberry"
            :show_in_getting_started false
            :caveats                 nil
            :points_of_interest      nil
            :entity_id               nil
            :definition              {:filter [:> [:field 4 nil] "2014-10-19"]}
            :archived                false}
           (into {} (-> (#'segment/serialize-segment Segment (:id segment) segment)
                        (update :id boolean)
                        (update :table_id boolean)))))))

(deftest diff-segments-test
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Segment  [segment        {:table_id   table-id
                                            :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]]
    (is (= {:definition  {:before {:filter [:> [:field 4 nil] "2014-10-19"]}
                          :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
            :description {:before "Lookin' for a blueberry"
                          :after  "BBB"}
            :name        {:before "Toucans in the rainforest"
                          :after  "Something else"}}
           (#'segment/diff-segments
            Segment
            segment
            (assoc segment
                   :name        "Something else"
                   :description "BBB"
                   :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]})))))

  (testing "test case where definition doesn't change"
    (is (= {:name {:before "A"
                   :after  "B"}}
           (#'segment/diff-segments
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
           (#'segment/diff-segments
            Segment
            nil
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}))))

  (testing "removals only"
    (is (= {:definition {:before {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}
                         :after  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}}
           (#'segment/diff-segments
            Segment
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"] [:= 5 "yes"]]}}
            {:name        "A"
             :description "Unchanged"
             :definition  {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}})))))
