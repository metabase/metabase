(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [expectations :refer :all]
            [metabase.db :refer :all]
            [metabase.http-client :refer :all]
            [metabase.driver.query-processor.expand :as ql]
            (metabase.models [card :refer [Card]]
                             [common :as common]
                             [database :refer [Database]]
                             [table :refer [Table]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ expect-eval-actual-first random-name with-temp with-temp* obj->json->obj]]))

;; # CARD LIFECYCLE

;; ## Helper fns
(defn post-card [card-name]
  ((user->client :rasta) :post 200 "card" {:name                   card-name
                                           :public_perms           0
                                           :can_read               true
                                           :can_write              true
                                           :display                "scalar"
                                           :dataset_query          (obj->json->obj (ql/wrap-inner-query
                                                                                    (query categories
                                                                                      (ql/aggregation (ql/count)))))
                                           :visualization_settings {:global {:title nil}}}))

;; ## GET /api/card
;; Filter cards by database
(expect
  [true
   false
   true]
  (with-temp* [Database [{db-id :id}]
               Card     [{card-1-id :id} {:database_id (id)}]
               Card     [{card-2-id :id} {:database_id db-id}]]
    (let [card-returned? (fn [database-id card-id]
                           (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :database, :model_id database-id)]
                                             (:id card)))
                                      card-id))]
      [(card-returned? (id) card-1-id)
       (card-returned? db-id card-1-id)
       (card-returned? db-id card-2-id)])))

;; Make sure `id` is required when `f` is :database
(expect {:errors {:id "id is required parameter when filter mode is 'database'"}}
  ((user->client :crowberto) :get 400 "card" :f :database))

;; Filter cards by table
(expect
  [true
   false
   true]
  (with-temp* [Database [{database-id :id}]
               Table    [{table-1-id :id} {:db_id database-id}]
               Table    [{table-2-id :id} {:db_id database-id}]
               Card     [{card-1-id :id} {:table_id table-1-id}]
               Card     [{card-2-id :id} {:table_id table-2-id}]]
    (let [card-returned? (fn [table-id card-id]
                           (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :table, :model_id table-id)]
                                             (:id card)))
                                      card-id))]
      [(card-returned? table-1-id card-1-id)
       (card-returned? table-2-id card-1-id)
       (card-returned? table-2-id card-2-id)])))

;; Make sure `id` is required when `f` is :table
(expect {:errors {:id "id is required parameter when filter mode is 'table'"}}
  ((user->client :crowberto) :get 400 "card" :f :table))

;; ## POST /api/card
;; Test that we can make a card
(let [card-name (random-name)]
  (expect-eval-actual-first (match-$ (sel :one Card :name card-name)
                              {:description            nil
                               :organization_id        nil
                               :name                   card-name
                               :creator_id             (user->id :rasta)
                               :updated_at             $
                               :dataset_query          (obj->json->obj (ql/wrap-inner-query
                                                                        (query categories
                                                                          (ql/aggregation (ql/count)))))
                               :id                     $
                               :display                "scalar"
                               :visualization_settings {:global {:title nil}}
                               :public_perms           0
                               :created_at             $
                               :database_id            (id)
                               :table_id               (id :categories)
                               :query_type             "query"
                               :archived               false})
    (post-card card-name)))

;; ## GET /api/card/:id
;; Test that we can fetch a card
(let [card-name (random-name)]
  (expect-eval-actual-first
      (match-$ (sel :one Card :name card-name)
        {:description            nil
         :can_read               true
         :can_write              true
         :organization_id        nil
         :dashboard_count        0
         :name                   card-name
         :creator_id             (user->id :rasta)
         :creator                (match-$ (fetch-user :rasta)
                                   {:common_name  "Rasta Toucan",
                                    :is_superuser false,
                                    :is_qbnewb    true,
                                    :last_login   $,
                                    :last_name    "Toucan",
                                    :first_name   "Rasta",
                                    :date_joined  $,
                                    :email        "rasta@metabase.com",
                                    :id           $})
         :updated_at             $
         :dataset_query          (obj->json->obj (ql/wrap-inner-query
                                                   (query categories
                                                     (ql/aggregation (ql/count)))))
         :id                     $
         :display                "scalar"
         :visualization_settings {:global {:title nil}}
         :public_perms           0
         :created_at             $
         :database_id            (id)
         :table_id               (id :categories)
         :query_type             "query"
         :archived               false
         :labels                 []})
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
    (Card id)))

;; deleting a card that doesn't exist should return a 404 (#1957)
(expect "Not found."
  ((user->client :crowberto) :delete 404 "card/12345"))

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
