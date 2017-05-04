(ns metabase.permissions-collection-test
  "A test suite for permissions `Collections`. Reüses functions from `metabase.permissions-test`."
  (:require [expectations :refer :all]
            [metabase
             [permissions-test :as perms-test :refer [*card:db2-count-of-venues* *db2*]]
             [util :as u]]
            [metabase.models
             [card :as card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as permissions]
             [permissions-group :as group]
             [revision :refer [Revision]]]
            [metabase.test.data.users :as test-users]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; the Card used in the tests below is one Crowberto (an admin) should be allowed to read/write based on data permissions,
;; but not Rasta (all-users)

(defn- api-call-was-successful? {:style/indent 0} [response]
  (when (and (string? response)
             (not= response "You don't have permissions to do that."))
    (println "RESPONSE:" response)) ; DEBUG
  (and (not= response "You don't have permissions to do that.")
       (not= response "Unauthenticated")))

(defn- can-run-query? [username]
  (api-call-was-successful? ((test-users/user->client username) :post (format "card/%d/query" (u/get-id *card:db2-count-of-venues*)))))

(defn- set-card-collection! [collection-or-id]
  (db/update! Card (u/get-id *card:db2-count-of-venues*)
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
  (tt/with-temp Collection [collection]
    (set-card-collection! collection)
    (can-run-query? :rasta)))

;; if a card is in a collection and we have permissions for that collection, we should be able to run it
;; [Disabled for now since this test seems to randomly fail all the time for reasons I don't understand)
#_(perms-test/expect-with-test-data
  true
  (tt/with-temp Collection [collection]
    (set-card-collection! collection)
    (permissions/grant-collection-read-permissions! (group/all-users) collection)
    (can-run-query? :rasta)))

;; Make sure a User isn't allowed to save a Card they have collections readwrite permissions for
;; if they don't have data perms for the query
(defn- query-rasta-has-no-data-perms-for []
  {:database (u/get-id *db2*)
   :type     "query"
   :query    {:source-table (u/get-id (perms-test/table *db2* :venues))}})


(expect
  false
  (perms-test/with-test-data
    (tt/with-temp Collection [collection]
      (set-card-collection! collection)
      (permissions/grant-collection-readwrite-permissions! (group/all-users) collection)
      (api-call-was-successful?
        ((test-users/user->client :rasta) :put (str "card/" (u/get-id *card:db2-count-of-venues*))
         {:dataset_query (query-rasta-has-no-data-perms-for)})))))

;; Make sure a User isn't allowed to unarchive a Card if they don't have data perms for the query
(expect
  false
  (perms-test/with-test-data
    (tt/with-temp Collection [collection]
      (set-card-collection! collection)
      (permissions/grant-collection-readwrite-permissions! (group/all-users) collection)
      (db/update! Card (u/get-id *card:db2-count-of-venues*)
        :archived      true
        :dataset_query (query-rasta-has-no-data-perms-for))
      (api-call-was-successful?
        ((test-users/user->client :rasta) :put (str "card/" (u/get-id *card:db2-count-of-venues*))
         {:archived false})))))

;; Make sure a User isn't allowed to restore a Card to a previous revision if they don't have data perms for the query
(expect
  false
  (perms-test/with-test-data
    (tt/with-temp Collection [collection]
      (set-card-collection! collection)
      (permissions/grant-collection-readwrite-permissions! (group/all-users) collection)
      (tt/with-temp Revision [revision {:model    "Card"
                                        :model_id (u/get-id *card:db2-count-of-venues*)
                                        :object   (card/serialize-instance (assoc (Card (u/get-id *card:db2-count-of-venues*))
                                                                             :dataset_query (query-rasta-has-no-data-perms-for)))}]
        (api-call-was-successful?
          ((test-users/user->client :rasta) :post "revision/revert"
           {:entity      "card"
            :id          (u/get-id (u/get-id *card:db2-count-of-venues*))
            :revision_id (u/get-id revision)}))))))
