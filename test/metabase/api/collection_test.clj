(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [expectations :refer :all]
            (metabase.models [card :refer [Card]]
                             [collection :refer [Collection]])
            [metabase.test.data.users :refer [user->client]]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

;; check that we can get a basic list of collections
(tu/expect-with-temp [Collection [collection]]
  [(into {} collection)]
  ((user->client :crowberto) :get 200 "collection"))

;; TODO - check that we don't see collections if we don't have permissions for them

;; TODO - check that we don't see collections if they're archived

;; check that cards are returned with the collections detail endpoint
(tu/expect-with-temp [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
  (tu/obj->json->obj (assoc collection :cards [card]))
  (tu/obj->json->obj ((user->client :crowberto) :get 200 (str "collection/" (u/get-id collection)))))

;; TODO - check that collections detail properly checks permissions

;; TODO - check that collections detail doesn't return archived collections

;; TODO - test that we can create a new collection (POST /api/collection)

;; TODO - test that non-admins aren't allowed to create a collection

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
