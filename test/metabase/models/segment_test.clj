(ns metabase.models.segment-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer :all]
                             [segment :refer :all])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]))

(defn user-details
  [username]
  (-> (fetch-user username)
      (dissoc :date_joined :last_login)))

(defn create-segment-then-select
  [name description creator definition]
  (let [{:keys [creator] :as segment} (create-segment name description creator definition)]
    (-> segment
        (dissoc :id :created_at :updated_at)
        (assoc :creator (dissoc creator :date_joined :last_login)))))

(defn update-segment-then-select
  [segment message]
  (let [{:keys [creator] :as segment} (update-segment segment message)]
    (-> segment
        (dissoc :id  :created_at :updated_at)
        (assoc :creator (dissoc creator :date_joined :last_login)))))


;; create-segment
(expect
  {:creator_id  (user->id :rasta)
   :creator     (user-details :rasta)
   :name        "I only want *these* things"
   :description nil
   :definition  {:clause ["a" "b"]}}
  (create-segment-then-select "I only want *these* things" nil (user->id :rasta) {:clause ["a" "b"]}))


;; retrieve-segment
;; this should cover all the basic Segment attributes
(expect
  {:creator_id   (user->id :rasta)
   :creator      (user-details :rasta)
   :name         "Ivory Tower"
   :description  "All the glorious things..."
   :definition   {:database 45
                  :query    {:filter ["yay"]}}}
  (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                       :name        "Ivory Tower"
                                       :description "All the glorious things..."
                                       :definition  {:database 45
                                                     :query    {:filter ["yay"]}}}]
    (let [{:keys [creator] :as segment} (retrieve-segment id)]
      (-> segment
          (dissoc :id :created_at :updated_at)
          (assoc :creator (dissoc creator :date_joined :last_login))))))


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
  (tu/with-temp Segment [{:keys [id]} {:creator_id  (user->id :rasta)
                                       :name        "Droids in the desert"
                                       :description "Lookin' for a jedi"
                                       :definition  {}}]
    (update-segment-then-select {:id          id
                                 :name        "Tatooine"
                                 :description nil
                                 :creator_id  (user->id :crowberto)
                                 :definition  {:database 2
                                               :query    {:filter ["not" "the droids you're looking for"]}}} "Just horsing around")))
