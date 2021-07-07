(ns metabase.models.collection-test
  (:refer-clojure :exclude [ancestors descendants])
  (:require [clojure.math.combinatorics :as math.combo]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.api.common :refer [*current-user-permissions-set*]]
            [metabase.models :refer [Card Collection Dashboard NativeQuerySnippet Permissions PermissionsGroup Pulse User]]
            [metabase.models.collection :as collection]
            [metabase.models.permissions :as perms]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (mt/user->id :lucky))))

(deftest create-collection-test
  (testing "test that we can create a new Collection with valid inputs"
    (mt/with-temp Collection [collection {:name "My Favorite Cards", :color "#ABCDEF"}]
      (is (= (merge
              (mt/object-defaults Collection)
              {:name              "My Favorite Cards"
               :slug              "my_favorite_cards"
               :description       nil
               :color             "#ABCDEF"
               :archived          false
               :location          "/"
               :personal_owner_id nil})
             (mt/derecordize (dissoc collection :id)))))))

(deftest color-validation-test
  (testing "Collection colors should be validated when inserted into the DB"
    (doseq [[input msg] {nil        "Missing color"
                         "#ABC"     "Too short"
                         "#BCDEFG"  "Invalid chars"
                         "#ABCDEFF" "Too long"
                         "ABCDEF"   "Missing hash prefix"}]
      (testing msg
        (is (thrown?
             Exception
             (db/insert! Collection {:name "My Favorite Cards", :color input})))))))

(deftest with-temp-defaults-test
  (testing "double-check that `with-temp-defaults` are working correctly for Collection"
    (mt/with-temp Collection [collection]
      (is (some? collection)))))

(deftest duplicate-names-test
  (testing "test that duplicate names ARE allowed"
    (mt/with-temp* [Collection [c1 {:name "My Favorite Cards"}]
                    Collection [c2 {:name "My Favorite Cards"}]]
      (is (some? c1))
      (is (some? c2))

      (testing "Duplicate names should result in duplicate slugs..."
        (testing "Collection 1"
          (is (= "my_favorite_cards"
                 (:slug c1))))
        (testing "Collection 2"
          (is (= "my_favorite_cards"
                 (:slug c2)))))))

  (testing "things with different names that would cause the same slug SHOULD be allowed"
    (mt/with-temp* [Collection [c1 {:name "My Favorite Cards"}]
                    Collection [c2 {:name "my_favorite Cards"}]]
      (is (some? c1))
      (is (some? c2))
      (is (= (:slug c1) (:slug c2))))))

(deftest archive-cards-test
  (testing "check that archiving a Collection archives its Cards as well"
    (mt/with-temp* [Collection [collection]
                    Card       [card       {:collection_id (u/the-id collection)}]]
      (db/update! Collection (u/the-id collection)
        :archived true)
      (is (= true
             (db/select-one-field :archived Card :id (u/the-id card))))))

  (testing "check that unarchiving a Collection unarchives its Cards as well"
    (mt/with-temp* [Collection [collection {:archived true}]
                    Card       [card       {:collection_id (u/the-id collection), :archived true}]]
      (db/update! Collection (u/the-id collection)
        :archived false)
      (is (= false
             (db/select-one-field :archived Card :id (u/the-id card)))))))

