(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [expectations :refer :all]
            [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.test.util :refer [match-$ expect-eval-actual-first deserialize-dates]]
            [metabase.test-data :refer :all]))

;; # CARD LIFECYCLE

;; Helper fns
(defn post-card [card-name]
  (-> ((user->client :rasta) :post 200 "card" {:organization (:id @test-org)
                                               :name card-name
                                               :public_perms 0
                                               :can_read true
                                               :can_write true
                                               :display "scalar"
                                               :dataset_query {:type "query"
                                                               :query {:source_table (table->id :categories)
                                                                       :filter [nil nil]
                                                                       :aggregation ["count"]
                                                                       :breakout [nil]
                                                                       :limit nil}
                                                               :database (:id @test-db)}
                                               :visualization_settings {:global {:title nil}}})
      (deserialize-dates :updated_at :created_at)))

(defn random-card-name []
  (name (gensym)))

;; ## POST /api/card
;; Test that we can make a card
(let [card-name (random-card-name)]
  (expect-eval-actual-first (match-$ (sel :one Card :name card-name)
                              {:description nil
                               :organization_id (:id @test-org)
                               :name card-name
                               :creator_id (user->id :rasta)
                               :updated_at $
                               :dataset_query {:type "query"
                                               :query {:source_table (table->id :categories)
                                                       :filter [nil nil]
                                                       :aggregation ["count"]
                                                       :breakout [nil]
                                                       :limit nil}
                                               :database (:id @test-org)}
                               :id $
                               :display "scalar"
                               :visualization_settings {:global {:title nil}}
                               :public_perms 0
                               :created_at $})
    (post-card card-name)))



;; ## GET /api/card/:id
;; Test that we can fetch a card
(let [card-name (random-card-name)
      {:keys [id]} (post-card card-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Card :id id)
        {:description nil
         :can_read true
         :can_write true
         :organization_id (:id @test-org)
         :name card-name
         :organization {:inherits true
                        :logo_url nil
                        :description nil
                        :name "Test Organization"
                        :slug "test"
                        :id (:id @test-org)}
         :creator_id (user->id :rasta)
         :updated_at $
         :dataset_query {:type "query"
                         :query {:source_table (table->id :categories)
                                 :filter [nil nil]
                                 :aggregation ["count"]
                                 :breakout [nil]
                                 :limit nil}
                         :database (:id @test-db)}
         :id id
         :display "scalar"
         :visualization_settings {:global {:title nil}}
         :public_perms 0
         :created_at $})
    (-> ((user->client :rasta) :get 200 (format "card/%d" id))
        (deserialize-dates :updated_at :created_at))))

;; ## DELETE /api/card/:id
;; Check that we can delete a card
(let [{:keys [id]} (post-card (random-card-name))]
  (expect-eval-actual-first nil
    (do ((user->client :rasta) :delete 204 (format "card/%d" id))
        (sel :one Card :id id))))


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
(expect-let [card (post-card (random-card-name))]
  {:favorite false}
  (fave? card))

;; ## POST /api/card/:id/favorite
;; Can we favorite a card?
(expect-let [card (post-card (random-card-name))]
  [{:favorite false}
   {:favorite true}]
  [(fave? card)
   (do (fave card)
       (fave? card))])

;; DELETE /api/card/:id/favorite
;; Can we unfavorite a card?
(expect-let [card (post-card (random-card-name))
             get-fave? ((user->client :rasta) :get (format "card/%d/favorite" (:id card)))]
  [{:favorite false}
   {:favorite true}
   {:favorite false}]
  [(fave? card)
   (do (fave card)
       (fave? card))
   (do (unfave card)
       (fave? card))])
