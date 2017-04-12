(ns metabase.api.card-test
  "Tests for /api/card endpoints."
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [medley.core :as m]
            [toucan.db :as db]
            [toucan.util.test :as tt]
            [metabase.http-client :refer :all, :as http]
            [metabase.middleware :as middleware]
            (metabase.models [card :refer [Card]]
                             [card-favorite :refer [CardFavorite]]
                             [card-label :refer [CardLabel]]
                             [collection :refer [Collection]]
                             [database :refer [Database]]
                             [label :refer [Label]]
                             [permissions :refer [Permissions], :as perms]
                             [permissions-group :as perms-group]
                             [table :refer [Table]]
                             [view-log :refer [ViewLog]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [match-$ random-name obj->json->obj], :as tu]
            [metabase.util :as u])
  (:import java.util.UUID))

;;; CARD LIFECYCLE

;;; Helpers

(def ^:const card-defaults
  {:archived          false
   :collection_id     nil
   :description       nil
   :display           "scalar"
   :enable_embedding  false
   :embedding_params  nil
   :made_public_by_id nil
   :public_uuid       nil
   :query_type        "query"
   :cache_ttl         nil})

;; ## GET /api/card
;; Filter cards by database
(expect
  [true
   false
   true]
  (tt/with-temp* [Database [{db-id :id}]
                  Card     [{card-1-id :id} {:database_id (id)}]
                  Card     [{card-2-id :id} {:database_id db-id}]]
    (let [card-returned? (fn [database-id card-id]
                           (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :database, :model_id database-id)]
                                             (u/get-id card)))
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
(defn- card-returned? [table-id card-id]
  (contains? (set (for [card ((user->client :rasta) :get 200 "card", :f :table, :model_id table-id)]
                    (u/get-id card)))
             card-id))

(expect
  [true
   false
   true]
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-1-id :id}  {:db_id database-id}]
                  Table    [{table-2-id :id}  {:db_id database-id}]
                  Card     [{card-1-id :id}   {:table_id table-1-id}]
                  Card     [{card-2-id :id}   {:table_id table-2-id}]]
    [(card-returned? table-1-id card-1-id)
     (card-returned? table-2-id card-1-id)
     (card-returned? table-2-id card-2-id)]))

;; Make sure `id` is required when `f` is :table
(expect {:errors {:id "id is required parameter when filter mode is 'table'"}}
        ((user->client :crowberto) :get 400 "card", :f :table))


