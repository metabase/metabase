(ns metabase.models.collection-test
  (:refer-clojure :exclude [ancestors descendants])
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.api.common :refer [*current-user-permissions-set*]]
   [metabase.audit :as audit]
   [metabase.models
    :refer [Card
            Collection
            Dashboard
            NativeQuerySnippet
            Permissions
            PermissionsGroup
            Pulse
            User]]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.permissions :as perms]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db :test-users :test-users-personal-collections))

(defn- lucky-collection-children-location []
  (collection/children-location (collection/user->personal-collection (mt/user->id :lucky))))

(deftest ^:parallel format-personal-collection-name-test
  (testing "test that the Personal collection name formatting outputs correct strings"
    (is (= "Meta Base's Personal Collection"
           (collection/format-personal-collection-name "Meta" "Base" "MetaBase@metabase.com" :site)))
    (is (= "Meta's Personal Collection"
           (collection/format-personal-collection-name "Meta" nil "MetaBase@metabase.com" :site)))
    (is (= "Base's Personal Collection"
           (collection/format-personal-collection-name nil "Base" "MetaBase@metabase.com" :site)))
    (is (= "MetaBase@metabase.com's Personal Collection"
           (collection/format-personal-collection-name nil nil "MetaBase@metabase.com" :site)))))

