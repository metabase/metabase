(ns metabase.models.segment-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [segment :as segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test.data.users :refer [fetch-user user->id]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- user-details
  [username]
  (dissoc (fetch-user username) :date_joined :last_login))

(defn- segment-details
  [{:keys [creator], :as segment}]
  (-> segment
      (dissoc :id :table_id :created_at :updated_at)
      (assoc :creator (dissoc creator :date_joined :last_login))))


;; Updating -- you should not be able to change the creator_id of a Segment
(expect
  UnsupportedOperationException
  (tt/with-temp Segment [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Segment id {:creator_id (user->id :crowberto)})))

;; you shouldn't be able to set it to `nil` either
(expect
  UnsupportedOperationException
  (tt/with-temp Segment [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Segment id {:creator_id nil})))

;; However calling `update!` with a value that is the same as the current value shouldn't throw an Exception
(expect
  true
  (tt/with-temp Segment [{:keys [id]} {:creator_id (user->id :rasta)}]
    (db/update! Segment id {:creator_id (user->id :rasta)})))


;; retrieve-segements
(expect
  [{:creator_id              (user->id :rasta)
    :creator                 (user-details :rasta)
    :name                    "Segment 1"
    :description             nil
    :show_in_getting_started false
    :caveats                 nil
    :points_of_interest      nil
    :archived                false
    :definition              nil}]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id-1 :id}    {:db_id database-id}]
                  Table    [{table-id-2 :id}    {:db_id database-id}]
                  Segment  [{segement-id-1 :id} {:table_id table-id-1, :name "Segment 1", :description nil}]
                  Segment  [{segment-id-2 :id}  {:table_id table-id-2}]
                  Segment  [{segment-id3 :id}   {:table_id table-id-1, :archived true}]]
    (vec
     (for [segment (u/prog1 (segment/retrieve-segments table-id-1)
                     (assert (= 1 (count <>))))]
       (-> (dissoc (into {} segment) :id :table_id :created_at :updated_at)
           (update :creator #(dissoc % :date_joined :last_login)))))))


;; ## Segment Revisions

;; #'segment/serialize-segment
(expect
  {:id                      true
   :table_id                true
   :creator_id              (user->id :rasta)
   :name                    "Toucans in the rainforest"
   :description             "Lookin' for a blueberry"
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :definition              {:filter [:> [:field-id 4] "2014-10-19"]}
   :archived                false}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Segment  [segment        {:table_id   table-id
                                            :definition {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}]]
    (-> (#'segment/serialize-segment Segment (:id segment) segment)
        (update :id boolean)
        (update :table_id boolean))))


;; #'segment/diff-segments
(expect
  {:definition  {:before {:filter [:> [:field-id 4] "2014-10-19"]}
                 :after  {:filter [:between [:field-id 4] "2014-07-01" "2014-10-19"]}}
   :description {:before "Lookin' for a blueberry"
                 :after  "BBB"}
   :name        {:before "Toucans in the rainforest"
                 :after  "Something else"}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Segment  [segment        {:table_id   table-id
                                            :definition {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}]]
    (#'segment/diff-segments
     Segment
     segment
     (assoc segment
       :name        "Something else"
       :description "BBB"
       :definition  {:filter [:between [:field-id 4] "2014-07-01" "2014-10-19"]}))))

;; test case where definition doesn't change
(expect
  {:name {:before "A"
          :after  "B"}}
  (#'segment/diff-segments
   Segment
   {:name        "A"
    :description "Unchanged"
    :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}
   {:name        "B"
    :description "Unchanged"
    :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}))

;; first version  so comparing against nil
(expect
  {:name        {:after  "A"}
   :description {:after "Unchanged"}
   :definition  {:after {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}}
  (#'segment/diff-segments
   Segment
   nil
   {:name        "A"
    :description "Unchanged"
    :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}))

;; removals only
(expect
  {:definition  {:before {:filter [:and [:> [:field-id 4] "2014-10-19"] [:= 5 "yes"]]}
                 :after  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}}
  (#'segment/diff-segments
   Segment
   {:name        "A"
    :description "Unchanged"
    :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"] [:= 5 "yes"]]}}
   {:name        "A"
    :description "Unchanged"
    :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}))