;;; Filter by `recent`
;; Should return cards that were recently viewed by current user only
(tt/expect-with-temp [Card     [{card-1-id :id}]
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
(tt/expect-with-temp [Card     [{card-1-id :id}]
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
(tt/expect-with-temp [Card [{card-1-id :id}]
                      Card [{card-2-id :id} {:archived true}]
                      Card [{card-3-id :id} {:archived true}]]
  #{card-2-id card-3-id}
  (set (map :id ((user->client :rasta) :get 200 "card", :f :archived))))

;;; Filter by `fav`
(tt/expect-with-temp [Card         [{card-id-1 :id}]
                      Card         [{card-id-2 :id}]
                      Card         [{card-id-3 :id}]
                      CardFavorite [_ {:card_id card-id-1, :owner_id (user->id :rasta)}]
                      CardFavorite [_ {:card_id card-id-2, :owner_id (user->id :crowberto)}]]
  [{:id card-id-1, :favorite true}]
  (for [card ((user->client :rasta) :get 200 "card", :f :fav)]
    (select-keys card [:id :favorite])))

;;; Filter by labels
(tt/expect-with-temp [Card      [{card-1-id :id}]
                      Card      [{card-2-id :id}]
                      Label     [{label-1-id :id} {:name "Toucans"}]                           ; slug will be `toucans`
                      Label     [{label-2-id :id} {:name "More Toucans"}]                      ; slug will be `more_toucans`
                      CardLabel [_                {:card_id card-1-id, :label_id label-1-id}]
                      CardLabel [_                {:card_id card-2-id, :label_id label-2-id}]]
  ;; When filtering by `more_toucans` only the second Card should get returned
  [card-2-id]
  (map :id ((user->client :rasta) :get 200 "card", :label "more_toucans")))                 ; filtering is done by slug

(defn- mbql-count-query [database-id table-id]
  {:database database-id
   :type     "query"
   :query    {:source-table table-id, :aggregation {:aggregation-type "count"}}})

;; ## POST /api/card
;; Test that we can make a card
(let [card-name (random-name)]
  (tt/expect-with-temp [Database [{database-id :id}]
                        Table    [{table-id :id}  {:db_id database-id}]]
    (merge card-defaults
           {:name                   card-name
            :creator_id             (user->id :rasta)
            :dataset_query          (mbql-count-query database-id table-id)
            :visualization_settings {:global {:title nil}}
            :database_id            database-id ; these should be inferred automatically
            :table_id               table-id})
    ;; make sure we clean up after ourselves as well and delete the Card we create
    (dissoc (u/prog1 ((user->client :rasta) :post 200 "card" {:name                   card-name
                                                              :display                "scalar"
                                                              :dataset_query          (mbql-count-query database-id table-id)
                                                              :visualization_settings {:global {:title nil}}})
              (db/delete! Card :id (u/get-id <>)))
            :created_at :updated_at :id)))

;; ## GET /api/card/:id
;; Test that we can fetch a card
(tt/expect-with-temp [Database  [{database-id :id}]
                      Table     [{table-id :id}   {:db_id database-id}]
                      Card      [card             {:dataset_query (mbql-count-query database-id table-id)}]]
  (merge card-defaults
         (match-$ card
           {:dashboard_count        0
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
            :can_write              true
            :created_at             $
            :database_id            database-id ; these should be inferred from the dataset_query
            :table_id               table-id
            :collection             nil
            :labels                 []}))
  ((user->client :rasta) :get 200 (str "card/" (u/get-id card))))

;; Check that a user without permissions isn't allowed to fetch the card
(tt/expect-with-temp [Database  [{database-id :id}]
                      Table     [{table-id :id}    {:db_id database-id}]
                      Card      [card              {:dataset_query (mbql-count-query database-id table-id)}]]
  "You don't have permissions to do that."
  (do
    ;; revoke permissions for default group to this database
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    ;; now a non-admin user shouldn't be able to fetch this card
    ((user->client :rasta) :get 403 (str "card/" (u/get-id card)))))

;; ## PUT /api/card/:id

;; updating a card that doesn't exist should give a 404
(expect "Not found."
  ((user->client :crowberto) :put 404 "card/12345"))

;; Test that we can edit a Card
(let [updated-name (random-name)]
  (tt/expect-with-temp [Card [{card-id :id, original-name :name}]]
    [original-name
     updated-name]
    [(db/select-one-field :name Card, :id card-id)
     (do ((user->client :rasta) :put 200 (str "card/" card-id) {:name updated-name})
         (db/select-one-field :name Card, :id card-id))]))

(defmacro ^:private with-temp-card {:style/indent 1} [binding & body]
  `(tt/with-temp Card ~binding
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

;; Can we clear the description of a Card? (#4738)
(expect
  nil
  (with-temp-card [card {:description "What a nice Card"}]
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:description nil})
    (db/select-one-field :description Card :id (u/get-id card))))

;; description should be blankable as well
(expect
  ""
  (with-temp-card [card {:description "What a nice Card"}]
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:description ""})
    (db/select-one-field :description Card :id (u/get-id card))))

;; Can we update a card's embedding_params?
(expect
  {:abc "enabled"}
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding true]
      ((user->client :crowberto) :put 200 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))
    (db/select-one-field :embedding_params Card :id (u/get-id card))))

;; We shouldn't be able to update them if we're not an admin...
(expect
  "You don't have permissions to do that."
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding true]
      ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))

;; ...or if embedding isn't enabled
(expect
  "Embedding is not enabled."
  (with-temp-card [card]
    (tu/with-temporary-setting-values [enable-embedding false]
      ((user->client :crowberto) :put 400 (str "card/" (u/get-id card)) {:embedding_params {:abc "enabled"}}))))

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
  (db/exists? CardFavorite, :card_id (u/get-id card), :owner_id (user->id :rasta)))

(defn- fave! [card]
  ((user->client :rasta) :post 200 (format "card/%d/favorite" (u/get-id card))))

(defn- unfave! [card]
  ((user->client :rasta) :delete 204 (format "card/%d/favorite" (u/get-id card))))

;; ## GET /api/card/:id/favorite
;; Can we see if a Card is a favorite ?
(expect
  false
  (with-temp-card [card]
    (fave? card)))

;; ## POST /api/card/:id/favorite
;; Can we favorite a card?
(expect
  [false
   true]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))]))

;; DELETE /api/card/:id/favorite
;; Can we unfavorite a card?
(expect
  [false
   true
   false]
  (with-temp-card [card]
    [(fave? card)
     (do (fave! card)
         (fave? card))
     (do (unfave! card)
         (fave? card))]))


;;; POST /api/card/:id/labels
;; Check that we can update card labels
(tt/expect-with-temp [Card  [{card-id :id}]
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


;;; POST /api/:card-id/query/csv

(defn- do-with-temp-native-card {:style/indent 0} [f]
  (tt/with-temp* [Database  [{database-id :id} {:details (:details (Database (id))), :engine :h2}]
                  Table     [{table-id :id}    {:db_id database-id, :name "CATEGORIES"}]
                  Card      [card              {:dataset_query {:database database-id
                                                                :type     :native
                                                                :native   {:query "SELECT COUNT(*) FROM CATEGORIES;"}}}]]
    ;; delete all permissions for this DB
    (perms/delete-related-permissions! (perms-group/all-users) (perms/object-path database-id))
    (f database-id card)))

;; can someone with native query *read* permissions see a CSV card? (Issue #3648)
(expect
  (str "COUNT(*)\n"
       "75\n")
  (do-with-temp-native-card
    (fn [database-id card]
      ;; insert new permissions for native read access
      (perms/grant-native-read-permissions! (perms-group/all-users) database-id)
      ;; now run the query
      ((user->client :rasta) :post 200 (format "card/%d/query/csv" (u/get-id card))))))

;; does someone without *read* permissions get DENIED?
(expect
  "You don't have permissions to do that."
  (do-with-temp-native-card
    (fn [database-id card]
      ((user->client :rasta) :post 403 (format "card/%d/query/csv" (u/get-id card))))))


;;; Tests for GET /api/card/:id/json
;; endpoint should return an array of maps, one for each row
(expect
  [{(keyword "COUNT(*)") 75}]
  (do-with-temp-native-card
    (fn [database-id card]
      (perms/grant-native-read-permissions! (perms-group/all-users) database-id)
      ((user->client :rasta) :post 200 (format "card/%d/query/json" (u/get-id card))))))


;;; Test GET /api/card/:id/query/csv & GET /api/card/:id/json **WITH PARAMETERS**

(defn- do-with-temp-native-card-with-params {:style/indent 0} [f]
  (tt/with-temp* [Database  [{database-id :id} {:details (:details (Database (id))), :engine :h2}]
               Table     [{table-id :id}    {:db_id database-id, :name "VENUES"}]
               Card      [card              {:dataset_query {:database database-id
                                                             :type     :native
                                                             :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE CATEGORY_ID = {{category}};"
                                                                        :template_tags {:category {:id           "a9001580-3bcc-b827-ce26-1dbc82429163"
                                                                                                   :name         "category"
                                                                                                   :display_name "Category"
                                                                                                   :type         "number"
                                                                                                   :required     true}}}}}]]
    (f database-id card)))

(def ^:private ^:const ^String encoded-params
  (json/generate-string [{:type   :category
                          :target [:variable [:template-tag :category]]
                          :value  2}]))

;; CSV
(expect
  (str "COUNT(*)\n"
       "8\n")
  (do-with-temp-native-card-with-params
    (fn [database-id card]
      ((user->client :rasta) :post 200 (format "card/%d/query/csv?parameters=%s" (u/get-id card) encoded-params)))))

;; JSON
(expect
  [{(keyword "COUNT(*)") 8}]
  (do-with-temp-native-card-with-params
    (fn [database-id card]
      ((user->client :rasta) :post 200 (format "card/%d/query/json?parameters=%s" (u/get-id card) encoded-params)))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                                      COLLECTIONS                                                       |
;;; +------------------------------------------------------------------------------------------------------------------------+

;; Make sure we can create a card and specify its `collection_id` at the same time
(tt/expect-with-temp [Collection [collection]]
  (u/get-id collection)
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (let [{card-id :id} ((user->client :rasta) :post 200 "card" {:name                   "My Cool Card"
                                                                 :display                "scalar"
                                                                 :dataset_query          (mbql-count-query (id) (id :venues))
                                                                 :visualization_settings {:global {:title nil}}
                                                                 :collection_id          (u/get-id collection)})]
      ;; make sure we clean up after ourselves and delete the newly created Card
      (u/prog1 (db/select-one-field :collection_id Card :id card-id)
        (db/delete! Card :id card-id)))))

;; Make sure we card creation fails if we try to set a `collection_id` we don't have permissions for
(tt/expect-with-temp [Collection [collection]]
  "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "card" {:name                   "My Cool Card"
                                           :display                "scalar"
                                           :dataset_query          (mbql-count-query (id) (id :venues))
                                           :visualization_settings {:global {:title nil}}
                                           :collection_id          (u/get-id collection)}))

;; Make sure we can change the `collection_id` of a Card if it's not in any collection
(tt/expect-with-temp [Card       [card]
                      Collection [collection]]
  (u/get-id collection)
  (do
    ((user->client :crowberto) :put 200 (str "card/" (u/get-id card)) {:collection_id (u/get-id collection)})
    (db/select-one-field :collection_id Card :id (u/get-id card))))

;; Make sure we can still change *anything* for a Card if we don't have permissions for the Collection it belongs to
(tt/expect-with-temp [Collection [collection]
                      Card       [card       {:collection_id (u/get-id collection)}]]
  "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:name "Number of Blueberries Consumed Per Month"}))

;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the new collection
(tt/expect-with-temp [Collection [original-collection]
                      Collection [new-collection]
                      Card       [card                {:collection_id (u/get-id original-collection)}]]
  "You don't have permissions to do that."
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
    ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})))

;; Make sure that we can't change the `collection_id` of a Card if we don't have write permissions for the current collection
(tt/expect-with-temp [Collection [original-collection]
                      Collection [new-collection]
                      Card       [card                {:collection_id (u/get-id original-collection)}]]
  "You don't have permissions to do that."
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
    ((user->client :rasta) :put 403 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})))

;; But if we do have permissions for both, we should be able to change it.
(tt/expect-with-temp [Collection [original-collection]
                      Collection [new-collection]
                      Card       [card                {:collection_id (u/get-id original-collection)}]]
  (u/get-id new-collection)
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) original-collection)
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) new-collection)
    ((user->client :rasta) :put 200 (str "card/" (u/get-id card)) {:collection_id (u/get-id new-collection)})
    (db/select-one-field :collection_id Card :id (u/get-id card))))


;;; Test GET /api/card?collection= -- Test that we can use empty string to return Cards not in any collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2]]
  [(u/get-id card-2)]
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (map :id ((user->client :rasta) :get 200 "card/" :collection ""))))

;; Test GET /api/card?collection=<slug> filters by collection with slug
(tt/expect-with-temp [Collection [collection {:name "Favorite Places"}]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2]]
  [(u/get-id card-1)]
  (do
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (map :id ((user->client :rasta) :get 200 "card/" :collection :favorite_places))))

;; Test GET /api/card?collection=<slug> should return a 404 if no such collection exists
(expect
  "Not found."
  ((user->client :rasta) :get 404 "card/" :collection :some_fake_collection_slug))

;; Make sure GET /api/card?collection=<slug> still works with Collections with URL-encoded Slugs (#4535)
(expect
  []
  (tt/with-temp Collection [collection {:name "Obsługa klienta"}]
    (do
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :get 200 "card/" :collection "obs%C5%82uga_klienta"))))

;; ...even if the slug isn't passed in URL-encoded
(expect
  []
  (tt/with-temp Collection [collection {:name "Obsługa klienta"}]
    (do
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      ((user->client :rasta) :get 200 "card/" :collection "obsługa_klienta"))))


;;; ------------------------------------------------------------ Bulk Collections Update (POST /api/card/collections) ------------------------------------------------------------

(defn- collection-ids [cards-or-card-ids]
  (map :collection_id (db/select [Card :collection_id]
                        :id [:in (map u/get-id cards-or-card-ids)])))

(defn- POST-card-collections!
  "Update the Collection of CARDS-OR-CARD-IDS via the `POST /api/card/collections` endpoint using USERNAME;
   return the response of this API request and the latest Collection IDs from the database."
  [username expected-status-code collection-or-collection-id-or-nil cards-or-card-ids]
  [((user->client username) :post expected-status-code "card/collections"
     {:collection_id (when collection-or-collection-id-or-nil
                       (u/get-id collection-or-collection-id-or-nil))
      :card_ids      (map u/get-id cards-or-card-ids)})
   (collection-ids cards-or-card-ids)])

;; Test that we can bulk move some Cards with no collection into a collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1]
                      Card       [card-2]]
  [{:status "ok"}
   [(u/get-id collection) (u/get-id collection)]]
  (POST-card-collections! :crowberto 200 collection [card-1 card-2]))

;; Test that we can bulk move some Cards from one collection to another
(tt/expect-with-temp [Collection [old-collection]
                      Collection [new-collection]
                      Card       [card-1         {:collection_id (u/get-id old-collection)}]
                      Card       [card-2         {:collection_id (u/get-id old-collection)}]]
  [{:status "ok"}
   [(u/get-id new-collection) (u/get-id new-collection)]]
  (POST-card-collections! :crowberto 200 new-collection [card-1 card-2]))

;; Test that we can bulk remove some Cards from a collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2     {:collection_id (u/get-id collection)}]]
  [{:status "ok"}
   [nil nil]]
  (POST-card-collections! :crowberto 200 nil [card-1 card-2]))

;; Check that we aren't allowed to move Cards if we don't have permissions for destination collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1]
                      Card       [card-2]]
  ["You don't have permissions to do that."
   [nil nil]]
  (POST-card-collections! :rasta 403 collection [card-1 card-2]))

;; Check that we aren't allowed to move Cards if we don't have permissions for source collection
(tt/expect-with-temp [Collection [collection]
                      Card       [card-1     {:collection_id (u/get-id collection)}]
                      Card       [card-2     {:collection_id (u/get-id collection)}]]
  ["You don't have permissions to do that."
   [(u/get-id collection) (u/get-id collection)]]
  (POST-card-collections! :rasta 403 nil [card-1 card-2]))

;; Check that we aren't allowed to move Cards if we don't have permissions for the Card
(tt/expect-with-temp [Collection [collection]
                      Database   [database]
                      Table      [table      {:db_id (u/get-id database)}]
                      Card       [card-1     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]
                      Card       [card-2     {:dataset_query (mbql-count-query (u/get-id database) (u/get-id table))}]]
  ["You don't have permissions to do that."
   [nil nil]]
  (do
    (perms/revoke-permissions! (perms-group/all-users) (u/get-id database))
    (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
    (POST-card-collections! :rasta 403 collection [card-1 card-2])))


;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+
;;; |                                                                    PUBLIC SHARING ENDPOINTS                                                                    |
;;; +----------------------------------------------------------------------------------------------------------------------------------------------------------------+

(defn- shared-card []
  {:public_uuid       (str (UUID/randomUUID))
   :made_public_by_id (user->id :crowberto)})

;;; ------------------------------------------------------------ POST /api/card/:id/public_link ------------------------------------------------------------

;; Test that we can share a Card
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      (let [{uuid :uuid} ((user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card)))]
        (db/exists? Card :id (u/get-id card), :public_uuid uuid)))))

;; Test that we *cannot* share a Card if we aren't admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      ((user->client :rasta) :post 403 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we *cannot* share a Card if the setting is disabled
(expect
  "Public sharing is not enabled."
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Card [card]
      ((user->client :crowberto) :post 400 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we *cannot* share a Card if the Card has been archived
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card {:archived true}]
      ((user->client :crowberto) :post 404 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if the Card doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :post 404 (format "card/%d/public_link" Integer/MAX_VALUE))))

;; Test that if a Card has already been shared we reüse the existing UUID
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (= (:public_uuid card)
         (:uuid ((user->client :crowberto) :post 200 (format "card/%d/public_link" (u/get-id card))))))))


;;; ------------------------------------------------------------ DELETE /api/card/:id/public_link ------------------------------------------------------------

;; Test that we can unshare a Card
(expect
  false
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      ((user->client :crowberto) :delete 204 (format "card/%d/public_link" (u/get-id card)))
      (db/exists? Card :id (u/get-id card), :public_uuid (:public_uuid card)))))

;; Test that we *cannot* unshare a Card if we are not admins
(expect
  "You don't have permissions to do that."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      ((user->client :rasta) :delete 403 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if Card isn't shared
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card]
      ((user->client :crowberto) :delete 404 (format "card/%d/public_link" (u/get-id card))))))

;; Test that we get a 404 if Card doesn't exist
(expect
  "Not found."
  (tu/with-temporary-setting-values [enable-public-sharing true]
    ((user->client :crowberto) :delete 404 (format "card/%d/public_link" Integer/MAX_VALUE))))

;; Test that we can fetch a list of publically-accessible cards
(expect
  [{:name true, :id true, :public_uuid true}]
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card (shared-card)]
      (for [card ((user->client :crowberto) :get 200 "card/public")]
        (m/map-vals boolean (select-keys card [:name :id :public_uuid]))))))

;; Test that we can fetch a list of embeddable cards
(expect
  [{:name true, :id true}]
  (tu/with-temporary-setting-values [enable-embedding true]
    (tt/with-temp Card [card {:enable_embedding true}]
      (for [card ((user->client :crowberto) :get 200 "card/embeddable")]
        (m/map-vals boolean (select-keys card [:name :id]))))))
