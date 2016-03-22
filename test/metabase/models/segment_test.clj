(ns metabase.models.segment-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            (metabase.models [database :refer [Database]]
                             [hydrate :refer :all]
                             [segment :refer :all]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

(defn user-details
  [username]
  (-> (fetch-user username)
      (dissoc :date_joined :last_login)))

(defn segment-details
  [{:keys [creator] :as segment}]
  (-> segment
      (dissoc :id :table_id :created_at :updated_at)
      (assoc :creator (dissoc creator :date_joined :last_login))))

(defn create-segment-then-select
  [table name description creator definition]
  (-> (create-segment table name description creator definition)
      segment-details))

(defn update-segment-then-select
  [segment]
  (-> (update-segment segment (user->id :crowberto))
      segment-details))


;; create-segment
(expect
  {:creator_id  (user->id :rasta)
   :creator     (user-details :rasta)
   :name        "I only want *these* things"
   :description nil
   :is_active   true
   :definition  {:clause ["a" "b"]}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (create-segment-then-select id "I only want *these* things" nil (user->id :rasta) {:clause ["a" "b"]}))))


;; exists-segment?
(expect
  [true
   false]
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                           :table_id    id
                                           :name        "Ivory Tower"
                                           :description "All the glorious things..."
                                           :definition  {:database 45
                                                         :query    {:filter ["yay"]}}}]
        [(exists-segment? id)
         (exists-segment? 34)]))))


;; retrieve-segment
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Ivory Tower"
   :description  "All the glorious things..."
   :is_active    true
   :definition   {:database 45
                  :query    {:filter ["yay"]}}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                           :table_id    id
                                           :name        "Ivory Tower"
                                           :description "All the glorious things..."
                                           :definition  {:database 45
                                                         :query    {:filter ["yay"]}}}]
        (let [{:keys [creator] :as segment} (retrieve-segment id)]
          (-> segment
              (dissoc :id :table_id :created_at :updated_at)
              (assoc :creator (dissoc creator :date_joined :last_login))))))))


;; retrieve-segements
(expect
  [{:creator_id   (user->id :rasta)
    :creator      (user-details :rasta)
    :name         "Segment 1"
    :description  nil
    :is_active    true
    :definition   {}}]
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id1 :id} {:name   "Table 1"
                                          :db_id  database-id
                                          :active true}]
      (tu/with-temp Table [{table-id2 :id} {:name   "Table 2"
                                            :db_id  database-id
                                            :active true}]
        (tu/with-temp Segment [{segement-id1 :id} {:creator_id  (user->id :rasta)
                                                   :table_id    table-id1
                                                   :name        "Segment 1"
                                                   :definition  {}}]
          (tu/with-temp Segment [{segment-id2 :id} {:creator_id  (user->id :rasta)
                                                    :table_id    table-id2
                                                    :name        "Segment 2"
                                                    :definition  {}}]
            (tu/with-temp Segment [{segment-id3 :id} {:creator_id  (user->id :rasta)
                                                      :table_id    table-id1
                                                      :name        "Segment 3"
                                                      :is_active   false
                                                      :definition  {}}]
              (let [segments (retrieve-segments table-id1)]
              (assert (= 1 (count segments)))
              (->> segments
                   (mapv #(into {} %))                      ; expectations doesn't compare our record type properly
                   (mapv #(dissoc % :id :table_id :created_at :updated_at))
                   (mapv (fn [{:keys [creator] :as segment}]
                           (assoc segment :creator (dissoc creator :date_joined :last_login)))))))))))))


;; update-segment
;; basic update.  we are testing several things here
;;  1. ability to update the Segment name
;;  2. creator_id cannot be changed
;;  3. ability to set description, including to nil
;;  4. ability to modify the definition json
;;  5. revision is captured along with our commit message
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Tatooine"
   :description  nil
   :is_active    true
   :definition   {:database 2
                  :query    {:filter ["not" "the droids you're looking for"]}}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                           :table_id    id
                                           :name        "Droids in the desert"
                                           :description "Lookin' for a jedi"
                                           :definition  {}}]
        (update-segment-then-select {:id          id
                                     :name        "Tatooine"
                                     :description nil
                                     :creator_id  (user->id :crowberto)
                                     :table_id    456
                                     :definition  {:database 2
                                                   :query    {:filter ["not" "the droids you're looking for"]}}
                                     :revision_message "Just horsing around"})))))

;; delete-segment
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Droids in the desert"
   :description  "Lookin' for a jedi"
   :is_active    false
   :definition   {}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                           :table_id    id
                                           :name        "Droids in the desert"
                                           :description "Lookin' for a jedi"
                                           :definition  {}}]
        (delete-segment id (user->id :crowberto) "revision message")
        (segment-details (retrieve-segment id))))))


;; ## Segment Revisions

(tu/resolve-private-fns metabase.models.segment serialize-segment diff-segments)

;; serialize-segment
(expect
  {:id          true
   :table_id    true
   :creator_id  (user->id :rasta)
   :name        "Droids in the desert"
   :description "Lookin' for a jedi"
   :definition  {:filter ["AND",[">",4,"2014-10-19"]]}
   :is_active   true}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{table-id :id} {:name   "Stuff"
                                         :db_id  database-id
                                         :active true}]
      (tu/with-temp Segment [segment {:creator_id  (user->id :rasta)
                                      :table_id    table-id
                                      :name        "Droids in the desert"
                                      :description "Lookin' for a jedi"
                                      :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}]
        (-> (serialize-segment Segment (:id segment) segment)
            (update :id boolean)
            (update :table_id boolean))))))


;; diff-segments
(expect
  {:definition  {:before {:filter ["AND" [">" 4 "2014-10-19"]]}
                 :after  {:filter ["AND" ["BETWEEN" 4 "2014-07-01" "2014-10-19"]]}}
   :description {:before "Lookin' for a jedi"
                 :after  "BBB"}
   :name        {:before "Droids in the desert"
                 :after  "Something else"}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (tu/with-temp Segment [segment {:creator_id  (user->id :rasta)
                                      :table_id    id
                                      :name        "Droids in the desert"
                                      :description "Lookin' for a jedi"
                                      :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}]
        (diff-segments Segment segment (assoc segment :name "Something else"
                                                      :description "BBB"
                                                      :definition {:filter ["AND",["BETWEEN",4,"2014-07-01","2014-10-19"]]}))))))

;; test case where definition doesn't change
(expect
  {:name {:before "A"
          :after  "B"}}
  (diff-segments Segment
                 {:name        "A"
                  :description "Unchanged"
                  :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}
                 {:name        "B"
                  :description "Unchanged"
                  :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}))

;; first version, so comparing against nil
(expect
  {:name        {:after  "A"}
   :description {:after "Unchanged"}
   :definition  {:after {:filter ["AND",[">",4,"2014-10-19"]]}}}
  (diff-segments Segment
                 nil
                 {:name        "A"
                  :description "Unchanged"
                  :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}))

;; removals only
(expect
  {:definition  {:before {:filter ["AND",[">",4,"2014-10-19"],["=",5,"yes"]]}
                 :after  {:filter ["AND",[">",4,"2014-10-19"]]}}}
  (diff-segments Segment
                 {:name        "A"
                  :description "Unchanged"
                  :definition  {:filter ["AND",[">",4,"2014-10-19"],["=",5,"yes"]]}}
                 {:name        "A"
                  :description "Unchanged"
                  :definition  {:filter ["AND",[">",4,"2014-10-19"]]}}))