(deftest format-personal-collection-name-length-test
  (testing "test that an unrealistically long collection name with unicode letters is still less than the max length for a slug (metabase#33917)"
    (mt/with-temporary-setting-values [site-locale "ru"]
      (is (< (count (#'collection/slugify (collection/format-personal-collection-name (apply str (repeat 34 "Б"))
                                                                                      (apply str (repeat 35 "Б"))
                                                                                      "MetaBase@metabase.com"
                                                                                      :site)))
             (var-get #'collection/collection-slug-max-length))))))

(deftest create-collection-test
  (testing "test that we can create a new Collection with valid inputs"
    (t2.with-temp/with-temp [Collection collection {:name "My Favorite Cards"}]
      (is (partial= (merge
                     (mt/object-defaults Collection)
                     {:name              "My Favorite Cards"
                      :slug              "my_favorite_cards"
                      :description       nil
                      :archived          false
                      :location          "/"
                      :personal_owner_id nil})
                    collection)))))

(deftest with-temp-defaults-test
  (testing "double-check that `with-temp-defaults` are working correctly for Collection"
    (t2.with-temp/with-temp [Collection collection]
      (is (some? collection)))))

(deftest duplicate-names-test
  (testing "test that duplicate names ARE allowed"
    (t2.with-temp/with-temp [Collection c1 {:name "My Favorite Cards"}
                             Collection c2 {:name "My Favorite Cards"}]
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
    (t2.with-temp/with-temp [Collection c1 {:name "My Favorite Cards"}
                             Collection c2 {:name "my_favorite Cards"}]
      (is (some? c1))
      (is (some? c2))
      (is (= (:slug c1) (:slug c2))))))

(deftest entity-ids-test
  (testing "entity IDs are generated"
    (t2.with-temp/with-temp [Collection collection]
      (is (some? (:entity_id collection)))))

  (testing "entity IDs are unique"
    (t2.with-temp/with-temp [Collection c1 {:name "My Favorite Cards"}
                             Collection c2 {:name "my_favorite Cards"}]
      (is (not= (:entity_id c1) (:entity_id c2))))))

(defn- archive-collection! [col]
  (mt/with-current-user (mt/user->id :crowberto)
    (collection/archive-or-unarchive-collection! col {:archived true})))

(defn- unarchive-collection! [col]
  (mt/with-current-user (mt/user->id :crowberto)
    (collection/archive-or-unarchive-collection! col {:archived false})))

(deftest archive-cards-test
  (testing "check that archiving a Collection archives its Cards as well"
    (t2.with-temp/with-temp [Collection collection {}
                             Card       card       {:collection_id (u/the-id collection)}]
      (archive-collection! collection)
      (is (true? (t2/select-one-fn :archived Card :id (u/the-id card))))))

  (testing "check that unarchiving a Collection unarchives its Cards as well"
    (t2.with-temp/with-temp [Collection collection {}
                             Card       card       {:collection_id (u/the-id collection)}]
      (archive-collection! collection)
      (is (t2/select-one-fn :archived Card :id (u/the-id card)))
      (unarchive-collection! (t2/select-one :model/Collection :id (u/the-id collection)))
      (is (false? (t2/select-one-fn :archived Card :id (u/the-id card)))))))

(deftest validate-name-test
  (testing "check that collections' names cannot be blank"
    (is (thrown?
         Exception
         (t2.with-temp/with-temp [Collection collection {:name ""}]
           collection))))

  (testing "check we can't change the name of a Collection to a blank string"
    (t2.with-temp/with-temp [Collection collection]
      (is (thrown?
           Exception
           (t2/update! Collection (u/the-id collection)
                       {:name ""}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                     Nested Collections Helper Fns & Macros                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn do-with-collection-hierarchy [options a-fn]
  (mt/with-non-admin-groups-no-root-collection-perms
    (t2.with-temp/with-temp [Collection a (merge options {:name "A"})
                             Collection b (merge options {:name "B", :location (collection/location-path a)})
                             Collection c (merge options {:name "C", :location (collection/location-path a)})
                             Collection d (merge options {:name "D", :location (collection/location-path a c)})
                             Collection e (merge options {:name "E", :location (collection/location-path a c d)})
                             Collection f (merge options {:name "F", :location (collection/location-path a c)})
                             Collection g (merge options {:name "G", :location (collection/location-path a c f)})]
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
                     (t2/select-fn->fn :id :name Collection :id [:in ids]))]
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
(deftest ^:parallel location-path-test
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

(deftest ^:parallel location-path-ids-test
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

(deftest ^:parallel children-location-test
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
  ;; let's just say all of the collections we're dealing with are:
  ;; - NOT the trash
  ;; - NOT archived
  ;; - don't have a `archive_operation_id`
  (with-redefs [collection/is-trash? (constantly false)
                collection/collection-id->collection
                (constantly
                 (zipmap (next (range 10))
                         (next (map (fn [id]
                                      {:id id
                                       :archived false
                                       :archive_operation_id nil})
                                    (range 10)))))]
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
      (is (= (into #{"root"} (range 1 10))
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
              #{"/collection/root/read/"}))))))

;; testing the 2-arity form of `permissions-set->visible-collection-ids`
(deftest permissions-set->visible-collection-ids-test-with-config
  (with-redefs [collection/is-trash? #(= (:id %) 1)
                collection/collection-id->collection
                ;; These are the collections we get to play with
                (constantly
                 {1 {:id 1
                     :archived false
                     :archive_operation_id nil}
                  2 {:id 2
                     :archived true
                     :archive_operation_id "1234"}
                  3 {:id 3
                     :archived true
                     :archive_operation_id "1234"}
                  4 {:id 4
                     :archived true
                     :archive_operation_id "5678"}
                  5 {:id 5
                     :archived false
                     :archive_operation_id nil}})]
    (let [permissions #{"/collection/1/" "/collection/2/"
                        "/collection/3/" "/collection/4/"
                        "/collection/5/"}]
      (testing "Archived"
        (testing "Default"
          (is (= #{5}
                 (collection/permissions-set->visible-collection-ids permissions {}))))
        (testing "Only"
          (is (= #{2 3 4}
                 (collection/permissions-set->visible-collection-ids permissions {:include-archived-items :only}))))
        (testing "Exclude"
          (is (= #{5}
                 (collection/permissions-set->visible-collection-ids permissions {:include-archived-items :exclude}))))
        (testing "All"
          (is (= #{2 3 4 5}
                 (collection/permissions-set->visible-collection-ids permissions {:include-archived-items :all})))))
      (testing "Include trash?"
        (testing "true"
          (is (= #{1 5}
                 (collection/permissions-set->visible-collection-ids permissions {:include-trash-collection? true}))))
        (testing "false"
          (is (= #{5}
                 (collection/permissions-set->visible-collection-ids permissions {:include-trash-collection? false}))))
        (testing "default"
          (is (= #{5}
                 (collection/permissions-set->visible-collection-ids permissions {})))))
      (testing "archive operation id"
        (testing "can filter down to a particular archive operation id"
          (is (= #{2 3}
                 (collection/permissions-set->visible-collection-ids permissions {:archive-operation-id "1234"
                                                                                  :include-archived-items :all})))
          (is (= #{4}
                 (collection/permissions-set->visible-collection-ids permissions {:archive-operation-id "5678"
                                                                                  :include-archived-items :all}))))))))

(deftest effective-location-path-test
  (with-redefs [audit/is-collection-id-audit? (constantly false)
                collection/collection-id->collection (constantly
                                                      (zipmap (map * (next (range 10)) (repeat 10))
                                                              (next (map (fn [id]
                                                                           {:id id
                                                                            :archived false
                                                                            :archive_operation_id nil})
                                                                         (map * (range 10) (repeat 10))))))]
    (testing "valid input"
      (doseq [[args expected] {["/10/20/30/" #{10 20}]    "/10/20/"
                               ["/10/20/30/" #{10 30}]    "/10/30/"
                               ["/10/20/30/" #{}]         "/"
                               ["/10/20/30/" #{10 20 30}] "/10/20/30/"}]
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
                 (collection/effective-location-path {:location "/10/20/30/"}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                Nested Collections: CRUD Constraints & Behavior                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmacro ^:private with-collection-in-location [[collection-binding location] & body]
  `(let [name# (mt/random-name)]
     (try
       (let [~collection-binding (first (t2/insert-returning-instances! Collection :name name#, :location ~location))]
         ~@body)
       (finally
         (t2/delete! Collection :name name#)))))

(defn- nonexistent-collection-id []
  (inc (or (:max (t2/select-one [Collection [:%max.id :max]]))
           0)))

(deftest crud-validate-path-test
  (testing "Make sure we can't INSERT a Collection with an invalid location"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Collection location: path is invalid"
         (with-collection-in-location [_ "/a/"]))))

  (testing "We should be able to INSERT a Collection with a *valid* location"
    (t2.with-temp/with-temp [Collection parent]
      (with-collection-in-location [collection (collection/location-path parent)]
        (is (= (collection/location-path parent)
               (:location collection))))))

  (testing "Make sure we can't UPDATE a Collection to give it an invalid location"
    (t2.with-temp/with-temp [Collection collection]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid Collection location: path is invalid"
           (t2/update! Collection (u/the-id collection) {:location "/a/"})))))

  (testing "We should be able to UPDATE a Collection and give it a new, *valid* location"
    (t2.with-temp/with-temp [Collection collection-1 {}
                             Collection collection-2 {}]
      (is (pos? (t2/update! Collection (u/the-id collection-1) {:location (collection/location-path collection-2)}))))))

(deftest crud-validate-ancestors-test
  (testing "Make sure we can't INSERT a Collection with an non-existent ancestors"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Collection location: some or all ancestors do not exist"
         (with-collection-in-location [_ (collection/location-path (nonexistent-collection-id))]))))

  (testing "Make sure we can't UPDATE a Collection to give it a non-existent ancestors"
    (t2.with-temp/with-temp [Collection collection]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid Collection location: some or all ancestors do not exist"
           (t2/update! Collection (u/the-id collection) {:location (collection/location-path (nonexistent-collection-id))}))))))

(deftest delete-descendant-collections-test
  (testing "When we delete a Collection do its descendants get deleted as well?"
    ;;    +-> B
    ;;    |
    ;; x -+-> C -+-> D -> E     ===>     x
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (is (= 1
             (t2/delete! Collection :id (u/the-id a))))
      (is (= 0
             (t2/count Collection :id [:in (map u/the-id [a b c d e f g])])))))

  (testing "parents & siblings should be untouched"
    ;; ...put
    ;;
    ;;    +-> B                             +-> B
    ;;    |                                 |
    ;; A -+-> x -+-> D -> E     ===>     A -+
    ;;           |
    ;;           +-> F -> G
    (with-collection-hierarchy [{:keys [a b c d e f g]}]
      (t2/delete! Collection :id (u/the-id c))
      (is (= 2
             (t2/count Collection :id [:in (map u/the-id [a b c d e f g])]))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Nested Collections: Ancestors & Effective Ancestors                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ---------------------------------------------- Effective Ancestors -----------------------------------------------

(defn- effective-ancestors [collection]
  (map :name (:effective_ancestors (t2/hydrate collection :effective_ancestors))))

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

(deftest effective-ancestors-root-collection-test
  ;; happens if we do, e.g. `(t2/hydrate a-card-in-the-root-collection [:collection :effective_ancestors])`
  (testing "`nil` and the root collection should get `[]` as their effective_ancestors"
    (is (= [[] []]
           (map :effective_ancestors (t2/hydrate [nil collection/root-collection] :effective_ancestors))))))


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
             (update :children (comp set format-collections))))))

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
    (with-collection-hierarchy [_]
      (is (contains? (descendants collection/root-collection)
                     {:name        "A"
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
                                      :children    #{}}}})))))



(deftest descendant-ids-test
  (testing "double-check that descendant-ids is working right too"
    (t2.with-temp/with-temp [Collection a {}
                             Collection b {:location (collection/children-location a)}
                             Collection c {:location (collection/children-location b)}]
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
  (let [replace-ids-with-names (reduce comp identity (for [{:keys [id name]} (if (sequential? collections)
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
    (is (thrown-with-msg?
         Exception
         #"You cannot archive the Root Collection."
         (collection/perms-for-archiving collection/root-collection))))

  (testing "Let's make sure we get an Exception when we try to archive the Custom Reports Collection"
    (t2.with-temp/with-temp [Collection cr-collection {}]
      (with-redefs [audit/default-custom-reports-collection (constantly cr-collection)]
        (is (thrown-with-msg?
             Exception
             #"You cannot archive the Custom Reports Collection."
             (collection/perms-for-archiving cr-collection))))))

  (testing "Let's make sure we get an Exception when we try to archive a Personal Collection"
    (is (thrown-with-msg?
         Exception
         #"You cannot archive a Personal Collection."
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
  (with-collection-hierarchy [{:keys [a b], :as _collections}]
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
   (for [collection (-> (apply t2/select Collection, :id [:in (map u/the-id collections)], additional-conditions)
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
      (collection/move-collection! a (collection/children-location (t2/select-one Collection :id (u/the-id f))))
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
      (t2/update! Collection (u/the-id e) {:archived true})
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
      (archive-collection! c)
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
      (archive-collection! e)
      (unarchive-collection! (t2/select-one :model/Collection :id (u/the-id e)))
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
      (archive-collection! c)
      (unarchive-collection! (t2/select-one :model/Collection :id (u/the-id c)))
      (is (= {"A" {"B" {}
                   "C" {"D" {"E" {}}
                        "F" {"G" {}}}}}
             (collection-locations (vals collections) :archived false))))))

(deftest nested-collection-archiving-objects-test
  (doseq [model [Card Dashboard NativeQuerySnippet Pulse]]
    (testing (format "Test that archiving applies to %ss" (name model))
      ;; object is in E; archiving E should cause object to be archived
      (with-collection-hierarchy [{:keys [e], :as _collections} (when (= model NativeQuerySnippet)
                                                                  {:namespace "snippets"})]
        (t2.with-temp/with-temp [model object {:collection_id (u/the-id e)}]
          (archive-collection! e)
          (is (= true
                 (t2/select-one-fn :archived model :id (u/the-id object)))))))

    (testing (format "Test that archiving applies to %ss belonging to descendant Collections" (name model))
      ;; object is in E, a descendant of C; archiving C should cause object to be archived
      (with-collection-hierarchy [{:keys [c e], :as _collections} (when (= model NativeQuerySnippet)
                                                                    {:namespace "snippets"})]
        (t2.with-temp/with-temp [model object {:collection_id (u/the-id e)}]
          (archive-collection! c)
          (is (= true
                 (t2/select-one-fn :archived model :id (u/the-id object)))))))))

(deftest nested-collection-unarchiving-objects-test
  (doseq [model [Card Dashboard NativeQuerySnippet Pulse]]
    (testing (format "Test that unarchiving applies to %ss" (name model))
      ;; object is in E; unarchiving E should cause object to be unarchived
      (with-collection-hierarchy [{:keys [e], :as _collections} (when (= model NativeQuerySnippet)
                                                                  {:namespace "snippets"})]
        (archive-collection! e)
        (t2.with-temp/with-temp [model object {:collection_id (u/the-id e), :archived true}]
          (unarchive-collection! (t2/select-one :model/Collection :id (u/the-id e)))
          (is (= false
                 (t2/select-one-fn :archived model :id (u/the-id object)))))))

    (testing (format "Test that unarchiving applies to %ss belonging to descendant Collections" (name model))
      ;; object is in E, a descendant of C; unarchiving C should cause object to be unarchived
      (with-collection-hierarchy [{:keys [c e], :as _collections} (when (= model NativeQuerySnippet)
                                                                    {:namespace "snippets"})]
        (archive-collection! c)
        (t2.with-temp/with-temp [model object {:collection_id (u/the-id e), :archived true}]
          (unarchive-collection! (t2/select-one :model/Collection :id (u/the-id c)))
          (is (= false
                 (t2/select-one-fn :archived model :id (u/the-id object)))))))))

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
    (t2/select-fn-set :object Permissions
                      {:where [:and
                               [:like :object "/collection/%"]
                               [:= :group_id (u/the-id perms-group)]]})))

(deftest copy-root-collection-perms-test
  (testing (str "Make sure that when creating a new Collection at the Root Level, we copy the group permissions for "
                "the Root Collection\n")
    (doseq [collection-namespace [nil "currency"]
            :let                 [root-collection (assoc collection/root-collection :namespace collection-namespace)
                                  other-namespace (if collection-namespace nil "currency")]]
      (testing (format "Collection namespace = %s\n" (pr-str collection-namespace))
        (t2.with-temp/with-temp [PermissionsGroup group]
          (testing "no perms beforehand = no perms after"
            (t2.with-temp/with-temp [Collection collection {:name "{new}", :namespace collection-namespace}]
              (is (= #{}
                     (group->perms [collection] group)))))

          (perms/grant-collection-read-permissions! group root-collection)
          (t2.with-temp/with-temp [Collection collection {:name "{new}", :namespace collection-namespace}]
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
            (t2.with-temp/with-temp [Collection collection {:name "{new}", :namespace collection-namespace}]
              (is (= #{"/collection/{new}/"
                       (perms/collection-readwrite-path root-collection)}
                     (group->perms [collection] group)))))

          (testing (format "Perms for Root Collection in %s namespace should not affect Collections in %s namespace"
                           (pr-str collection-namespace) (pr-str other-namespace))
            (t2.with-temp/with-temp [Collection collection {:name "{new}", :namespace other-namespace}]
              (is (= #{(perms/collection-readwrite-path root-collection)}
                     (group->perms [collection] group))))))))))

(deftest copy-parent-permissions-test
  (testing "Make sure that when creating a new child Collection, we copy the group permissions for its parent"
    (t2.with-temp/with-temp [PermissionsGroup group]
      (testing "parent has readwrite permissions"
        (t2.with-temp/with-temp [Collection parent {:name "{parent}"}]
          (perms/grant-collection-readwrite-permissions! group parent)
          (t2.with-temp/with-temp [Collection child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/{parent}/"
                     "/collection/{child}/"}
                   (group->perms [parent child] group))))))

      (testing "parent has read permissions"
        (t2.with-temp/with-temp [Collection parent {:name "{parent}"}]
          (perms/grant-collection-read-permissions! group parent)
          (t2.with-temp/with-temp [Collection child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/{parent}/read/"
                     "/collection/{child}/read/"}
                   (group->perms [parent child] group))))))

      (testing "parent has no permissions"
        (t2.with-temp/with-temp [Collection parent {:name "{parent}"}
                                 Collection child  {:name "{child}", :location (collection/children-location parent)}]
          (is (= #{}
                 (group->perms [parent child] group)))))

      (testing "parent given read permissions after the fact -- should not update existing children"
        (t2.with-temp/with-temp [Collection parent {:name "{parent}"}
                                 Collection child  {:name "{child}", :location (collection/children-location parent)}]
          (perms/grant-collection-read-permissions! group parent)
          (is (= #{"/collection/{parent}/read/"}
                 (group->perms [parent child] group)))))

      (testing "If we have Root Collection perms they shouldn't be copied for a Child"
        (t2.with-temp/with-temp [Collection parent {:name "{parent}"}]
          (perms/grant-collection-read-permissions! group collection/root-collection)
          (t2.with-temp/with-temp [Collection child {:name "{child}", :location (collection/children-location parent)}]
            (is (= #{"/collection/root/read/"}
                   (group->perms [parent child] group)))))))

    (testing (str "Make sure that when creating a new Collection as child of a Personal Collection, no group "
                  "permissions are created")
      (t2.with-temp/with-temp [Collection child {:name "{child}", :location (lucky-collection-children-location)}]
        (is (not (t2/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id child))])))))

    (testing (str "Make sure that when creating a new Collection as grandchild of a Personal Collection, no group "
                  "permissions are created")
      (t2.with-temp/with-temp [Collection child      {:location (lucky-collection-children-location)}
                               Collection grandchild {:location (collection/children-location child)}]
        (is (not (t2/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id child))])))
        (is (not (t2/exists? Permissions :object [:like (format "/collection/%d/%%" (u/the-id grandchild))])))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Personal Collections                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest personal-collections-restrictions-test
  (testing "Make sure we're not allowed to *unarchive* a Personal Collection"
    (t2.with-temp/with-temp [User my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (t2/update! Collection (u/the-id personal-collection) {:archived true}))))))

  (testing "Make sure we're not allowed to *move* a Personal Collection"
    (t2.with-temp/with-temp [User       my-cool-user          {}
                             Collection some-other-collection {}]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (t2/update! Collection (u/the-id personal-collection)
                         {:location (collection/location-path some-other-collection)}))))))

  (testing "Make sure we're not allowed to change the owner of a Personal Collection"
    (t2.with-temp/with-temp [User my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown?
             Exception
             (t2/update! Collection (u/the-id personal-collection) {:personal_owner_id (mt/user->id :crowberto)}))))))

  (testing "We are not allowed to change the authority_level of a Personal Collection"
    (t2.with-temp/with-temp [User my-cool-user]
      (let [personal-collection (collection/user->personal-collection my-cool-user)]
        (is (thrown-with-msg?
             Exception
             #"You are not allowed to change the authority level of a Personal Collection."
             (t2/update! Collection (u/the-id personal-collection) {:authority_level "official"}))))))

  (testing "Does hydrating `:personal_collection_id` force creation of Personal Collections?"
    (t2.with-temp/with-temp [User temp-user]
      (is (malli= [:map [:personal_collection_id ms/PositiveInt]]
                  (t2/hydrate temp-user :personal_collection_id))))))

(deftest hydrate-is-personal-test
  (binding [collection/*allow-deleting-personal-collections* true]
    (mt/with-temp
      [:model/User       {user-id :id}               {}
       :model/Collection {personal-coll :id}         {:personal_owner_id user-id}
       :model/Collection {nested-personal-coll :id}  {:location          (format "/%d/" personal-coll)
                                                      :personal_owner_id nil}
       :model/Collection {top-level-coll :id}        {:location "/"}
       :model/Collection {nested-top-level-coll :id} {:location (format "/%d/" top-level-coll)}]
      (let [check-is-personal (fn [id-or-ids]
                                (if (int? id-or-ids)
                                  (-> (t2/select-one :model/Collection id-or-ids)
                                      (t2/hydrate :is_personal)
                                      :is_personal)
                                  (as-> (t2/select :model/Collection :id [:in id-or-ids] {:order-by [:id]}) collections
                                    (t2/hydrate collections :is_personal)
                                    (map :is_personal collections))))]

        (testing "simple hydration and batched hydration should return correctly"
          (is (= [true true false false]
                 (map check-is-personal [personal-coll nested-personal-coll top-level-coll nested-top-level-coll])
                 (check-is-personal [personal-coll nested-personal-coll top-level-coll nested-top-level-coll]))))
        (testing "root collection shouldn't be hydrated"
          (is (= nil (t2/hydrate nil :is_personal)))
          (is (= [nil true] (map :is_personal (t2/hydrate [nil (t2/select-one :model/Collection personal-coll)] :is_personal)))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                    Moving Collections "Across the Boundary"                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; When moving a Collection from a Personal Collection (or a descendant of one) to a non-Personal one (or a descendant
;; of one), we need to work some magic on its (and its descendants') Permissions.

;;; --------------------------------------------- Personal -> Impersonal ---------------------------------------------

(defmacro ^:private with-collection-hierarchy-in [parent-location [collection-symb & more] & body]
  (if-not collection-symb
    `(do ~@body)
    `(t2.with-temp/with-temp [Collection ~collection-symb {:name     ~(u/upper-case-en (name collection-symb))
                                                           :location ~parent-location}]
       (with-collection-hierarchy-in (collection/children-location ~collection-symb) ~more ~@body))))

(defmacro ^:private with-personal-and-impersonal-collections {:style/indent 1}
  [[group-binding personal-and-root-collection-bindings] & body]
  (let [collections (zipmap (vals personal-and-root-collection-bindings)
                            (keys personal-and-root-collection-bindings))]
    `(t2.with-temp/with-temp [PermissionsGroup ~group-binding]
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
          (t2/update! Collection (u/the-id a) {:location (collection/children-location collection/root-collection)})
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
          (t2/update! Collection (u/the-id a) {:location (collection/children-location b)})
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
          (t2/update! Collection (u/the-id b) {:location (collection/children-location collection/root-collection)})
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
          (t2/update! Collection (u/the-id b) {:location (collection/children-location c)})
          (is (= #{"/collection/B/"
                   "/collection/C/"}
                 (group->perms [a b c] group)))))))

  (testing "Perms should apply recursively as well..."
    ;; Personal Collection > A > B         Personal Collection
    ;;                              ===>
    ;; Root Collection > C                 Root Collection > C > A > B
    (with-personal-and-impersonal-collections [group {[a b] :personal, [c] :root}]
      (perms/grant-collection-readwrite-permissions! group c)
      (t2/update! Collection (u/the-id a) {:location (collection/children-location c)})
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
          (t2/update! Collection (u/the-id a) {:location (lucky-collection-children-location)})
          (is (= #{}
                 (group->perms [a] group)))))
      (testing "to a descendant of a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection > A        Personal Collection > A > B
        ;;                          ===>
        ;; Root Collection > B            Root Collection
        (with-personal-and-impersonal-collections [group {[a] :personal, [b] :root}]
          (perms/grant-collection-readwrite-permissions! group b)
          (t2/update! Collection (u/the-id b) {:location (collection/children-location a)})
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
          (t2/update! Collection (u/the-id b) {:location (lucky-collection-children-location)})
          (is (= #{"/collection/A/"}
                 (group->perms [a b] group)))))

      (testing "to a descendant of a Personal Collection, we should *delete* perms entries for it"
        ;; Personal Collection > A        Personal Collection > A > C
        ;;                          ===>
        ;; Root Collection > B > C        Root Collection > B
        (with-personal-and-impersonal-collections [group {[a] :personal, [b c] :root}]
          (perms/grant-collection-readwrite-permissions! group b)
          (perms/grant-collection-readwrite-permissions! group c)
          (t2/update! Collection (u/the-id c) {:location (collection/children-location a)})
          (is (= #{"/collection/B/"}
                 (group->perms [a b c] group)))))))

  (testing "Deleting perms should apply recursively as well..."
    ;; Personal Collection > A        Personal Collection > A > B > C
    ;;                          ===>
    ;; Root Collection > B > C        Root Collection
    (with-personal-and-impersonal-collections [group {[a] :personal, [b c] :root}]
      (perms/grant-collection-readwrite-permissions! group b)
      (perms/grant-collection-readwrite-permissions! group c)
      (t2/update! Collection (u/the-id b) {:location (collection/children-location a)})
      (is (= #{}
             (group->perms [a b c] group))))))

(deftest ^:parallel valid-location-path?-test
  (are [path expected] (= expected
                          (#'collection/valid-location-path? path))
    nil       false
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
    1.0       false))

(deftest check-parent-collection-namespace-matches-test
  (doseq [[parent-namespace child-namespace] [[nil "x"]
                                              ["x" nil]
                                              ["x" "y"]]]
    (t2.with-temp/with-temp [Collection parent-collection {:namespace parent-namespace}]
      (testing (format "You should not be able to create a Collection in namespace %s inside a Collection in namespace %s"
                       (pr-str child-namespace) (pr-str parent-namespace))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Collection must be in the same namespace as its parent"
             (t2/insert! Collection
                         {:location  (format "/%d/" (:id parent-collection))
                          :name      "Child Collection"
                          :namespace child-namespace}))))

      (testing (format "You should not be able to move a Collection of namespace %s into a Collection of namespace %s"
                       (pr-str child-namespace) (pr-str parent-namespace))
        (t2.with-temp/with-temp [Collection collection-2 {:namespace child-namespace}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Collection must be in the same namespace as its parent"
               (collection/move-collection! collection-2 (format "/%d/" (:id parent-collection)))))))

      (testing (format "You should not be able to change the namespace of a Collection from %s to %s"
                       (pr-str parent-namespace) (pr-str child-namespace))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You cannot move a Collection to a different namespace once it has been created"
             (t2/update! Collection (:id parent-collection) {:namespace child-namespace})))))))

(deftest check-special-collection-namespace-cannot-be-personal-collection
  (testing "You should not be able to create a Personal Collection with a non-nil `:namespace`."
    (t2.with-temp/with-temp [User {user-id :id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Personal Collections must be in the default namespace"
           (t2/insert! Collection
                       {:name              "Personal Collection"
                        :namespace         "x"
                        :personal_owner_id user-id}))))))

(deftest check-collection-namespace-test
  (testing "check-collection-namespace"
    (testing "Should succeed if namespace is allowed"
      (t2.with-temp/with-temp [Collection {collection-id :id}]
        (is (= nil
               (collection/check-collection-namespace Card collection-id)))))

    (testing "Should throw exception if namespace is not allowed"
      (t2.with-temp/with-temp [Collection {collection-id :id} {:namespace "x"}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Card can only go in Collections in the \"default\" or :analytics namespace."
             (collection/check-collection-namespace Card collection-id)))))

    (testing "Should throw exception if Collection does not exist"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Collection does not exist"
           (collection/check-collection-namespace Card Integer/MAX_VALUE))))))

(deftest delete-collection-cascades
  (testing "When deleting a Collection, should delete things that used to be in that collection"
    (t2.with-temp/with-temp [Collection {coll-id :id}      {}
                             Card       {card-id :id}      {:collection_id coll-id}
                             Dashboard  {dashboard-id :id} {:collection_id coll-id}
                             Pulse      {pulse-id :id}     {:collection_id coll-id}]
      (t2/delete! Collection :id coll-id)
      (is (not (t2/exists? Card :id card-id)))
      (is (not (t2/exists? Dashboard :id dashboard-id)))
      (is (not (t2/exists? Pulse :id pulse-id))))
    (t2.with-temp/with-temp [Collection         {coll-id :id}    {:namespace "snippets"}
                             NativeQuerySnippet {snippet-id :id} {:collection_id coll-id}]
      (t2/delete! Collection :id coll-id)
      (is (not (t2/exists? NativeQuerySnippet :id snippet-id))
          "Snippet"))))

(deftest collections->tree-test
  (is (= [{:name     "A"
           :id       1
           :location "/"
           :below    #{:dataset :card}
           :children [{:name "B", :id 2, :location "/1/", :children []}
                      {:name     "C"
                       :id       3
                       :location "/1/"
                       :below    #{:dataset :card}
                       :children [{:name     "D"
                                   :id       4
                                   :location "/1/3/"
                                   :here     #{:dataset}
                                   :below    #{:dataset}
                                   :children [{:name "E", :id 5, :location "/1/3/4/",
                                               :children [] :here #{:dataset}}]}
                                  {:name     "F"
                                   :id       6
                                   :location "/1/3/"
                                   :here     #{:card}
                                   :children [{:name "G", :id 7, :location "/1/3/6/", :children []}]}]}]}
          {:name "H", :id 8, :location "/", :children []}
          {:name "aaa", :id 9, :location "/", :children [] :here #{:card}}]
         (collection/collections->tree
          {:dataset #{4 5} :card #{6 9}}
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
         (collection/collections->tree {} nil)
         (collection/collections->tree {} [])))
  (testing "Make sure it doesn't throw an NPE if Collection name is nil for some reason (FE test data?)"
    (is (= [{:name nil, :location "/", :id 1, :children []}
            {:name "a", :location "/", :id 2, :children []}]
           (collection/collections->tree {}
                                         [{:name nil, :location "/", :id 1}
                                          {:name "a", :location "/", :id 2}])))))

(deftest ^:parallel collections->tree-missing-parents-test
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
             :here     #{:card}
             :below    #{:card}
             :children [{:name "Grandchild", :location "/1/2/", :id 3, :children [] :here #{:card}}]}]
           (collection/collections->tree {:card #{1 2 3}}
                                         [{:name "Child", :location "/1/", :id 2}
                                          {:name "Grandchild", :location "/1/2/", :id 3}])))))

(deftest ^:parallel collections->tree-permutations-test
  (testing "The tree should build a proper tree regardless of which order the Collections are passed in (#14280)"
    (doseq [collections (math.combo/permutations [{:id 1, :name "a", :location "/3/"}
                                                  {:id 2, :name "a", :location "/3/1/"}
                                                  {:id 3, :name "a", :location "/"}
                                                  {:id 4, :name "a", :location "/3/1/"}
                                                  {:id 5, :name "a", :location "/3/1/2/"}
                                                  {:id 6, :name "a", :location "/3/"}])]
      (testing (format "Permutation: %s" (pr-str (map :id collections)))
        (let [id->idx (into {} (map-indexed
                                (fn [i c]
                                  [(:id c) i])
                                collections))
              correctly-order (fn [colls]
                                (sort-by (comp id->idx :id) colls))]
          (testing "sanity check: correctly-order puts collections into the order they were passed in"
            (is (= collections (correctly-order collections))))
          (testing "A correct tree is generated, with children ordered as they were passed in"
            (is (= [{:id       3
                     :name     "a"
                     :location "/"
                     :children (correctly-order
                                [{:id       1
                                  :name     "a"
                                  :location "/3/"
                                  :children (correctly-order
                                             [{:id       2
                                               :name     "a"
                                               :location "/3/1/"
                                               :children (correctly-order
                                                          [{:id       5
                                                            :name     "a"
                                                            :location "/3/1/2/"
                                                            :children []}])}
                                              {:id       4
                                               :name     "a"
                                               :location "/3/1/"
                                               :children []}])}
                                 {:id       6
                                  :name     "a"
                                  :location "/3/"
                                  :children []}])}]
                   (collection/collections->tree {} collections)))))))))

(deftest ^:parallel annotate-collections-test
  (let [collections [{:id 1, :name "a", :location "/"}
                     {:id 2, :name "b", :location "/1/"}
                     {:id 3, :name "c", :location "/1/2/"}
                     {:id 4, :name "d", :location "/1/2/3/"}
                     {:id 5, :name "e", :location "/1/"}]
        clean      #(walk/prewalk
                     (fn [x]
                       ;; select important keys and remove empty children
                       (if (map? x)
                         (cond-> (select-keys x [:id :here :below :children])
                           (not (seq (:children x))) (dissoc :children))
                         x))
                     %)]
    (is (= [{:id 1 :name "a" :location "/"       :here #{:card}    :below #{:card :dataset}}
            {:id 2 :name "b" :location "/1/"                       :below #{:dataset}}
            {:id 3 :name "c" :location "/1/2/"   :here #{:dataset} :below #{:dataset}}
            {:id 4 :name "d" :location "/1/2/3/" :here #{:dataset}}
            {:id 5 :name "e" :location "/1/"     :here #{:card}}]
           (#'collection/annotate-collections {:card #{1 5} :dataset #{3 4}} collections)))
    (is (= [{:id 1 :here #{:card} :below #{:card :dataset}
             :children
             [{:id 2 :below #{:dataset}
               :children
               [{:id 3 :here #{:dataset} :below #{:dataset}
                 :children
                 [{:id 4 :here #{:dataset}}]}]}
              {:id 5 :here #{:card}}]}]
           (clean (collection/collections->tree {:card #{1 5} :dataset #{3 4}}
                                                collections))))))

(deftest identity-hash-test
  (testing "Collection hashes are composed of the name, namespace, and parent collection's hash"
    (let [now #t "2022-09-01T12:34:56"]
      (t2.with-temp/with-temp [Collection c1 {:name       "top level"
                                              :created_at now
                                              :namespace  "yolocorp"
                                              :location   "/"}
                               Collection c2 {:name       "nested"
                                              :created_at now
                                              :namespace  "yolocorp"
                                              :location   (format "/%s/" (:id c1))}
                               Collection c3 {:name       "grandchild"
                                              :created_at now
                                              :namespace  "yolocorp"
                                              :location   (format "/%s/%s/" (:id c1) (:id c2))}]
        (let [c1-hash (serdes/identity-hash c1)
              c2-hash (serdes/identity-hash c2)]
          (is (= "f2620cc6"
                 (serdes/raw-hash ["top level" :yolocorp "ROOT" now])
                 c1-hash)
              "Top-level collections should use a parent hash of 'ROOT'")
          (is (= "a27aef0f"
                 (serdes/raw-hash ["nested" :yolocorp c1-hash now])
                 c2-hash))
          (is (= "e816af2d"
                 (serdes/raw-hash ["grandchild" :yolocorp c2-hash now])
                 (serdes/identity-hash c3))))))))

(deftest instance-analytics-collections-test
  (testing "Instance analytics and it's contents isn't writable, even for admins."
    (t2.with-temp/with-temp [Collection audit-collection {:type "instance-analytics"}
                             Card       audit-card       {:collection_id (:id audit-collection)}
                             Dashboard  audit-dashboard  {:collection_id (:id audit-collection)}
                             Collection cr-collection    {}
                             Card       cr-card          {:collection_id (:id cr-collection)}
                             Dashboard  cr-dashboard     {:collection_id (:id cr-collection)}]
      (with-redefs [audit/default-audit-collection          (constantly audit-collection)
                    audit/default-custom-reports-collection (constantly cr-collection)]
        (mt/with-current-user (mt/user->id :crowberto)
          (mt/with-additional-premium-features #{:audit-app}
            (is (not (mi/can-write? audit-collection))
                "Admin isn't able to write to audit collection")
            (is (not (mi/can-write? audit-card))
                "Admin isn't able to write to audit collection card")
            (is (not (mi/can-write? audit-dashboard))
                "Admin isn't able to write to audit collection dashboard"))
          (mt/with-premium-features #{}
            (is (not (mi/can-read? audit-collection))
                "Admin isn't able to read audit collection when audit app isn't enabled")
            (is (not (mi/can-read? audit-card))
                "Admin isn't able to read audit collection card when audit app isn't enabled")
            (is (not (mi/can-read? audit-dashboard))
                "Admin isn't able to read audit collection dashboard when audit app isn't enabled")
            (is (not (mi/can-read? cr-collection))
                "Admin isn't able to read custom reports collection when audit app isn't enabled")
            (is (not (mi/can-read? cr-card))
                "Admin isn't able to read custom reports card when audit app isn't enabled")
            (is (not (mi/can-read? cr-dashboard))
                "Admin isn't able to read custom reports dashboard when audit app isn't enabled")))))))