(deftest validate-name-test
  (testing "check that collections' names cannot be blank"
    (is (thrown?
         Exception
         (mt/with-temp Collection [collection {:name ""}]
           collection))))

  (testing "check we can't change the name of a Collection to a blank string"
    (mt/with-temp Collection [collection]
      (is (thrown?
           Exception
           (db/update! Collection (u/the-id collection)
             :name ""))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Nested Collections Helper Fns & Macros                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-collection-hierarchy [options a-fn]
  (mt/with-non-admin-groups-no-root-collection-perms
    (mt/with-temp* [Collection [a (merge options {:name "A"})]
                    Collection [b (merge options {:name "B", :location (collection/location-path a)})]
                    Collection [c (merge options {:name "C", :location (collection/location-path a)})]
                    Collection [d (merge options {:name "D", :location (collection/location-path a c)})]
                    Collection [e (merge options {:name "E", :location (collection/location-path a c d)})]
                    Collection [f (merge options {:name "F", :location (collection/location-path a c)})]
                    Collection [g (merge options {:name "G", :location (collection/location-path a c f)})]]
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
  [[collections-binding options] & body]
  `(do-with-collection-hierarchy ~options (fn [~collections-binding] ~@body)))

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

;;
(deftest location-path-test
  (testing "Does our handy utility function for working with `location` paths work as expected?"
    (testing "valid input"
      (doseq [[args expected] {[1 2 3]                   "/1/2/3/"
                               nil                       "/"
                               [{:id 1}]                 "/1/"
                               [{:id 1} {:id 2} {:id 3}] "/1/2/3/"
                               [1 {:id 337}]             "/1/337/"}]
        (testing (pr-str (cons 'location-path args))
          (is (= expected
                 (apply collection/location-path args))))))

    (testing "invalid input"
      (doseq [args [["1"]
                    [nil]
                    [-1]
                    ;; shouldn't allow duplicates
                    [1 2 1]]]
        (testing (pr-str (cons 'location-path args))
          (is (thrown?
               Exception
               (apply collection/location-path args))))))))

(deftest location-path-ids-test
  (testing "valid input"
    (doseq [[path expected] {"/1/2/3/" [1 2 3]
                             "/"       []
                             "/1/"     [1]
                             "/1/337/" [1 337]}]
      (testing (pr-str (list 'location-path->ids path))
        (is (= expected
               (collection/location-path->ids path))))

      (testing (pr-str (list 'location-path->parent-id path))
        (is (= (last expected)
               (collection/location-path->parent-id path))))))

  (testing "invalid input"
    (doseq [path ["/a/"
                  nil
                  "/-1/"
                  "/1/2/1/"]]
      (testing (pr-str (list 'location-path->ids path))
        (is (thrown?
             Exception
             (collection/location-path->ids path))))

      (testing (pr-str (list 'location-path->parent-id path))
        (is (thrown?
             Exception
             (collection/location-path->parent-id path)))))))

(deftest children-location-test
  (testing "valid input"
    (doseq [[collection expected] {{:id 1000, :location "/1/2/3/"} "/1/2/3/1000/"
                                   {:id 1000, :location "/"}       "/1000/"
                                   {:id 1000, :location "/1/"}     "/1/1000/"
                                   {:id 1000, :location "/1/337/"} "/1/337/1000/"}]
      (testing (pr-str (list 'children-location collection))
        (is (= expected
               (collection/children-location collection))))))

  (testing "invalid input"
    (doseq [collection [{:id 1000, :location "/a/"}
                        {:id 1000, :location nil}
                        {:id 1000, :location "/-1/"}
                        {:id nil, :location "/1/"}
                        {:id "a", :location "/1/"}
                        {:id 1, :location "/1/2/"}]]
      (testing (pr-str (list 'children-location collection))
        (is (thrown?
             Exception
             (collection/children-location collection)))))))

(deftest permissions-set->visible-collection-ids-test
  (testing "Make sure we can look at the current user's permissions set and figure out which Collections they're allowed to see"
    (is (= #{8 9}
           (collection/permissions-set->visible-collection-ids
            #{"/db/1/"
              "/db/2/native/"
              "/db/4/schema/"
              "/db/5/schema/PUBLIC/"
              "/db/6/schema/PUBLIC/table/7/"
              "/collection/8/"
              "/collection/9/read/"}))))

  (testing "If the current user has root permissions then make sure the function returns `:all`, which signifies that they are able to see all Collections"
    (is (= :all
           (collection/permissions-set->visible-collection-ids
            #{"/"
              "/db/2/native/"
              "/collection/9/read/"}))))

  (testing "for the Root Collection we should return `root`"
    (is (= #{8 9 "root"}
           (collection/permissions-set->visible-collection-ids
            #{"/collection/8/"
              "/collection/9/read/"
              "/collection/root/"})))

    (is (= #{"root"}
           (collection/permissions-set->visible-collection-ids
            #{"/collection/root/read/"})))))

(deftest effective-location-path-test
  (testing "valid input"
    (doseq [[args expected] {["/10/20/30/" #{10 20}]    "/10/20/"
                             ["/10/20/30/" #{10 30}]    "/10/30/"
                             ["/10/20/30/" #{}]         "/"
                             ["/10/20/30/" #{10 20 30}] "/10/20/30/"
                             ["/10/20/30/" :all]        "/10/20/30/"}]
      (testing (pr-str (cons 'effective-location-path args))
        (is (= expected
               (apply collection/effective-location-path args))))))

  (testing "invalid input"
    (doseq [args [["/10/20/30/" nil]
                  ["/10/20/30/" [20]]
                  [nil #{}]
                  [[10 20] #{}]]]
      (testing (pr-str (cons 'effective-location-path args))
        (is (thrown?
             Exception
             (apply collection/effective-location-path args))))))

  (testing "Does the function also work if we call the single-arity version that powers hydration?"
    (testing "mix of full and read perms"
      (binding [*current-user-permissions-set* (atom #{"/collection/10/" "/collection/20/read/"})]
        (is (= "/10/20/"
               (collection/effective-location-path {:location "/10/20/30/"})))))

    (testing "missing some perms"
      (binding [*current-user-permissions-set* (atom #{"/collection/10/read/" "/collection/30/read/"})]
        (is (= "/10/30/"
               (collection/effective-location-path {:location "/10/20/30/"})))))

    (testing "no perms"
      (binding [*current-user-permissions-set* (atom #{})]
        (is (= "/"
               (collection/effective-location-path {:location "/10/20/30/"})))))

    (testing "read perms for all"
      (binding [*current-user-permissions-set* (atom #{"/collection/10/" "/collection/20/read/" "/collection/30/read/"})]
        (is (= "/10/20/30/"
               (collection/effective-location-path {:location "/10/20/30/"})))))

    (testing "root perms"
      (binding [*current-user-permissions-set* (atom #{"/"})]
        (is (= "/10/20/30/"
               (collection/effective-location-path {:location "/10/20/30/"})))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Nested Collections: CRUD Constraints & Behavior                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro ^:private with-collection-in-location [[collection-binding location] & body]
  `(let [name# (mt/random-name)]
     (try
       (let [~collection-binding (db/insert! Collection :name name#, :color "#ABCDEF", :location ~location)]
         ~@body)
       (finally
         (db/delete! Collection :name name#)))))

(defn- nonexistent-collection-id []
  (inc (or (:max (db/select-one [Collection [:%max.id :max]]))
           0)))

(deftest crud-validate-path-test
  (testing "Make sure we can't INSERT a Collection with an invalid location"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Collection location: path is invalid"
         (with-collection-in-location [_ "/a/"]))))

  (testing "We should be able to INSERT a Collection with a *valid* location"
    (mt/with-temp Collection [parent]
      (with-collection-in-location [collection (collection/location-path parent)]
        (is (= (collection/location-path parent)
               (:location collection))))))

  (testing "Make sure we can't UPDATE a Collection to give it an invalid location"
    (mt/with-temp Collection [collection]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid Collection location: path is invalid"
           (db/update! Collection (u/the-id collection) :location "/a/")))))

  (testing "We should be able to UPDATE a Collection and give it a new, *valid* location"
    (mt/with-temp* [Collection [collection-1]
                    Collection [collection-2]]
      (is (= true
             (db/update! Collection (u/the-id collection-1) :location (collection/location-path collection-2)))))))

(deftest crud-validate-ancestors-test
  (testing "Make sure we can't INSERT a Collection with an non-existent ancestors"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Collection location: some or all ancestors do not exist"
         (with-collection-in-location [_ (collection/location-path (nonexistent-collection-id))]))))

  (testing "Make sure we can't UPDATE a Collection to give it a non-existent ancestors"
    (mt/with-temp Collection [collection]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid Collection location: some or all ancestors do not exist"
           (db/update! Collection (u/the-id collection) :location (collection/location-path (nonexistent-collection-id))))))))

(deftest delete-descendant-collections-test
  (testing "When we delete a Collection do its descendants get deleted as well?"
    ;;    +-> B
    ;;    |
    ;; x -+-> C -+-> D -> E     ===>     x
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (db/delete! Collection :id (u/the-id a))
      (is (= 0
             (db/count Collection :id [:in (map u/the-id [a b c d e f g])])))))

  (testing "parents & siblings should be untouched"
    ;; ...put
    ;;
    ;;    +-> B                             +-> B
    ;;    |                                 |
    ;; A -+-> x -+-> D -> E     ===>     A -+
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (db/delete! Collection :id (u/the-id c))
      (is (= 2
             (db/count Collection :id [:in (map u/the-id [a b c d e f g])]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Nested Collections: Ancestors & Effective Ancestors                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- ancestors [collection]
  (map :name (#'collection/ancestors collection)))

(deftest ancestors-test
  (with-collection-hierarchy [{:keys [c d e]}]
    (testing "Can we hydrate `ancestors` the way we'd hope?"
      (is (= ["A" "C"]
             (ancestors d)))
      (is (= ["A" "C" "D"]
             (ancestors e))))
    (testing "trying it on C should give us only A"
      (is (= ["A"]
             (ancestors c))))))


;;; ---------------------------------------------- Effective Ancestors -----------------------------------------------

(defn- effective-ancestors [collection]
  (map :name (collection/effective-ancestors collection)))

(deftest effective-ancestors-test
  (with-collection-hierarchy [{:keys [a c d]}]
    (testing "For D: if we don't have permissions for C, we should only see A"
      (with-current-user-perms-for-collections [a d]
        (is (= ["A"]
               (effective-ancestors d)))))

    (testing "For D: if we don't have permissions for A, we should only see C"
      (with-current-user-perms-for-collections [c d]
        (is (= ["C"]
               (effective-ancestors d)))))

    (testing "For D: if we have perms for all ancestors we should see them all"
      (with-current-user-perms-for-collections [a c d]
        (is (= ["A" "C"]
               (effective-ancestors d)))))

    (testing "For D: if we have permissions for no ancestors, we should see nothing"
      (with-current-user-perms-for-collections [d]
        (is (= []
               (effective-ancestors d)))))))


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

(deftest descendants-test
  (with-collection-hierarchy [{:keys [a b c d]}]
    (testing "make sure we can fetch the descendants of a Collection in the hierarchy we'd expect"
      (is (= #{{:name "B", :id true, :location "/A/", :children #{}, :description nil}
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
             (descendants a))))

    (testing "try for one of the children, make sure we get just that subtree"
      (is (= #{}
             (descendants b))))

    (testing "try for the other child, we should get just that subtree!"
      (is (= #{{:name        "D"
                :id          true
                :description nil
                :location    "/A/C/"
                :children    #{{:name "E", :id true, :description nil, :location "/A/C/D/", :children #{}}}}
               {:name        "F"
                :id          true
                :description nil
                :location    "/A/C/"
                :children    #{{:name "G", :id true, :description nil, :location "/A/C/F/", :children #{}}}}}
             (descendants c))))

    (testing "try for a grandchild"
      (is (= #{{:name "E", :id true, :description nil, :location "/A/C/D/", :children #{}}}
             (descendants d))))))

(deftest root-collection-descendants-test
  (testing "For the *Root* Collection, can we get top-level Collections?"
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (= #{{:name        "A"
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
         (descendants collection/root-collection)))))



(deftest descendant-ids-test
  (testing "double-check that descendant-ids is working right too"
    (mt/with-temp* [Collection [a]
                    Collection [b {:location (collection/children-location a)}]
                    Collection [c {:location (collection/children-location b)}]]
      (is (= #{(u/the-id b) (u/the-id c)}
             (#'collection/descendant-ids a))))))


;;; ----------------------------------------------- Effective Children -----------------------------------------------

(defn- effective-children [collection]
  (set (map :name (collection/effective-children collection))))

(deftest effective-children-test
  (with-collection-hierarchy [{:keys [a b c d e f g]}]
    (testing "If we *have* perms for everything we should just see B and C."
      (with-current-user-perms-for-collections [a b c d e f g]
        (is (= #{"B" "C"}
               (effective-children a)))))

    (testing "make sure that `effective-children` isn't returning children or location of children! Those should get discarded."
      (with-current-user-perms-for-collections [a b c d e f g]
        (is (= #{:name :id :description}
               (set (keys (first (collection/effective-children a))))))))

    (testing "If we don't have permissions for C, C's children (D and F) should be moved up one level"
      ;;
      ;;    +-> B                             +-> B
      ;;    |                                 |
      ;; A -+-> x -+-> D -> E     ===>     A -+-> D -> E
      ;;           |                          |
      ;;           +-> F -> G                 +-> F -> G
      (with-current-user-perms-for-collections [a b d e f g]
        (is (= #{"B" "D" "F"}
               (effective-children a)))))

    (testing "If we also remove D, its child (F) should get moved up, for a total of 2 levels."
      ;;
      ;;    +-> B                             +-> B
      ;;    |                                 |
      ;; A -+-> x -+-> x -> E     ===>     A -+-> E
      ;;           |                          |
      ;;           +-> F -> G                 +-> F -> G
      (with-current-user-perms-for-collections [a b e f g]
        (is (= #{"B" "E" "F"}
               (effective-children a)))))

    (testing "If we remove C and both its children, both grandchildren should get get moved up"
      ;;
      ;;    +-> B                             +-> B
      ;;    |                                 |
      ;; A -+-> x -+-> x -> E     ===>     A -+-> E
      ;;           |                          |
      ;;           +-> x -> G                 +-> G
      (with-current-user-perms-for-collections [a b e g]
        (is (= #{"B" "E" "G"}
               (effective-children a)))))

    (testing "Now try with one of the Children. `effective-children` for C should be D & F"
      ;;
      ;; C -+-> D -> E              C -+-> D -> E
      ;;    |              ===>        |
      ;;    +-> F -> G                 +-> F -> G
      (with-current-user-perms-for-collections [b c d e f g]
        (is (= #{"D" "F"}
               (effective-children c)))))

    (testing "If we remove perms for D & F their respective children should get moved up"
      ;;
      ;; C -+-> x -> E              C -+-> E
      ;;    |              ===>        |
      ;;    +-> x -> G                 +-> G
      (with-current-user-perms-for-collections [b c e g]
        (is (= #{"E" "G"}
               (effective-children c)))))

    (testing "For the Root Collection: can we fetch its effective children?"
      (with-current-user-perms-for-collections [a b c d e f g]
        (is (= #{"A"}
               (effective-children collection/root-collection)))))

    (testing "For the Root Collection: if we don't have perms for A, we should get B and C as effective children"
      (with-current-user-perms-for-collections [b c d e f g]
        (is (= #{"B" "C"}
               (effective-children collection/root-collection)))))

    (testing "For the Root Collection: if we remove A and C we should get B, D and F"
      (with-collection-hierarchy [{:keys [b d e f g]}]
        (is (= #{"B" "D" "F"}
               (with-current-user-perms-for-collections [b d e f g]
                 (effective-children collection/root-collection))))))))

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

(deftest perms-for-archiving-test
  (with-collection-hierarchy [{:keys [a b c d], :as collections}]
    (testing "To Archive A, you should need *write* perms for A and all of its descendants, and also the Root Collection..."
      (is (= #{"/collection/root/"
               "/collection/A/"
               "/collection/B/"
               "/collection/C/"
               "/collection/D/"
               "/collection/E/"
               "/collection/F/"
               "/collection/G/"}
             (->> (collection/perms-for-archiving a)
                  (perms-path-ids->names collections)))))

    (testing (str "Now let's move down a level. To archive B, you should need permissions for A and B, since B doesn't "
                  "have any descendants")
      (is (= #{"/collection/A/"
               "/collection/B/"}
             (->> (collection/perms-for-archiving b)
                  (perms-path-ids->names collections)))))

    (testing "but for C, you should need perms for A (parent); C; and D, E, F, and G (descendants)"
      (is (= #{"/collection/A/"
               "/collection/C/"
               "/collection/D/"
               "/collection/E/"
               "/collection/F/"
               "/collection/G/"}
             (->> (collection/perms-for-archiving c)
                  (perms-path-ids->names collections)))))

    (testing "For D you should need C (parent), D, and E (descendant)"
      (is (= #{"/collection/C/"
               "/collection/D/"
               "/collection/E/"}
             (->> (collection/perms-for-archiving d)
                  (perms-path-ids->names collections)))))))

(deftest perms-for-archiving-exceptions-test
  (testing "If you try to calculate permissions to archive the Root Collection, throw an Exception!"
    (is (thrown?
         Exception
         (collection/perms-for-archiving collection/root-collection))))

  (testing "Let's make sure we get an Exception when we try to archive a Personal Collection"
    (is (thrown?
         Exception
         (collection/perms-for-archiving (collection/user->personal-collection (mt/fetch-user :lucky))))))

  (testing "invalid input"
    (doseq [input [nil {} 1]]
      (testing (format "input = %s" (pr-str input))
        (is (thrown?
             Exception
             (collection/perms-for-archiving input)))))))


;;; ------------------------------------------------ Perms for Moving ------------------------------------------------

;; `*` marks the things that require permissions in charts below!

(deftest perms-for-moving-test
  (with-collection-hierarchy [{:keys [b c], :as collections}]
    (testing "If we want to move B into C, we should need perms for A, B, and C."
      ;; B because it is being moved; C we are moving
      ;; something into it, A because we are moving something out of it
      ;;
      ;;    +-> B                              +-> B*
      ;;    |                                  |
      ;; A -+-> C -+-> D -> E  ===>  A* -> C* -+-> D -> E
      ;;           |                           |
      ;;           +-> F -> G                  +-> F -> G

      (is (= #{"/collection/A/"
               "/collection/B/"
               "/collection/C/"}
             (->> (collection/perms-for-moving b c)
                  (perms-path-ids->names collections)))))

    (testing "Ok, now let's try moving something with descendants."
      ;; If we move C into B, we need perms for C and all its
      ;; descendants, and B, since it's the new parent; and A, the old parent
      ;;
      ;;    +-> B
      ;;    |
      ;; A -+-> C -+-> D -> E  ===>  A* -> B* -> C* -+-> D* -> E*
      ;;           |                                 |
      ;;           +-> F -> G                        +-> F* -> G*
      (is (= #{"/collection/A/"
               "/collection/B/"
               "/collection/C/"
               "/collection/D/"
               "/collection/E/"
               "/collection/F/"
               "/collection/G/"}
             (->> (collection/perms-for-moving c b)
                  (perms-path-ids->names collections)))))

    (testing "Ok, now how about moving B into the Root Collection?"
      ;;    +-> B                    B* [and Root*]
      ;;    |
      ;; A -+-> C -+-> D -> E  ===>  A* -> C -+-> D -> E
      ;;           |                          |
      ;;           +-> F -> G                 +-> F -> G
      (is (= #{"/collection/root/"
               "/collection/A/"
               "/collection/B/"}
             (->> (collection/perms-for-moving b collection/root-collection)
                  (perms-path-ids->names collections)))))

    (testing "How about moving C into the Root Collection?"
      ;;    +-> B                    A* -> B
      ;;    |
      ;; A -+-> C -+-> D -> E  ===>  C* -+-> D* -> E* [and Root*]
      ;;           |                     |
      ;;           +-> F -> G            +-> F* -> G*
      (is (= #{"/collection/root/"
               "/collection/A/"
               "/collection/C/"
               "/collection/D/"
               "/collection/E/"
               "/collection/F/"
               "/collection/G/"}
             (->> (collection/perms-for-moving c collection/root-collection)
                  (perms-path-ids->names collections)))))))

(deftest perms-for-moving-exceptions-test
  (with-collection-hierarchy [{:keys [a b], :as collections}]
    (testing "If you try to calculate permissions to move or archive the Root Collection, throw an Exception!"
      (is (thrown?
           Exception
           (collection/perms-for-moving collection/root-collection a))))

    (testing "You should also see an Exception if you try to move a Collection into itself or into one its descendants..."
      (testing "B -> B"
        (is (thrown?
             Exception
             (collection/perms-for-moving b b))))

      (testing "A -> B"
        (is (thrown?
             Exception
             (collection/perms-for-moving a b)))))

    (testing "Let's make sure we get an Exception when we try to *move* a Personal Collection"
      (is (thrown?
           Exception
           (collection/perms-for-moving (collection/user->personal-collection (mt/fetch-user :lucky)) a)))))

  (testing "invalid input"
    (doseq [[collection new-parent] [[{:location "/"} nil]
                                     [{:location "/"} {}]
                                     [{:location "/"} 1]
                                     [nil {:location "/"}]
                                     [{}  {:location "/"}]
                                     [1   {:location "/"}]]]
      (testing (pr-str (list 'perms-for-moving collection new-parent))
        (is (thrown?
             Exception
             (collection/perms-for-moving collection new-parent)))))))


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
   (for [collection (-> (apply db/select Collection, :id [:in (map u/the-id collections)], additional-conditions)
                        format-collections)]
     (assoc-in {} (concat (filter seq (str/split (:location collection) #"/"))
                          [(:name collection)])
               {}))))

(deftest move-nested-collections-test
  (testing "Make sure the util functions above actually work correctly"
    ;;
    ;;    +-> B
    ;;    |
    ;; A -+-> C -+-> D -> E
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [collections]
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections))))))

  (testing "Test that we can move a Collection"
    ;;
    ;;    +-> B                        +-> B ---> E
    ;;    |                            |
    ;; A -+-> C -+-> D -> E   ===>  A -+-> C -+-> D
    ;;           |                            |
    ;;           +-> F -> G                   +-> F -> G
    (with-collection-hierarchy [{:keys [b e], :as collections}]
      (collection/move-collection! e (collection/children-location b))
      (is (= {"A" {"B" {"E" {}}
                   "C" {"D" {}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections))))))

  (testing "Test that we can move a Collection and its descendants get moved as well"
    ;;
    ;;    +-> B                       +-> B ---> D -> E
    ;;    |                           |
    ;; A -+-> C -+-> D -> E  ===>  A -+-> C -+
    ;;           |                           |
    ;;           +-> F -> G                  +-> F -> G
    (with-collection-hierarchy [{:keys [b d], :as collections}]
      (collection/move-collection! d (collection/children-location b))
      (is (= {"A" {"B" {"D" {"E" {}}}
                   "C" {"F" {"G" {}}}}}
             (collection-locations (vals collections))))))

  (testing "Test that we can move a Collection into the Root Collection"
    ;;
    ;;    +-> B                        +-> B
    ;;    |                            |
    ;; A -+-> C -+-> D -> E   ===>  A -+-> C -> D -> E
    ;;           |
    ;;           +-> F -> G         F -> G
    (with-collection-hierarchy [{:keys [f], :as collections}]
      (collection/move-collection! f (collection/children-location collection/root-collection))
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}}}
              "F" {"G" {}}}
             (collection-locations (vals collections))))))

  (testing "Test that we can move a Collection out of the Root Collection"
    ;;
    ;;    +-> B                               +-> B
    ;;    |                                   |
    ;; A -+-> C -+-> D -> E   ===>  F -+-> A -+-> C -+-> D -> E
    ;;           |                     |
    ;;           +-> F -> G            +-> G
    (with-collection-hierarchy [{:keys [a f], :as collections}]
      (collection/move-collection! f (collection/children-location collection/root-collection))
      (collection/move-collection! a (collection/children-location (Collection (u/the-id f))))
      (is (= {"F" {"A" {"B" {}
                        "C" {"D" {"E" {}}}}
                   "G" {}}}
             (collection-locations (vals collections)))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                   Nested Collections: Archiving/Unarchiving                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest nested-collections-archiving-test
  (testing "Make sure the 'additional-conditions' for collection-locations is working normally"
    (with-collection-hierarchy [collections]
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections) :archived false)))))

  (testing "Test that we can archive a Collection with no descendants!"
    ;;    +-> B                        +-> B
    ;;    |                            |
    ;; A -+-> C -+-> D -> E   ===>  A -+-> C -+-> D
    ;;           |                            |
    ;;           +-> F -> G                   +-> F -> G
    (with-collection-hierarchy [{:keys [e], :as collections}]
      (db/update! Collection (u/the-id e) :archived true)
      (is (= {"A" {"B" {}
                   "C" {"D" {}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections) :archived false)))))

  (testing "Test that we can archive a Collection *with* descendants"
    ;;    +-> B                        +-> B
    ;;    |                            |
    ;; A -+-> C -+-> D -> E   ===>  A -+
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [{:keys [c], :as collections}]
      (db/update! Collection (u/the-id c) :archived true)
      (is (= {"A" {"B" {}}}
             (collection-locations (vals collections) :archived false))))))

