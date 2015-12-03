(ns metabase.models.segment-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [metabase.db :as db]
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

(defn create-segment-then-select
  [table name description creator definition]
  (let [{:keys [creator] :as segment} (create-segment table name description creator definition)]
    (-> segment
        (dissoc :id :table_id :created_at :updated_at)
        (assoc :creator (dissoc creator :date_joined :last_login)))))

(defn update-segment-then-select
  [segment message]
  (let [{:keys [creator] :as segment} (update-segment segment message)]
    (-> segment
        (dissoc :id :table_id :created_at :updated_at)
        (assoc :creator (dissoc creator :date_joined :last_login)))))


;; create-segment
(expect
  {:creator_id  (user->id :rasta)
   :creator     (user-details :rasta)
   :name        "I only want *these* things"
   :description nil
   :definition  {:clause ["a" "b"]}}
  (tu/with-temp Database [{database-id :id} {:name      "Hillbilly"
                                             :engine    :yeehaw
                                             :details   {}
                                             :is_sample false}]
    (tu/with-temp Table [{:keys [id]} {:name   "Stuff"
                                       :db_id  database-id
                                       :active true}]
      (create-segment-then-select id "I only want *these* things" nil (user->id :rasta) {:clause ["a" "b"]}))))


;; retrieve-segment
;; this should cover all the basic Segment attributes
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Ivory Tower"
   :description  "All the glorious things..."
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


;; update-segment
;; basic update.  we are testing several things here
;;  1. ability to update the Segment name
;;  2. creator_id cannot be changed
;;  3. ability to set description, including to nil
;;  4. ability to modify the definition json
;;  5. revision is captured along with our commit message
;; TODO: check on the revision
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Tatooine"
   :description  nil
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
                                                   :query    {:filter ["not" "the droids you're looking for"]}}} "Just horsing around")))))
