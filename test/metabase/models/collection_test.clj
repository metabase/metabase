(ns metabase.models.collection-test
  (:refer-clojure :exclude [ancestors descendants])
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [permissions :as perms]]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; test that we can create a new Collection with valid inputs
(expect
  {:name        "My Favorite Cards"
   :slug        "my_favorite_cards"
   :description nil
   :color       "#ABCDEF"
   :archived    false
   :location    "/"}
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

;; test that duplicate names aren't allowed
(expect
  Exception
  (tt/with-temp* [Collection [_ {:name "My Favorite Cards"}]
                  Collection [_ {:name "My Favorite Cards"}]]
    :ok))

;; things with different names that would cause the same slug shouldn't be allowed either
(expect
  Exception
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
;;; |                                     Nested Collections Helper Fns & Macros                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-collection-hierarchy [a-fn]
  (tt/with-temp* [Collection [a {:name "A"}]
                  Collection [b {:name "B", :location (collection/location-path a)}]
                  Collection [c {:name "C", :location (collection/location-path a)}]
                  Collection [d {:name "D", :location (collection/location-path a c)}]
                  Collection [e {:name "E", :location (collection/location-path a c d)}]
                  Collection [f {:name "F", :location (collection/location-path a c)}]
                  Collection [g {:name "G", :location (collection/location-path a c f)}]]
    (a-fn {:a a, :b b, :c c, :d d, :e e, :f f, :g g})))

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
  (let [ids     (collection/location-path->ids path)
        id->name (when (seq ids)
                   (db/select-field->field :id :name Collection :id [:in ids]))]
    ;; now loop through each ID and replace the ID part like (ex. /10/) with a name (ex. /A/)
    (loop [path path, [id & more] ids]
      (if-not id
        path
        (recur
         (str/replace path (re-pattern (str "/" id "/")) (str "/" (id->name id) "/"))
         more)))))


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
     "/db/3/native/read/"
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
  #{{:name "B", :id true, :location "/A/", :children #{}}
    {:name     "C"
     :id       true
     :location "/A/"
     :children #{{:name     "D"
                  :id       true
                  :location "/A/C/"
                  :children #{{:name "E", :id true, :location "/A/C/D/", :children #{}}}}
                 {:name     "F"
                  :id       true
                  :location "/A/C/"
                  :children #{{:name "G", :id true, :location "/A/C/F/", :children #{}}}}}}}
  (with-collection-hierarchy [{:keys [a]}]
    (descendants a)))

;; try for one of the children, make sure we get just that subtree
(expect
  #{}
  (with-collection-hierarchy [{:keys [b]}]
    (descendants b)))

;; try for the other child, we should get just that subtree!
(expect
  #{{:name     "D"
     :id       true
     :location "/A/C/"
     :children #{{:name "E", :id true, :location "/A/C/D/", :children #{}}}}
    {:name     "F"
     :id       true
     :location "/A/C/"
     :children #{{:name "G", :id true, :location "/A/C/F/", :children #{}}}}}
  (with-collection-hierarchy [{:keys [c]}]
    (descendants c)))

;; try for a grandchild
(expect
  #{{:name "E", :id true, :location "/A/C/D/", :children #{}}}
  (with-collection-hierarchy [{:keys [d]}]
    (descendants d)))

;; For the *Root* Collection, can we get top-level Collections?
(expect
  #{{:name     "A"
     :id       true
     :location "/"
     :children #{{:name     "C"
                  :id       true
                  :location "/A/"
                  :children #{{:name     "D"
                               :id       true
                               :location "/A/C/"
                               :children #{{:name     "E"
                                            :id       true
                                            :location "/A/C/D/"
                                            :children #{}}}}
                              {:name     "F"
                               :id       true
                               :location "/A/C/"
                               :children #{{:name     "G"
                                            :id       true
                                            :location "/A/C/F/"
                                            :children #{}}}}}}
                 {:name "B", :id true, :location "/A/", :children #{}}}}
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (descendants collection/root-collection))})


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
  #{:name :id}
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
  [collections]
  (apply
   merge-with combine
   (for [collection (-> (db/select Collection :id [:in (map u/get-id collections)])
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
