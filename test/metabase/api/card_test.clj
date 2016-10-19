(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.http-client :refer :all, :as http]
            [metabase.middleware :as middleware]
            (metabase.models [card :refer [Card]]
                             [card-favorite :refer [CardFavorite]]
                             [card-label :refer [CardLabel]]
                             [database :refer [Database]]
                             [label :refer [Label]]
                             [permissions :refer [Permissions], :as perms]
                             [permissions-group :as perms-group]
                             [table :refer [Table]]
                             [view-log :refer [ViewLog]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ random-name with-temp with-temp* obj->json->obj expect-with-temp]]
            [metabase.util :as u]))

;; # CARD LIFECYCLE

;; ## Helper fns

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


(expect (get middleware/response-unauthentic :body) (http/client :get 401 "card"))
(expect (get middleware/response-unauthentic :body) (http/client :put 401 "card/13"))


;; Make sure `id` is required when `f` is :database
(expect {:errors {:id "id is required parameter when filter mode is 'database'"}}
  ((user->client :crowberto) :get 400 "card" :f :database))

;; Filter cards by table
(expect
  [true
   false
   true]
  (with-temp* [Database [{database-id :id}]
               Table    [{table-1-id :id}  {:db_id database-id}]
               Table    [{table-2-id :id}  {:db_id database-id}]
               Card     [{card-1-id :id}   {:table_id table-1-id}]
               Card     [{card-2-id :id}   {:table_id table-2-id}]]
    (let [card-returned? (fn [table-id card-id]
                           (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :table, :model_id table-id)]
                                             (:id card)))
                                      card-id))]
      [(card-returned? table-1-id card-1-id)
       (card-returned? table-2-id card-1-id)
       (card-returned? table-2-id card-2-id)])))

;; Make sure `id` is required when `f` is :table
(expect {:errors {:id "id is required parameter when filter mode is 'table'"}}
        ((user->client :crowberto) :get 400 "card", :f :table))


