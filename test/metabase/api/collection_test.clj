(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test.data.users :refer [user->client user->id]]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that we can get a basic list of collections
;; (for the purposes of test purposes remove the personal collections)
(tt/expect-with-temp [Collection [collection]]
  [(assoc (into {} collection) :can_write true)]
  (for [collection ((user->client :crowberto) :get 200 "collection")
        :when (not (:personal_owner_id collection))]
    collection))

;; We should only see our own Personal Collections!
(expect
  ["Lucky Pigeon's Personal Collection"]
  (do
    (collection-test/force-create-personal-collections!)
    ;; now fetch those Collections as the Lucky bird
    (map :name ((user->client :lucky) :get 200 "collection"))))

;; ...unless we are *admins*
(expect
  ["Crowberto Corv's Personal Collection"
   "Lucky Pigeon's Personal Collection"
   "Rasta Toucan's Personal Collection"
   "Trash Bird's Personal Collection"]
  (do
    (collection-test/force-create-personal-collections!)
    ;; now fetch those Collections as a superuser
    (map :name ((user->client :crowberto) :get 200 "collection"))))

;; check that we don't see collections if we don't have permissions for them
(expect
  ["Collection 1"
   "Rasta Toucan's Personal Collection"]
  (tt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                  Collection [collection-2 {:name "Collection 2"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (collection-test/force-create-personal-collections!)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; check that we don't see collections if they're archived
(expect
  ["Rasta Toucan's Personal Collection"
   "Regular Collection"]
  (tt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                  Collection [collection-2 {:name "Regular Collection"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (collection-test/force-create-personal-collections!)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; Check that if we pass `?archived=true` we instead see archived cards
(expect
  ["Archived Collection"]
  (tt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                  Collection [collection-2 {:name "Regular Collection"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (collection-test/force-create-personal-collections!)
    (map :name ((user->client :rasta) :get 200 "collection" :archived :true))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/collection                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we can create a new collection (POST /api/collection)
(expect
  {:name              "Stamp Collection"
   :slug              "stamp_collection"
   :description       nil
   :color             "#123456"
   :archived          false
   :location          "/"
   :personal_owner_id nil}
  (tu/with-model-cleanup [Collection]
    (-> ((user->client :crowberto) :post 200 "collection"
         {:name "Stamp Collection", :color "#123456"})
        (dissoc :id))))

;; test that non-admins aren't allowed to create a collection
(expect
  "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "collection"
   {:name "Stamp Collection", :color "#123456"}))

;; Can I create a Collection as a child of an existing collection?
(expect
  {:id                true
   :name              "Trading Card Collection"
   :slug              "trading_card_collection"
   :description       "Collection of basketball cards including limited-edition holographic Draymond Green"
   :color             "#ABCDEF"
   :archived          false
   :location          "/A/C/D/"
   :personal_owner_id nil}
  (tu/with-model-cleanup [Collection]
    (with-collection-hierarchy [a c d]
      (-> ((user->client :crowberto) :post 200 "collection"
           {:name        "Trading Card Collection"
            :color       "#ABCDEF"
            :description "Collection of basketball cards including limited-edition holographic Draymond Green"
            :parent_id   (u/get-id d)})
          (update :location collection-test/location-path-ids->names)
          (update :id integer?)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUT /api/collection/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we can update a collection (PUT /api/collection/:id)
(tt/expect-with-temp [Collection [collection]]
  {:id                (u/get-id collection)
   :name              "My Beautiful Collection"
   :slug              "my_beautiful_collection"
   :description       nil
   :color             "#ABCDEF"
   :archived          false
   :location          "/"
   :personal_owner_id nil}
  ((user->client :crowberto) :put 200 (str "collection/" (u/get-id collection))
   {:name "My Beautiful Collection", :color "#ABCDEF"}))

;; check that users without write perms aren't allowed to update a Collection
(expect
  "You don't have permissions to do that."
  (tt/with-temp Collection [collection]
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
     {:name "My Beautiful Collection", :color "#ABCDEF"})))

;; Archiving a collection should delete any alerts associated with questions in the collection
(expect
  {:emails (merge (et/email-to :crowberto {:subject "One of your alerts has stopped working",
                                           :body    {"the question was archived by Crowberto Corv" true}})
                  (et/email-to :rasta {:subject "One of your alerts has stopped working",
                                       :body    {"the question was archived by Crowberto Corv" true}}))
   :pulse  nil}
  (tt/with-temp* [Collection            [{collection-id :id}]
                  Card                  [{card-id :id :as card} {:collection_id collection-id}]
                  Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                         :alert_first_only false
                                                         :creator_id       (user->id :rasta)
                                                         :name             "Original Alert Name"}]

                  PulseCard             [_              {:pulse_id pulse-id
                                                         :card_id  card-id
                                                         :position 0}]
                  PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                  PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (user->id :crowberto)
                                                         :pulse_channel_id pc-id}]
                  PulseChannelRecipient [{pcr-id-2 :id} {:user_id          (user->id :rasta)
                                                         :pulse_channel_id pc-id}]]
    (et/with-fake-inbox
      (et/with-expected-messages 2
        ((user->client :crowberto) :put 200 (str "collection/" collection-id)
         {:name "My Beautiful Collection", :color "#ABCDEF", :archived true}))
      (array-map
       :emails (et/regex-email-bodies #"the question was archived by Crowberto Corv")
       :pulse  (Pulse pulse-id)))))

;; I shouldn't be allowed to archive a Collection without proper perms
(expect
  "You don't have permissions to do that."
  (tt/with-temp Collection [collection]
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
     {:archived true})))

;; Perms checking should be recursive as well...
;;
;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you would
;; also need perms for B
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection-a]
                  Collection [collection-b {:location (collection/children-location collection-a)}]]
    (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
     {:archived true})))

;; Can I *change* the `location` of a Collection? (i.e. move it into a different parent Colleciton)
(expect
  {:id                true
   :name              "E"
   :slug              "e"
   :description       nil
   :color             "#ABCDEF"
   :archived          false
   :location          "/A/B/"
   :personal_owner_id nil}
  (with-collection-hierarchy [a b e]
    (-> ((user->client :crowberto) :put 200 (str "collection/" (u/get-id e))
         {:parent_id (u/get-id b)})
        (update :location collection-test/location-path-ids->names)
        (update :id integer?))))

;; I shouldn't be allowed to move the Collection without proper perms.
;; If I want to move A into B, I should need permissions for both A and B
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection-a]
                  Collection [collection-b]]
    (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
     {:parent_id (u/get-id collection-b)})))

;; Perms checking should be recursive as well...
;;
;; Create A, B, and C; B is a child of A. Grant perms for A and B. Moving A into C should fail because we need perms
;; for C:
;; (collections with readwrite perms marked below with a `*`)
;;
;; A* -> B*  ==>  C -> A -> B
;; C
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection-a]
                  Collection [collection-b {:location (collection/children-location collection-a)}]
                  Collection [collection-c]]
    (doseq [collection [collection-a collection-b]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
     {:parent_id (u/get-id collection-c)})))


;; Create A, B, and C; B is a child of A. Grant perms for A and C. Moving A into C should fail because we need perms
;; for B:
;; (collections with readwrite perms marked below with a `*`)
;;
;; A* -> B  ==>  C -> A -> B
;; C*
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection-a]
                  Collection [collection-b {:location (collection/children-location collection-a)}]
                  Collection [collection-c]]
    (doseq [collection [collection-a collection-c]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
     {:parent_id (u/get-id collection-c)})))

;; Create A, B, and C; B is a child of A. Grant perms for B and C. Moving A into C should fail because we need perms
;; for A:
;; (collections with readwrite perms marked below with a `*`)
;;
;; A -> B*  ==>  C -> A -> B
;; C*
(expect
  "You don't have permissions to do that."
  (tt/with-temp* [Collection [collection-a]
                  Collection [collection-b {:location (collection/children-location collection-a)}]
                  Collection [collection-c]]
    (doseq [collection [collection-b collection-c]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
     {:parent_id (u/get-id collection-c)})))
