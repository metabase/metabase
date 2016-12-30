(ns metabase.permissions-collection-test
  "A test suite for permissions `Collections`. Reüses functions from `metabase.permissions-test`."
  (:require  [expectations :refer :all]
             [metabase.db :as db]
             (metabase.models [card :refer [Card]]
                              [collection :refer [Collection]]
                              [permissions :as permissions]
                              [permissions-group :as group])
             [metabase.permissions-test :as perms-test]
             [metabase.test.data.users :as test-users]
             [metabase.test.util :as tu]
             [metabase.util :as u]))

(defn- card []
  @(resolve 'metabase.permissions-test/*card:db2-count-of-venues*))

(defn- can-run-query? [username]
  (let [response ((test-users/user->client username) :post (format "card/%d/query" (u/get-id (card))))]
    (not= response "You don't have permissions to do that.")))

(defn- set-card-collection! [collection-or-id]
  (db/update! Card (u/get-id (card))
    :collection_id (u/get-id collection-or-id)))


;; if a card is in no collection but we have data permissions, we should be able to run it
(perms-test/expect-with-test-data
  true
  (can-run-query? :crowberto))

;; if a card is in no collection and we don't have data permissions, we should not be able to run it
(perms-test/expect-with-test-data
  false
  (can-run-query? :rasta))

;; if a card is in a collection and we don't have permissions for that collection, we shouldn't be able to run it
(perms-test/expect-with-test-data
  false
  (tu/with-temp Collection [collection]
    (set-card-collection! collection)
    (can-run-query? :rasta)))

;; if a card is in a collection and we have permissions for that collection, we should be able to run it
(perms-test/expect-with-test-data
  true
  (tu/with-temp Collection [collection]
    (set-card-collection! collection)
    (permissions/grant-collection-read-permissions! (group/all-users) collection)
    (can-run-query? :rasta)))
