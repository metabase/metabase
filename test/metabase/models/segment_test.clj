(ns metabase.models.segment-test
  (:require [expectations :refer :all]
            [metabase.models
             [database :refer [Database]]
             [segment :as segment :refer :all]
             [table :refer [Table]]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(defn- user-details
  [username]
  (dissoc (fetch-user username) :date_joined :last_login))

(defn- segment-details
  [{:keys [creator], :as segment}]
  (-> segment
      (dissoc :id :table_id :created_at :updated_at)
      (assoc :creator (dissoc creator :date_joined :last_login))))

(defn- create-segment-then-select!
  [table name description creator definition]
  (segment-details (create-segment! table name description creator definition)))

(defn- update-segment-then-select!
  [segment]
  (segment-details (update-segment! segment (user->id :crowberto))))


;; create-segment!
(expect
  {:creator_id              (user->id :rasta)
   :creator                 (user-details :rasta)
   :name                    "I only want *these* things"
   :description             nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :definition              {:aggregation [[:count]]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]]
    (create-segment-then-select! table-id "I only want *these* things" nil (user->id :rasta) {:aggregation [[:count]]})))


;; exists?
(expect
  [true
   false]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}   {:db_id database-id}]
                  Segment  [{segment-id :id} {:table_id table-id}]]
    [(segment/exists? segment-id)
     (segment/exists? 3400)]))


;; retrieve-segment
(expect
  {:creator_id              (user->id :rasta)
   :creator                 (user-details :rasta)
   :name                    "Toucans in the rainforest"
   :description             "Lookin' for a blueberry"
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :definition              {:filter [:= [:field-id 1] 2]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}   {:db_id database-id}]
                  Segment  [{segment-id :id} {:table_id   table-id
                                              :definition {:filter [:= [:field-id 1] 2]}}]]
    (let [{:keys [creator] :as segment} (retrieve-segment segment-id)]
      (-> segment
          (dissoc :id :table_id :created_at :updated_at)
          (assoc :creator (dissoc creator :date_joined :last_login))))))


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
    (doall (for [segment (u/prog1 (retrieve-segments table-id-1)
                                  (assert (= 1 (count <>))))]
             (-> (dissoc (into {} segment) :id :table_id :created_at :updated_at)
                 (update :creator (u/rpartial dissoc :date_joined :last_login)))))))


;; update-segment!
;; basic update.  we are testing several things here
;;  1. ability to update the Segment name
;;  2. creator_id cannot be changed
;;  3. ability to set description, including to nil
;;  4. ability to modify the definition json
;;  5. revision is captured along with our commit message
(expect
  {:creator_id              (user->id :rasta)
   :creator                 (user-details :rasta)
   :name                    "Costa Rica"
   :description             nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :definition              {:filter [:!= [:field-id 10] "toucans"]}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [{:keys [id]} {:table_id id}]]
    (update-segment-then-select! {:id                      id
                                  :name                    "Costa Rica"
                                  :description             nil
                                  :show_in_getting_started false
                                  :caveats                 nil
                                  :points_of_interest      nil
                                  :creator_id              (user->id :crowberto)
                                  :table_id                456
                                  :definition              {:filter [:!= [:field-id 10] "toucans"]}
                                  :revision_message        "Just horsing around"})))

;; delete-segment!
(expect
  {:creator_id              (user->id :rasta)
   :creator                 (user-details :rasta)
   :name                    "Toucans in the rainforest"
   :description             "Lookin' for a blueberry"
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                true
   :definition              nil}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{:keys [id]} {:db_id database-id}]
                  Segment  [{:keys [id]} {:table_id id}]]
    (delete-segment! id (user->id :crowberto) "revision message")
    (segment-details (retrieve-segment id))))


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
    (#'segment/diff-segments Segment segment (assoc segment
                                               :name        "Something else"
                                               :description "BBB"
                                               :definition  {:filter [:between [:field-id 4] "2014-07-01" "2014-10-19"]}))))

;; test case where definition doesn't change
(expect
  {:name {:before "A"
          :after  "B"}}
  (#'segment/diff-segments Segment
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
  (#'segment/diff-segments Segment
                           nil
                           {:name        "A"
                            :description "Unchanged"
                            :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}))

;; removals only
(expect
  {:definition  {:before {:filter [:and [:> [:field-id 4] "2014-10-19"] [:= 5 "yes"]]}
                 :after  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}}
  (#'segment/diff-segments Segment
                           {:name        "A"
                            :description "Unchanged"
                            :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"] [:= 5 "yes"]]}}
                           {:name        "A"
                            :description "Unchanged"
                            :definition  {:filter [:and [:> [:field-id 4] "2014-10-19"]]}}))
