(ns metabase.models.collection-test
  (:refer-clojure :exclude [ancestors descendants])
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [user :refer [User]]]
            [metabase.test.data.users :as test-users]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

(defn force-create-personal-collections!
  "Force the creation of the Personal Collections for our various test users. They are eventually going to get
  automatically created anyway as soon as those Users' permissions get calculated in `user/permissions-set`; better to
  do it now so the test results will be consistent."
  []
  (doseq [username [:rasta :lucky :crowberto :trashbird]]
    (collection/user->personal-collection (test-users/user->id username))))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (test-users/user->id :lucky))))

(defn- replace-collection-ids
  "In Collection perms `graph`, replace instances of the ID of `collection-or-id` with `:COLLECTION`, making it possible
  to write tests that don't need to know its actual numeric ID."
  [collection-or-id graph]
  (update graph :groups (partial m/map-vals (partial m/map-keys (fn [collection-id]
                                                                  (if (= collection-id (u/get-id collection-or-id))
                                                                    :COLLECTION
                                                                    collection-id))))))

;; test that we can create a new Collection with valid inputs
(expect
  {:name              "My Favorite Cards"
   :slug              "my_favorite_cards"
   :description       nil
   :color             "#ABCDEF"
   :archived          false
   :location          "/"
   :personal_owner_id nil}
  (tt/with-temp Collection [collection {:name "My Favorite Cards", :color "#ABCDEF"}]
    (dissoc collection :id)))

;; check that the color is validated
(expect Exception (db/insert! Collection {:name "My Favorite Cards"}))                    ; missing color
(expect Exception (db/insert! Collection {:name "My Favorite Cards", :color "#ABC"}))     ; too short
(expect Exception (db/insert! Collection {:name "My Favorite Cards", :color "#BCDEFG"}))  ; invalid chars
(expect Exception (db/insert! Collection {:name "My Favorite Cards", :color "#ABCDEFF"})) ; too long
(expect Exception (db/insert! Collection {:name "My Favorite Cards", :color "ABCDEF"}))   ; missing hash prefix

;; double-check that `with-temp-defaults` are working correctly for Collection
(expect
  :ok
  (tt/with-temp* [Collection [_]]
    :ok))

;; test that duplicate names ARE allowed
(expect
  :ok
  (tt/with-temp* [Collection [_ {:name "My Favorite Cards"}]
                  Collection [_ {:name "My Favorite Cards"}]]
    :ok))

;; Duplicate names should result in duplicate slugs...
(expect
  ["my_favorite_cards"
   "my_favorite_cards"]
  (tt/with-temp* [Collection [collection-1 {:name "My Favorite Cards"}]
                  Collection [collection-2 {:name "My Favorite Cards"}]]
    (map :slug [collection-1 collection-2])))


;; things with different names that would cause the same slug SHOULD be allowed
(expect
  :ok
  (tt/with-temp* [Collection [_ {:name "My Favorite Cards"}]
                  Collection [_ {:name "my_favorite Cards"}]]
    :ok))

;; check that archiving a collection archives its cards as well
(expect
  true
  (tt/with-temp* [Collection [collection]
                  Card       [card       {:collection_id (u/get-id collection)}]]
    (db/update! Collection (u/get-id collection)
      :archived true)
    (db/select-one-field :archived Card :id (u/get-id card))))

;; check that unarchiving a collection unarchives its cards as well
(expect
  false
  (tt/with-temp* [Collection [collection {:archived true}]
                  Card       [card       {:collection_id (u/get-id collection), :archived true}]]
    (db/update! Collection (u/get-id collection)
      :archived false)
    (db/select-one-field :archived Card :id (u/get-id card))))

;; check that collections' names cannot be blank
(expect
  Exception
  (tt/with-temp Collection [collection {:name ""}]
    collection))

;; check we can't change the name of a Collection to a blank string
(expect
  Exception
  (tt/with-temp Collection [collection]
    (db/update! Collection (u/get-id collection)
      :name "")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Graph Tests                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- graph [& {:keys [clear-revisions?]}]
  ;; delete any previously existing collection revision entries so we get revision = 0
  (when clear-revisions?
    (db/delete! 'CollectionRevision))
  ;; force lazy creation of the three magic groups as needed
  (group/all-users)
  (group/admin)
  (group/metabot)
  ;; now fetch the graph
  (collection/graph))

;; Check that the basic graph works
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (graph :clear-revisions? true)))

;; Creating a new Collection shouldn't give perms to anyone but admins
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
              (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
              (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (replace-collection-ids collection (graph :clear-revisions? true)))))

;; make sure read perms show up correctly
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
              (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
              (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (perms/grant-collection-read-permissions! (group/all-users) collection)
      (replace-collection-ids collection (graph :clear-revisions? true)))))

;; make sure we can grant write perms for new collections (!)
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
              (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
              (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (perms/grant-collection-readwrite-permissions! (group/all-users) collection)
      (replace-collection-ids collection (graph :clear-revisions? true)))))

;; make sure a non-magical group will show up
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :none}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (graph :clear-revisions? true)))

;; How abut *read* permissions for the Root Collection?
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :read}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (perms/grant-collection-read-permissions! new-group collection/root-collection)
    (graph :clear-revisions? true)))

;; How about granting *write* permissions for the Root Collection?
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
    (graph :clear-revisions? true)))

;; Can we do a no-op update?
(expect
  ;; revision should not have changed, because there was nothing to do...
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}}}
  ;; need to bind *current-user-id* or the Revision won't get updated
  (tu/with-non-admin-groups-no-root-collection-perms
    (binding [*current-user-id* (test-users/user->id :crowberto)]
      (collection/update-graph! (graph :clear-revisions? true))
      (graph))))

;; Can we give someone read perms via the graph?
(expect
  {:revision 1
   :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :read}
              (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
              (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (binding [*current-user-id* (test-users/user->id :crowberto)]
        (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                            :read))
        (replace-collection-ids collection (graph))))))

;; can we give them *write* perms?
(expect
 {:revision 1
  :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :write}
             (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
             (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
 (tu/with-non-admin-groups-no-root-collection-perms
   (tt/with-temp Collection [collection]
     (binding [*current-user-id* (test-users/user->id :crowberto)]
       (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                           [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                           :write))
       (replace-collection-ids collection (graph))))))

;; can we *revoke* perms?
(expect
  {:revision 1
   :groups   {(u/get-id (group/all-users)) {:root :none,  :COLLECTION :none}
              (u/get-id (group/metabot))   {:root :none,  :COLLECTION :none}
              (u/get-id (group/admin))     {:root :write, :COLLECTION :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [collection]
      (binding [*current-user-id* (test-users/user->id :crowberto)]
        (perms/grant-collection-read-permissions! (group/all-users) collection)
        (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups (u/get-id (group/all-users)) (u/get-id collection)]
                                            :none))
        (replace-collection-ids collection (graph))))))

;; How abut *read* permissions for the Root Collection?
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 1
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :read}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (binding [*current-user-id* (test-users/user->id :crowberto)]
      (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                          [:groups (u/get-id new-group) :root]
                                          :read))
      (graph))))