(deftest nested-collection-unarchiving-test
  (testing "Test that we can unarchive a Collection with no descendants"
    ;;    +-> B                        +-> B
    ;;    |                            |
    ;; A -+-> C -+-> D        ===>  A -+-> C -+-> D -> E
    ;;           |                            |
    ;;           +-> F -> G                   +-> F -> G
    (with-collection-hierarchy [{:keys [e], :as collections}]
      (db/update! Collection (u/the-id e) :archived true)
      (db/update! Collection (u/the-id e) :archived false)
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections) :archived false)))))

  (testing "Test that we can unarchive a Collection *with* descendants"
    ;;    +-> B                        +-> B
    ;;    |                            |
    ;; A -+                   ===>  A -+-> C -+-> D -> E
    ;;                                        |
    ;;                                        +-> F -> G
    (with-collection-hierarchy [{:keys [c], :as collections}]
      (db/update! Collection (u/the-id c) :archived true)
      (db/update! Collection (u/the-id c) :archived false)
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections) :archived false))))))

(deftest nested-collection-archiving-objects-test
  (doseq [model [Card Dashboard NativeQuerySnippet Pulse]]
    (testing (format "Test that archiving applies to %ss" (name model))
      ;; object is in E; archiving E should cause object to be archived
      (with-collection-hierarchy [{:keys [e], :as collections} (when (= model NativeQuerySnippet)
                                                                 {:namespace "snippets"})]
        (mt/with-temp model [object {:collection_id (u/the-id e)}]
          (db/update! Collection (u/the-id e) :archived true)
          (is (= true
                 (db/select-one-field :archived model :id (u/the-id object)))))))

    (testing (format "Test that archiving applies to %ss belonging to descendant Collections" (name model))
      ;; object is in E, a descendant of C; archiving C should cause object to be archived
      (with-collection-hierarchy [{:keys [c e], :as collections} (when (= model NativeQuerySnippet)
                                                                   {:namespace "snippets"})]
        (mt/with-temp model [object {:collection_id (u/the-id e)}]
          (db/update! Collection (u/the-id c) :archived true)
          (is (= true
                 (db/select-one-field :archived model :id (u/the-id object)))))))))

