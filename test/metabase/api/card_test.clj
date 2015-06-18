(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]]
                             [common :as common])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp]]))

;; # CARD LIFECYCLE

;; ## Helper fns
(defn post-card [card-name]
  ((user->client :rasta) :post 200 "card" {:name                   card-name
                                           :public_perms           0
                                           :can_read               true
                                           :can_write              true
                                           :display                "scalar"
                                           :dataset_query          {:type     "query"
                                                                    :query    {:source_table (id :categories)
                                                                               :filter       [nil nil]
                                                                               :aggregation  ["count"]
                                                                               :breakout     [nil]
                                                                               :limit        nil}
                                                                    :database (db-id)}
                                           :visualization_settings {:global {:title nil}}}))

;; ## GET /api/card
;; Check that only the creator of a private Card can see it
(expect [true
         false]
  (with-temp Card [{:keys [id]} {:name                   (random-name)
                                 :public_perms           common/perms-none
                                 :creator_id             (user->id :crowberto)
                                 :display                :table
                                 :dataset_query          {}
                                 :visualization_settings {}}]
    (let [can-see-card? (fn [user]
                          (contains? (->> ((user->client user) :get 200 "card" :f :all)
                                          (map :id)
                                          set)
                                     id))]
      [(can-see-card? :crowberto)
       (can-see-card? :rasta)])))


;; ## POST /api/card
;; Test that we can make a card
(let [card-name (random-name)]
  (expect-eval-actual-first (match-$ (sel :one Card :name card-name)
                              {:description nil
                               :organization_id nil
                               :name card-name
                               :creator_id (user->id :rasta)
                               :updated_at $
                               :dataset_query {:type "query"
                                               :query {:source_table (id :categories)
                                                       :filter [nil nil]
                                                       :aggregation ["count"]
                                                       :breakout [nil]
                                                       :limit nil}
                                               :database (db-id)}
                               :id $
                               :display "scalar"
                               :visualization_settings {:global {:title nil}}
                               :public_perms 0
                               :created_at $})
    (post-card card-name)))

;; ## GET /api/card/:id
;; Test that we can fetch a card
(let [card-name (random-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Card :name card-name)
        {:description nil
         :can_read true
         :can_write true
         :organization_id nil
         :name card-name
         :creator_id (user->id :rasta)
         :updated_at $
         :dataset_query {:type "query"
                         :query {:source_table (id :categories)
                                 :filter [nil nil]
                                 :aggregation ["count"]
                                 :breakout [nil]
                                 :limit nil}
                         :database (db-id)}
         :id $
         :display "scalar"
         :visualization_settings {:global {:title nil}}
         :public_perms 0
         :created_at $})
    (let [{:keys [id]} (post-card card-name)]
      ((user->client :rasta) :get 200 (format "card/%d" id)))))

;; ## PUT /api/card/:id
;; Test that we can edit a Card
(let [card-name (random-name)
      updated-name (random-name)]
  (expect-eval-actual-first
      [card-name
       updated-name]
    (let [{id :id} (post-card card-name)]
      [(sel :one :field [Card :name] :id id)
       (do ((user->client :rasta) :put 200 (format "card/%d" id) {:name updated-name})
           (sel :one :field [Card :name] :id id))])))

;; ## DELETE /api/card/:id
;; Check that we can delete a card
(expect-eval-actual-first nil
  (let [{:keys [id]} (post-card (random-name))]
    ((user->client :rasta) :delete 204 (format "card/%d" id))
    (sel :one Card :id id)))


;; # CARD FAVORITE STUFF

;; Helper Functions
(defn fave? [card]
  ((user->client :rasta) :get 200 (format "card/%d/favorite" (:id card))))

(defn fave [card]
  ((user->client :rasta) :post 200 (format "card/%d/favorite" (:id card))))

(defn unfave [card]
  ((user->client :rasta) :delete 204 (format "card/%d/favorite" (:id card))))

;; ## GET /api/card/:id/favorite
;; Can we see if a Card is a favorite ?
(expect-let [card (post-card (random-name))]
  {:favorite false}
  (fave? card))

;; ## POST /api/card/:id/favorite
;; Can we favorite a card?
(expect-let [card (post-card (random-name))]
  [{:favorite false}
   {:favorite true}]
  [(fave? card)
   (do (fave card)
       (fave? card))])

;; DELETE /api/card/:id/favorite
;; Can we unfavorite a card?
(expect-let [card (post-card (random-name))
             get-fave? ((user->client :rasta) :get (format "card/%d/favorite" (:id card)))]
  [{:favorite false}
   {:favorite true}
   {:favorite false}]
  [(fave? card)
   (do (fave card)
       (fave? card))
   (do (unfave card)
       (fave? card))])