;; How about granting *write* permissions for the Root Collection?
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 1
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (binding [*current-user-id* (test-users/user->id :crowberto)]
      (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                          [:groups (u/get-id new-group) :root]
                                          :write))
      (graph))))

;; can we *revoke* RootCollection perms?
(tt/expect-with-temp [PermissionsGroup [new-group]]
  {:revision 1
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}
              (u/get-id new-group)         {:root :none}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (binding [*current-user-id* (test-users/user->id :crowberto)]
      (perms/grant-collection-readwrite-permissions! new-group collection/root-collection)
      (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                          [:groups (u/get-id new-group) :root]
                                          :none))
      (graph))))

;; Make sure that personal Collections *do not* appear in the Collections graph
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (force-create-personal-collections!)
    (graph :clear-revisions? true)))

;; Make sure that if we try to be sneaky and edit a Personal Collection via the graph, an Exception is thrown
(expect
  Exception
  (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (test-users/user->id :lucky)))]
    (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                        [:groups (u/get-id (group/all-users)) lucky-personal-collection-id]
                                        :read))))

;; double-check that the graph is unchanged
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (u/ignore-exceptions
      (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (test-users/user->id :lucky)))]
        (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                            [:groups (u/get-id (group/all-users)) lucky-personal-collection-id]
                                            :read))))
    (graph)))

;; Make sure descendants of Personal Collections do not come back as part of the graph either...
(expect
  {:revision 0
   :groups   {(u/get-id (group/all-users)) {:root :none}
              (u/get-id (group/metabot))   {:root :none}
              (u/get-id (group/admin))     {:root :write}}}
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp Collection [_ {:location (lucky-collection-children-location)}]
      (graph))))

