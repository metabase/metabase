(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [expectations :refer :all]
            [metabase.db :as db]
            (metabase.models [card :refer [Card]]
                             [collection :refer [Collection]]
                             [permissions :as perms]
                             [permissions-group :as group])
            [metabase.test.data.users :refer [user->client]]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

;; check that we can get a basic list of collections
(tu/expect-with-temp [Collection [collection]]
  [(assoc (into {} collection) :can_write true)]
  ((user->client :crowberto) :get 200 "collection"))

;; check that we don't see collections if we don't have permissions for them
(tu/expect-with-temp [Collection [collection-1 {:name "Collection 1"}]
                      Collection [collection-2 {:name "Collection 2"}]]
  ["Collection 1"]
  (do
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; check that we don't see collections if they're archived
(tu/expect-with-temp [Collection [collection-1 {:name "Archived Collection", :archived true}]
                      Collection [collection-2 {:name "Regular Collection"}]]
  ["Regular Collection"]
  (do
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; Check that if we pass `?archived=true` we instead see archived cards
(tu/expect-with-temp [Collection [collection-1 {:name "Archived Collection", :archived true}]
                      Collection [collection-2 {:name "Regular Collection"}]]
  ["Archived Collection"]
  (do
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (map :name ((user->client :rasta) :get 200 "collection" :archived :true))))

;; check that we can see collection details (GET /api/collection/:id)
(expect
  "Coin Collection"
  (tu/with-temp Collection [collection {:name "Coin Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (:name ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection))))))

;; check that collections detail properly checks permissions
(expect
  "You don't have permissions to do that."
  (tu/with-temp Collection [collection]
    ((user->client :rasta) :get 403 (str "collection/" (u/get-id collection)))))

;; check that cards are returned with the collections detail endpoint
(tu/expect-with-temp [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
  (tu/obj->json->obj (assoc collection :cards [card]))
  (tu/obj->json->obj ((user->client :crowberto) :get 200 (str "collection/" (u/get-id collection)))))

;; check that collections detail doesn't return archived collections
(expect
  "Not found."
  (tu/with-temp Collection [collection {:archived true}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    ((user->client :rasta) :get 404 (str "collection/" (u/get-id collection)))))

;; test that we can create a new collection (POST /api/collection)
(expect
  {:name        "Stamp Collection"
   :slug        "stamp_collection"
   :description nil
   :color       "#123456"
   :archived    false}
  (dissoc (u/prog1 ((user->client :crowberto) :post 200 "collection"
                    {:name "Stamp Collection", :color "#123456"})
            ;; make sure we clean up after ourselves
            (db/cascade-delete! Collection :id (u/get-id <>)))
          :id))

;; test that non-admins aren't allowed to create a collection
(expect
  "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "collection"
   {:name "Stamp Collection", :color "#123456"}))

;; test that we can update a collection (PUT /api/collection/:id)
(tu/expect-with-temp [Collection [collection]]
  {:id          (u/get-id collection)
   :name        "My Beautiful Collection"
   :slug        "my_beautiful_collection"
   :description nil
   :color       "#ABCDEF"
   :archived    false}
  ((user->client :crowberto) :put 200 (str "collection/" (u/get-id collection))
   {:name "My Beautiful Collection", :color "#ABCDEF"}))

;; check that non-admins aren't allowed to update a collection
(tu/expect-with-temp [Collection [collection]]
  "You don't have permissions to do that."
  ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
   {:name "My Beautiful Collection", :color "#ABCDEF"}))