(deftest nested-collection-unarchiving-objects-test
  (doseq [model [Card Dashboard NativeQuerySnippet Pulse]]
    (testing (format "Test that unarchiving applies to %ss" (name model))
      ;; object is in E; unarchiving E should cause object to be unarchived
      (with-collection-hierarchy [{:keys [e], :as collections} (when (= model NativeQuerySnippet)
                                                                 {:namespace "snippets"})]
        (db/update! Collection (u/the-id e) :archived true)
        (mt/with-temp model [object {:collection_id (u/the-id e), :archived true}]
          (db/update! Collection (u/the-id e) :archived false)
          (is (= false
                 (db/select-one-field :archived model :id (u/the-id object)))))))

    (testing (format "Test that unarchiving applies to %ss belonging to descendant Collections" (name model))
      ;; object is in E, a descendant of C; unarchiving C should cause object to be unarchived
      (with-collection-hierarchy [{:keys [c e], :as collections} (when (= model NativeQuerySnippet)
                                                                   {:namespace "snippets"})]
        (db/update! Collection (u/the-id c) :archived true)
        (mt/with-temp model [object {:collection_id (u/the-id e), :archived true}]
          (db/update! Collection (u/the-id c) :archived false)
          (is (= false
                 (db/select-one-field :archived model :id (u/the-id object)))))))))

