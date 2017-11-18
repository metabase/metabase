(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [expectations :refer :all]
            [metabase
             [email-test :as et]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test.data.users :refer [user->client user->id]]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; check that we can get a basic list of collections
(tt/expect-with-temp [Collection [collection]]
  [(assoc (into {} collection) :can_write true)]
  ((user->client :crowberto) :get 200 "collection"))

;; check that we don't see collections if we don't have permissions for them
(expect
  ["Collection 1"]
  (tt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                  Collection [collection-2 {:name "Collection 2"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; check that we don't see collections if they're archived
(expect
  ["Regular Collection"]
  (tt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                  Collection [collection-2 {:name "Regular Collection"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (map :name ((user->client :rasta) :get 200 "collection"))))

;; Check that if we pass `?archived=true` we instead see archived cards
(expect
  ["Archived Collection"]
  (tt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                  Collection [collection-2 {:name "Regular Collection"}]]
    (perms/grant-collection-read-permissions! (group/all-users) collection-1)
    (perms/grant-collection-read-permissions! (group/all-users) collection-2)
    (map :name ((user->client :rasta) :get 200 "collection" :archived :true))))

;; check that we can see collection details (GET /api/collection/:id)
(expect
  "Coin Collection"
  (tt/with-temp Collection [collection {:name "Coin Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (:name ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection))))))

;; check that collections detail properly checks permissions
(expect
  "You don't have permissions to do that."
  (tt/with-temp Collection [collection]
    ((user->client :rasta) :get 403 (str "collection/" (u/get-id collection)))))

;; check that cards are returned with the collections detail endpoint
(tt/expect-with-temp [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
  (tu/obj->json->obj (assoc collection :cards [card]))
  (tu/obj->json->obj ((user->client :crowberto) :get 200 (str "collection/" (u/get-id collection)))))

;; check that collections detail doesn't return archived collections
(expect
  "Not found."
  (tt/with-temp Collection [collection {:archived true}]
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
            (db/delete! Collection :id (u/get-id <>)))
          :id))

;; test that non-admins aren't allowed to create a collection
(expect
  "You don't have permissions to do that."
  ((user->client :rasta) :post 403 "collection"
   {:name "Stamp Collection", :color "#123456"}))

;; test that we can update a collection (PUT /api/collection/:id)
(tt/expect-with-temp [Collection [collection]]
  {:id          (u/get-id collection)
   :name        "My Beautiful Collection"
   :slug        "my_beautiful_collection"
   :description nil
   :color       "#ABCDEF"
   :archived    false}
  ((user->client :crowberto) :put 200 (str "collection/" (u/get-id collection))
   {:name "My Beautiful Collection", :color "#ABCDEF"}))

;; check that non-admins aren't allowed to update a collection
(expect
  "You don't have permissions to do that."
  (tt/with-temp Collection [collection]
    ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
     {:name "My Beautiful Collection", :color "#ABCDEF"})))

;; Archiving a collection should delete any alerts associated with questions in the collection
(tt/expect-with-temp [Collection            [{collection-id :id}]
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

  [(merge (et/email-to :crowberto {:subject "One of your alerts has stopped working",
                                   :body    {"the question was archived by Crowberto Corv" true}})
          (et/email-to :rasta {:subject "One of your alerts has stopped working",
                               :body    {"the question was archived by Crowberto Corv" true}}))
   nil]
  (et/with-fake-inbox
    (et/with-expected-messages 2
      ((user->client :crowberto) :put 200 (str "collection/" collection-id)
       {:name "My Beautiful Collection", :color "#ABCDEF", :archived true}))
    [(et/regex-email-bodies #"the question was archived by Crowberto Corv")
     (Pulse pulse-id)]))