;;; Filter by `recent`
;; Should return cards that were recently viewed by current user only
(expect-with-temp [Card     [{card-1-id :id}]
                   Card     [{card-2-id :id}]
                   Card     [{card-3-id :id}]
                   Card     [{card-4-id :id}]
                   ;; 3 was viewed most recently, followed by 4, then 1. Card 2 was viewed by a different user so shouldn't be returned
                   ViewLog  [_               {:model "card", :model_id card-1-id, :user_id (user->id :rasta),     :timestamp (u/->Timestamp #inst "2015-12-01")}]
                   ViewLog  [_               {:model "card", :model_id card-2-id, :user_id (user->id :trashbird), :timestamp (u/->Timestamp #inst "2016-01-01")}]
                   ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta),     :timestamp (u/->Timestamp #inst "2016-02-01")}]
                   ViewLog  [_               {:model "card", :model_id card-4-id, :user_id (user->id :rasta),     :timestamp (u/->Timestamp #inst "2016-03-01")}]
                   ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta),     :timestamp (u/->Timestamp #inst "2016-04-01")}]]
  [card-3-id card-4-id card-1-id]
  (mapv :id ((user->client :rasta) :get 200 "card", :f :recent)))

;;; Filter by `popular`
;; `f=popular` should return cards sorted by number of ViewLog entries for all users; cards with no entries should be excluded
(expect-with-temp [Card     [{card-1-id :id}]
                   Card     [{card-2-id :id}]
                   Card     [{card-3-id :id}]
                   ;; 3 entries for card 3, 2 for card 2, none for card 1,
                   ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta)}]
                   ViewLog  [_               {:model "card", :model_id card-2-id, :user_id (user->id :trashbird)}]
                   ViewLog  [_               {:model "card", :model_id card-2-id, :user_id (user->id :rasta)}]
                   ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :crowberto)}]
                   ViewLog  [_               {:model "card", :model_id card-3-id, :user_id (user->id :rasta)}]]
  [card-3-id card-2-id]
  (map :id ((user->client :rasta) :get 200 "card", :f :popular)))

;;; Filter by `archived`
;; check that the set of Card IDs returned with f=archived is equal to the set of archived cards
(expect-with-temp [Card [{card-1-id :id}]
                   Card [{card-2-id :id} {:archived true}]
                   Card [{card-3-id :id} {:archived true}]]
  #{card-2-id card-3-id}
  (set (map :id ((user->client :rasta) :get 200 "card", :f :archived))))

;;; Filter by `fav`
(expect-with-temp [Card         [{card-id-1 :id}]
                   Card         [{card-id-2 :id}]
                   Card         [{card-id-3 :id}]
                   CardFavorite [_ {:card_id card-id-1, :owner_id (user->id :rasta)}]
                   CardFavorite [_ {:card_id card-id-2, :owner_id (user->id :crowberto)}]]
  [{:id card-id-1, :favorite true}]
  (for [card ((user->client :rasta) :get 200 "card", :f :fav)]
    (select-keys card [:id :favorite])))

;;; Filter by labels
(expect-with-temp [Card      [{card-1-id :id}]
                   Card      [{card-2-id :id}]
                   Label     [{label-1-id :id} {:name "Toucans"}]                           ; slug will be `toucans`
                   Label     [{label-2-id :id} {:name "More Toucans"}]                      ; slug will be `more_toucans`
                   CardLabel [_                {:card_id card-1-id, :label_id label-1-id}]
                   CardLabel [_                {:card_id card-2-id, :label_id label-2-id}]]
  ;; When filtering by `more_toucans` only the second Card should get returned
  [card-2-id]
  (map :id ((user->client :rasta) :get 200 "card", :label "more_toucans")))                 ; filtering is done by slug


;; ## POST /api/card
;; Test that we can make a card
(let [card-name (random-name)]
  (expect-with-temp [Database [{database-id :id}]
                     Table    [{table-id :id}  {:db_id database-id}]]
    {:description            nil
     :name                   card-name
     :creator_id             (user->id :rasta)
     :dataset_query          {:database database-id
                              :type     "query"
                              :query    {:source-table table-id, :aggregation {:aggregation-type "count"}}}
     :display                "scalar"
     :visualization_settings {:global {:title nil}}
     :database_id            database-id ; these should be inferred automatically
     :table_id               table-id
     :query_type             "query"
     :archived               false}
    (dissoc ((user->client :rasta) :post 200 "card" {:name                   card-name
                                                     :display                "scalar"
                                                     :dataset_query          {:database database-id
                                                                              :type     :query
                                                                              :query    {:source-table table-id, :aggregation {:aggregation-type :count}}}
                                                     :visualization_settings {:global {:title nil}}})
            :created_at :updated_at :id)))

;; ## GET /api/card/:id
;; Test that we can fetch a card
(expect-with-temp [Database  [{database-id :id}]
                   Table     [{table-id :id}   {:db_id database-id}]
                   Card      [card             {:dataset_query {:database database-id
                                                                :type     :query
                                                                :query    {:source-table table-id, :aggregation {:aggregation-type :count}}}}]]
  (match-$ card
    {:description            nil
     :dashboard_count        0
     :name                   $
     :creator_id             (user->id :rasta)
     :creator                (match-$ (fetch-user :rasta)
                               {:common_name  "Rasta Toucan"
                                :is_superuser false
                                :is_qbnewb    true
                                :last_login   $
                                :last_name    "Toucan"
                                :first_name   "Rasta"
                                :date_joined  $
                                :email        "rasta@metabase.com"
                                :id           $})
     :updated_at             $
     :dataset_query          $
     :id                     $
     :display                "table"
     :visualization_settings {}
     :created_at             $
     :database_id            database-id ; these should be inferred from the dataset_query
     :table_id               table-id
     :query_type             "query"
     :archived               false
     :labels                 []})
  ((user->client :rasta) :get 200 (str "card/" (:id card))))

;; Check that a user without permissions isn't allowed to fetch the card
(expect-with-temp [Database  [{database-id :id}]
                   Table     [{table-id :id}   {:db_id database-id}]
                   Card      [card             {:dataset_query {:database database-id
                                                                :type     :query
                                                                :query    {:source-table table-id, :aggregation {:aggregation-type :count}}}}]]
  "You don't have permissions to do that."
  (do
    ;; revoke permissions for default group to this database
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ;; now a non-admin user shouldn't be able to fetch this card
    ((user->client :rasta) :get 403 (str "card/" (:id card)))))

;; ## PUT /api/card/:id

;; updating a card that doesn't exist should give a 404
(expect "Not found."
  ((user->client :crowberto) :put 404 "card/12345"))

;; Test that we can edit a Card
(let [updated-name (random-name)]
  (expect-with-temp [Card [{card-id :id, original-name :name}]]
    [original-name
     updated-name]
    [(db/select-one-field :name Card, :id card-id)
     (do ((user->client :rasta) :put 200 (str "card/" card-id) {:name updated-name})
         (db/select-one-field :name Card, :id card-id))]))


(defmacro ^:private with-temp-card {:style/indent 1} [binding & body]
  `(with-temp Card ~binding
     ~@body))

;; Can we update a Card's archived status?
(expect
  [false true false]
  (with-temp-card [{:keys [id]}]
    (let [archived?     (fn [] (:archived (Card id)))
          set-archived! (fn [archived]
                          ((user->client :rasta) :put 200 (str "card/" id) {:archived archived})
                          (archived?))]
      [(archived?)
       (set-archived! true)
       (set-archived! false)])))


;; ## DELETE /api/card/:id
;; Check that we can delete a card
(expect
  nil
  (with-temp-card [{:keys [id]}]
    ((user->client :rasta) :delete 204 (str "card/" id))
    (Card id)))

;; deleting a card that doesn't exist should return a 404 (#1957)
(expect "Not found."
  ((user->client :crowberto) :delete 404 "card/12345"))

;; # CARD FAVORITE STUFF

;; Helper Functions
(defn- fave? [card]
  ((user->client :rasta) :get 200 (format "card/%d/favorite" (:id card))))

(defn- fave! [card]
  ((user->client :rasta) :post 200 (format "card/%d/favorite" (:id card))))

(defn- unfave! [card]
  ((user->client :rasta) :delete 204 (format "card/%d/favorite" (:id card))))

;; ## GET /api/card/:id/favorite
;; Can we see if a Card is a favorite ?
(expect
  {:favorite false}
  (with-temp-card [card]
    (fave? card)))

;; ## POST /api/card/:id/favorite
;; Can we favorite a card?
(expect
  [{:favorite false}
   {:favorite true}]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))]))

;; DELETE /api/card/:id/favorite
;; Can we unfavorite a card?
(expect
  [{:favorite false}
   {:favorite true}
   {:favorite false}]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))
     (do (unfave! card)
         (fave? card))]))


;;; POST /api/card/:id/labels
;; Check that we can update card labels
(expect-with-temp [Card  [{card-id :id}]
                   Label [{label-1-id :id} {:name "Toucan-Friendly"}]
                   Label [{label-2-id :id} {:name "Toucan-Unfriendly"}]]
  [[]                                                                                  ; (1) should start out with no labels
   [{:id label-1-id, :name "Toucan-Friendly",   :slug "toucan_friendly",   :icon nil}  ; (2) set a few labels
    {:id label-2-id, :name "Toucan-Unfriendly", :slug "toucan_unfriendly", :icon nil}]
   []]                                                                                 ; (3) should be able to reset to no labels
  (let [get-labels    (fn []
                        (:labels ((user->client :rasta) :get 200, (str "card/" card-id))))
        update-labels (fn [label-ids]
                        ((user->client :rasta) :post 200, (format "card/%d/labels" card-id) {:label_ids label-ids})
                        (get-labels))]
    [(get-labels)                            ; (1)
     (update-labels [label-1-id label-2-id]) ; (2)
     (update-labels [])]))                   ; (3)
