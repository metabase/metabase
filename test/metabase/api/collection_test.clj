(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [email-test :as et]
             [util :as u]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [dashboard :refer [Dashboard]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]]
            [metabase.test.data.users :refer [user->client user->id]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that we can get a basic list of collections
;; (for the purposes of test purposes remove the personal collections)
(tt/expect-with-temp [Collection [collection]]
  [{:parent_id nil, :effective_location nil, :effective_ancestors (), :can_write true, :name "Our analytics", :id "root"}
   (assoc (into {} collection) :can_write true)]
  (for [collection ((user->client :crowberto) :get 200 "collection")
        :when (not (:personal_owner_id collection))]
    collection))

;; We should only see our own Personal Collections!
(expect
  ["Our analytics"
   "Lucky Pigeon's Personal Collection"]
  (do
    (collection-test/force-create-personal-collections!)
    ;; now fetch those Collections as the Lucky bird
    (map :name ((user->client :lucky) :get 200 "collection"))))

;; ...unless we are *admins*
(expect
  ["Our analytics"
   "Crowberto Corv's Personal Collection"
   "Lucky Pigeon's Personal Collection"
   "Rasta Toucan's Personal Collection"
   "Trash Bird's Personal Collection"]
  (do
    (collection-test/force-create-personal-collections!)
    ;; now fetch those Collections as a superuser
    (map :name ((user->client :crowberto) :get 200 "collection"))))

;; check that we don't see collections if we don't have permissions for them
(expect
  ["Our analytics"
   "Collection 1"
   "Rasta Toucan's Personal Collection"]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                    Collection [collection-2 {:name "Collection 2"}]]
      (perms/grant-collection-read-permissions! (group/all-users) collection-1)
      (collection-test/force-create-personal-collections!)
      (map :name ((user->client :rasta) :get 200 "collection")))))

