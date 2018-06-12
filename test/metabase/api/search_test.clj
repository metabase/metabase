(ns metabase.api.search-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :as collection :refer [Collection]]
             [collection-test :as collection-test]
             [dashboard :refer [Dashboard]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.test.data.users  :as test-users]
            [metabase.test.util :as tu]
            [metabase.api.search :as search-api]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

(def ^:private default-search-results
  (set (map #(merge {:description nil, :id true, :collection_id false,
                     :collection_position nil, :archived false, :favorited nil} %)
            [{:name "dashboard foo dashboard", :type "dashboard"}
             {:name "collection foo collection", :type "collection", :collection_id true}
             {:name "card foo card", :type "card"}
             {:name "pulse foo pulse", :type "pulse", :archived nil}
             {:name "metric foo metric", :description "Lookin' for a blueberry", :type "metric"}
             {:name "segment foo segment", :description "Lookin' for a blueberry", :type "segment"}])))

(def ^:private default-archived-results
  (set (for [result default-search-results
             :when (false? (:archived result))]
         (assoc result :archived true))))

(defn- on-search-types [types-set f coll]
  (set (for [search-item coll]
         (if (contains? types-set (:type search-item))
           (f search-item)
           search-item))))

(def ^:private default-results-with-collection
  (on-search-types #{"dashboard" "pulse" "card"}
                   #(assoc % :collection_id true)
                   default-search-results))

;; Basic search, should find 1 of each entity type
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo")))))