;; ...and that you can't be sneaky and try to edit them either...
(expect
  Exception
  (tt/with-temp Collection [collection {:location (lucky-collection-children-location)}]
    (let [lucky-personal-collection-id (u/get-id (collection/user->personal-collection (test-users/user->id :lucky)))]
      (collection/update-graph! (assoc-in (graph :clear-revisions? true)
                                          [:groups
                                           (u/get-id (group/all-users))
                                           lucky-personal-collection-id
                                           (u/get-id collection)]
                                          :read)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Nested Collections Helper Fns & Macros                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-collection-hierarchy [a-fn]
  (tu/with-non-admin-groups-no-root-collection-perms
    (tt/with-temp* [Collection [a {:name "A"}]
                    Collection [b {:name "B", :location (collection/location-path a)}]
                    Collection [c {:name "C", :location (collection/location-path a)}]
                    Collection [d {:name "D", :location (collection/location-path a c)}]
                    Collection [e {:name "E", :location (collection/location-path a c d)}]
                    Collection [f {:name "F", :location (collection/location-path a c)}]
                    Collection [g {:name "G", :location (collection/location-path a c f)}]]
      (a-fn {:a a, :b b, :c c, :d d, :e e, :f f, :g g}))))

(defmacro with-collection-hierarchy
  "Run `body` with a hierarchy of Collections that looks like:

        +-> B
        |
     A -+-> C -+-> D -> E
               |
               +-> F -> G

     Bind only the collections you need by using `:keys`:

     (with-collection-hierarchy [{:keys [a b c]}]
       ...)"
  {:style/indent 1}
  [[collections-binding] & body]
  `(do-with-collection-hierarchy (fn [~collections-binding] ~@body)))

(defmacro with-current-user-perms-for-collections
  "Run `body` with the current User permissions for `collections-or-ids`.

     (with-current-user-perms-for-collections [a b c]
       ...)"
  {:style/indent 1}
  [collections-or-ids & body]
  `(binding [*current-user-permissions-set* (atom #{~@(for [collection-or-id collections-or-ids]
                                                        `(perms/collection-read-path ~collection-or-id))})]
     ~@body))

(defn location-path-ids->names
  "Given a Collection location `path` replace all the IDs with the names of the Collections they represent. Done to make
  it possible to compare Collection location paths in tests without having to know the randomly-generated IDs."
  [path]
  ;; split the path into IDs and then fetch a map of ID -> Name for each ID
  (when (seq path)
    (let [ids      (collection/location-path->ids path)
          id->name (when (seq ids)
                     (db/select-field->field :id :name Collection :id [:in ids]))]
      ;; now loop through each ID and replace the ID part like (ex. /10/) with a name (ex. /A/)
      (loop [path path, [id & more] ids]
        (if-not id
          path
          (recur
           (str/replace path (re-pattern (str "/" id "/")) (str "/" (id->name id) "/"))
           more))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Nested Collections: Location Paths                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Does our handy utility function for working with `location` paths work as expected?
(expect "/1/2/3/" (collection/location-path 1 2 3))
(expect "/"       (collection/location-path))
(expect "/1/"     (collection/location-path {:id 1}))
(expect "/1/2/3/" (collection/location-path {:id 1} {:id 2} {:id 3}))
(expect "/1/337/" (collection/location-path 1 {:id 337}))
(expect Exception (collection/location-path "1"))
(expect Exception (collection/location-path nil))
(expect Exception (collection/location-path -1))
(expect Exception (collection/location-path 1 2 1)) ; shouldn't allow duplicates

(expect [1 2 3]   (collection/location-path->ids "/1/2/3/"))
(expect []        (collection/location-path->ids "/"))
(expect [1]       (collection/location-path->ids "/1/"))
(expect [1 337]   (collection/location-path->ids "/1/337/"))
(expect Exception (collection/location-path->ids "/a/"))
(expect Exception (collection/location-path->ids nil))
(expect Exception (collection/location-path->ids "/-1/"))
(expect Exception (collection/location-path->ids "/1/2/1/"))

(expect 3         (collection/location-path->parent-id "/1/2/3/"))
(expect nil       (collection/location-path->parent-id "/"))
(expect 1         (collection/location-path->parent-id "/1/"))
(expect 337       (collection/location-path->parent-id "/1/337/"))
(expect Exception (collection/location-path->parent-id "/a/"))
(expect Exception (collection/location-path->parent-id nil))
(expect Exception (collection/location-path->parent-id "/-1/"))
(expect Exception (collection/location-path->parent-id "/1/2/1/"))

(expect "/1/2/3/1000/" (collection/children-location {:id 1000, :location "/1/2/3/"}))
(expect "/1000/"       (collection/children-location {:id 1000, :location "/"}))
(expect "/1/1000/"     (collection/children-location {:id 1000, :location "/1/"}))
(expect "/1/337/1000/" (collection/children-location {:id 1000, :location "/1/337/"}))
(expect Exception      (collection/children-location {:id 1000, :location "/a/"}))
(expect Exception      (collection/children-location {:id 1000, :location nil}))
(expect Exception      (collection/children-location {:id 1000, :location "/-1/"}))
(expect Exception      (collection/children-location {:id nil,  :location "/1/"}))
(expect Exception      (collection/children-location {:id "a",  :location "/1/"}))
(expect Exception      (collection/children-location {:id 1,    :location "/1/2/"}))

;; Make sure we can look at the current user's permissions set and figure out which Collections they're allowed to see
(expect
  #{8 9}
  (collection/permissions-set->visible-collection-ids
   #{"/db/1/"
     "/db/2/native/"
     "/db/4/schema/"
     "/db/5/schema/PUBLIC/"
     "/db/6/schema/PUBLIC/table/7/"
     "/collection/8/"
     "/collection/9/read/"}))

;; If the current user has root permissions then make sure the function returns `:all`, which signifies that they are
;; able to see all Collections
(expect
  :all
  (collection/permissions-set->visible-collection-ids
   #{"/"
     "/db/2/native/"
     "/collection/9/read/"}))

;; Can we calculate `effective-location-path`?
(expect "/10/20/"    (collection/effective-location-path "/10/20/30/" #{10 20}))
(expect "/10/30/"    (collection/effective-location-path "/10/20/30/" #{10 30}))
(expect "/"          (collection/effective-location-path "/10/20/30/" #{}))
(expect "/10/20/30/" (collection/effective-location-path "/10/20/30/" #{10 20 30}))
(expect "/10/20/30/" (collection/effective-location-path "/10/20/30/" :all))
(expect Exception    (collection/effective-location-path "/10/20/30/" nil))
(expect Exception    (collection/effective-location-path "/10/20/30/" [20]))
(expect Exception    (collection/effective-location-path nil #{}))
(expect Exception    (collection/effective-location-path [10 20] #{}))

;; Does the function also work if we call the single-arity version that powers hydration?
(expect
  "/10/20/"
  (binding [*current-user-permissions-set* (atom #{"/collection/10/" "/collection/20/read/"})]
    (collection/effective-location-path {:location "/10/20/30/"})))

(expect
  "/10/30/"
  (binding [*current-user-permissions-set* (atom #{"/collection/10/read/" "/collection/30/read/"})]
    (collection/effective-location-path {:location "/10/20/30/"})))

(expect
  "/"
  (binding [*current-user-permissions-set* (atom #{})]
    (collection/effective-location-path {:location "/10/20/30/"})))

(expect
  "/10/20/30/"
  (binding [*current-user-permissions-set* (atom #{"/collection/10/" "/collection/20/read/" "/collection/30/read/"})]
    (collection/effective-location-path {:location "/10/20/30/"})))

(expect
  "/10/20/30/"
  (binding [*current-user-permissions-set* (atom #{"/"})]
    (collection/effective-location-path {:location "/10/20/30/"})))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Nested Collections: CRUD Constraints & Behavior                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Can we INSERT a Collection with a valid path?
(defn- insert-collection-with-location! [location]
  (tu/with-model-cleanup [Collection]
    (-> (db/insert! Collection :name (tu/random-name), :color "#ABCDEF", :location location)
        :location
        (= location))))

(expect
  (tt/with-temp Collection [parent]
    (insert-collection-with-location! (collection/location-path parent))))

;; Make sure we can't INSERT a Collection with an invalid path
(defn- nonexistent-collection-id []
  (inc (or (:max (db/select-one [Collection [:%max.id :max]]))
           0)))

(expect
  Exception
  (insert-collection-with-location! "/a/"))

;; Make sure we can't INSERT a Collection with an non-existent ancestors
(expect
  Exception
  (insert-collection-with-location! (collection/location-path (nonexistent-collection-id))))

;; MAae sure we can UPDATE a Collection and give it a new, *valid* location
(expect
  (tt/with-temp* [Collection [collection-1]
                  Collection [collection-2]]
    (db/update! Collection (u/get-id collection-1) :location (collection/location-path collection-2))))

;; Make sure we can't UPDATE a Collection to give it an valid path
(expect
  Exception
  (tt/with-temp Collection [collection]
    (db/update! Collection (u/get-id collection) :location "/a/")))

;; Make sure we can't UPDATE a Collection to give it a non-existent ancestors
(expect
  Exception
  (tt/with-temp Collection [collection]
    (db/update! Collection (u/get-id collection) :location (collection/location-path (nonexistent-collection-id)))))


;; When we delete a Collection do its descendants get deleted as well?
;;
;;    +-> B
;;    |
;; x -+-> C -+-> D -> E     ===>     x
;;           |
;;           +-> F -> G
(expect
  0
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (db/delete! Collection :id (u/get-id a))
    (db/count Collection :id [:in (map u/get-id [a b c d e f g])])))

;; ...put parents & siblings should be untouched
;;
;;    +-> B                             +-> B
;;    |                                 |
;; A -+-> x -+-> D -> E     ===>     A -+
;;           |
;;           +-> F -> G
(expect
  2
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (db/delete! Collection :id (u/get-id c))
    (db/count Collection :id [:in (map u/get-id [a b c d e f g])])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Nested Collections: Ancestors & Effective Ancestors                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ancestors [collection]
  (map :name (#'collection/ancestors collection)))

;; Can we hydrate `ancestors` the way we'd hope?
(expect
  ["A" "C"]
  (with-collection-hierarchy [{:keys [d]}]
    (ancestors d)))

(expect
  ["A" "C" "D"]
  (with-collection-hierarchy [{:keys [e]}]
    (ancestors e)))

;; trying it on C should give us only A
(expect
  ["A"]
  (with-collection-hierarchy [{:keys [c]}]
    (ancestors c)))


;;; ---------------------------------------------- Effective Ancestors -----------------------------------------------

(defn- effective-ancestors [collection]
  (map :name (collection/effective-ancestors collection)))

;; For D: if we don't have permissions for C, we should only see A
(expect
  ["A"]
  (with-collection-hierarchy [{:keys [a d]}]
    (with-current-user-perms-for-collections [a d]
      (effective-ancestors d))))

;; For D: if we don't have permissions for A, we should only see C
(expect
  ["C"]
  (with-collection-hierarchy [{:keys [c d]}]
    (with-current-user-perms-for-collections [c d]
      (effective-ancestors d))))

;; For D: if we have perms for all ancestors we should see them all
(expect
  ["A" "C"]
  (with-collection-hierarchy [{:keys [a c d]}]
    (with-current-user-perms-for-collections [a c d]
      (effective-ancestors d))))

;; For D: if we have permissions for no ancestors, we should see nothing
(expect
  []
  (with-collection-hierarchy [{:keys [a c d]}]
    (with-current-user-perms-for-collections [d]
      (effective-ancestors d))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Nested Collections: Descendants & Effective Children                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; -------------------------------------------------- Descendants ---------------------------------------------------

(defn- format-collections
  "Put the results of `collection/descendants` (etc.) in a nice format that makes it easy to write our tests."
  [collections]
  (set (for [collection collections]
         (-> (into {} collection)
             (update :id integer?)
             (update :location location-path-ids->names)
             (update :children (comp set (partial format-collections)))))))

(defn- descendants [collection]
  (-> (#'collection/descendants collection)
      format-collections))

;; make sure we can fetch the descendants of a Collection in the hierarchy we'd expect
(expect
  #{{:name "B", :id true, :location "/A/", :children #{}, :description nil}
    {:name        "C"
     :id          true
     :description nil
     :location    "/A/"
     :children    #{{:name        "D"
                     :id          true
                     :description nil
                     :location    "/A/C/"
                     :children    #{{:name "E", :id true, :description nil, :location "/A/C/D/", :children #{}}}}
                    {:name        "F"
                     :id          true
                     :description nil
                     :location    "/A/C/"
                     :children    #{{:name "G", :id true, :description nil, :location "/A/C/F/", :children #{}}}}}}}
  (with-collection-hierarchy [{:keys [a]}]
    (descendants a)))

;; try for one of the children, make sure we get just that subtree
(expect
  #{}
  (with-collection-hierarchy [{:keys [b]}]
    (descendants b)))

;; try for the other child, we should get just that subtree!
(expect
  #{{:name        "D"
     :id          true
     :description nil
     :location    "/A/C/"
     :children    #{{:name "E", :id true, :description nil, :location "/A/C/D/", :children #{}}}}
    {:name        "F"
     :id          true
     :description nil
     :location    "/A/C/"
     :children    #{{:name "G", :id true, :description nil, :location "/A/C/F/", :children #{}}}}}
  (with-collection-hierarchy [{:keys [c]}]
    (descendants c)))

;; try for a grandchild
(expect
  #{{:name "E", :id true, :description nil, :location "/A/C/D/", :children #{}}}
  (with-collection-hierarchy [{:keys [d]}]
    (descendants d)))

;; For the *Root* Collection, can we get top-level Collections?
(expect
  #{{:name        "A"
     :id          true
     :description nil
     :location    "/"
     :children    #{{:name        "C"
                     :id          true
                     :description nil
                     :location    "/A/"
                     :children    #{{:name        "D"
                                     :id          true
                                     :description nil
                                     :location    "/A/C/"
                                     :children    #{{:name        "E"
                                                     :id          true
                                                     :description nil
                                                     :location    "/A/C/D/"
                                                     :children    #{}}}}
                                    {:name        "F"
                                     :id          true
                                     :description nil
                                     :location    "/A/C/"
                                     :children    #{{:name        "G"
                                                     :id          true
                                                     :description nil
                                                     :location    "/A/C/F/"
                                                     :children    #{}}}}}}
                    {:name        "B"
                     :id          true
                     :description nil
                     :location    "/A/"
                     :children    #{}}}}}
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (descendants collection/root-collection)))

;; double-check that descendant-ids is working right too
(tt/expect-with-temp [Collection [a]
                      Collection [b {:location (collection/children-location a)}]
                      Collection [c {:location (collection/children-location b)}]]
  #{(u/get-id b) (u/get-id c)}
  (#'collection/descendant-ids a))


;;; ----------------------------------------------- Effective Children -----------------------------------------------

(defn- effective-children [collection]
  (set (map :name (collection/effective-children collection))))

;; If we *have* perms for everything we should just see B and C.
(expect
  #{"B" "C"}
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (with-current-user-perms-for-collections [a b c d e f g]
      (effective-children a))))

;; make sure that `effective-children` isn't returning children or location of children! Those should get discarded.
(expect
  #{:name :id :description}
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (with-current-user-perms-for-collections [a b c d e f g]
      (set (keys (first (collection/effective-children a)))))))

;; If we don't have permissions for C, C's children (D and F) should be moved up one level
;;
;;    +-> B                             +-> B
;;    |                                 |
;; A -+-> x -+-> D -> E     ===>     A -+-> D -> E
;;           |                          |
;;           +-> F -> G                 +-> F -> G
(expect
  #{"B" "D" "F"}
  (with-collection-hierarchy [{:keys [a b d e f g]}]
    (with-current-user-perms-for-collections [a b d e f g]
      (effective-children a))))

;; If we also remove D, its child (F) should get moved up, for a total of 2 levels.
;;
;;    +-> B                             +-> B
;;    |                                 |
;; A -+-> x -+-> x -> E     ===>     A -+-> E
;;           |                          |
;;           +-> F -> G                 +-> F -> G
(expect
  #{"B" "E" "F"}
  (with-collection-hierarchy [{:keys [a b e f g]}]
    (with-current-user-perms-for-collections [a b e f g]
      (effective-children a))))

;; If we remove C and both its children, both grandchildren should get get moved up
;;
;;    +-> B                             +-> B
;;    |                                 |
;; A -+-> x -+-> x -> E     ===>     A -+-> E
;;           |                          |
;;           +-> x -> G                 +-> G
(expect
  #{"B" "E" "G"}
  (with-collection-hierarchy [{:keys [a b e g]}]
    (with-current-user-perms-for-collections [a b e g]
      (effective-children a))))

;; Now try with one of the Children. `effective-children` for C should be D & F
;;
;; C -+-> D -> E              C -+-> D -> E
;;    |              ===>        |
;;    +-> F -> G                 +-> F -> G
(expect
  #{"D" "F"}
  (with-collection-hierarchy [{:keys [b c d e f g]}]
    (with-current-user-perms-for-collections [b c d e f g]
      (effective-children c))))

;; If we remove perms for D & F their respective children should get moved up
;;
;; C -+-> x -> E              C -+-> E
;;    |              ===>        |
;;    +-> x -> G                 +-> G
(expect
  #{"E" "G"}
  (with-collection-hierarchy [{:keys [b c e g]}]
    (with-current-user-perms-for-collections [b c e g]
      (effective-children c))))

;; For the Root Collection: can we fetch its effective children?
(expect
  #{"A"}
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (with-current-user-perms-for-collections [a b c d e f g]
      (effective-children collection/root-collection))))

;; For the Root Collection: if we don't have perms for A, we should get B and C as effective children
(expect
  #{"B" "C"}
  (with-collection-hierarchy [{:keys [b c d e f g]}]
    (with-current-user-perms-for-collections [b c d e f g]
      (effective-children collection/root-collection))))

;; For the Root Collection: if we remove A and C we should get B, D and F
(expect
  #{"B" "D" "F"}
  (with-collection-hierarchy [{:keys [b d e f g]}]
    (with-current-user-perms-for-collections [b d e f g]
      (effective-children collection/root-collection))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Nested Collections: Perms for Moving & Archiving                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; The tests in this section continue to use the Collection hierarchy above. The hierarchy doesn't get modified here,
;; so it's the same in each test:
;;
;;    +-> B
;;    |
;; A -+-> C -+-> D -> E
;;           |
;;           +-> F -> G

(defn perms-path-ids->names
  "Given a set of permissions and `collections` (the map returned by the `with-collection-hierarchy` macro above, or a
  sequential collection), replace the numeric IDs in the permissions paths with corresponding Collection names, making
  our tests easier to read."
  [collections perms-set]
  ;; first build a function that will replace any instances of numeric IDs with their respective names
  ;; e.g. /123/ would become something like /A/
  ;; Do this by composing together a series of functions that will handle one string replacement for each ID + name
  ;; pair
  (let [replace-ids-with-names (reduce comp (for [{:keys [id name]} (if (sequential? collections)
                                                                      collections
                                                                      (vals collections))]
                                              #(str/replace % (re-pattern (format "/%d/" id)) (str "/" name "/"))))]
    (set (for [perms-path perms-set]
           (replace-ids-with-names perms-path)))))

;;; ---------------------------------------------- Perms for Archiving -----------------------------------------------

;; To Archive A, you should need *write* perms for A and all of its descendants, and also the Root Collection...
(expect
  #{"/collection/root/"
    "/collection/A/"
    "/collection/B/"
    "/collection/C/"
    "/collection/D/"
    "/collection/E/"
    "/collection/F/"
    "/collection/G/"}
  (with-collection-hierarchy [{:keys [a], :as collections}]
    (->> (collection/perms-for-archiving a)
         (perms-path-ids->names collections))))

;; Now let's move down a level. To archive B, you should need permissions for A and B, since B doesn't
;; have any descendants
(expect
  #{"/collection/A/"
    "/collection/B/"}
  (with-collection-hierarchy [{:keys [b], :as collections}]
    (->> (collection/perms-for-archiving b)
         (perms-path-ids->names collections))))

;; but for C, you should need perms for A (parent); C; and D, E, F, and G (descendants)
(expect
  #{"/collection/A/"
    "/collection/C/"
    "/collection/D/"
    "/collection/E/"
    "/collection/F/"
    "/collection/G/"}
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (->> (collection/perms-for-archiving c)
         (perms-path-ids->names collections))))

;; For D you should need C (parent), D, and E (descendant)
(expect
  #{"/collection/C/"
    "/collection/D/"
    "/collection/E/"}
  (with-collection-hierarchy [{:keys [d], :as collections}]
    (->> (collection/perms-for-archiving d)
         (perms-path-ids->names collections))))

;; If you try to calculate permissions to archive the Root Collection, throw an Exception! Because you can't do
;; that...
(expect
  Exception
  (collection/perms-for-archiving collection/root-collection))

;; Let's make sure we get an Exception when we try to archive a Personal Collection
(expect
  Exception
  (collection/perms-for-archiving (collection/user->personal-collection (test-users/fetch-user :lucky))))

;; also you should get an Exception if you try to pull a fast one on use and pass in some sort of invalid input...
(expect Exception (collection/perms-for-archiving nil))
(expect Exception (collection/perms-for-archiving {}))
(expect Exception (collection/perms-for-archiving 1))


;;; ------------------------------------------------ Perms for Moving ------------------------------------------------

;; `*` marks the things that require permissions in charts below!

;; If we want to move B into C, we should need perms for A, B, and C. B because it is being moved; C we are moving
;; something into it, A because we are moving something out of it
;;
;;    +-> B                              +-> B*
;;    |                                  |
;; A -+-> C -+-> D -> E  ===>  A* -> C* -+-> D -> E
;;           |                           |
;;           +-> F -> G                  +-> F -> G

(expect
  #{"/collection/A/"
    "/collection/B/"
    "/collection/C/"}
  (with-collection-hierarchy [{:keys [b c], :as collections}]
    (->> (collection/perms-for-moving b c)
         (perms-path-ids->names collections))))

;; Ok, now let's try moving something with descendants. If we move C into B, we need perms for C and all its
;; descendants, and B, since it's the new parent; and A, the old parent
;;
;;    +-> B
;;    |
;; A -+-> C -+-> D -> E  ===>  A* -> B* -> C* -+-> D* -> E*
;;           |                                 |
;;           +-> F -> G                        +-> F* -> G*
(expect
  #{"/collection/A/"
    "/collection/B/"
    "/collection/C/"
    "/collection/D/"
    "/collection/E/"
    "/collection/F/"
    "/collection/G/"}
  (with-collection-hierarchy [{:keys [b c], :as collections}]
    (->> (collection/perms-for-moving c b)
         (perms-path-ids->names collections))))

;; Ok, now how about moving B into the Root Collection?
;;
;;    +-> B                    B* [and Root*]
;;    |
;; A -+-> C -+-> D -> E  ===>  A* -> C -+-> D -> E
;;           |                          |
;;           +-> F -> G                 +-> F -> G
(expect
  #{"/collection/root/"
    "/collection/A/"
    "/collection/B/"}
  (with-collection-hierarchy [{:keys [b], :as collections}]
    (->> (collection/perms-for-moving b collection/root-collection)
         (perms-path-ids->names collections))))

;; How about moving C into the Root Collection?
;;
;;    +-> B                    A* -> B
;;    |
;; A -+-> C -+-> D -> E  ===>  C* -+-> D* -> E* [and Root*]
;;           |                     |
;;           +-> F -> G            +-> F* -> G*
(expect
  #{"/collection/root/"
    "/collection/A/"
    "/collection/C/"
    "/collection/D/"
    "/collection/E/"
    "/collection/F/"
    "/collection/G/"}
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (->> (collection/perms-for-moving c collection/root-collection)
         (perms-path-ids->names collections))))

;; If you try to calculate permissions to move or archive the Root Collection, throw an Exception! Because you can't
;; do that...
(expect
  Exception
  (with-collection-hierarchy [{:keys [a]}]
    (collection/perms-for-moving collection/root-collection a)))

;; You should also see an Exception if you try to move a Collection into itself or into one its descendants...
(expect
  Exception
  (with-collection-hierarchy [{:keys [b]}]
    (collection/perms-for-moving b b)))

(expect
  Exception
  (with-collection-hierarchy [{:keys [a b]}]
    (collection/perms-for-moving a b)))

;; Let's make sure we get an Exception when we try to *move* a Collection
(expect
  Exception
  (with-collection-hierarchy [{:keys [a]}]
    (collection/perms-for-moving (collection/user->personal-collection (test-users/fetch-user :lucky)) a)))

;; also you should get an Exception if you try to pull a fast one on use and pass in some sort of invalid input...
(expect Exception (collection/perms-for-moving {:location "/"} nil))
(expect Exception (collection/perms-for-moving {:location "/"} {}))
(expect Exception (collection/perms-for-moving {:location "/"} 1))
(expect Exception (collection/perms-for-moving nil {:location "/"}))
(expect Exception (collection/perms-for-moving {}  {:location "/"}))
(expect Exception (collection/perms-for-moving 1   {:location "/"}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Nested Collections: Moving Collections                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- combine
  "Recursive `merge-with` that works on nested maps."
  [& maps]
  (->>
   ;; recursively call `combine` to merge this map and its nested maps
   (apply merge-with combine maps)
   ;; now sort the map by its keys and put it back in as an array map to keep the order. Nice!
   (sort-by first)
   (into (array-map))))

(defn- collection-locations
  "Print out an amazingly useful map that charts the hierarchy of `collections`."
  [collections & additional-conditions]
  (apply
   merge-with combine
   (for [collection (-> (apply db/select Collection, :id [:in (map u/get-id collections)], additional-conditions)
                        format-collections)]
     (assoc-in {} (concat (filter seq (str/split (:location collection) #"/"))
                          [(:name collection)])
               {}))))

;; Make sure the util functions above actually work correctly
;;
;;    +-> B
;;    |
;; A -+-> C -+-> D -> E
;;           |
;;           +-> F -> G
(expect
  {"A" {"B" {}
        "C" {"D" {"E" {}}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [collections]
    (collection-locations (vals collections))))

;; Test that we can move a Collection
;;
;;    +-> B                        +-> B ---> E
;;    |                            |
;; A -+-> C -+-> D -> E   ===>  A -+-> C -+-> D
;;           |                            |
;;           +-> F -> G                   +-> F -> G
(expect
  {"A" {"B" {"E" {}}
        "C" {"D" {}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [{:keys [b e], :as collections}]
    (collection/move-collection! e (collection/children-location b))
    (collection-locations (vals collections))))

;; Test that we can move a Collection and its descendants get moved as well
;;
;;    +-> B                       +-> B ---> D -> E
;;    |                           |
;; A -+-> C -+-> D -> E  ===>  A -+-> C -+
;;           |                           |
;;           +-> F -> G                  +-> F -> G
(expect
  {"A" {"B" {"D" {"E" {}}}
        "C" {"F" {"G" {}}}}}
  (with-collection-hierarchy [{:keys [b d], :as collections}]
    (collection/move-collection! d (collection/children-location b))
    (collection-locations (vals collections))))


;; Test that we can move a Collection into the Root Collection
;;
;;    +-> B                        +-> B
;;    |                            |
;; A -+-> C -+-> D -> E   ===>  A -+-> C -> D -> E
;;           |
;;           +-> F -> G         F -> G
(expect
  {"A" {"B" {}
        "C" {"D" {"E" {}}}}
   "F" {"G" {}}}
  (with-collection-hierarchy [{:keys [f], :as collections}]
    (collection/move-collection! f (collection/children-location collection/root-collection))
    (collection-locations (vals collections))))

;; Test that we can move a Collection out of the Root Collection
;;
;;    +-> B                               +-> B
;;    |                                   |
;; A -+-> C -+-> D -> E   ===>  F -+-> A -+-> C -+-> D -> E
;;           |                     |
;;           +-> F -> G            +-> G
(expect
  {"F" {"A" {"B" {}
             "C" {"D" {"E" {}}}}
        "G" {}}}
  (with-collection-hierarchy [{:keys [a f], :as collections}]
    (collection/move-collection! f (collection/children-location collection/root-collection))
    (collection/move-collection! a (collection/children-location (Collection (u/get-id f))))
    (collection-locations (vals collections))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Nested Collections: Archiving/Unarchiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure the 'additional-conditions' for collection-locations is working normally
(expect
  {"A" {"B" {}
        "C" {"D" {"E" {}}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [collections]
    (collection-locations (vals collections) :archived false)))

;; Test that we can archive a Collection with no descendants!
;;
;;    +-> B                        +-> B
;;    |                            |
;; A -+-> C -+-> D -> E   ===>  A -+-> C -+-> D
;;           |                            |
;;           +-> F -> G                   +-> F -> G
(expect
  {"A" {"B" {}
        "C" {"D" {}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (db/update! Collection (u/get-id e) :archived true)
    (collection-locations (vals collections) :archived false)))

;; Test that we can archive a Collection *with* descendants
;;
;;    +-> B                        +-> B
;;    |                            |
;; A -+-> C -+-> D -> E   ===>  A -+
;;           |
;;           +-> F -> G
(expect
  {"A" {"B" {}}}
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (db/update! Collection (u/get-id c) :archived true)
    (collection-locations (vals collections) :archived false)))

;; Test that we can unarchive a Collection with no descendants
;;
;;    +-> B                        +-> B
;;    |                            |
;; A -+-> C -+-> D        ===>  A -+-> C -+-> D -> E
;;           |                            |
;;           +-> F -> G                   +-> F -> G
(expect
  {"A" {"B" {}
        "C" {"D" {"E" {}}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (db/update! Collection (u/get-id e) :archived true)
    (db/update! Collection (u/get-id e) :archived false)
    (collection-locations (vals collections) :archived false)))


;; Test that we can unarchive a Collection *with* descendants
;;
;;    +-> B                        +-> B
;;    |                            |
;; A -+                   ===>  A -+-> C -+-> D -> E
;;                                        |
;;                                        +-> F -> G
(expect
  {"A" {"B" {}
        "C" {"D" {"E" {}}
             "F" {"G" {}}}}}
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (db/update! Collection (u/get-id c) :archived true)
    (db/update! Collection (u/get-id c) :archived false)
    (collection-locations (vals collections) :archived false)))

;; Test that archiving applies to Cards
;; Card is in E; archiving E should cause Card to be archived
(expect
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (tt/with-temp Card [card {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id e) :archived true)
      (db/select-one-field :archived Card :id (u/get-id card)))))

;; Test that archiving applies to Cards belonging to descendant Collections
;; Card is in E, a descendant of C; archiving C should cause Card to be archived
(expect
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (tt/with-temp Card [card {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id c) :archived true)
      (db/select-one-field :archived Card :id (u/get-id card)))))

;; Test that archiving applies to Dashboards
;; Dashboard is in E; archiving E should cause Dashboard to be archived
(expect
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (tt/with-temp Dashboard [dashboard {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id e) :archived true)
      (db/select-one-field :archived Dashboard :id (u/get-id dashboard)))))

;; Test that archiving applies to Dashboards belonging to descendant Collections
;; Dashboard is in E, a descendant of C; archiving C should cause Dashboard to be archived
(expect
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (tt/with-temp Dashboard [dashboard {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id c) :archived true)
      (db/select-one-field :archived Dashboard :id (u/get-id dashboard)))))

;; Test that archiving Collections applies to Pulses
;; Pulse is in E; archiving E should cause Pulse to be archived
(expect
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (tt/with-temp Pulse [pulse {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id e) :archived true)
      (db/select-one-field :archived Pulse :id (u/get-id pulse)))))

;; Test that archiving works on Pulses belonging to descendant Collections
;; Pulse is in E, a descendant of C; archiving C should cause Pulse to be archived
(expect
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (tt/with-temp Pulse [pulse {:collection_id (u/get-id e)}]
      (db/update! Collection (u/get-id c) :archived true)
      (db/select-one-field :archived Pulse :id (u/get-id pulse)))))

;; Test that unarchiving applies to Cards
;; Card is in E; unarchiving E should cause Card to be unarchived
(expect
  false
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (db/update! Collection (u/get-id e) :archived true)
    (tt/with-temp Card [card {:collection_id (u/get-id e), :archived true}]
      (db/update! Collection (u/get-id e) :archived false)
      (db/select-one-field :archived Card :id (u/get-id card)))))

;; Test that unarchiving applies to Cards belonging to descendant Collections
;; Card is in E, a descendant of C; unarchiving C should cause Card to be unarchived
(expect
  false
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (db/update! Collection (u/get-id c) :archived true)
    (tt/with-temp Card [card {:collection_id (u/get-id e), :archived true}]
      (db/update! Collection (u/get-id c) :archived false)
      (db/select-one-field :archived Card :id (u/get-id card)))))

;; Test that unarchiving applies to Dashboards
;; Dashboard is in E; unarchiving E should cause Dashboard to be unarchived
(expect
  false
  (with-collection-hierarchy [{:keys [e], :as collections}]
    (db/update! Collection (u/get-id e) :archived true)
    (tt/with-temp Dashboard [dashboard {:collection_id (u/get-id e), :archived true}]
      (db/update! Collection (u/get-id e) :archived false)
      (db/select-one-field :archived Dashboard :id (u/get-id dashboard)))))

;; Test that unarchiving applies to Dashboards belonging to descendant Collections
;; Dashboard is in E, a descendant of C; unarchiving C should cause Dashboard to be unarchived
(expect
  false
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (db/update! Collection (u/get-id c) :archived true)
    (tt/with-temp Dashboard [dashboard {:collection_id (u/get-id e), :archived true}]
      (db/update! Collection (u/get-id c) :archived false)
      (db/select-one-field :archived Dashboard :id (u/get-id dashboard)))))

;; Test that we cannot archive a Collection at the same time we are moving it
(expect
  Exception
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (db/update! Collection (u/get-id c), :archived true, :location "/")))

;; Test that we cannot unarchive a Collection at the same time we are moving it
(expect
  Exception
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (db/update! Collection (u/get-id c), :archived true)
    (db/update! Collection (u/get-id c), :archived false, :location "/")))

;; Passing in a value of archived that is the same as the value in the DB shouldn't affect anything however!
(expect
  (with-collection-hierarchy [{:keys [c], :as collections}]
    (db/update! Collection (u/get-id c), :archived false, :location "/")))

;; Check that attempting to unarchive a Card that's not archived doesn't affect arcived descendants
(expect
  (with-collection-hierarchy [{:keys [c e], :as collections}]
    (db/update! Collection (u/get-id e), :archived true)
    (db/update! Collection (u/get-id c), :archived false)
    (db/select-one-field :archived Collection :id (u/get-id e))))

;; TODO - can you unarchive a Card that is inside an archived Collection??


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Permissions Inheritance Upon Creation!                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- group->perms
  "Return the perms paths for a `perms-group`, replacing the ID of any `collections` in any entries with their name."
  [collections perms-group]
  ;; we can reuse the `perms-path-ids->names` helper function from above, just need to stick `collection` in a map
  ;; to simulate the output of the `with-collection-hierarchy` macro
  (perms-path-ids->names
   (zipmap (map :name collections)
           collections)
   (db/select-field :object Permissions :group_id (u/get-id perms-group))))

;; Make sure that when creating a new Collection at the Root Level, we copy the group permissions for the Root
;; Collection
(expect
  #{"/collection/{new}/"
    "/collection/root/"}
  (tt/with-temp PermissionsGroup [group]
    (perms/grant-collection-readwrite-permissions! group collection/root-collection)
    (tt/with-temp Collection [collection {:name "{new}"}]
      (group->perms [collection] group))))

(expect
  #{"/collection/{new}/read/"
    "/collection/root/read/"}
  (tt/with-temp PermissionsGroup [group]
    (perms/grant-collection-read-permissions! group collection/root-collection)
    (tt/with-temp Collection [collection {:name "{new}"}]
      (group->perms [collection] group))))

;; Needless to say, no perms before hand = no perms after
(expect
  #{}
  (tt/with-temp PermissionsGroup [group]
    (tt/with-temp Collection [collection {:name "{new}"}]
      (group->perms [collection] group))))

;; ...and granting perms after shouldn't affect Collections already created
(expect
  #{"/collection/root/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection [collection {:name "{new}"}]]
    (perms/grant-collection-read-permissions! group collection/root-collection)
    (group->perms [collection] group)))

;; Make sure that when creating a new Collection as a child of another, we copy the group permissions for its parent
(expect
  #{"/collection/{parent}/"
    "/collection/{child}/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [parent {:name "{parent}"}]]
    (perms/grant-collection-readwrite-permissions! group parent)
    (tt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
      (group->perms [parent child] group))))

(expect
  #{"/collection/{parent}/read/"
    "/collection/{child}/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [parent {:name "{parent}"}]]
    (perms/grant-collection-read-permissions! group parent)
    (tt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
      (group->perms [parent child] group))))

(expect
  #{}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [parent {:name "{parent}"}]
                  Collection       [child {:name "{child}", :location (collection/children-location parent)}]]
    (group->perms [parent child] group)))

(expect
  #{"/collection/{parent}/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [parent {:name "{parent}"}]
                  Collection       [child {:name "{child}", :location (collection/children-location parent)}]]
    (perms/grant-collection-read-permissions! group parent)
    (group->perms [parent child] group)))

;; If we have Root Collection perms they shouldn't be copied for a Child
(expect
  #{"/collection/root/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [parent {:name "{parent}"}]]
    (perms/grant-collection-read-permissions! group collection/root-collection)
    (tt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
      (group->perms [parent child] group))))

;; Make sure that when creating a new Collection as child of a Personal Collection, no group permissions are created
(expect
  false
  (tt/with-temp Collection [child {:name "{child}", :location (lucky-collection-children-location)}]
    (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/get-id child))])))

;; Make sure that when creating a new Collection as grandchild of a Personal Collection, no group permissions are
;; created
(expect
  false
  (tt/with-temp* [Collection [child {:location (lucky-collection-children-location)}]
                  Collection [grandchild {:location (collection/children-location child)}]]
    (or (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/get-id child))])
        (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/get-id grandchild))]))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Make sure we're not allowed to *unarchive* a Personal Collection
(expect
  Exception
  (tt/with-temp User [my-cool-user]
    (let [personal-collection (collection/user->personal-collection my-cool-user)]
      (db/update! Collection (u/get-id personal-collection) :archived true))))

;; Make sure we're not allowed to *move* a Personal Collection
(expect
  Exception
  (tt/with-temp* [User       [my-cool-user]
                  Collection [some-other-collection]]
    (let [personal-collection (collection/user->personal-collection my-cool-user)]
      (db/update! Collection (u/get-id personal-collection) :location (collection/location-path some-other-collection)))))

;; Make sure we're not allowed to change the owner of a Personal Collection
(expect
  Exception
  (tt/with-temp User [my-cool-user]
    (let [personal-collection (collection/user->personal-collection my-cool-user)]
      (db/update! Collection (u/get-id personal-collection) :personal_owner_id (test-users/user->id :crowberto)))))

;; Does hydrating `:personal_collection_id` force creation of Personal Collections?
(expect
  (tt/with-temp User [temp-user]
    (-> (hydrate temp-user :personal_collection_id)
        :personal_collection_id
        integer?)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Moving Collections "Across the Boundary"                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; When moving a Collection from a Personal Collection (or a descendant of one) to a non-Personal one (or a descendant
;; of one), we need to work some magic on its (and its descendants') Permissions.

;;; --------------------------------------------- Personal -> Impersonal ---------------------------------------------

;; When moving a Collection from a Personal Collection to the Root Collection, we should create perms entries that
;; match the Root Collection's entries for any groups that have Root Collection perms.
;;
;; Personal Collection > A          Personal Collection
;;                           ===>
;; Root Collection                  Root Collection > A
(expect
  #{"/collection/root/read/"
    "/collection/A/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]]
    (perms/grant-collection-read-permissions! group collection/root-collection)
    (db/update! Collection (u/get-id a) :location (collection/children-location collection/root-collection))
    (group->perms [a] group)))

;; When moving a Collection from a *descendant* of a Personal Collection to the Root Collection, we should create
;; perms entries that match the Root Collection's entries for any groups that have Root Collection perms.
;;
;; Personal Collection > A > B         Personal Collection > A
;;                              ===>
;; Root Collection                     Root Collection > B
(expect
  #{"/collection/root/"
    "/collection/B/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location a)}]]
    (perms/grant-collection-readwrite-permissions! group collection/root-collection)
    (db/update! Collection (u/get-id b) :location (collection/children-location collection/root-collection))
    (group->perms [a b] group)))

;; When moving a Collection from a Personal Collection to a non-personal Collection, we should create perms entries
;; that match the Root Collection's entries for any groups that have Root Collection perms.
;;
;; Personal Collection > A         Personal Collection
;;                           ===>
;; Root Collection > B             Root Collection > B > A
(expect
  #{"/collection/A/read/"
    "/collection/B/read/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location collection/root-collection)}]]
    (perms/grant-collection-read-permissions! group b)
    (db/update! Collection (u/get-id a) :location (collection/children-location b))
    (group->perms [a b] group)))

;; When moving a Collection from a *descendant* of a Personal Collection to a non-personal Collection, we should
;; create perms entries that match the Root Collection's entries for any groups that have Root Collection perms.
;;
;; Personal Collection > A > B         Personal Collection > A
;;                              ===>
;; Root Collection > C                 Root Collection > C > B
(expect
  #{"/collection/B/"
    "/collection/C/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location a)}]
                  Collection       [c {:name "C", :location (collection/children-location collection/root-collection)}]]
    (perms/grant-collection-readwrite-permissions! group c)
    (db/update! Collection (u/get-id b) :location (collection/children-location c))
    (group->perms [a b c] group)))

;; Perms should apply recursively as well...
;;
;; Personal Collection > A > B         Personal Collection
;;                              ===>
;; Root Collection > C                 Root Collection > C > A > B
(expect
  #{"/collection/A/"
    "/collection/B/"
    "/collection/C/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location a)}]
                  Collection       [c {:name "C", :location (collection/children-location collection/root-collection)}]]
    (perms/grant-collection-readwrite-permissions! group c)
    (db/update! Collection (u/get-id a) :location (collection/children-location c))
    (group->perms [a b c] group)))


;;; --------------------------------------------- Impersonal -> Personal ---------------------------------------------

;; When moving a Collection from Root to a Personal Collection, we should *delete* perms entries for it
;;
;; Personal Collection        Personal Collection > A
;;                      ===>
;; Root Collection > A        Root Collection
(expect
  #{}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (collection/children-location collection/root-collection)}]]
    (perms/grant-collection-readwrite-permissions! group a)
    (db/update! Collection (u/get-id a) :location (lucky-collection-children-location))
    (group->perms [a] group)))

;; When moving a Collection from a non-Personal Collection to a Personal Collection, we should *delete* perms entries
;; for it
;;
;; Personal Collection            Personal Collection > B
;;                          ===>
;; Root Collection > A > B        Root Collection > A
(expect
  #{"/collection/A/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (collection/children-location collection/root-collection)}]
                  Collection       [b {:name "B", :location (collection/children-location a)}]]
    (perms/grant-collection-readwrite-permissions! group a)
    (perms/grant-collection-readwrite-permissions! group b)
    (db/update! Collection (u/get-id b) :location (lucky-collection-children-location))
    (group->perms [a b] group)))

;; When moving a Collection from Root to a descendant of a Personal Collection, we should *delete* perms entries for it
;;
;; Personal Collection > A        Personal Collection > A > B
;;                          ===>
;; Root Collection > B            Root Collection
(expect
  #{}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location collection/root-collection)}]]
    (perms/grant-collection-readwrite-permissions! group b)
    (db/update! Collection (u/get-id b) :location (collection/children-location a))
    (group->perms [a b] group)))

;; When moving a Collection from a non-Personal Collection to a descendant of a Personal Collection, we should
;; *delete* perms entries for it
;;
;; Personal Collection > A        Personal Collection > A > C
;;                          ===>
;; Root Collection > B > C        Root Collection > B
(expect
  #{"/collection/B/"}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location collection/root-collection)}]
                  Collection       [c {:name "C", :location (collection/children-location b)}]]
    (perms/grant-collection-readwrite-permissions! group b)
    (perms/grant-collection-readwrite-permissions! group c)
    (db/update! Collection (u/get-id c) :location (collection/children-location a))
    (group->perms [a b c] group)))

;; Deleting perms should apply recursively as well...
;;
;; Personal Collection > A        Personal Collection > A > B > C
;;                          ===>
;; Root Collection > B > C        Root Collection
(expect
  #{}
  (tt/with-temp* [PermissionsGroup [group]
                  Collection       [a {:name "A", :location (lucky-collection-children-location)}]
                  Collection       [b {:name "B", :location (collection/children-location collection/root-collection)}]
                  Collection       [c {:name "C", :location (collection/children-location b)}]]
    (perms/grant-collection-readwrite-permissions! group b)
    (perms/grant-collection-readwrite-permissions! group c)
    (db/update! Collection (u/get-id b) :location (collection/children-location a))
    (group->perms [a b c] group)))