;; check that we don't see collections if they're archived
(expect
  ["Our analytics"
   "Rasta Toucan's Personal Collection"
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
;;; |                                              GET /collection/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that we can see collection details (GET /api/collection/:id)
(expect
  "Coin Collection"
  (tt/with-temp Collection [collection {:name "Coin Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (:name ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection))))))

;; check that collections detail properly checks permissions
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      ((user->client :rasta) :get 403 (str "collection/" (u/get-id collection))))))


;;; ----------------------------------------- Cards, Dashboards, and Pulses ------------------------------------------

;; check that cards are returned with the collection/items endpoint
(tt/expect-with-temp [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
  (tu/obj->json->obj
    [{:id                  (u/get-id card)
      :name                (:name card)
      :collection_position nil
      :display            "table"
      :description         nil
      :favorite            false
      :model               "card"}])
  (tu/obj->json->obj
   ((user->client :crowberto) :get 200 (str "collection/" (u/get-id collection) "/items"))))

(defn- do-with-some-children-of-collection [collection-or-id-or-nil f]
  (collection-test/force-create-personal-collections!)
  (tu/with-non-admin-groups-no-root-collection-perms
    (let [collection-id-or-nil (when collection-or-id-or-nil
                                 (u/get-id collection-or-id-or-nil))]
      (tt/with-temp* [Card       [_ {:name "Birthday Card", :collection_id collection-id-or-nil}]
                      Dashboard  [_ {:name "Dine & Dashboard", :collection_id collection-id-or-nil}]
                      Pulse      [_ {:name "Electro-Magnetic Pulse", :collection_id collection-id-or-nil}]]
        (f)))))

(defmacro ^:private with-some-children-of-collection {:style/indent 1} [collection-or-id-or-nil & body]
  `(do-with-some-children-of-collection ~collection-or-id-or-nil (fn [] ~@body)))

(defn- default-item [item-map]
  (merge {:id true, :collection_position nil} item-map))

(defn- collection-item [collection-name & {:as extra-keypairs}]
  (merge {:id          true
          :description nil
          :can_write   (str/ends-with? collection-name "Personal Collection")
          :model       "collection"
          :name        collection-name}
         extra-keypairs))

;; check that you get to see the children as appropriate
(expect
  (map default-item [{:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"}
                     {:name "Dine & Dashboard", :description nil, :model "dashboard"}
                     {:name "Electro-Magnetic Pulse", :model "pulse"}])
  (tt/with-temp Collection [collection {:name "Debt Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (tu/boolean-ids-and-timestamps
       ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items"))))))

;; ...and that you can also filter so that you only see the children you want to see
(expect
  [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})]
  (tt/with-temp Collection [collection {:name "Art Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (tu/boolean-ids-and-timestamps
       ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items?model=dashboard"))))))

;; Let's make sure the `archived` option works.
(expect
  [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})]
  (tt/with-temp Collection [collection {:name "Art Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (db/update-where! Dashboard {:collection_id (u/get-id collection)} :archived true)
      (tu/boolean-ids-and-timestamps
       ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items?archived=true"))))))

;;; --------------------------------- Fetching Personal Collections (Ours & Others') ---------------------------------

(defn- lucky-personal-collection []
  {:description         nil
   :archived            false
   :slug                "lucky_pigeon_s_personal_collection"
   :color               "#31698A"
   :can_write           true
   :name                "Lucky Pigeon's Personal Collection"
   :personal_owner_id   (user->id :lucky)
   :effective_ancestors [{:metabase.models.collection/is-root? true, :name "Our analytics", :id "root", :can_write true}]
   :effective_location  "/"
   :parent_id           nil
   :id                  (u/get-id (collection/user->personal-collection (user->id :lucky)))
   :location            "/"})

(defn- lucky-personal-collection-id
  []
  (u/get-id (collection/user->personal-collection (user->id :lucky))))

(defn- api-get-lucky-personal-collection [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  ((user->client user-kw) :get expected-status-code (str "collection/" (lucky-personal-collection-id))))

(defn- api-get-lucky-personal-collection-items [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  ((user->client user-kw) :get expected-status-code (str "collection/" (lucky-personal-collection-id) "/items")))

;; Can we use this endpoint to fetch our own Personal Collection?
(expect
  (lucky-personal-collection)
  (api-get-lucky-personal-collection :lucky))

;; Can and admin use this endpoint to fetch someone else's Personal Collection?
(expect
  (lucky-personal-collection)
  (api-get-lucky-personal-collection :crowberto))

;; Other, non-admin Users should not be allowed to fetch others' Personal Collections!
(expect
  "You don't have permissions to do that."
  (api-get-lucky-personal-collection :rasta, :expected-status-code 403))

(def ^:private lucky-personal-subcollection-item
  [(collection-item "Lucky's Personal Sub-Collection" :can_write true)])

(defn- api-get-lucky-personal-collection-with-subcollection [user-kw]
  (tt/with-temp Collection [_ {:name     "Lucky's Personal Sub-Collection"
                               :location (collection/children-location
                                          (collection/user->personal-collection (user->id :lucky)))}]
    (tu/boolean-ids-and-timestamps (api-get-lucky-personal-collection-items user-kw))))

;; If we have a sub-Collection of our Personal Collection, that should show up
(expect
  lucky-personal-subcollection-item
  (api-get-lucky-personal-collection-with-subcollection :lucky))

;; sub-Collections of other's Personal Collections should show up for admins as well
(expect
  lucky-personal-subcollection-item
  (api-get-lucky-personal-collection-with-subcollection :crowberto))


;;; ------------------------------------ Effective Ancestors & Effective Children ------------------------------------

(defmacro ^:private with-collection-hierarchy
  "Totally-rad macro that creates a Collection hierarchy and grants the All Users group perms for all the Collections
  you've bound."
  {:style/indent 1}
  [collection-bindings & body]
  {:pre [(vector? collection-bindings)
         (every? symbol? collection-bindings)]}
  `(collection-test/with-collection-hierarchy [{:keys ~collection-bindings}]
     ~@(for [collection-symb collection-bindings]
         `(perms/grant-collection-read-permissions! (group/all-users) ~collection-symb))
     ~@body))

(defn- format-ancestors-and-children
  "Nicely format the `:effective_` results from an API call."
  [results]
  (-> results
      (select-keys [:effective_ancestors :effective_location])
      (update :effective_ancestors (partial map #(update % :id integer?)))
      (update :effective_location collection-test/location-path-ids->names)))

(defn- api-get-collection-ancestors-and-children
  "Call the API with Rasta to fetch `collection-or-id` and put the `:effective_` results in a nice format for the tests
  below."
  [collection-or-id & additional-get-params]
  [(format-ancestors-and-children ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection-or-id))))
   (tu/boolean-ids-and-timestamps (apply (user->client :rasta) :get 200 (str "collection/" (u/get-id collection-or-id) "/items")
                                         additional-get-params))])

;; does a top-level Collection like A have the correct Children?
(expect
  [{:effective_ancestors []
    :effective_location  "/"}
   (map collection-item ["B" "C"])]
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children a)))

;; ok, does a second-level Collection have its parent and its children?
(expect
  [{:effective_ancestors [{:name "A", :id true, :can_write false}]
    :effective_location  "/A/"}
   (map collection-item ["D" "G"])]
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children c)))

;; what about a third-level Collection?
(expect
  [{:effective_ancestors [{:name "A", :id true, :can_write false}
                          {:name "C", :id true, :can_write false}]
    :effective_location  "/A/C/"}
   []]
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children d)))

;; for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie and say we are
;; a child of A
(expect
  [{:effective_ancestors [{:name "A", :id true, :can_write false}]
    :effective_location  "/A/"}
   []]
  (with-collection-hierarchy [a b d g]
    (api-get-collection-ancestors-and-children d)))

;; for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection.
(expect
  [{:effective_ancestors [{:name "C", :id true, :can_write false}]
    :effective_location  "/C/"}
   []]
  (with-collection-hierarchy [b c d g]
    (api-get-collection-ancestors-and-children d)))

;; for C: if we remove D we should get E and F as effective children
(expect
  [{:effective_ancestors [{:name "A", :id true, :can_write false}]
    :effective_location  "/A/"}
   (map collection-item ["E" "F"])]
  (with-collection-hierarchy [a b c e f g]
    (api-get-collection-ancestors-and-children c)))

;; Make sure we can collapse multiple generations. For A: removing C and D should move up E and F
(expect
  [{:effective_ancestors []
    :effective_location  "/"}
   (map collection-item ["B" "E" "F"])]
  (with-collection-hierarchy [a b e f g]
    (api-get-collection-ancestors-and-children a)))

;; Let's make sure the 'archived` option works on Collections, nested or not
(expect
  [{:effective_ancestors []
    :effective_location  "/"}
   [(collection-item "B")]]
  (with-collection-hierarchy [a b c]
    (db/update! Collection (u/get-id b) :archived true)
    (api-get-collection-ancestors-and-children a :archived true)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/root                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called "Root" Collection
(expect
  {:name                "Our analytics"
   :id                  "root"
   :can_write           true
   :effective_location  nil
   :effective_ancestors []
   :parent_id           nil}
  (with-some-children-of-collection nil
    ((user->client :crowberto) :get 200 "collection/root")))

;; Make sure you can see everything for Users that can see everything
(expect
  [(default-item {:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"})
   (collection-item "Crowberto Corv's Personal Collection")
   (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
   (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})]
  (with-some-children-of-collection nil
    (tu/boolean-ids-and-timestamps ((user->client :crowberto) :get 200 "collection/root/items"))))

;; ...but we don't let you see stuff you wouldn't otherwise be allowed to see
(expect
  [(collection-item "Rasta Toucan's Personal Collection")]
  ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no collection_id
  (with-some-children-of-collection nil
    (tu/boolean-ids-and-timestamps ((user->client :rasta) :get 200 "collection/root/items"))))

;; ...but if they have read perms for the Root Collection they should get to see them
(expect
  [(default-item {:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"})
   (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
   (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})
   (collection-item "Rasta Toucan's Personal Collection")]
  (with-some-children-of-collection nil
    (tt/with-temp* [PermissionsGroup           [group]
                    PermissionsGroupMembership [_ {:user_id (user->id :rasta), :group_id (u/get-id group)}]]
      (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection/is-root? true}))
      (tu/boolean-ids-and-timestamps ((user->client :rasta) :get 200 "collection/root/items")))))

;; So I suppose my Personal Collection should show up when I fetch the Root Collection, shouldn't it...
(expect
  [{:name        "Rasta Toucan's Personal Collection"
    :id          (u/get-id (collection/user->personal-collection (user->id :rasta)))
    :description nil
    :model       "collection"
    :can_write   true}]
  (do
    (collection-test/force-create-personal-collections!)
    ((user->client :rasta) :get 200 "collection/root/items")))

;; And for admins, only return our own Personal Collection (!)
(expect
  [{:name        "Crowberto Corv's Personal Collection"
    :id          (u/get-id (collection/user->personal-collection (user->id :crowberto)))
    :description nil
    :model       "collection"
    :can_write   true}]
  (do
    (collection-test/force-create-personal-collections!)
    ((user->client :crowberto) :get 200 "collection/root/items")))

;; That includes sub-collections of Personal Collections! I shouldn't see them!
(expect
  [{:name        "Crowberto Corv's Personal Collection"
    :id          (u/get-id (collection/user->personal-collection (user->id :crowberto)))
    :description nil
    :model       "collection"
    :can_write   true}]
  (do
    (collection-test/force-create-personal-collections!)
    (tt/with-temp Collection [_ {:name     "Lucky's Sub-Collection"
                                 :location (collection/children-location
                                            (collection/user->personal-collection (user->id :lucky)))}]
      ((user->client :crowberto) :get 200 "collection/root/items"))))

;; Can we look for `archived` stuff with this endpoint?
(expect
  [{:name                "Business Card"
    :description         nil
    :collection_position nil
    :display             "table"
    :favorite            false
    :model               "card"}]
  (tt/with-temp Card [card {:name "Business Card", :archived true}]
    (collection-test/force-create-personal-collections!)
    (for [item ((user->client :crowberto) :get 200 "collection/root/items?archived=true")]
      (dissoc item :id))))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-get-root-collection-ancestors-and-children
  "Call the API with Rasta to fetch the 'Root' Collection and put the `:effective_` results in a nice format for the
  tests below."
  [& additional-get-params]
  (collection-test/force-create-personal-collections!)
  [(format-ancestors-and-children ((user->client :rasta) :get 200 "collection/root"))
   (tu/boolean-ids-and-timestamps (apply (user->client :rasta) :get 200 "collection/root/items" additional-get-params))])

;; Do top-level collections show up as children of the Root Collection?
(expect
  [{:effective_ancestors []
    :effective_location  nil}
   (map collection-item ["A" "Rasta Toucan's Personal Collection"])]
  (with-collection-hierarchy [a b c d e f g]
    (api-get-root-collection-ancestors-and-children)))

;; ...and collapsing children should work for the Root Collection as well
(expect
  [{:effective_ancestors []
    :effective_location  nil}
   (map collection-item ["B" "D" "F" "Rasta Toucan's Personal Collection"])]
  (with-collection-hierarchy [b d e f g]
    (api-get-root-collection-ancestors-and-children)))

;; does `archived` work on Collections as well?
(expect
  [{:effective_ancestors []
    :effective_location  nil}
   [(collection-item "A")]]
  (with-collection-hierarchy [a b d e f g]
    (db/update! Collection (u/get-id a) :archived true)
    (api-get-root-collection-ancestors-and-children :archived true)))


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
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
       {:name "My Beautiful Collection", :color "#ABCDEF"}))))

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
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
       {:archived true}))))

;; Perms checking should be recursive as well...
;;
;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you would
;; also need perms for B
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-a]
                    Collection [collection-b {:location (collection/children-location collection-a)}]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
       {:archived true}))))

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
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-a]
                    Collection [collection-b]]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
       {:parent_id (u/get-id collection-b)}))))

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
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-a]
                    Collection [collection-b {:location (collection/children-location collection-a)}]
                    Collection [collection-c]]
      (doseq [collection [collection-a collection-b]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
       {:parent_id (u/get-id collection-c)}))))


;; Create A, B, and C; B is a child of A. Grant perms for A and C. Moving A into C should fail because we need perms
;; for B:
;; (collections with readwrite perms marked below with a `*`)
;;
;; A* -> B  ==>  C -> A -> B
;; C*
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-a]
                    Collection [collection-b {:location (collection/children-location collection-a)}]
                    Collection [collection-c]]
      (doseq [collection [collection-a collection-c]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
       {:parent_id (u/get-id collection-c)}))))

;; Create A, B, and C; B is a child of A. Grant perms for B and C. Moving A into C should fail because we need perms
;; for A:
;; (collections with readwrite perms marked below with a `*`)
;;
;; A -> B*  ==>  C -> A -> B
;; C*
(expect
  "You don't have permissions to do that."
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [collection-a]
                    Collection [collection-b {:location (collection/children-location collection-a)}]
                    Collection [collection-c]]
      (doseq [collection [collection-b collection-c]]
        (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
      ((user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
       {:parent_id (u/get-id collection-c)}))))