;; Favorites are per user, so other user's favorites don't cause search results to be favorited
(expect
  default-search-results
  (tt/with-temp* [Card       [{card-id :id} {:name "card foo card"}]
                  CardFavorite  [_ {:card_id card-id
                                    :owner_id (test-users/user->id :rasta)}]
                  Dashboard  [{dash-id :id} {:name "dashboard foo dashboard"}]
                  DashboardFavorite [_ {:dashboard_id dash-id
                                        :user_id (test-users/user->id :rasta)}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo")))))

;; Basic search, should find 1 of each entity type and include favorites when available
(expect
  (on-search-types #{"dashboard" "card"}
                   #(assoc % :favorited true)
                   default-search-results)
  (tt/with-temp* [Card       [{card-id :id} {:name "card foo card"}]
                  CardFavorite  [_ {:card_id card-id
                                    :owner_id (test-users/user->id :crowberto)}]
                  Dashboard  [{dash-id :id} {:name "dashboard foo dashboard"}]
                  DashboardFavorite [_ {:dashboard_id dash-id
                                        :user_id (test-users/user->id :crowberto)}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo")))))

;; Basic search should only return substring matches
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Card       [_ {:name "card bar card"}]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Dashboard  [_ {:name "dashboard bar dashboard"}]
                  Collection [_ {:name "collection foo collection"}]
                  Collection [_ {:name "collection bar collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Pulse      [_ {:name "pulse bar pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Metric     [_ {:name "metric bar metric"}]
                  Segment    [_ {:name "segment foo segment"}]
                  Segment    [_ {:name "segment bar segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo")))))

(defn- archived [m]
  (assoc m :archived true))

;; Should return unarchived results by default
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Card       [_ (archived {:name "card foo card2"})]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Dashboard  [_ (archived {:name "dashboard foo dashboard2"})]
                  Collection [_ {:name "collection foo collection"}]
                  Collection [_ (archived  {:name "collection foo collection2"})]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Metric     [_ (archived {:name "metric foo metric2"})]
                  Segment    [_ {:name "segment foo segment"}]
                  Segment    [_ (archived {:name "segment foo segment2"})]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo")))))

;; Should return archived results when specified
(expect
  default-archived-results
  (tt/with-temp* [Card       [_ (archived {:name "card foo card"})]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ (archived {:name "dashboard foo dashboard"})]
                  Dashboard  [_ {:name "dashboard foo dashboard2"}]
                  Collection [_ (archived {:name "collection foo collection"})]
                  Collection [_ {:name "collection foo collection2"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ (archived {:name "metric foo metric"})]
                  Metric     [_ {:name "metric foo metric2"}]
                  Segment    [_ (archived {:name "segment foo segment"})]
                  Segment    [_ {:name "segment foo segment2"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search",
                                         :q "foo", :archived "true")))))

;; Search within a collection will omit the collection, only return cards/dashboards/pulses in the collection
(expect
  ;; Metrics and segments don't have a collection, so they shouldn't be included in the results
  (set (remove (comp #{"collection" "metric" "segment"} :type) default-results-with-collection))
  (tt/with-temp* [Collection [{coll-id :id} {:name "collection foo collection"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id}]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id}]
                  Dashboard  [_ {:name "dashboard bar dashboard2"}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id}]
                  Pulse      [_ {:name "pulse foo pulse2"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :crowberto) :get 200 "search", :q "foo", :collection coll-id)))))

;; Querying for a collection you don't have access to just returns empty
(expect
  []
  (tt/with-temp* [Collection [coll-1          {:name "collection 1"}]
                  Collection [{coll-2-id :id} {:name "collection 2"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll-1)
    ((test-users/user->client :rasta) :get 200 "search", :q "foo", :collection coll-2-id)))

;; Users with access to a collection should be able to search it
(expect
  ;; Metrics and segments don't have a collection, so they shouldn't be included in the results
  (set (remove (comp #{"collection" "metric" "segment"} :type) default-results-with-collection))
  (tt/with-temp* [Collection [{coll-id :id, :as coll} {:name "collection foo collection"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id}]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id}]
                  Dashboard  [_ {:name "dashboard bar dashboard2"}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id}]
                  Pulse      [_ {:name "pulse foo pulse2"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll)
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :rasta) :get 200 "search", :q "foo", :collection coll-id)))))

;; Collections a user doesn't have access to are automatically omitted from the results
(expect
  default-results-with-collection
  (tt/with-temp* [Collection [{coll-id-1 :id, :as coll-1} {:name "collection foo collection"}]
                  Collection [{coll-id-2 :id, :as coll-2} {:name "collection foo collection2"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id-1}]
                  Card       [_ {:name "card foo card2", :collection_id coll-id-2}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id-1}]
                  Dashboard  [_ {:name "dashboard bar dashboard2", :collection_id coll-id-2}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id-1}]
                  Pulse      [_ {:name "pulse foo pulse2", :collection_id coll-id-2}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll-1)
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :rasta) :get 200 "search", :q "foo")))))

;; Searching for the root collection will return all items with a nil collection_id
(expect
  (set (remove #(contains? #{"collection" "metric" "segment"} (:type %)) default-search-results))
  (tt/with-temp* [Collection [{coll-id :id, :as coll} {:name "collection foo collection"}]
                  Card       [_ {:name "card foo card"}]
                  Card       [_ {:name "card foo card2", :collection_id coll-id}]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Dashboard  [_ {:name "dashboard bar dashboard2", :collection_id coll-id}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Pulse      [_ {:name "pulse foo pulse2", :collection_id coll-id}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((test-users/user->client :rasta) :get 200 "search", :q "foo", :collection "root")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Fetching a (Non-Root) Collection                                        |
;;; +----------------------------------------------------------------------------------------------------------------+

;; check that we can see collection details (GET /api/search?collection=:id)
(expect-focused
  "Coin Collection"
  (tt/with-temp Collection [collection {:name "Coin Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (:name ((test-users/user->client :rasta) :get 200 (str "search?collection=" (u/get-id collection))))))

(defn- x []
  (tt/with-temp Collection [collection {:name "Coin Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (test-users/with-test-user :rasta
      (toucan.db/debug-print-queries
        (search-api/do-search nil nil (str (u/get-id collection))))
      #_(:name ((test-users/user->client :rasta) :get 200 (str "search?collection=" (u/get-id collection)))))))

;; check that collections detail properly checks permissions
(expect
  "You don't have permissions to do that."
  (tt/with-temp Collection [collection]
    ((test-users/user->client :rasta) :get 403 (str "search?collection=" (u/get-id collection)))))


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
    ((test-users/user->client :crowberto) :get 200 (str "search?collection=" (u/get-id collection)))))

;; check that collections detail doesn't return archived collections
(expect
  "Not found."
  (tt/with-temp Collection [collection {:archived true}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    ((test-users/user->client :rasta) :get 404 (str "search?collection=" (u/get-id collection)))))

(defn- remove-ids-from-collection-detail [results & {:keys [keep-collection-id?]
                                                     :or {keep-collection-id? false}}]
  (into {} (for [[k items] (select-keys results (cond->> [:name :cards :dashboards :pulses :can_write]
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
   :pulses     [{:name "Electro-Magnetic Pulse", :collection_position nil}]
   :can_write  false}
  (tt/with-temp Collection [collection {:name "Debt Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (-> ((test-users/user->client :rasta) :get 200 (str "search?collection=" (u/get-id collection)))
          remove-ids-from-collection-detail))))

;; ...and that you can also filter so that you only see the children you want to see
(expect
  {:name       "Art Collection"
   :dashboards [{:name "Dine & Dashboard", :collection_position nil}]
   :can_write  false}
  (tt/with-temp Collection [collection {:name "Art Collection"}]
    (perms/grant-collection-read-permissions! (group/all-users) collection)
    (with-some-children-of-collection collection
      (-> ((test-users/user->client :rasta) :get 200 (str "search?collection=" (u/get-id collection) "&model=dashboards"))
          remove-ids-from-collection-detail))))


;;; ------------------------------------ Effective Ancestors & Effective Children ------------------------------------

(defmacro ^:private with-collection-hierarchy
  "Totally-rad macro that creates a Collection hierarchy (with names A-G) and grants the All Users group read perms for
  all the Collections you've *bound*. Hierarchy looks like this:

    ;;    +-> B
    ;;    |
    ;; A -+-> C -+-> D -> E
    ;;           |
    ;;           +-> F -> G

  For example:

    (with-collection-hierarchy [a b c]
      ;; All Users will have perms for A, B, and C; but not for D-G .
      ...)"
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

(defn- api-fetch-collection-ancestors-and-children
  "Call the API with Rasta to fetch `collection-or-id` and put the `:effective_` results in a nice format for the tests
  below."
  [collection-or-id]
  (-> ((test-users/user->client :rasta) :get 200 (str "search?collection=" (u/get-id collection-or-id)))
      format-ancestors-and-children))

;; does a top-level Collection like A have the correct Children?
(expect
  {:effective_children  #{{:name "B", :id true} {:name "C", :id true}}
   :effective_ancestors []
   :effective_location  "/"}
  (with-collection-hierarchy [a b c d g]
    (api-fetch-collection-ancestors-and-children a)))

;; ok, does a second-level Collection have its parent and its children?
(expect
  {:effective_children  #{{:name "D", :id true} {:name "G", :id true}}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location  "/A/"}
  (with-collection-hierarchy [a b c d g]
    (api-fetch-collection-ancestors-and-children c)))

;; what about a third-level Collection?
(expect
  {:effective_children #{}
   :effective_ancestors [{:name "A", :id true} {:name "C", :id true}]
   :effective_location "/A/C/"}
  (with-collection-hierarchy [a b c d g]
    (api-fetch-collection-ancestors-and-children d)))

;; for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie and say we are
;; a child of A
(expect
  {:effective_children #{}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location "/A/"}
  (with-collection-hierarchy [a b d g]
    (api-fetch-collection-ancestors-and-children d)))

;; for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection.
(expect
  {:effective_children #{},
   :effective_ancestors [{:name "C", :id true}]
   :effective_location "/C/"}
  (with-collection-hierarchy [b c d g]
    (api-fetch-collection-ancestors-and-children d)))

;; for C: if we remove D we should get E and F as effective children
(expect
  {:effective_children #{{:name "E", :id true} {:name "F", :id true}}
   :effective_ancestors [{:name "A", :id true}]
   :effective_location "/A/"}
  (with-collection-hierarchy [a b c e f g]
    (api-fetch-collection-ancestors-and-children c)))

;; Make sure we can collapse multiple generations. For A: removing C and D should move up E and F
(expect
  {:effective_children #{{:name "B", :id true}
                         {:name "E", :id true}
                         {:name "F", :id true}}
   :effective_ancestors []
   :effective_location "/"}
  (with-collection-hierarchy [a b e f g]
    (api-fetch-collection-ancestors-and-children a)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Fetching the Root Collection                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called "Root" Collection

;; Make sure you can see everything for Users that can see everything
(expect
  {:name       "Root Collection"
   :id         "root"
   :cards      [{:name "Birthday Card",          :collection_position nil}]
   :dashboards [{:name "Dine & Dashboard",       :collection_position nil}]
   :pulses     [{:name "Electro-Magnetic Pulse", :collection_position nil}]
   :can_write  true}
  (with-some-children-of-collection nil
    (-> ((test-users/user->client :crowberto) :get 200 "search?collection=root")
        (remove-ids-from-collection-detail :keep-collection-id? true))))

;; ...but we don't let you see stuff you wouldn't otherwise be allowed to see
(expect
  {:name       "Root Collection"
   :id         "root"
   :cards      []
   :dashboards []
   :pulses     []
   :can_write  false}
  ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no collection_id
  (with-some-children-of-collection nil
    (-> ((test-users/user->client :rasta) :get 200 "search?collection=root")
        (remove-ids-from-collection-detail :keep-collection-id? true))))

;; ...but if they have read perms for the Root Collection they should get to see them
(expect
  {:name       "Root Collection"
   :id         "root"
   :cards      [{:name "Birthday Card"          :collection_position nil}]
   :dashboards [{:name "Dine & Dashboard"       :collection_position nil}]
   :pulses     [{:name "Electro-Magnetic Pulse" :collection_position nil}]
   :can_write  false}
  (with-some-children-of-collection nil
    (tt/with-temp* [PermissionsGroup           [group]
                    PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
      (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.search?collection=is-root? true}))
      (-> ((test-users/user->client :rasta) :get 200 "search?collection=root")
          (remove-ids-from-collection-detail :keep-collection-id? true)))))

;; So I suppose my Personal Collection should show up when I fetch the Root Collection, shouldn't it...
(expect
  {:pulses              []
   :can_write           false
   :dashboards          []
   :name                "Root Collection"
   :effective_ancestors []
   :effective_location  nil
   :id                  "root"
   :cards               []
   :effective_children  [{:name "Rasta Toucan's Personal Collection"
                          :id   (u/get-id (collection/user->personal-collection (test-users/user->id :rasta)))}]}
  (do
    (collection-test/force-create-personal-collections!)
    ((test-users/user->client :rasta) :get 200 "search?collection=root")))

;; And for admins, only return our own Personal Collection (!)
(expect
  {:pulses              []
   :can_write           true
   :dashboards          []
   :name                "Root Collection"
   :effective_ancestors []
   :effective_location  nil
   :id                  "root"
   :cards               []
   :effective_children  [{:name "Crowberto Corv's Personal Collection"
                          :id   (u/get-id (collection/user->personal-collection (test-users/user->id :crowberto)))}]}
  (do
    (collection-test/force-create-personal-collections!)
    ((test-users/user->client :crowberto) :get 200 "search?collection=root")))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-fetch-root-collection-ancestors-and-children
  "Call the API with Rasta to fetch the 'Root' Collection and put the `:effective_` results in a nice format for the
  tests below."
  []
  ;; call the API endpoint with some of the other users so we can make sure their Personal Collections don't show up
  ;; inappropriately
  ((test-users/user->client :crowberto) :get 200 "search?collection=root")
  ((test-users/user->client :lucky) :get 200 "search?collection=root")
  (-> ((test-users/user->client :rasta) :get 200 "search?collection=root")
      format-ancestors-and-children))

;; Do top-level collections show up as children of the Root Collection?
(expect
  {:effective_children  #{{:name "A", :id true}
                          {:name "Rasta Toucan's Personal Collection", :id true}}
   :effective_ancestors []
   :effective_location  nil}
  (with-collection-hierarchy [a b c d e f g]
    (api-fetch-root-collection-ancestors-and-children)))

;; ...and collapsing children should work for the Root Collection as well
(expect
  {:effective_children  #{{:name "B", :id true}
                          {:name "D", :id true}
                          {:name "F", :id true}
                          {:name "Rasta Toucan's Personal Collection", :id true}}
   :effective_ancestors []
   :effective_location  nil}
  (with-collection-hierarchy [b d e f g]
    (api-fetch-root-collection-ancestors-and-children)))
