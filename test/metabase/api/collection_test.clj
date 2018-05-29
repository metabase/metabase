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
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [table :refer [Table]]]
            [metabase.test.data.users :refer [user->client user->id]]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

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
  (tt/with-temp Collection [collection]
    ((user->client :rasta) :get 403 (str "collection/" (u/get-id collection)))))


;;; ----------------------------------------- Cards, Dashboards, and Pulses ------------------------------------------

;; check that cards are returned with the collections detail endpoint
(tt/expect-with-temp [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
  (tu/obj->json->obj
    (assoc collection
      :cards               [(select-keys card [:name :id :collection_position])]
      :dashboards          []
      :pulses              []
      :effective_ancestors []
      :effective_location  "/"
      :effective_children  []
      :can_write           true))
  (tu/obj->json->obj
    ((user->client :crowberto) :get 200 (str "collection/" (u/get-id collection)))))

;; check that collections detail doesn't return archived collections
(expect
  "Not found."
  (tt/with-temp Collection [collection {:archived true}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    ((user->client :rasta) :get 404 (str "collection/" (u/get-id collection)))))

(defn- remove-ids-from-collection-detail [results & {:keys [keep-collection-id?]
                                                     :or {keep-collection-id? false}}]
  (into {} (for [[k items] (select-keys results (cond->> [:name :cards :dashboards :pulses]
                                                  keep-collection-id? (cons :id)))]
             [k (if-not (sequential? items)
                  items
                  (for [item items]
                    (dissoc item :id)))])))

(defn- do-with-some-children-of-collection [collection-or-id-or-nil f]
  (let [collection-id-or-nil (when collection-or-id-or-nil
                               (u/get-id collection-or-id-or-nil))]
    (tt/with-temp* [Card       [_ {:name "Birthday Card",          :collection_id collection-id-or-nil}]
                    Dashboard  [_ {:name "Dine & Dashboard",       :collection_id collection-id-or-nil}]
                    Pulse      [_ {:name "Electro-Magnetic Pulse", :collection_id collection-id-or-nil}]]
      (f))))

(defmacro ^:private with-some-children-of-collection {:style/indent 1} [collection-or-id-or-nil & body]
  `(do-with-some-children-of-collection ~collection-or-id-or-nil (fn [] ~@body)))

;; check that you get to see the children as appropriate
(expect
  {:name       "Debt Collection"
   :cards      [{:name "Birthday Card",          :collection_position nil}]
   :dashboards [{:name "Dine & Dashboard",       :collection_position nil}]
   :pulses     [{:name "Electro-Magnetic Pulse", :collection_position nil}]}
  (tt/with-temp Collection [collection {:name "Debt Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (-> ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection)))
          remove-ids-from-collection-detail))))

;; ...and that you can also filter so that you only see the children you want to see
(expect
  {:name       "Art Collection"
   :dashboards [{:name "Dine & Dashboard", :collection_position nil}]}
  (tt/with-temp Collection [collection {:name "Art Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (-> ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "?model=dashboards"))
          remove-ids-from-collection-detail))))


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
      (select-keys [:effective_children :effective_ancestors :effective_location])
      (update :effective_children  (comp set (partial map #(update % :id integer?))))
      (update :effective_ancestors (partial map #(update % :id integer?)))
      (update :effective_location collection-test/location-path-ids->names)))

(defn- api-get-collection-ancestors-and-children
  "Call the API with Rasta to fetch `collection-or-id` and put the `:effective_` results in a nice format for the tests
  below."
  [collection-or-id]
  (-> ((user->client :rasta) :get 200 (str "collection/" (u/get-id collection-or-id)))
      format-ancestors-and-children))

;; does a top-level Collection like A have the correct Children?
(expect
  {:effective_children  #{{:name "B", :id true} {:name "C", :id true}}
   :effective_ancestors []
   :effective_location  "/"}
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children a)))

;; ok, does a second-level Collection have its parent and its children?
(expect
  {:effective_children  #{{:name "D", :id true} {:name "G", :id true}}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location  "/A/"}
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children c)))

;; what about a third-level Collection?
(expect
  {:effective_children #{}
   :effective_ancestors [{:name "A", :id true} {:name "C", :id true}]
   :effective_location "/A/C/"}
  (with-collection-hierarchy [a b c d g]
    (api-get-collection-ancestors-and-children d)))

;; for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie and say we are
;; a child of A
(expect
  {:effective_children #{}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location "/A/"}
  (with-collection-hierarchy [a b d g]
    (api-get-collection-ancestors-and-children d)))

;; for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection.
(expect
  {:effective_children #{},
   :effective_ancestors [{:name "C", :id true}]
   :effective_location "/C/"}
  (with-collection-hierarchy [b c d g]
    (api-get-collection-ancestors-and-children d)))

;; for C: if we remove D we should get E and F as effective children
(expect
  {:effective_children #{{:name "E", :id true} {:name "F", :id true}}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location "/A/"}
  (with-collection-hierarchy [a b c e f g]
    (api-get-collection-ancestors-and-children c)))

;; Make sure we can collapse multiple generations. For A: removing C and D should move up E and F
(expect
  {:effective_children #{{:name "B", :id true}
                         {:name "E", :id true}
                         {:name "F", :id true}}
   :effective_ancestors []
   :effective_location "/"}
  (with-collection-hierarchy [a b e f g]
    (api-get-collection-ancestors-and-children a)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/root                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called "Root" Collection

;; Make sure you can see everything for Users that can see everything
(expect
  {:name       "Root Collection"
   :id         "root"
   :cards      [{:name "Birthday Card",          :collection_position nil}]
   :dashboards [{:name "Dine & Dashboard",       :collection_position nil}]
   :pulses     [{:name "Electro-Magnetic Pulse", :collection_position nil}]}
  (with-some-children-of-collection nil
    (-> ((user->client :crowberto) :get 200 "collection/root")
        (remove-ids-from-collection-detail :keep-collection-id? true))))

;; ...but we don't let you see stuff you wouldn't otherwise be allowed to see
(expect
  {:name       "Root Collection"
   :id         "root"
   :cards      []
   :dashboards [{:name "Dine & Dashboard",       :collection_position nil}]
   :pulses     [{:name "Electro-Magnetic Pulse", :collection_position nil}]}
  ;; create a fake DB and don't give all users perms to it
  (tt/with-temp* [Database [db]
                  Table    [table {:db_id (u/get-id db)}]]
    (perms/revoke-permissions! (group/all-users) (u/get-id db))
    ;; create the normal 'Child' objects
    (with-some-children-of-collection nil
      ;; move the Card into the DB that we have no perms for
      (db/update! Card (db/select-one-id Card :name "Birthday Card")
        :dataset_query {:database (u/get-id db), :type :query, :query {:source-table (u/get-id table)}})
      ;; ok, a regular user shouldn't get to see it any more :(
      (-> ((user->client :rasta) :get 200 "collection/root")
          (remove-ids-from-collection-detail :keep-collection-id? true)))))

;; Make sure this endpoint can also filter things
(expect
  {:name  "Root Collection"
   :id    "root"
   :cards [{:name "Birthday Card", :collection_position nil}]}
  (with-some-children-of-collection nil
    (-> ((user->client :crowberto) :get 200 "collection/root?model=cards")
        (remove-ids-from-collection-detail :keep-collection-id? true))))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-get-root-collection-ancestors-and-children
  "Call the API with Rasta to fetch the 'Root' Collection and put the `:effective_` results in a nice format for the
  tests below."
  []
  (-> ((user->client :rasta) :get 200 "collection/root")
      format-ancestors-and-children))

;; Do top-level collections show up as children of the Root Collection?
(expect
  {:effective_children #{{:name "A", :id true}}
   :effective_ancestors []
   :effective_location "/"}
  (with-collection-hierarchy [a b c d e f g]
    (api-get-root-collection-ancestors-and-children)))

;; ...and collapsing children should work for the Root Collection as well
(expect
  {:effective_children #{{:name "B", :id true}
                         {:name "D", :id true}
                         {:name "F", :id true}}
   :effective_ancestors []
   :effective_location "/"}
  (with-collection-hierarchy [b d e f g]
    (api-get-root-collection-ancestors-and-children)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/collection                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; test that we can create a new collection (POST /api/collection)
(expect
  {:name        "Stamp Collection"
   :slug        "stamp_collection"
   :description nil
   :color       "#123456"
   :archived    false
   :location    "/"}
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
  {:id          true
   :name        "Trading Card Collection"
   :slug        "trading_card_collection"
   :description "Collection of basketball cards including limited-edition holographic Draymond Green"
   :color       "#ABCDEF"
   :archived    false
   :location    "/A/C/D/"}
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
  {:id          (u/get-id collection)
   :name        "My Beautiful Collection"
   :slug        "my_beautiful_collection"
   :description nil
   :color       "#ABCDEF"
   :archived    false
   :location    "/"}
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

;; Can I *change* the `location` of a Collection? (i.e. move it into a different parent Colleciton)
(expect
  {:id          true
   :name        "E"
   :slug        "e"
   :description nil
   :color       "#ABCDEF"
   :archived    false
   :location    "/A/B/"}
  (with-collection-hierarchy [a b e]
    (-> ((user->client :crowberto) :put 200 (str "collection/" (u/get-id e))
         {:parent_id (u/get-id b)})
        (update :location collection-test/location-path-ids->names)
        (update :id integer?))))