(deftest archive-while-moving-test
  (testing "Test that we cannot archive a Collection at the same time we are moving it"
    (with-collection-hierarchy [{:keys [c], :as collections}]
      (is (thrown?
           Exception
           (db/update! Collection (u/the-id c), :archived true, :location "/")))))

  (testing "Test that we cannot unarchive a Collection at the same time we are moving it"
    (with-collection-hierarchy [{:keys [c], :as collections}]
      (db/update! Collection (u/the-id c), :archived true)
      (is (thrown?
           Exception
           (db/update! Collection (u/the-id c), :archived false, :location "/")))))

  (testing "Passing in a value of archived that is the same as the value in the DB shouldn't affect anything however!"
    (with-collection-hierarchy [{:keys [c], :as collections}]
      (db/update! Collection (u/the-id c), :archived false, :location "/")
      (is (= "/"
             (db/select-one-field :location Collection :id (u/the-id c)))))))

(deftest archive-noop-shouldnt-affect-descendants-test
  (testing "Check that attempting to unarchive a Card that's not archived doesn't affect archived descendants"
    (with-collection-hierarchy [{:keys [c e], :as collections}]
      (db/update! Collection (u/the-id e), :archived true)
      (db/update! Collection (u/the-id c), :archived false)
      (is (= true
             (db/select-one-field :archived Collection :id (u/the-id e)))))))

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
   (db/select-field :object Permissions :group_id (u/the-id perms-group))))

