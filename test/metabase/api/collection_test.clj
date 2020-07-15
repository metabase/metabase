(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [models :refer [Card Collection Dashboard NativeQuerySnippet PermissionsGroup PermissionsGroupMembership Pulse PulseCard PulseChannel PulseChannelRecipient]]
             [test :as mt]
             [util :as u]]
            [metabase.models
             [collection :as collection]
             [collection-test :as collection-test]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.models.collection
             [graph :as graph]
             [graph-test :as graph.test]]
            [metabase.test.fixtures :as fixtures]
            [schema.core :as s]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-collections-test
  (testing "GET /api/collection"
    (testing "check that we can get a basic list of collections"
      ;; (for the purposes of test purposes remove the personal collections)
      (mt/with-temp Collection [collection]
        (is (= [{:parent_id           nil
                 :effective_location  nil
                 :effective_ancestors []
                 :can_write           true
                 :name                "Our analytics"
                 :id                  "root"}
                (assoc (into {} collection) :can_write true)]
               (for [collection ((mt/user->client :crowberto) :get 200 "collection")
                     :when      (not (:personal_owner_id collection))]
                 collection)))))

    (testing "We should only see our own Personal Collections!"
      (is (= ["Lucky Pigeon's Personal Collection"]
             (->> ((mt/user->client :lucky) :get 200 "collection")
                  (filter :personal_owner_id)
                  (map :name))))

      (testing "...unless we are *admins*"
        (is (= ["Crowberto Corv's Personal Collection"
                "Lucky Pigeon's Personal Collection"
                "Rasta Toucan's Personal Collection"
                "Trash Bird's Personal Collection"]
               (->> ((mt/user->client :crowberto) :get 200 "collection")
                    (filter #((set (map mt/user->id [:crowberto :lucky :rasta :trashbird])) (:personal_owner_id %)))
                    (map :name)
                    sort)))))

    (testing "check that we don't see collections if we don't have permissions for them"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp* [Collection [collection-1 {:name "Collection 1"}]
                        Collection [collection-2 {:name "Collection 2"}]]
          (perms/grant-collection-read-permissions! (group/all-users) collection-1)
          (is (= ["Our analytics"
                  "Collection 1"
                  "Rasta Toucan's Personal Collection"]
                 (map :name ((mt/user->client :rasta) :get 200 "collection")))))))

    (testing "check that we don't see collections if they're archived"
      (mt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                      Collection [collection-2 {:name "Regular Collection"}]]
        (is (= ["Our analytics"
                "Rasta Toucan's Personal Collection"
                "Regular Collection"]
               (map :name ((mt/user->client :rasta) :get 200 "collection"))))))

    (testing "Check that if we pass `?archived=true` we instead see archived Collections"
      (mt/with-temp* [Collection [collection-1 {:name "Archived Collection", :archived true}]
                      Collection [collection-2 {:name "Regular Collection"}]]
        (is (= ["Archived Collection"]
               (map :name ((mt/user->client :rasta) :get 200 "collection" :archived :true))))))

    (testing "?namespace= parameter"
      (mt/with-temp* [Collection [{normal-id :id} {:name "Normal Collection"}]
                      Collection [{coins-id  :id} {:name "Coin Collection", :namespace "currency"}]]
        (letfn [(collection-names [collections]
                  (->> collections
                       (filter #(#{normal-id coins-id} (:id %)))
                       (map :name)))]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= ["Normal Collection"]
                   (collection-names ((mt/user->client :rasta) :get 200 "collection")))))

          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names ((mt/user->client :rasta) :get 200 "collection?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-names ((mt/user->client :rasta) :get 200 "collection?namespace=stamps")))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-collection-test
  (testing "GET /api/collection/:id"
    (testing "check that we can see collection details"
      (mt/with-temp Collection [collection {:name "Coin Collection"}]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (is (= "Coin Collection"
               (:name ((mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection))))))))

    (testing "check that collections detail properly checks permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 (str "collection/" (u/get-id collection))))))))))


;;; ------------------------------------------------ Collection Items ------------------------------------------------

(defn- do-with-some-children-of-collection [collection-or-id-or-nil f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [collection-id-or-nil (when collection-or-id-or-nil
                                 (u/get-id collection-or-id-or-nil))]
      (mt/with-temp* [Card       [{card-id :id}      {:name "Birthday Card", :collection_id collection-id-or-nil}]
                      Dashboard  [{dashboard-id :id} {:name "Dine & Dashboard", :collection_id collection-id-or-nil}]
                      Pulse      [{pulse-id :id}     {:name "Electro-Magnetic Pulse", :collection_id collection-id-or-nil}]]
        (f {:card-id card-id, :dashboard-id dashboard-id, :pulse-id pulse-id})))))

(defmacro ^:private with-some-children-of-collection {:style/indent 1} [collection-or-id-or-nil & body]
  `(do-with-some-children-of-collection
    ~collection-or-id-or-nil
    (fn [~'&ids]
      ~@body)))

(defn- remove-non-test-items
  "Remove Cards, Dashboards, and Pulses that aren't the 'Birthday Card'/'Dine & Dashboard'/'Electro-Magnetic Pulse'
  created by `with-some-children-of-collection`."
  [items {:keys [card-id dashboard-id pulse-id]}]
  (filter (fn [{:keys [id model]}]
            (case model
              "card"      (= id card-id)
              "dashboard" (= id dashboard-id)
              "pulse"     (= id pulse-id)
              true))
          items))

(defn- default-item [item-map]
  (merge {:id true, :collection_position nil} item-map))

(defn- collection-item [collection-name & {:as extra-keypairs}]
  (merge {:id          true
          :description nil
          :can_write   (str/ends-with? collection-name "Personal Collection")
          :model       "collection"
          :name        collection-name}
         extra-keypairs))

(deftest collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "check that cards are returned with the collection/items endpoint"
      (mt/with-temp* [Collection [collection]
                      Card       [card        {:collection_id (u/get-id collection)}]]
        (is (= (mt/obj->json->obj
                 [{:id                  (u/get-id card)
                   :name                (:name card)
                   :collection_position nil
                   :display             "table"
                   :description         nil
                   :favorite            false
                   :model               "card"}])
               (mt/obj->json->obj
                 ((mt/user->client :crowberto) :get 200 (str "collection/" (u/get-id collection) "/items")))))))

    (testing "check that you get to see the children as appropriate"
      (mt/with-temp Collection [collection {:name "Debt Collection"}]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (with-some-children-of-collection collection
          (is (= (map default-item [{:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"}
                                    {:name "Dine & Dashboard", :description nil, :model "dashboard"}
                                    {:name "Electro-Magnetic Pulse", :model "pulse"}])
                 (mt/boolean-ids-and-timestamps
                  ((mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items")))))))

      (testing "...and that you can also filter so that you only see the children you want to see"
        (mt/with-temp Collection [collection {:name "Art Collection"}]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (with-some-children-of-collection collection
            (is (= [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})]
                   (mt/boolean-ids-and-timestamps
                    ((mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items?model=dashboard")))))))))

    (testing "Let's make sure the `archived` option works."
      (mt/with-temp Collection [collection {:name "Art Collection"}]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (with-some-children-of-collection collection
          (db/update-where! Dashboard {:collection_id (u/get-id collection)} :archived true)
          (is (= [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})]
                 (mt/boolean-ids-and-timestamps
                  ((mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection) "/items?archived=true"))))))))))

(deftest snippet-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "Native query snippets should come back when fetching the items in a Collection in the `:snippets` namespace"
      (mt/with-temp* [Collection         [{collection-id :id} {:namespace "snippets", :name "My Snippet Collection"}]
                      NativeQuerySnippet [{snippet-id :id}    {:collection_id collection-id, :name "My Snippet"}]
                      NativeQuerySnippet [{archived-id :id}   {:collection_id collection-id, :name "Archived Snippet", :archived true}]]
        (is (= [{:id    snippet-id
                 :name  "My Snippet"
                 :model "snippet"}]
               ((mt/user->client :rasta) :get 200 (format "collection/%d/items" collection-id))))

        (testing "\nShould be able to fetch archived Snippets"
          (is (= [{:id    archived-id
                   :name  "Archived Snippet"
                   :model "snippet"}]
                 ((mt/user->client :rasta) :get 200 (format "collection/%d/items?archived=true" collection-id)))))

        (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
          (is (= [{:id    snippet-id
                   :name  "My Snippet"
                   :model "snippet"}]
                 ((mt/user->client :rasta) :get 200 (format "collection/%d/items?model=snippet" collection-id)))))))))


;;; --------------------------------- Fetching Personal Collections (Ours & Others') ---------------------------------

(defn- lucky-personal-collection []
  (merge
   (mt/object-defaults Collection)
   {:slug                "lucky_pigeon_s_personal_collection"
    :color               "#31698A"
    :can_write           true
    :name                "Lucky Pigeon's Personal Collection"
    :personal_owner_id   (mt/user->id :lucky)
    :effective_ancestors [{:metabase.models.collection.root/is-root? true, :name "Our analytics", :id "root", :can_write true}]
    :effective_location  "/"
    :parent_id           nil
    :id                  (u/get-id (collection/user->personal-collection (mt/user->id :lucky)))
    :location            "/"}))

(defn- lucky-personal-collection-id
  []
  (u/get-id (collection/user->personal-collection (mt/user->id :lucky))))

(defn- api-get-lucky-personal-collection [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  ((mt/user->client user-kw) :get expected-status-code (str "collection/" (lucky-personal-collection-id))))

(defn- api-get-lucky-personal-collection-items [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  ((mt/user->client user-kw) :get expected-status-code (str "collection/" (lucky-personal-collection-id) "/items")))

(deftest fetch-personal-collection-test
  (testing "GET /api/collection/:id"
    (testing "Can we use this endpoint to fetch our own Personal Collection?"
      (is (= (lucky-personal-collection)
             (api-get-lucky-personal-collection :lucky))))

    (testing "Can and admin use this endpoint to fetch someone else's Personal Collection?"
      (is (= (lucky-personal-collection)
             (api-get-lucky-personal-collection :crowberto))))

    (testing "Other, non-admin Users should not be allowed to fetch others' Personal Collections!"
      (is (= "You don't have permissions to do that."
             (api-get-lucky-personal-collection :rasta, :expected-status-code 403))))))

(def ^:private lucky-personal-subcollection-item
  [(collection-item "Lucky's Personal Sub-Collection" :can_write true)])

(defn- api-get-lucky-personal-collection-with-subcollection [user-kw]
  (mt/with-temp Collection [_ {:name     "Lucky's Personal Sub-Collection"
                               :location (collection/children-location
                                          (collection/user->personal-collection (mt/user->id :lucky)))}]
    (mt/boolean-ids-and-timestamps (api-get-lucky-personal-collection-items user-kw))))

(deftest fetch-personal-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "If we have a sub-Collection of our Personal Collection, that should show up"
      (is (= lucky-personal-subcollection-item
             (api-get-lucky-personal-collection-with-subcollection :lucky))))

    (testing "sub-Collections of other's Personal Collections should show up for admins as well"
      (is (= lucky-personal-subcollection-item
             (api-get-lucky-personal-collection-with-subcollection :crowberto))))))


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

(defn- format-ancestors
  "Nicely format the `:effective_` results from an API call."
  [results]
  (-> results
      (select-keys [:effective_ancestors :effective_location])
      (update :effective_ancestors (partial map #(update % :id integer?)))
      (update :effective_location collection-test/location-path-ids->names)))

(defn- api-get-collection-ancestors
  "Call the API with Rasta to fetch `collection-or-id` and put the `:effective_` results in a nice format for the tests
  below."
  [collection-or-id & additional-get-params]
  (format-ancestors ((mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection-or-id)))))

(defn- api-get-collection-children
  [collection-or-id & additional-get-params]
  (mt/boolean-ids-and-timestamps (apply (mt/user->client :rasta) :get 200 (str "collection/" (u/get-id collection-or-id) "/items")
                                        additional-get-params)))

(deftest effective-ancestors-and-children-test
  (testing "does a top-level Collection like A have the correct Children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is(= {:effective_ancestors []
               :effective_location  "/"}
              (api-get-collection-ancestors a))))
      (testing "children"
        (is (= (map collection-item ["B" "C"])
               (api-get-collection-children a))))))

  (testing "ok, does a second-level Collection have its parent and its children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (= (map collection-item ["D" "G"])
               (api-get-collection-children c))))))

  (testing "what about a third-level Collection?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}
                                      {:name "C", :id true, :can_write false}]
                :effective_location  "/A/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))

  (testing (str "for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie "
                "and say we are a child of A")
    (with-collection-hierarchy [a b d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))

  (testing "for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection."
    (with-collection-hierarchy [b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "C", :id true, :can_write false}]
                :effective_location  "/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d)))))

    (testing "for C: if we remove D we should get E and F as effective children"
      (with-collection-hierarchy [a b c e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors [{:name "A", :id true, :can_write false}]
                  :effective_location  "/A/"}
                 (api-get-collection-ancestors c))))
        (testing "children"
          (is (= (map collection-item ["E" "F"])
                 (api-get-collection-children c)))))))

  (testing "Make sure we can collapse multiple generations. For A: removing C and D should move up E and F"
    (with-collection-hierarchy [a b e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (= (map collection-item ["B" "E" "F"])
               (api-get-collection-children a))))))

  (testing "Let's make sure the 'archived` option works on Collections, nested or not"
    (with-collection-hierarchy [a b c]
      (db/update! Collection (u/get-id b) :archived true)
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a :archived true))))
      (testing "children"
        (is (= [(collection-item "B")]
               (api-get-collection-children a :archived true)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/root                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-root-collection-test
  (testing "GET /api/collection/root"
    (testing "Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called \"Root\" Collection"
      (is (= {:name                "Our analytics"
              :id                  "root"
              :can_write           true
              :effective_location  nil
              :effective_ancestors []
              :parent_id           nil}
             (with-some-children-of-collection nil
               ((mt/user->client :crowberto) :get 200 "collection/root")))))

    (testing "Make sure you can see everything for Users that can see everything"
      (is (= [(default-item {:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"})
              (collection-item "Crowberto Corv's Personal Collection")
              (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
              (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})]
             (with-some-children-of-collection nil
               (-> ((mt/user->client :crowberto) :get 200 "collection/root/items")
                   (remove-non-test-items &ids)
                   mt/boolean-ids-and-timestamps))))

      (testing "...but we don't let you see stuff you wouldn't otherwise be allowed to see"
        (is (= [(collection-item "Rasta Toucan's Personal Collection")]
               ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no collection_id
               (with-some-children-of-collection nil
                 (mt/boolean-ids-and-timestamps ((mt/user->client :rasta) :get 200 "collection/root/items")))))

        (testing "...but if they have read perms for the Root Collection they should get to see them"
          (with-some-children-of-collection nil
            (mt/with-temp* [PermissionsGroup           [group]
                            PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
              (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
              (is (= [(default-item {:name "Birthday Card", :description nil, :favorite false, :model "card", :display "table"})
                      (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
                      (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})
                      (collection-item "Rasta Toucan's Personal Collection")]
                     (-> ((mt/user->client :rasta) :get 200 "collection/root/items")
                         (remove-non-test-items &ids)
                         mt/boolean-ids-and-timestamps ))))))))

    (testing "So I suppose my Personal Collection should show up when I fetch the Root Collection, shouldn't it..."
      (is (= [{:name        "Rasta Toucan's Personal Collection"
               :id          (u/get-id (collection/user->personal-collection (mt/user->id :rasta)))
               :description nil
               :model       "collection"
               :can_write   true}]
             (->> ((mt/user->client :rasta) :get 200 "collection/root/items")
                  (filter #(str/includes? (:name %) "Personal Collection"))))))

    (testing "For admins, only return our own Personal Collection (!)"
      (is (= [{:name        "Crowberto Corv's Personal Collection"
               :id          (u/get-id (collection/user->personal-collection (mt/user->id :crowberto)))
               :description nil
               :model       "collection"
               :can_write   true}]
             (->> ((mt/user->client :crowberto) :get 200 "collection/root/items")
                  (filter #(str/includes? (:name %) "Personal Collection")))))

      (testing "That includes sub-collections of Personal Collections! I shouldn't see them!"
        (mt/with-temp Collection [_ {:name     "Lucky's Sub-Collection"
                                     :location (collection/children-location
                                                (collection/user->personal-collection (mt/user->id :lucky)))}]
          (is (= [{:name        "Crowberto Corv's Personal Collection"
                   :id          (u/get-id (collection/user->personal-collection (mt/user->id :crowberto)))
                   :description nil
                   :model       "collection"
                   :can_write   true}]
                 (->> ((mt/user->client :crowberto) :get 200 "collection/root/items")
                      (filter #(str/includes? (:name %) "Personal Collection"))))))))

    (testing "Can we look for `archived` stuff with this endpoint?"
      (mt/with-temp Card [card {:name "Business Card", :archived true}]
        (is (= [{:name                "Business Card"
                 :description         nil
                 :collection_position nil
                 :display             "table"
                 :favorite            false
                 :model               "card"}]
               (for [item ((mt/user->client :crowberto) :get 200 "collection/root/items?archived=true")]
                 (dissoc item :id))))))))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-get-root-collection-ancestors
  "Call the API with Rasta to fetch the 'Root' Collection and put the `:effective_` results in a nice format for the
  tests below."
  [& additional-get-params]
  (format-ancestors ((mt/user->client :rasta) :get 200 "collection/root")))

(defn- api-get-root-collection-children
  [& additional-get-params]
  (mt/boolean-ids-and-timestamps (apply (mt/user->client :rasta) :get 200 "collection/root/items" additional-get-params)))

(deftest fetch-root-collection-items-test
  (testing "GET /api/collection/root/items"
    (testing "Do top-level collections show up as children of the Root Collection?"
      (with-collection-hierarchy [a b c d e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors))))
        (testing "children"
          (is (= (map collection-item ["A" "Rasta Toucan's Personal Collection"])
                 (api-get-root-collection-children))))))

    (testing "...and collapsing children should work for the Root Collection as well"
      (with-collection-hierarchy [b d e f g]
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors))))
        (testing "children"
          (is (= (map collection-item ["B" "D" "F" "Rasta Toucan's Personal Collection"])
                 (api-get-root-collection-children))))))

    (testing "does `archived` work on Collections as well?"
      (with-collection-hierarchy [a b d e f g]
        (db/update! Collection (u/get-id a) :archived true)
        (testing "ancestors"
          (is (= {:effective_ancestors []
                  :effective_location  nil}
                 (api-get-root-collection-ancestors :archived true))))
        (testing "children"
          (is (= [(collection-item "A")]
                 (api-get-root-collection-children :archived true))))))

    (testing "\n?namespace= parameter"
      (mt/with-temp* [Collection [{normal-id :id} {:name "Normal Collection"}]
                      Collection [{coins-id :id}  {:name "Coin Collection", :namespace "currency"}]]
        (letfn [(collection-names [items]
                  (->> items
                       (filter #(and (= (:model %) "collection")
                                     (#{normal-id coins-id} (:id %))))
                       (map :name)))]
          (testing "should only show Collections in the 'default' namespace by default"
            (is (= ["Normal Collection"]
                   (collection-names ((mt/user->client :rasta) :get 200 "collection/root/items")))))

          (testing "By passing `:namespace` we should be able to see Collections in that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names ((mt/user->client :rasta) :get 200 "collection/root/items?namespace=currency")))))
            (testing "?namespace=stamps"
              (is (= []
                     (collection-names ((mt/user->client :rasta) :get 200 "collection/root/items?namespace=stamps")))))))))))

(deftest root-collection-snippets-test
  (testing "GET /api/collection/root/items?namespace=snippets"
    (testing "\nNative query snippets should come back when fetching the items in the root Collection of the `:snippets` namespace"
      (mt/with-temp* [NativeQuerySnippet [{snippet-id :id}   {:name "My Snippet"}]
                      NativeQuerySnippet [{archived-id :id}  {:name "Archived Snippet", :archived true}]
                      Dashboard          [{dashboard-id :id} {:name "My Dashboard"}]]
        (letfn [(only-test-items [results]
                  (if (sequential? results)
                    (filter #(#{["snippet" snippet-id]
                                ["snippet" archived-id]
                                ["dashboard" dashboard-id]} ((juxt :model :id) %))
                            results)
                    results))
                (only-test-item-names [results]
                  (let [items (only-test-items results)]
                    (if (sequential? items)
                      (map :name items)
                      items)))]
          (is (= [{:id    snippet-id
                   :name  "My Snippet"
                   :model "snippet"}]
                 (only-test-items ((mt/user->client :rasta) :get 200 "collection/root/items?namespace=snippets"))))

          (testing "\nSnippets should not come back for the default namespace"
            (is (= ["My Dashboard"]
                   (only-test-item-names ((mt/user->client :rasta) :get 200 "collection/root/items")))))

          (testing "\nShould be able to fetch archived Snippets"
            (is (= ["Archived Snippet"]
                   (only-test-item-names ((mt/user->client :rasta) :get 200
                                          "collection/root/items?namespace=snippets&archived=true")))))

          (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
            (is (= ["My Snippet"]
                   (only-test-item-names ((mt/user->client :rasta) :get 200
                                          "collection/root/items?namespace=snippets&model=snippet"))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/collection                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-collection-test
  (testing "POST /api/collection"
    (testing "\ntest that we can create a new collection"
      (mt/with-model-cleanup [Collection]
        (is (= (merge
                (mt/object-defaults Collection)
                {:name              "Stamp Collection"
                 :slug              "stamp_collection"
                 :color             "#123456"
                 :archived          false
                 :location          "/"
                 :personal_owner_id nil})
               (-> ((mt/user->client :crowberto) :post 200 "collection"
                    {:name "Stamp Collection", :color "#123456"})
                   (dissoc :id))))))

    (testing "\ntest that non-admins aren't allowed to create a collection in the root collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= "You don't have permissions to do that."
               ((mt/user->client :rasta) :post 403 "collection"
                {:name "Stamp Collection", :color "#123456"})))))

    (testing "\nCan a non-admin user with Root Collection perms add a new collection to the Root Collection? (#8949)"
      (mt/with-model-cleanup [Collection]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [PermissionsGroup           [group]
                          PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
            (perms/grant-collection-readwrite-permissions! group collection/root-collection)
            (is (= (merge
                    (mt/object-defaults Collection)
                    {:name     "Stamp Collection"
                     :color    "#123456"
                     :location "/"
                     :slug     "stamp_collection"})
                   (dissoc ((mt/user->client :rasta) :post 200 "collection"
                            {:name "Stamp Collection", :color "#123456"})
                           :id)))))))

    (testing "\nCan I create a Collection as a child of an existing collection?"
      (mt/with-model-cleanup [Collection]
        (with-collection-hierarchy [a c d]
          (is (= (merge
                  (mt/object-defaults Collection)
                  {:id          true
                   :name        "Trading Card Collection"
                   :slug        "trading_card_collection"
                   :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                   :color       "#ABCDEF"
                   :location    "/A/C/D/"})
                 (-> ((mt/user->client :crowberto) :post 200 "collection"
                      {:name        "Trading Card Collection"
                       :color       "#ABCDEF"
                       :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                       :parent_id   (u/get-id d)})
                     (update :location collection-test/location-path-ids->names)
                     (update :id integer?)))))))

    (testing "\nShould be able to create a Collection in a different namespace"
      (let [collection-name (mt/random-name)]
        (try
          (is (schema= {:name      (s/eq collection-name)
                        :namespace (s/eq "snippets")
                        s/Keyword  s/Any}
                       ((mt/user->client :crowberto) :post 200 "collection"
                        {:name       collection-name
                         :color      "#f38630"
                         :descrption "My SQL Snippets"
                         :namespace  "snippets"})))
          (finally
            (db/delete! Collection :name collection-name)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUT /api/collection/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-collection-test
  (testing "PUT /api/collection/:id"
    (testing "test that we can update a collection"
      (mt/with-temp Collection [collection]
        (is (= (merge
                (mt/object-defaults Collection)
                {:id       (u/get-id collection)
                 :name     "My Beautiful Collection"
                 :slug     "my_beautiful_collection"
                 :color    "#ABCDEF"
                 :location "/"})
               ((mt/user->client :crowberto) :put 200 (str "collection/" (u/get-id collection))
                {:name "My Beautiful Collection", :color "#ABCDEF"})))))

    (testing "check that users without write perms aren't allowed to update a Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
                  {:name "My Beautiful Collection", :color "#ABCDEF"}))))))))

(deftest archive-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Archiving a collection should delete any alerts associated with questions in the collection"
      (mt/with-temp* [Collection            [{collection-id :id}]
                      Card                  [{card-id :id :as card} {:collection_id collection-id}]
                      Pulse                 [{pulse-id :id} {:alert_condition  "rows"
                                                             :alert_first_only false
                                                             :creator_id       (mt/user->id :rasta)
                                                             :name             "Original Alert Name"}]

                      PulseCard             [_              {:pulse_id pulse-id
                                                             :card_id  card-id
                                                             :position 0}]
                      PulseChannel          [{pc-id :id}    {:pulse_id pulse-id}]
                      PulseChannelRecipient [{pcr-id-1 :id} {:user_id          (mt/user->id :crowberto)
                                                             :pulse_channel_id pc-id}]
                      PulseChannelRecipient [{pcr-id-2 :id} {:user_id          (mt/user->id :rasta)
                                                             :pulse_channel_id pc-id}]]
        (mt/with-fake-inbox
          (mt/with-expected-messages 2
            ((mt/user->client :crowberto) :put 200 (str "collection/" collection-id)
             {:name "My Beautiful Collection", :color "#ABCDEF", :archived true}))
          (testing "emails"
            (is (= (merge (mt/email-to :crowberto {:subject "One of your alerts has stopped working",
                                                   :body    {"the question was archived by Crowberto Corv" true}})
                          (mt/email-to :rasta {:subject "One of your alerts has stopped working",
                                               :body    {"the question was archived by Crowberto Corv" true}}))
                   (mt/regex-email-bodies #"the question was archived by Crowberto Corv"))))
          (testing "Pulse"
            (is (= nil
                   (Pulse pulse-id)))))))

    (testing "I shouldn't be allowed to archive a Collection without proper perms"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp Collection [collection]
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection))
                  {:archived true})))))

      (testing "Perms checking should be recursive as well..."
        ;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you
        ;; would also need perms for B
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [Collection [collection-a]
                          Collection [collection-b {:location (collection/children-location collection-a)}]]
            (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
                    {:archived true})))))))))

(deftest move-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Can I *change* the `location` of a Collection? (i.e. move it into a different parent Collection)"
      (with-collection-hierarchy [a b e]
        (is (= (merge
                (mt/object-defaults Collection)
                {:id       true
                 :name     "E"
                 :slug     "e"
                 :color    "#ABCDEF"
                 :location "/A/B/"})
               (-> ((mt/user->client :crowberto) :put 200 (str "collection/" (u/get-id e))
                    {:parent_id (u/get-id b)})
                   (update :location collection-test/location-path-ids->names)
                   (update :id integer?))))))

    (testing "I shouldn't be allowed to move the Collection without proper perms."
      (testing "If I want to move A into B, I should need permissions for both A and B"
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp* [Collection [collection-a]
                          Collection [collection-b]]
            (perms/grant-collection-readwrite-permissions! (group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
                    {:parent_id (u/get-id collection-b)}))))))

      (testing "Perms checking should be recursive as well..."
        (testing "Create A, B, and C; B is a child of A."
          (testing "Grant perms for A and B. Moving A into C should fail because we need perms for C"
            ;; (collections with readwrite perms marked below with a `*`)
            ;; A* -> B* ==> C -> A -> B
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-a collection-b]]
                  (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
                        {:parent_id (u/get-id collection-c)}))))))

          (testing "Grant perms for A and C. Moving A into C should fail because we need perms for B."
            ;; A* -> B  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-a collection-c]]
                  (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
                        {:parent_id (u/get-id collection-c)}))))))

          (testing "Grant perms for B and C. Moving A into C should fail because we need perms for A"
            ;; A -> B*  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp* [Collection [collection-a]
                              Collection [collection-b {:location (collection/children-location collection-a)}]
                              Collection [collection-c]]
                (doseq [collection [collection-b collection-c]]
                  (perms/grant-collection-readwrite-permissions! (group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       ((mt/user->client :rasta) :put 403 (str "collection/" (u/get-id collection-a))
                        {:parent_id (u/get-id collection-c)})))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            GET /api/collection/graph and PUT /api/collection/graph                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest graph-test
  (mt/with-temp* [Collection [{default-a :id}   {:location "/"}]
                  Collection [{default-ab :id}  {:location (format "/%d/" default-a)}]
                  Collection [{currency-a :id}  {:namespace "currency", :location "/"}]
                  Collection [{currency-ab :id} {:namespace "currency", :location (format "/%d/" currency-a)}]
                  PermissionsGroup [{group-id :id}]]
    (letfn [(nice-graph [graph]
              (let [id->alias {default-a   "Default A"
                               default-ab  "Default A -> B"
                               currency-a  "Currency A"
                               currency-ab "Currency A -> B"}]
                (transduce
                 identity
                 (fn
                   ([graph]
                    (-> (get-in graph [:groups (keyword (str group-id))])
                        (select-keys (vals id->alias))))
                   ([graph [collection-id k]]
                    (graph.test/replace-collection-ids collection-id graph k)))
                 graph
                 id->alias)))]
      (doseq [collection [default-a default-ab currency-a currency-ab]]
        (perms/grant-collection-read-permissions! group-id collection))
      (testing "GET /api/collection/graph\n"
        (testing "Should be able to fetch the permissions graph for the default namespace"
          (is (= {"Default A" "read", "Default A -> B" "read"}
                 (nice-graph ((mt/user->client :crowberto) :get 200 "collection/graph")))))

        (testing "Should be able to fetch the permissions graph for a non-default namespace"
          (is (= {"Currency A" "read", "Currency A -> B" "read"}
                 (nice-graph ((mt/user->client :crowberto) :get 200 "collection/graph?namespace=currency")))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :get 403 "collection/graph")))))

      (testing "PUT /api/collection/graph\n"
        (testing "Should be able to update the graph for the default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response ((mt/user->client :crowberto) :put 200 "collection/graph"
                            (assoc (graph/graph) :groups {group-id {default-ab :write, currency-ab :write}}))]
              (is (= {"Default A" "read", "Default A -> B" "write"}
                     (nice-graph response))))))

        (testing "Should be able to update the graph for a non-default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response ((mt/user->client :crowberto) :put 200 "collection/graph?namespace=currency"
                            (assoc (graph/graph) :groups {group-id {default-a :write, currency-a :write}}))]
              (is (= {"Currency A" "write", "Currency A -> B" "read"}
                     (nice-graph response))))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 ((mt/user->client :rasta) :put 403 "collection/graph?namespace=currency"
                  (assoc (graph/graph) :groups {group-id {default-a :write, currency-a :write}})))))))))