(deftest copy-root-collection-perms-test
  (testing (str "Make sure that when creating a new Collection at the Root Level, we copy the group permissions for "
                "the Root Collection\n")
    (doseq [collection-namespace [nil "currency"]
            :let                 [root-collection       (assoc collection/root-collection :namespace collection-namespace)
                                  other-namespace      (if collection-namespace nil "currency")
                                  other-root-collection (assoc collection/root-collection :namespace other-namespace)]]
      (testing (format "Collection namespace = %s\n" (pr-str collection-namespace))
        (mt/with-temp PermissionsGroup [group]
          (testing "no perms beforehand = no perms after"
            (mt/with-temp Collection [collection {:name "{new}", :namespace collection-namespace}]
              (is (= #{}
                     (group->perms [collection] group)))))

          (perms/grant-collection-read-permissions! group root-collection)
          (mt/with-temp Collection [collection {:name "{new}", :namespace collection-namespace}]
            (testing "copy read perms"
              (is (= #{"/collection/{new}/read/"
                       (perms/collection-read-path root-collection)}
                     (group->perms [collection] group))))

            (testing "revoking root collection perms shouldn't affect perms of existing children"
              (perms/revoke-collection-permissions! group root-collection)
              (is (= #{"/collection/{new}/read/"}
                     (group->perms [collection] group))))

            (testing "granting new root collection perms shouldn't affect perms of existing children"
              (perms/grant-collection-readwrite-permissions! group root-collection)
              (is (= #{(perms/collection-readwrite-path root-collection) "/collection/{new}/read/"}
                     (group->perms [collection] group)))))

          (testing "copy readwrite perms"
            (mt/with-temp Collection [collection {:name "{new}", :namespace collection-namespace}]
              (is (= #{"/collection/{new}/"
                       (perms/collection-readwrite-path root-collection)}
                     (group->perms [collection] group)))))

          (testing (format "Perms for Root Collection in %s namespace should not affect Collections in %s namespace"
                           (pr-str collection-namespace) (pr-str other-namespace))
            (mt/with-temp Collection [collection {:name "{new}", :namespace other-namespace}]
              (is (= #{(perms/collection-readwrite-path root-collection)}
                     (group->perms [collection] group))))))))))

(deftest copy-parent-permissions-test
  (testing "Make sure that when creating a new child Collection, we copy the group permissions for its parent"
    (mt/with-temp PermissionsGroup [group]
      (testing "parent has readwrite permissions"
        (mt/with-temp Collection [parent {:name "{parent}"}]
          (perms/grant-collection-readwrite-permissions! group parent)
          (mt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/{parent}/"
                     "/collection/{child}/"}
                   (group->perms [parent child] group))))))

      (testing "parent has read permissions"
        (mt/with-temp Collection [parent {:name "{parent}"}]
          (perms/grant-collection-read-permissions! group parent)
          (mt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/{parent}/read/"
                     "/collection/{child}/read/"}
                   (group->perms [parent child] group))))))

      (testing "parent has no permissions"
        (mt/with-temp* [Collection [parent {:name "{parent}"}]
                        Collection [child {:name "{child}", :location (collection/children-location parent)}]]
          (is (= #{}
                 (group->perms [parent child] group)))))

      (testing "parent given read permissions after the fact -- should not update existing children"
        (mt/with-temp* [Collection [parent {:name "{parent}"}]
                        Collection [child {:name "{child}", :location (collection/children-location parent)}]]
          (perms/grant-collection-read-permissions! group parent)
          (is (= #{"/collection/{parent}/read/"}
                 (group->perms [parent child] group)))))

      (testing "If we have Root Collection perms they shouldn't be copied for a Child"
        (mt/with-temp Collection [parent {:name "{parent}"}]
          (perms/grant-collection-read-permissions! group collection/root-collection)
          (mt/with-temp Collection [child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/root/read/"}
                   (group->perms [parent child] group)))))))

    (testing (str "Make sure that when creating a new Collection as child of a Personal Collection, no group "
                  "permissions are created")
      (mt/with-temp Collection [child {:name "{child}", :location (lucky-collection-children-location)}]
        (is (not (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id child))])))))

    (testing (str "Make sure that when creating a new Collection as grandchild of a Personal Collection, no group "
                  "permissions are created")
      (mt/with-temp* [Collection [child {:location (lucky-collection-children-location)}]
                      Collection [grandchild {:location (collection/children-location child)}]]
        (is (not (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id child))])))
        (is (not (db/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id grandchild))])))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest personal-collections-restrictions-test
  (testing "Make sure we're not allowed to *unarchive* a Personal Collection"
    (mt/with-temp User [my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (db/update! Collection (u/the-id personal-collection) :archived true))))))

  (testing "Make sure we're not allowed to *move* a Personal Collection"
    (mt/with-temp* [User       [my-cool-user]
                    Collection [some-other-collection]]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (db/update! Collection (u/the-id personal-collection)
               :location (collection/location-path some-other-collection)))))))

  (testing "Make sure we're not allowed to change the owner of a Personal Collection"
    (mt/with-temp User [my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (db/update! Collection (u/the-id personal-collection) :personal_owner_id (mt/user->id :crowberto)))))))

  (testing "We are not allowed to change the authority_level of a Personal Collection"
    (mt/with-temp User [my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown-with-msg?
             Exception
             #"You are not allowed to change the authority level of a Personal Collection."
             (db/update! Collection (u/the-id personal-collection) :authority_level "official"))))))

  (testing "Does hydrating `:personal_collection_id` force creation of Personal Collections?"
    (mt/with-temp User [temp-user]
      (is (schema= {:personal_collection_id su/IntGreaterThanZero
                    s/Keyword               s/Any}
                   (hydrate temp-user :personal_collection_id))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Moving Collections "Across the Boundary"                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; When moving a Collection from a Personal Collection (or a descendant of one) to a non-Personal one (or a descendant
;; of one), we need to work some magic on its (and its descendants') Permissions.

;;; --------------------------------------------- Personal -> Impersonal ---------------------------------------------

(defmacro ^:private with-collection-hierarchy-in [parent-location [collection-symb & more] & body]
  (if-not collection-symb
    `(do ~@body)
    `(mt/with-temp Collection [~collection-symb {:name     ~(str/upper-case (name collection-symb))
                                                 :location ~parent-location}]
       (with-collection-hierarchy-in (collection/children-location ~collection-symb) ~more ~@body))))

(defmacro ^:private with-personal-and-impersonal-collections {:style/indent 1}
  [[group-binding personal-and-root-collection-bindings] & body]
  (let [collections (zipmap (vals personal-and-root-collection-bindings)
                            (keys personal-and-root-collection-bindings))]
    `(mt/with-temp PermissionsGroup [~group-binding]
       (with-collection-hierarchy-in (lucky-collection-children-location) ~(:personal collections)
         (with-collection-hierarchy-in (collection/children-location collection/root-collection) ~(:root collections)
           ~@body)))))

(deftest move-from-personal-to-impersonal-test
  (testing "Moving a Collection"
    (testing "from a Personal Collection"
      (testing (str "to the Root Collection, we should create perms entries that match the Root Collection's entries "
                    "for any groups that have Root Collection perms.")
        ;; Personal Collection > A          Personal Collection
        ;;                           ===>
        ;; Root Collection                  Root Collection > A
        (with-personal-and-impersonal-collections [group {[a] :personal}]
          (perms/grant-collection-read-permissions! group collection/root-collection)
          (db/update! Collection (u/the-id a) :location (collection/children-location collection/root-collection))
          (is (= #{"/collection/root/read/"
                   "/collection/A/read/"}
                 (group->perms [a] group)))))

      (testing (str "to a non-personal Collection, we should create perms entries that match the Root Collection's "
                    "entries for any groups that  have Root Collection perms.")
        ;; Personal Collection > A         Personal Collection
        ;;                           ===>
        ;; Root Collection > B             Root Collection > B > A
        (with-personal-and-impersonal-collections [group {[a] :personal, [b] :root}]
          (perms/grant-collection-read-permissions! group b)
          (db/update! Collection (u/the-id a) :location (collection/children-location b))
          (is (= #{"/collection/A/read/"
                   "/collection/B/read/"}
                 (group->perms [a b] group))))))

    (testing "from a descendant of a Personal Collection"
      (testing (str "to the Root Collection, we should create perms entries that match the Root Collection's entries "
                    "for any groups that have Root Collection perms.")
        ;; Personal Collection > A > B         Personal Collection > A
        ;;                              ===>
        ;; Root Collection                     Root Collection > B
        (with-personal-and-impersonal-collections [group {[a b] :personal}]
          (perms/grant-collection-readwrite-permissions! group collection/root-collection)
          (db/update! Collection (u/the-id b) :location (collection/children-location collection/root-collection))
          (is (= #{"/collection/root/"
                   "/collection/B/"}
                 (group->perms [a b] group)))))

      (testing (str "to a non-personal Collection, we should create perms entries that match the Root Collection's "
                    "entries for any groups that have Root Collection perms.")
        ;; Personal Collection > A > B         Personal Collection > A
        ;;                              ===>
        ;; Root Collection > C                 Root Collection > C > B
        (with-personal-and-impersonal-collections [group {[a b] :personal, [c] :root}]
          (perms/grant-collection-readwrite-permissions! group c)
          (db/update! Collection (u/the-id b) :location (collection/children-location c))
          (is (= #{"/collection/B/"
                   "/collection/C/"}
                 (group->perms [a b c] group)))))))

  (testing "Perms should apply recursively as well..."
    ;; Personal Collection > A > B         Personal Collection
    ;;                              ===>
    ;; Root Collection > C                 Root Collection > C > A > B
    (with-personal-and-impersonal-collections [group {[a b] :personal, [c] :root}]
      (perms/grant-collection-readwrite-permissions! group c)
      (db/update! Collection (u/the-id a) :location (collection/children-location c))
      (is (= #{"/collection/A/"
               "/collection/B/"
               "/collection/C/"}
             (group->perms [a b c] group))))))


;;; --------------------------------------------- Impersonal -> Personal ---------------------------------------------

(deftest move-from-impersonal-to-personal-test
  (testing "Moving a Collection"
    (testing "from Root"
      (testing "to a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection        Personal Collection > A
        ;;                      ===>
        ;; Root Collection > A        Root Collection
        (with-personal-and-impersonal-collections [group {[a] :root}]
          (perms/grant-collection-readwrite-permissions! group a)
          (db/update! Collection (u/the-id a) :location (lucky-collection-children-location))
          (is (= #{}
                 (group->perms [a] group)))))
      (testing "to a descendant of a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection > A        Personal Collection > A > B
        ;;                          ===>
        ;; Root Collection > B            Root Collection
        (with-personal-and-impersonal-collections [group {[a] :personal, [b] :root}]
          (perms/grant-collection-readwrite-permissions! group b)
          (db/update! Collection (u/the-id b) :location (collection/children-location a))
          (is (= #{}
                 (group->perms [a b] group))))))

    (testing "from a non-Personal Collection"
      (testing "to a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection            Personal Collection > B
        ;;                          ===>
        ;; Root Collection > A > B        Root Collection > A
        (with-personal-and-impersonal-collections [group {[a b] :root}]
          (perms/grant-collection-readwrite-permissions! group a)
          (perms/grant-collection-readwrite-permissions! group b)
          (db/update! Collection (u/the-id b) :location (lucky-collection-children-location))
          (is (= #{"/collection/A/"}
                 (group->perms [a b] group)))))

      (testing "to a descendant of a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection > A        Personal Collection > A > C
        ;;                          ===>
        ;; Root Collection > B > C        Root Collection > B
        (with-personal-and-impersonal-collections [group {[a] :personal, [b c] :root}]
          (perms/grant-collection-readwrite-permissions! group b)
          (perms/grant-collection-readwrite-permissions! group c)
          (db/update! Collection (u/the-id c) :location (collection/children-location a))
          (is (= #{"/collection/B/"}
                 (group->perms [a b c] group)))))))

  (testing "Deleting perms should apply recursively as well..."
    ;; Personal Collection > A        Personal Collection > A > B > C
    ;;                          ===>
    ;; Root Collection > B > C        Root Collection
    (with-personal-and-impersonal-collections [group {[a] :personal, [b c] :root}]
      (perms/grant-collection-readwrite-permissions! group b)
      (perms/grant-collection-readwrite-permissions! group c)
      (db/update! Collection (u/the-id b) :location (collection/children-location a))
      (is (= #{}
             (group->perms [a b c] group))))))

(deftest valid-location-path?-test
  (doseq [[path expected] {nil       false
                           ""        false
                           "/"       true
                           "/1"      false
                           "/1/"     true
                           "/1/2/"   true
                           "/1/1/"   false
                           "/1/2/1/" false
                           "/1/2/3/" true
                           "/abc/"   false
                           "1"       false
                           "/1.0/"   false
                           "/-1/"    false
                           1         false
                           1.0       false}]
    (testing (pr-str path)
      (is (= expected
             (#'collection/valid-location-path? path))))))

(deftest check-parent-collection-namespace-matches-test
  (doseq [[parent-namespace child-namespace] [[nil "x"]
                                              ["x" nil]
                                              ["x" "y"]]]
    (mt/with-temp Collection [parent-collection {:namespace parent-namespace}]
      (testing (format "You should not be able to create a Collection in namespace %s inside a Collection in namespace %s"
                       (pr-str child-namespace) (pr-str parent-namespace))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Collection must be in the same namespace as its parent"
             (db/insert! Collection
               {:location  (format "/%d/" (:id parent-collection))
                :color     "#F38630"
                :name      "Child Collection"
                :namespace child-namespace}))))

      (testing (format "You should not be able to move a Collection of namespace %s into a Collection of namespace %s"
                       (pr-str child-namespace) (pr-str parent-namespace))
        (mt/with-temp Collection [collection-2 {:namespace child-namespace}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Collection must be in the same namespace as its parent"
               (collection/move-collection! collection-2 (format "/%d/" (:id parent-collection)))))))

      (testing (format "You should not be able to change the namespace of a Collection from %s to %s"
                       (pr-str parent-namespace) (pr-str child-namespace))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You cannot move a Collection to a different namespace once it has been created"
             (db/update! Collection (:id parent-collection) :namespace child-namespace)))))))

(deftest check-special-collection-namespace-cannot-be-personal-collection
  (testing "You should not be able to create a Personal Collection with a non-nil `:namespace`."
    (mt/with-temp User [{user-id :id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Personal Collections must be in the default namespace"
           (db/insert! Collection
             {:color             "#F38630"
              :name              "Personal Collection"
              :namespace         "x"
              :personal_owner_id user-id}))))))

(deftest check-collection-namespace-test
  (testing "check-collection-namespace"
    (testing "Should succeed if namespace is allowed"
      (mt/with-temp* [Card       [{card-id :id}]
                      Collection [{collection-id :id}]]
        (is (= nil
               (collection/check-collection-namespace Card collection-id)))))

    (testing "Should throw exception if namespace is not allowed"
      (mt/with-temp* [Card       [{card-id :id}]
                      Collection [{collection-id :id} {:namespace "x"}]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Card can only go in Collections in the \"default\" namespace"
             (collection/check-collection-namespace Card collection-id)))))

    (testing "Should throw exception if Collection does not exist"
      (mt/with-temp Card [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Collection does not exist"
             (collection/check-collection-namespace Card Integer/MAX_VALUE)))))))

(deftest delete-collection-set-children-collection-id-to-null-test
  (testing "When deleting a Collection, should change collection_id of Children to nil instead of Cascading"
    (mt/with-temp* [Collection [{coll-id :id}]
                    Card       [{card-id :id}      {:collection_id coll-id}]
                    Dashboard  [{dashboard-id :id} {:collection_id coll-id}]
                    Pulse      [{pulse-id :id}     {:collection_id coll-id}]]
      (db/delete! Collection :id coll-id)
      (is (db/exists? Card :id card-id)
          "Card")
      (is (db/exists? Dashboard :id dashboard-id)
          "Dashboard")
      (is (db/exists? Pulse :id pulse-id)
          "Pulse"))
    (mt/with-temp* [Collection         [{coll-id :id}    {:namespace "snippets"}]
                    NativeQuerySnippet [{snippet-id :id} {:collection_id coll-id}]]
      (db/delete! Collection :id coll-id)
      (is (db/exists? NativeQuerySnippet :id snippet-id)
          "Snippet"))))

(deftest collections->tree-test
  (is (= [{:name     "A"
           :id       1
           :location "/"
           :children [{:name "B", :id 2, :location "/1/", :children []}
                      {:name     "C"
                       :id       3
                       :location "/1/"
                       :children [{:name     "D"
                                   :id       4
                                   :location "/1/3/"
                                   :children [{:name "E", :id 5, :location "/1/3/4/", :children []}]}
                                  {:name     "F"
                                   :id       6
                                   :location "/1/3/"
                                   :children [{:name "G", :id 7, :location "/1/3/6/", :children []}]}]}]}
          {:name "aaa", :id 9, :location "/", :children []}
          {:name "H", :id 8, :location "/", :children []}]
         (collection/collections->tree
          [{:name "A", :id 1, :location "/"}
           {:name "B", :id 2, :location "/1/"}
           {:name "C", :id 3, :location "/1/"}
           {:name "D", :id 4, :location "/1/3/"}
           {:name "E", :id 5, :location "/1/3/4/"}
           {:name "F", :id 6, :location "/1/3/"}
           {:name "G", :id 7, :location "/1/3/6/"}
           {:name "H", :id 8, :location "/"}
           {:name "aaa", :id 9, :location "/"}])))
  (is (= []
         (collection/collections->tree nil)
         (collection/collections->tree [])))
  (testing "Make sure it doesn't throw an NPE if Collection name is nil for some reason (FE test data?)"
    (is (= [{:name nil, :location "/", :id 1, :children []}
            {:name "a", :location "/", :id 2, :children []}]
           (collection/collections->tree [{:name nil, :location "/", :id 1}
                                          {:name "a", :location "/", :id 2}])))))

(deftest collections->tree-missing-parents-test
  (testing "collections->tree should 'pull' Collections up to a higher level if their parent isn't present (#14114)"
    ;; Imagine a hierarchy like:
    ;;
    ;; + Our analytics (All Users group has no perms)
    ;; +--+ [1] Parent Collection (All Users group has no perms)
    ;;    +--+ [2] Child Collection (All Users group has readwrite perms)
    ;;       +--+ [3] Grandchild collection (All Users group has readwrite perms)
    (is (= [{:name     "Child"
             :location "/1/"
             :id       2
             :children [{:name "Grandchild", :location "/1/2/", :id 3, :children []}]}]
           (collection/collections->tree [{:name "Child", :location "/1/", :id 2}
                                          {:name "Grandchild", :location "/1/2/", :id 3}])))))

(deftest collections->tree-permutations-test
  (testing "The tree should build a proper tree regardless of which order the Collections are passed in (#14280)"
    (doseq [collections (math.combo/permutations [{:id 1, :name "a", :location "/3/"}
                                                  {:id 2, :name "a", :location "/3/1/"}
                                                  {:id 3, :name "a", :location "/"}
                                                  {:id 4, :name "a", :location "/3/1/"}
                                                  {:id 5, :name "a", :location "/3/1/2/"}
                                                  {:id 6, :name "a", :location "/3/"}])]
      (testing (format "Permutation: %s" (pr-str (map :id collections)))
        (is (= [{:id       3
                 :name     "a"
                 :location "/"
                 :children [{:id       1
                             :name     "a"
                             :location "/3/"
                             :children [{:id       2
                                         :name     "a"
                                         :location "/3/1/"
                                         :children [{:id       5
                                                     :name     "a"
                                                     :location "/3/1/2/"
                                                     :children []}]}
                                        {:id       4
                                         :name     "a"
                                         :location "/3/1/"
                                         :children []}]}
                            {:id       6
                             :name     "a"
                             :location "/3/"
                             :children []}]}]
               (collection/collections->tree collections)))))))
