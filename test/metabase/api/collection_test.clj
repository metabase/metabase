(ns metabase.api.collection-test
  "Tests for /api/collection endpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.card-test :as api.card-test]
   [metabase.api.collection :as api.collection]
   [metabase.models
    :refer [Card Collection Dashboard DashboardCard ModerationReview
            NativeQuerySnippet PermissionsGroup PermissionsGroupMembership Pulse
            PulseCard PulseChannel PulseChannelRecipient Revision Timeline TimelineEvent User]]
   [metabase.models.collection :as collection]
   [metabase.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.models.collection-test :as collection-test]
   [metabase.models.collection.graph :as graph]
   [metabase.models.collection.graph-test :as graph.test]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time ZoneId ZonedDateTime)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users-personal-collections))

(defmacro ^:private with-collection-hierarchy
  "Totally-rad macro that creates a Collection hierarchy and grants the All Users group perms for all the Collections
  you've bound. See docs for [[metabase.models.collection-test/with-collection-hierarchy]] for more details."
  {:style/indent 1}
  [collection-bindings & body]
  {:pre [(vector? collection-bindings)
         (every? symbol? collection-bindings)]}
  `(collection-test/with-collection-hierarchy [{:keys ~collection-bindings}]
     ~@(for [collection-symb collection-bindings]
         `(perms/grant-collection-read-permissions! (perms-group/all-users) ~collection-symb))
     ~@body))

(defn- do-with-french-user-and-personal-collection [f]
  (binding [collection/*allow-deleting-personal-collections* true]
    (mt/with-mock-i18n-bundles {"fr" {:messages {"{0} {1}''s Personal Collection" "Collection personnelle de {0} {1}"}}}
      (t2.with-temp/with-temp [User       user       {:locale     "fr"
                                                      :first_name "Taco"
                                                      :last_name  "Bell"}
                               Collection collection {:personal_owner_id (:id user)}]
        (f user collection)))))

(defmacro ^:private with-french-user-and-personal-collection
  "Create a user with locale's fr and a collection associated with it"
  {:style/indent 2}
  [user collection & body]
  `(do-with-french-user-and-personal-collection
    (fn [~user ~collection]
      ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-collections-test
  (testing "GET /api/collection"
    (testing "check that we can get a basic list of collections"
      ;; (for test purposes remove the personal collections)
      (t2.with-temp/with-temp [Collection collection]
        (is (= [{:parent_id           nil
                 :effective_location  nil
                 :effective_ancestors []
                 :can_write           true
                 :name                "Our analytics"
                 :authority_level     nil
                 :is_personal         false
                 :id                  "root"
                 :can_restore         false
                 :can_delete          false}
                (assoc (into {:is_personal false} collection) :can_write true :can_delete false)]
               (filter #(#{(:id collection) "root"} (:id %))
                       (mt/user-http-request :crowberto :get 200 "collection"))))))))

(deftest list-collections-only-personal-collections-should-be-visible-test
  (testing "GET /api/collection"
    (testing "We should only see our own Personal Collections!"
      (is (= ["Lucky Pigeon's Personal Collection"]
             (->> (mt/user-http-request :lucky :get 200 "collection")
                  (filter :personal_owner_id)
                  (map :name))))
      (testing "...unless we are *admins*"
        (is (= ["Crowberto Corv's Personal Collection"
                "Lucky Pigeon's Personal Collection"
                "Rasta Toucan's Personal Collection"
                "Trash Bird's Personal Collection"]
               (->> (mt/user-http-request :crowberto :get 200 "collection")
                    (filter #((set (map mt/user->id [:crowberto :lucky :rasta :trashbird])) (:personal_owner_id %)))
                    (map :name)
                    sort))))
      (testing "...or we are *admins* but exclude other user's collections"
        (is (= ["Crowberto Corv's Personal Collection"]
               (->> (mt/user-http-request :crowberto :get 200 "collection" :exclude-other-user-collections true)
                    (filter #((set (map mt/user->id [:crowberto :lucky :rasta :trashbird])) (:personal_owner_id %)))
                    (map :name)
                    sort)))))))

(deftest list-collections-personal-collection-locale-test
  (testing "GET /api/collection"
    (testing "Personal Collection's name and slug should be returned in user's locale"
      (with-french-user-and-personal-collection user _collection
        (is (= [{:name "Collection personnelle de Taco Bell"
                 :slug "collection_personnelle_de_taco_bell"}]
               (->> (mt/user-http-request user :get 200 "collection")
                    (filter :personal_owner_id)
                    (map #(select-keys % [:name :slug])))))))))

(deftest list-collections-permissions-test
  (testing "GET /api/collection"
    (testing "check that we don't see collections if we don't have permissions for them"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection-1 {:name "Collection 1"}
                                 Collection _            {:name "Collection 2"}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection-1)
          (is (= ["Collection 1"
                  "Rasta Toucan's Personal Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection")
                      (filter (fn [{collection-name :name}]
                                (or (#{"Our analytics" "Collection 1" "Collection 2"} collection-name)
                                    (some-> collection-name (str/includes? "Personal Collection")))))
                      (map :name)))))))))

(deftest list-collections-personal-only-test
  (testing "GET /api/collection?personal-only=true check that we don't see collections that you don't have access to or aren't personal."
    (mt/with-non-admin-groups-no-root-collection-perms
      (t2.with-temp/with-temp [Collection collection-1 {:name "Collection 1"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection-1)
        (is (= ["Rasta Toucan's Personal Collection"]
               (->> (mt/user-http-request :rasta :get 200 "collection" :personal-only true)
                    (filter (fn [{collection-name :name}]
                              (or (#{"Our analytics" "Collection 1" "Collection 2"} collection-name)
                                  (str/includes? collection-name "Personal Collection"))))
                    (map :name))))))))

(deftest list-collections-personal-only-admin-test
  (testing "GET /api/collection?personal-only=true check that we see all personal collections if you are an admin."
    (t2.with-temp/with-temp [Collection collection-1 {:name "Collection 1"}]
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection-1)
      (is (= (->> (t2/select :model/Collection {:where [:!= :personal_owner_id nil]})
                  (map :name)
                  (into #{}))
             (->> (mt/user-http-request :crowberto :get 200 "collection" :personal-only true)
                  (filter (fn [{collection-name :name}]
                            (or (#{"Our analytics" "Collection 1" "Collection 2"} collection-name)
                                (str/includes? collection-name "Personal Collection"))))
                  (map :name)
                  (into #{})))))))

(deftest list-collections-archived-test
  (testing "GET /api/collection"
    (t2.with-temp/with-temp [Collection {archived-col-id :id} {:name "Archived Collection"}
                             Collection _ {:name "Regular Collection"}]
      (mt/user-http-request :rasta :put 200 (str "/collection/" archived-col-id) {:archived true})
      (letfn [(remove-other-collections [collections]
                (filter (fn [{collection-name :name}]
                          (or (#{"Our analytics" "Archived Collection" "Regular Collection"} collection-name)
                              (str/includes? collection-name "Personal Collection")))
                        collections))]
        (testing "check that we don't see collections if they're archived"
          (is (= ["Our analytics"
                  "Rasta Toucan's Personal Collection"
                  "Regular Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection")
                      remove-other-collections
                      (map :name)))))

        (testing "Check that if we pass `?archived=true` we instead see archived Collections"
          (is (= ["Archived Collection"]
                 (->> (mt/user-http-request :rasta :get 200 "collection" :archived :true)
                      remove-other-collections
                      (map :name)))))))))

(deftest list-collections-namespace-parameter-test
  (testing "GET /api/collection"
    (testing "?namespace= parameter"
      (t2.with-temp/with-temp [Collection {normal-id :id} {:name "Normal Collection"}
                               Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (letfn [(collection-names [collections]
                  (->> collections
                       (filter #(#{normal-id coins-id} (:id %)))
                       (map :name)))]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= ["Normal Collection"]
                   (collection-names (mt/user-http-request :rasta :get 200 "collection")))))

          (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names (mt/user-http-request :rasta :get 200 "collection?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-names (mt/user-http-request :rasta :get 200 "collection?namespace=stamps")))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/tree                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- collection-tree-transform [xform collections]
  (vec (for [collection collections
             :let       [collection (xform collection)]
             :when      collection]
         (cond-> collection
           (:children collection) (update :children (partial collection-tree-transform xform))))))

(defn- collection-tree-view
  "Keep just the fields specified by `fields-to-keep` of Collections in `collection-ids-to-keep` in the response
  returned by the Collection tree endpoint. If `fields-to-keep` is not specified, only the names are kept."
  ([collection-ids-to-keep collections]
   (collection-tree-view collection-ids-to-keep [:name] collections))
  ([collection-ids-to-keep fields-to-keep collections]
   (let [selection (conj fields-to-keep :children)
         ids-to-keep (set collection-ids-to-keep)]
     (collection-tree-transform (fn [collection]
                                  (when (contains? ids-to-keep (:id collection))
                                    (select-keys collection selection)))
                                collections))))

(deftest collection-tree-test
  (testing "GET /api/collection/tree"
    (let [personal-collection (collection/user->personal-collection (mt/user->id :rasta))]
      (testing "sanity check"
        (is (some? personal-collection)))
      (with-collection-hierarchy [a b c d e f g]
        (let [ids      (set (map :id (cons personal-collection [a b c d e f g])))
              response (mt/user-http-request :rasta :get 200 "collection/tree")]
          (testing "Make sure overall tree shape of the response is as is expected"
            (is (= [{:name     "A"
                     :children [{:name "B", :children []}
                                {:name     "C"
                                 :children [{:name     "D"
                                             :children [{:name "E", :children []}]}
                                            {:name     "F"
                                             :children [{:name     "G"
                                                         :children []}]}]}]}
                    {:name "Rasta Toucan's Personal Collection", :children []}]
                   (collection-tree-view ids response))))
          (testing "Make sure each Collection comes back with the expected keys"
            (is (partial= {:description       nil
                           :archived          false
                           :entity_id         (:entity_id personal-collection)
                           :slug              "rasta_toucan_s_personal_collection"
                           :name              "Rasta Toucan's Personal Collection"
                           :personal_owner_id (mt/user->id :rasta)
                           :id                (u/the-id personal-collection)
                           :location          "/"
                           :namespace         nil
                           :children          []
                           :authority_level   nil}
                          (some #(when (= (:id %) (u/the-id personal-collection)) %)
                                response)))))))))

(deftest collections-tree-exclude-other-user-collections-test
  (let [personal-collection (collection/user->personal-collection (mt/user->id :lucky))]
    (with-collection-hierarchy [a b c d e f g]
      (collection/move-collection! a (collection/children-location personal-collection))
      (let [ids                 (set (map :id (cons personal-collection [a b c d e f g])))
            response-rasta      (mt/user-http-request :rasta :get 200 "collection/tree" :exclude-other-user-collections true)
            response-lucky      (mt/user-http-request :lucky :get 200 "collection/tree" :exclude-other-user-collections true)
            expected-lucky-tree [{:name "Lucky Pigeon's Personal Collection",
                                  :children
                                  [{:name "A"
                                    :children
                                    [{:name "B" :children []}
                                     {:name "C"
                                      :children [{:name "D" :children [{:name "E" :children []}]} {:name "F" :children [{:name "G" :children []}]}]}]}]}]]
        (testing "Make sure that user is not able to see other users personal collections"
          (is (= []
                 (collection-tree-view ids response-rasta))))
        (testing "Make sure that user is able to see his own collections"
          (is (= expected-lucky-tree
                 (collection-tree-view ids response-lucky))))
        (testing "Mocking having one user still returns a correct result"
          (with-redefs [t2/select-fn-set (constantly nil)]
            (let [response (mt/user-http-request :lucky :get 200 "collection/tree" :exclude-other-user-collections true)]
              (is (= expected-lucky-tree
                     (collection-tree-view ids response))))))))))

(deftest collection-tree-here-and-below-test
  (testing "Tree should properly indicate contents"
    (with-collection-hierarchy [a b]
      (let [personal-collection (collection/user->personal-collection (mt/user->id :rasta))]
        (t2.with-temp/with-temp [Card _ {:name "Personal Card"
                                         :collection_preview false
                                         :collection_id (:id personal-collection)}
                                 Card _ {:name "Personal Model"
                                         :type :model
                                         :collection_preview false
                                         :collection_id (:id personal-collection)}
                                 Card _ {:name "A Card"
                                         :collection_preview false
                                         :collection_id (:id a)}
                                 Card _ {:name "B Model"
                                         :type :model
                                         :collection_preview false
                                         :collection_id (:id b)}]
          (is (=? [{:here ["card"] :below ["dataset"] :children [{:here ["dataset"]}]}
                   {:here ["card" "dataset"]}]
                  (filter
                   ;; filter out any extraneous collections
                   #(contains? #{(:id personal-collection) (:id a)} (:id %))
                   (mt/user-http-request :rasta :get 200 "collection/tree")))))))))

(deftest collection-tree-shallow-test
  (testing "GET /api/collection/tree?shallow=true"
    (with-collection-hierarchy [a b c d e f g]
      (let [personal-collection (collection/user->personal-collection (mt/user->id :rasta))
            ids                 (set (map :id (cons personal-collection [a b c d e f g])))]
        (let [response (mt/user-http-request :rasta :get 200 "collection/tree?shallow=true")]
          (testing "Make sure overall tree shape of the response is as is expected"
            (is (= [{:name     "A"
                     :children true}
                    {:name "Rasta Toucan's Personal Collection"
                     :children false}]
                   (->> response
                        (filter (fn [coll] (contains? ids (:id coll))))
                        (map #(select-keys % [:name :children])))))
            (testing "Make sure each Collection comes back with the expected keys"
              (is (partial= {:description       nil
                             :archived          false
                             :entity_id         (:entity_id personal-collection)
                             :slug              "rasta_toucan_s_personal_collection"
                             :name              "Rasta Toucan's Personal Collection"
                             :personal_owner_id (mt/user->id :rasta)
                             :id                (u/the-id personal-collection)
                             :location          "/"
                             :namespace         nil
                             :children          false
                             :authority_level   nil}
                            (some #(when (= (:id %) (u/the-id personal-collection)) %)
                                  response))))))
        (let [response (mt/user-http-request :rasta :get 200 (str "collection/tree?shallow=true&collection-id=" (:id a)))]
          (testing "Make sure collection-id param works as expected"
            (is (= [{:name     "B"
                     :children false}
                    {:name     "C"
                     :children true}]
                   (->> response
                        (filter (fn [coll] (contains? ids (:id coll))))
                        (map #(select-keys % [:name :children])))))))))))

(deftest select-collections-shallow-test
  (testing "Selecting collections based off collection-id equaling nil works."
    (with-collection-hierarchy [a b c d e f g]
      (let [personal-collection (collection/user->personal-collection (mt/user->id :crowberto))
            ids      (set (map :id (cons personal-collection [a b c d e f g])))]
        (mt/with-test-user :crowberto
          (testing "Make sure we get the expected collections when collection-id is nil"
            (let [collections (#'api.collection/select-collections {:archived                       false
                                                                    :exclude-other-user-collections false
                                                                    :shallow                        true
                                                                    :permissions-set                #{"/"}})]
              (is (= #{{:name "A"}
                       {:name "B"}
                       {:name "C"}
                       {:name "Crowberto Corv's Personal Collection"}}
                     (->> collections
                          (filter (fn [coll] (contains? ids (:id coll))))
                          (map #(select-keys % [:name]))
                          (into #{}))))))
          (testing "Make sure we get the expected collections when collection-id is an integer"
            (let [collections (#'api.collection/select-collections {:archived                       false
                                                                    :exclude-other-user-collections false
                                                                    :shallow                        true
                                                                    :collection-id                  (:id a)
                                                                    :permissions-set                #{"/"}})]
              ;; E & G are too deep to show up
              (is (= #{{:name "C"}
                       {:name "B"}
                       {:name "D"}
                       {:name "F"}}
                     (->> collections
                          (filter (fn [coll] (contains? ids (:id coll))))
                          (map #(select-keys % [:name]))
                          (into #{})))))
            (let [collections (#'api.collection/select-collections {:archived                       false
                                                                    :exclude-other-user-collections false
                                                                    :shallow                        true
                                                                    :collection-id                  (:id b)
                                                                    :permissions-set                #{"/"}})]
              (is (= #{}
                     (->> collections
                          (filter (fn [coll] (contains? ids (:id coll))))
                          (map #(select-keys % [:name]))
                          (into #{})))))))))))

(deftest collection-tree-exclude-other-users-personal-collections-test
  (testing "GET /api/collection/tree"
    (testing "Excludes other user collections"
      (let [admin-collection (collection/user->personal-collection (mt/user->id :crowberto))
            lucky-collection (collection/user->personal-collection (mt/user->id :lucky))]
        (t2.with-temp/with-temp [Collection ac {:name "Admin Child" :location (collection/location-path admin-collection)}
                                 Collection lc {:name "Lucky Child" :location (collection/location-path lucky-collection)}
                                 Collection a  {:name "A"}
                                 Collection b  {:name     "B"
                                                :location (collection/location-path a)}
                                 Collection c  {:name "C"}]
          (let [ids                   (set (map :id [admin-collection lucky-collection ac lc a b c]))
                admin-response        (mt/user-http-request :crowberto :get 200
                                                            "collection/tree")
                admin-response-ex     (mt/user-http-request :crowberto :get 200
                                                            "collection/tree?exclude-other-user-collections=true")
                non-admin-response    (mt/user-http-request :lucky :get 200
                                                            "collection/tree")
                non-admin-response-ex (mt/user-http-request :lucky :get 200
                                                            "collection/tree?exclude-other-user-collections=true")]
            (testing "By default, our admin can see everything"
              (is (= [{:name "A", :children [{:name "B", :children []}]}
                      {:name "C", :children []}
                      {:name "Crowberto Corv's Personal Collection", :children [{:name "Admin Child", :children []}]}
                      {:name "Lucky Pigeon's Personal Collection", :children [{:name "Lucky Child", :children []}]}]
                     (collection-tree-view ids admin-response))))
            (testing "When excluding other user collections, the admin only sees their own collections and shared collections"
              (is (= [{:name "A", :children [{:name "B", :children []}]}
                      {:name "C", :children []}
                      {:name "Crowberto Corv's Personal Collection", :children [{:name "Admin Child", :children []}]}]
                     (collection-tree-view ids admin-response-ex))))
            (testing "A non admin only sees their own collections without the flag..."
              (is (= [{:name "A", :children [{:name "B", :children []}]}
                      {:name "C", :children []}
                      {:name "Lucky Pigeon's Personal Collection", :children [{:name "Lucky Child", :children []}]}]
                     (collection-tree-view ids non-admin-response)))
              (testing "...as well as with the flag"
                (is (= [{:name "A", :children [{:name "B", :children []}]}
                        {:name "C", :children []}
                        {:name "Lucky Pigeon's Personal Collection", :children [{:name "Lucky Child", :children []}]}]
                       (collection-tree-view ids non-admin-response-ex)))))))))))

(deftest collection-tree-user-locale-test
  (testing "GET /api/collection/tree"
    (testing "for personal collections, it should return name and slug in user's locale"
      (with-french-user-and-personal-collection user collection
        (is (partial= {:description       nil
                       :archived          false
                       :entity_id         (:entity_id collection)
                       :slug              "collection_personnelle_de_taco_bell"
                       :name              "Collection personnelle de Taco Bell"
                       :personal_owner_id (:id user)
                       :id                (:id collection)
                       :location          "/"
                       :namespace         nil
                       :children          []
                       :authority_level   nil}
                      (some #(when (= (:id %) (:id collection)) %)
                            (mt/user-http-request user :get 200 "collection/tree"))))))))

(deftest collection-tree-child-permissions-test
  (testing "GET /api/collection/tree"
    (testing "Tree endpoint should still return Collections if we don't have perms for the parent Collection (#14114)"
      ;; Create a hierarchy like:
      ;;
      ;; + Our analytics (Revoke permissions to All Users)
      ;; +--+ Parent collection (Revoke permissions to All Users)
      ;;    +--+ Child collection (Give All Users group Curate access)
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection parent-collection {:name "Parent"}
                                 Collection child-collection  {:name "Child", :location (format "/%d/" (:id parent-collection))}]
          (perms/revoke-collection-permissions! (perms-group/all-users) parent-collection)
          (perms/grant-collection-readwrite-permissions! (perms-group/all-users) child-collection)
          (is (= [{:name "Child", :children []}]
                 (collection-tree-view (map :id [parent-collection child-collection])
                                       (mt/user-http-request :rasta :get 200 "collection/tree"))))
          (is (= [{:name "Child", :children []}]
                 (collection-tree-view (map :id [parent-collection child-collection])
                                       (mt/user-http-request :rasta :get 200 "collection/tree"
                                                             :exclude-other-user-collections true)))))))))

(deftest collection-tree-namespace-parameter-test
  (testing "GET /api/collection/tree"
    (testing "Namespace parameter"
      (t2.with-temp/with-temp [Collection {normal-id :id} {:name "Normal Collection"}
                               Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (let [ids [normal-id coins-id]]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= [{:name "Normal Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree")))))

          (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= [{:name "Coin Collection", :children []}]
                     (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=stamps")))))))))))

(deftest collection-tree-elide-collections-with-no-permissions-test
  (testing "GET /api/collection/tree"
    (testing "Tree should elide Collections for which we have no permissions (#14280)"
      ;; Create hierarchy like
      ;;
      ;;     +-> B*
      ;;     |
      ;; A* -+-> C -+-> D -> E*
      ;;            |
      ;;            +-> F* -> G*
      ;;
      ;; Grant perms for collections with a `*`. Should see
      ;;
      ;;     +-> B*
      ;;     |
      ;; A* -+-> E*
      ;;     |
      ;;     +-> F* -> G*
      (collection-test/with-collection-hierarchy [{:keys [a b e f g], :as collections}]
        (doseq [collection [a b e f g]]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection))
        (is (= [{:name     "A"
                 :children [{:name "B", :children []}
                            {:name "E", :children []}
                            {:name     "F"
                             :children [{:name "G", :children []}]}]}]
               (collection-tree-transform
                (let [ids-to-keep (set (map u/the-id (vals collections)))]
                  (fn [{collection-id :id, :as collection}]
                    (when (or (not collection-id)
                              (ids-to-keep collection-id))
                      (select-keys collection [:name :children]))))
                (mt/user-http-request :rasta :get 200 "collection/tree"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-collection-test
  (testing "GET /api/collection/:id"
    (testing "check that we can see collection details"
      (t2.with-temp/with-temp [Collection collection {:name "Coin Collection"}]
        (is (=? {:name "Coin Collection"}
                (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection)))))))

    (testing "check that collections detail properly checks permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "collection/" (u/the-id collection))))))))

    (testing "for personal collections, it should return name and slug in user's locale"
      (with-french-user-and-personal-collection user collection
        (is (=? {:name "Collection personnelle de Taco Bell"
                 :slug "collection_personnelle_de_taco_bell"}
                (mt/user-http-request (:id user) :get 200 (str "collection/" (:id collection)))))))))

;;; ------------------------------------------------ Collection Items ------------------------------------------------

(defn- do-with-some-children-of-collection [collection-or-id-or-nil f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [collection-id-or-nil (when collection-or-id-or-nil
                                 (u/the-id collection-or-id-or-nil))]
      (t2.with-temp/with-temp [Card          {card-id :id}                     {:name               "Birthday Card"
                                                                                :collection_preview false
                                                                                :collection_id      collection-id-or-nil}
                               Dashboard     {dashboard-id :id}                {:name          "Dine & Dashboard"
                                                                                :collection_id collection-id-or-nil}
                               Pulse         {pulse-id :id, :as _pulse}        {:name          "Electro-Magnetic Pulse"
                                                                                :collection_id collection-id-or-nil}
                               ;; this is a dashboard subscription
                               DashboardCard {dashboard-card-id :id}           {:dashboard_id dashboard-id
                                                                                :card_id      card-id}
                               Pulse         {dashboard-sub-pulse-id :id}      {:name          "Acme Products"
                                                                                :collection_id collection-id-or-nil}
                               PulseCard     {dashboard-sub-pulse-card-id :id} {:card_id           card-id
                                                                                :dashboard_card_id dashboard-card-id
                                                                                :pulse_id          dashboard-sub-pulse-id}]
        (f {:card-id                         card-id
            :dashboard-id                    dashboard-id
            :pulse-id                        pulse-id
            :dashboard-subscription-pulse-id dashboard-sub-pulse-id
            :dashboard-sub-pulse-card-id     dashboard-sub-pulse-card-id})))))

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
              ("card" "dataset") (= id card-id)
              "dashboard"        (= id dashboard-id)
              "pulse"            (= id pulse-id)
              true))
          items))

(defn- remove-non-personal-collections
  [items]
  (remove (fn [{:keys [model name]}]
            (when (= model "collection")
              (not (str/includes? name "Personal Collection"))))
          items))

(defn- default-item [{:keys [model] :as item-map}]
  (merge {:id true, :collection_position nil, :entity_id true}
         (when (= model "collection")
           {:authority_level nil})
         (when (= model "card")
           {:moderated_status nil})
         item-map))

(defn- collection-item [collection-name & {:as extra-keypairs}]
  (let [personal-collection (str/ends-with? collection-name "Personal Collection")]
    (merge (cond->
             {:id              true
              :description     nil
              :can_write       personal-collection
              :model           "collection"
              :authority_level nil
              :entity_id       true
              :name            collection-name}
             personal-collection (assoc :personal_owner_id personal-collection))
           extra-keypairs)))

(deftest collection-items-return-cards-test
  (testing "GET /api/collection/:id/items"
    (testing "check that cards are returned with the collection/items endpoint"
      (t2.with-temp/with-temp [Collection       collection             {}
                               User             {user-id :id}          {:first_name "x" :last_name "x" :email "zzzz@example.com"}
                               Card             {card-id :id :as card} {:collection_id (u/the-id collection)}
                               ModerationReview _                      {:moderated_item_type "card"
                                                                        :moderated_item_id   card-id
                                                                        :status              "verified"
                                                                        :moderator_id        user-id
                                                                        :most_recent         true}]
        (is (= (mt/obj->json->obj
                [{:collection_id       (:id collection)
                  :can_write           true
                  :can_delete          false
                  :can_restore         false
                  :id                  card-id
                  :archived            false
                  :location            nil
                  :name                (:name card)
                  :collection_position nil
                  :collection_preview  true
                  :database_id         (mt/id)
                  :display             "table"
                  :description         nil
                  :entity_id           (:entity_id card)
                  :moderated_status    "verified"
                  :model               "card"
                  :last_used_at        (:last_used_at card)
                  :fully_parameterized  true}])
               (mt/obj->json->obj
                (:data (mt/user-http-request :crowberto :get 200
                                             (str "collection/" (u/the-id collection) "/items"))))))))))

(deftest ^:mb/once collection-items-based-on-upload-test
  (testing "GET /api/collection/:id/items"
    (testing "check that based_on_upload is returned for cards correctly"
      (api.card-test/run-based-on-upload-test!
       (fn [card]
         (->> (mt/user-http-request :crowberto :get 200 (str "collection/" (:collection_id card) "/items?models=card&models=dataset"))
              :data
              (filter (fn [item]
                        (= (:id item) (:id card))))
              first))))))

(deftest collection-items-returns-collections-with-correct-collection-id-test
  (testing "GET /api/collection/:id/items?model=collection"
    (testing "check that the ID and collection_id don't match"
      (t2.with-temp/with-temp [:model/Collection parent {}
                               :model/Collection child {:location (collection/children-location parent)}]
        (is (= {:id (:id child)
                :collection_id (:id parent)}
               (select-keys (first (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id parent) "/items?model=collection"))))
                            [:id :collection_id])))))))

(deftest collection-items-return-database-id-for-datasets-test
  (testing "GET /api/collection/:id/items"
    (testing "Database id is returned for items in which dataset is true"
      (t2.with-temp/with-temp [Collection collection      {}
                               User       _               {:first_name "x" :last_name "x" :email "zzzz@example.com"}
                               Card       {card-id-1 :id} {:type          :model
                                                           :collection_id (u/the-id collection)}
                               Card       {card-id-2 :id} {:collection_id (u/the-id collection)}]
        (is (= #{{:id card-id-1 :database_id (mt/id)}
                 {:id card-id-2 :database_id (mt/id)}}
               (->> (:data (mt/user-http-request :crowberto :get 200
                                                 (str "collection/" (u/the-id collection) "/items")))
                    (map #(select-keys % [:id :database_id]))
                    set)))))))

(deftest collection-items-limit-offset-test
  (testing "GET /api/collection/:id/items"
    (testing "check that limit and offset work and total comes back"
      (t2.with-temp/with-temp [Collection collection {}
                               Card       _ {:collection_id (u/the-id collection)}
                               Card       _ {:collection_id (u/the-id collection)}
                               Card       _ {:collection_id (u/the-id collection)}]
        (is (= 2 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1")))))
        (is (= 1 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "2")))))
        (is (= 3 (:total (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1"))))))))

(deftest collection-items-pinning-filtering-test
  (testing "GET /api/collection/:id/items"
    (testing "check that pinning filtering exists"
      (t2.with-temp/with-temp [Collection collection {}
                               Card       _ {:collection_id       (u/the-id collection)
                                             :collection_position 1
                                             :name                "pinned-1"}
                               Card       _ {:collection_id       (u/the-id collection)
                                             :collection_position 1
                                             :name                "pinned-2"}
                               Card       _ {:collection_id (u/the-id collection)
                                             :name          "unpinned-card"}
                               Timeline   _ {:collection_id (u/the-id collection)
                                             :name          "timeline"}]
        (letfn [(fetch [pin-state]
                  (:data (mt/user-http-request :crowberto :get 200
                                               (str "collection/" (u/the-id collection) "/items")
                                               :pinned_state pin-state)))]
          (is (= #{"pinned-1" "pinned-2"}
                 (->> (fetch "is_pinned")
                      (map :name)
                      set)))
          (is (= #{"timeline" "unpinned-card"}
                 (->> (fetch "is_not_pinned")
                      (map :name)
                      set))))))))

(deftest collection-items-children-test
  (testing "GET /api/collection/:id/items"
    (testing "check that you get to see the children as appropriate"
      (t2.with-temp/with-temp [Collection collection {:name "Debt Collection"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (with-some-children-of-collection collection
          (is (partial= (-> (mapv default-item [{:name "Acme Products", :model "pulse", :entity_id true}
                                                {:name               "Birthday Card", :description nil,     :model     "card",
                                                 :collection_preview false,           :display     "table", :entity_id true}
                                                {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id true}
                                                {:name "Electro-Magnetic Pulse", :model "pulse", :entity_id true}])
                            (assoc-in [1 :fully_parameterized] true))
                        (mt/boolean-ids-and-timestamps
                         (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items"))))))))

      (testing "...and that you can also filter so that you only see the children you want to see"
        (t2.with-temp/with-temp [Collection collection {:name "Art Collection"}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
          (with-some-children-of-collection collection
            (is (partial= ()
                          (mt/boolean-ids-and-timestamps
                           (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items") :models "no_models")))))
            (is (partial= [(default-item {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id true})]
                          (mt/boolean-ids-and-timestamps
                           (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items") :models "dashboard")))))
            (is (partial= [(-> {:name               "Birthday Card", :description nil,     :model     "card",
                                :collection_preview false,           :display     "table", :entity_id true}
                               default-item
                               (assoc :fully_parameterized true))
                           (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id true})]
                          (mt/boolean-ids-and-timestamps
                           (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items")
                                                        :models "dashboard" :models "card")))))))))))

(deftest collection-items-logical-ui-location
  (testing "GET /api/collection/:id/items"
    (testing "Includes a logical ui location"
      (letfn [(path [& cs] (apply collection/location-path (map :id cs)))]
        (t2.with-temp/with-temp [Collection c1 {:name "C1"}
                                 Collection c2 {:name "C2"
                                                :location (path c1)}
                                 Collection c3 {:name "C3"
                                                :location (path c1 c2)}
                                 Collection c4 {:name "C4"
                                                :location (path c1 c2 c3)}]
          (perms/revoke-collection-permissions! (perms-group/all-users) c1)
          (perms/revoke-collection-permissions! (perms-group/all-users) c2)
          (perms/grant-collection-read-permissions! (perms-group/all-users) c3)
          (perms/grant-collection-read-permissions! (perms-group/all-users) c4)
          ;; user can see c3 and c4
          (let [response (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (:id c3)))]
            (is (= 1 (:total response)))
            (let [{:keys [location effective_location]} (-> response :data first)]
             (is (= (path c1 c2 c3) location))
             (testing "the unreadable collections are removed from the `ui-logical-path`"
               (is (= (path c3) effective_location))))))))))

(defn- get-items
  "A helper function to get a list of items in a collection from the collection API. User is a keyword like `:rasta` or
  `:crowberto`."
  [user coll]
  (->> (mt/user-http-request user :get 200 (str "collection/" (u/the-id coll) "/items"))
       :data))

(deftest collections-are-moved-to-trash-when-archived
  (let [set-of-item-names (fn [user coll] (->> (get-items user coll)
                                           (map :name)
                                           set))]
    (testing "I can trash something by marking it as archived"
      (t2.with-temp/with-temp [Collection collection {:name "Art Collection"}
                               Collection _ {:name "Baby Collection"
                                             :location (collection/children-location collection)}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
        (is (partial= [{:name "Art Collection", :description nil, :model "collection"}]
                      (get-items :crowberto (collection/trash-collection-id))))
        (is (partial= [{:name "Baby Collection", :model "collection"}]
                      (get-items :crowberto collection)))))
    (testing "I can untrash something by marking it as not archived"
      (t2.with-temp/with-temp [Collection collection {:name "A"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
        (is (= 1 (count (:data (mt/user-http-request :rasta :get 200 (str "collection/" (collection/trash-collection-id) "/items"))))))
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived false})
        (is (zero? (count (:data (mt/user-http-request :rasta :get 200 (str "collection/" (collection/trash-collection-id) "/items"))))))))
    (testing "I can untrash something to a specific location if desired"
      (t2.with-temp/with-temp [Collection collection-a {:name "A"}
                               Collection collection-b {:name "B" :location (collection/children-location collection-a)}
                               Collection destination {:name "Destination"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection-a)
        (perms/grant-collection-read-permissions! (perms-group/all-users) collection-b)
        (perms/grant-collection-read-permissions! (perms-group/all-users) destination)
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection-a)) {:archived true})
        (is (= #{"A"} (set-of-item-names :crowberto (collection/trash-collection-id))))
        (is (= #{} (set-of-item-names :crowberto destination)))
        ;; both A and B are marked as `archived`
        (is (:archived (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection-b)))))
        (is (:archived (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection-a)))))
        ;; we can't unarchive collection B without specifying a location, because it wasn't trashed directly.
        (is (mt/user-http-request :crowberto :put 400 (str "collection/" (u/the-id collection-b)) {:archived false}))

        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection-b)) {:archived false :parent_id (u/the-id destination)})
        ;; collection A is still here!
        (is (= #{"A"} (set-of-item-names :crowberto (collection/trash-collection-id))))
        ;; collection B got moved correctly
        (is (= #{"B"} (set-of-item-names :crowberto destination)))

        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection-a)) {:archived false :parent_id (u/the-id destination)})
        (is (= #{"A" "B"} (set-of-item-names :crowberto destination)))))))

(deftest collection-permissions-work-correctly
  (let [set-of-item-names (fn [coll] (->> (get-items :rasta coll)
                                          (map :name)
                                          set))]
    (t2.with-temp/with-temp [Collection collection-a {:name "A"}
                             Collection subcollection-a {:name "sub-A" :location (collection/children-location collection-a)}
                             Collection collection-b {:name "B"}
                             Collection subcollection-b {:name "sub-B" :location (collection/children-location collection-b)}
                             Collection collection-c {:name "C"}
                             Collection subcollection-c {:name "sub-C" :location (collection/children-location collection-c)}]
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-a)
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-b)
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-c)
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection-b)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-c)
      (testing "i can't archive from a collection I have no permissions on"
        (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id subcollection-a)) {:archived true}))
      (testing "i can't archive from a collection I have read permissions on"
        (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id subcollection-b)) {:archived true}))
      (testing "i can archive from a collection i have no permissions on"
        (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id subcollection-c)) {:archived true})))
    (t2.with-temp/with-temp [Collection collection-a {:name "A"}
                             Collection subcollection-a {:name "sub-A" :location (collection/children-location collection-a)}
                             Dashboard  dashboard-a {:name "dashboard-A" :collection_id (u/the-id collection-a)}
                             Collection collection-b {:name "B"}
                             Collection subcollection-b {:name "sub-B" :location (collection/children-location collection-b)}
                             Dashboard  dashboard-b {:name "dashboard-B" :collection_id (u/the-id collection-b)}
                             Collection collection-c {:name "C"}
                             Collection subcollection-c {:name "sub-C" :location (collection/children-location collection-c)}
                             Dashboard  dashboard-c {:name "dashboard-C" :collection_id (u/the-id collection-c)}]
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-a)
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-b)
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-c)
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection-b)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-c)
      (doseq [coll [subcollection-a subcollection-b subcollection-c]]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id coll)) {:archived true}))
      (doseq [dashboard [dashboard-a dashboard-b dashboard-c]]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard)) {:archived true}))
      (testing "rasta can see the correct set of collections in the trash"
        (is (= #{;; can see all three subcollections, because Rasta has read/write permissions on *them*
                 "sub-A"
                 "sub-C"
                 "sub-B"
                 ;; can see the dashboard in Collection C, because Rasta has read/write permissions on Collection C
                 "dashboard-C"} (set-of-item-names (collection/trash-collection-id)))))
      (testing "if the collections themselves are trashed, subcollection checks still work the same way"
        (doseq [coll [collection-a collection-b collection-c]]
          (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id coll)) {:archived true}))
        (is (= #{"sub-A"
                 "sub-B"
                 "sub-C"
                 "C"
                 "dashboard-C"}
               (set-of-item-names (collection/trash-collection-id))))))))

(deftest collection-items-revision-history-and-ordering-test
  (testing "GET /api/collection/:id/items"
    (mt/test-helpers-set-global-values!
      (mt/with-temp
        [Collection {collection-id :id}      {:name "Collection with Items"}
         User       {user1-id :id}           {:first_name "Test" :last_name "AAAA" :email "aaaa@example.com"}
         User       {user2-id :id}           {:first_name "Test" :last_name "ZZZZ" :email "zzzz@example.com"}
         Card       {card1-id :id :as card1} {:name "Card with history 1" :collection_id collection-id}
         Card       {card2-id :id :as card2} {:name "Card with history 2" :collection_id collection-id}
         Card       _                        {:name "ZZ" :collection_id collection-id}
         Card       _                        {:name "AA" :collection_id collection-id}
         Revision   revision1                {:model    "Card"
                                              :model_id card1-id
                                              :user_id  user2-id
                                              :object   (revision/serialize-instance card1 card1-id card1)}
         Revision   _revision2               {:model    "Card"
                                              :model_id card2-id
                                              :user_id  user1-id
                                              :object   (revision/serialize-instance card2 card2-id card2)}]
        ;; need different timestamps and Revision has a pre-update to throw as they aren't editable
        (is (= 1
               (t2/query-one {:update :revision
                              ;; in the past
                              :set    {:timestamp (.minusHours (ZonedDateTime/now (ZoneId/of "UTC")) 24)}
                              :where  [:= :id (:id revision1)]})))
        (testing "Results include last edited information from the `Revision` table"
          (is (= [{:name "AA"}
                  {:name "Card with history 1",
                   :last-edit-info
                   {:id         true,
                    :email      "zzzz@example.com",
                    :first_name "Test",
                    :last_name  "ZZZZ",
                    :timestamp  true}}
                  {:name "Card with history 2",
                   :last-edit-info
                   {:id         true,
                    :email      "aaaa@example.com",
                    :first_name "Test",
                    :last_name  "AAAA",
                    ;; timestamp collapsed to true, ordinarily a OffsetDateTime
                    :timestamp  true}}
                  {:name "ZZ"}]
                 (->> (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items")))
                      mt/boolean-ids-and-timestamps
                      (map #(select-keys % [:name :last-edit-info]))))))
        (testing "Results can be ordered by last-edited-at"
          (testing "ascending"
            (is (= ["Card with history 1" "Card with history 2" "AA" "ZZ"]
                   (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_at&sort_direction=asc"))
                        :data
                        (map :name)))))
          (testing "descending"
            (is (= ["Card with history 2" "Card with history 1" "AA" "ZZ"]
                   (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_at&sort_direction=desc"))
                        :data
                        (map :name))))))
       (testing "Results can be ordered by last-edited-by"
         (testing "ascending"
           ;; card with history 2 has user Test AAAA, history 1 user Test ZZZZ
           (is (= ["Card with history 2" "Card with history 1" "AA" "ZZ"]
                  (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_by&sort_direction=asc"))
                       :data
                       (map :name)))))
         (testing "descending"
           (is (= ["Card with history 1" "Card with history 2" "AA" "ZZ"]
                  (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=last_edited_by&sort_direction=desc"))
                       :data
                       (map :name))))))))))

(deftest collection-items-order-by-model-test
  (testing "GET /api/collection/:id/items"
    (testing "Results can be ordered by model"
      (t2.with-temp/with-temp [Collection {collection-id :id} {:name "Collection with Items"}
                               Card       _ {:name "ZZ" :collection_id collection-id}
                               Card       _ {:name "AA" :collection_id collection-id}
                               Dashboard  _ {:name "ZZ" :collection_id collection-id}
                               Dashboard  _ {:name "AA" :collection_id collection-id}
                               Pulse      _ {:name "ZZ" :collection_id collection-id}
                               Pulse      _ {:name "AA" :collection_id collection-id}]
        (testing "sort direction asc"
          (is (= [["dashboard" "AA"] ["dashboard" "ZZ"] ["pulse" "AA"] ["pulse" "ZZ"] ["card" "AA"] ["card" "ZZ"]]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=model&sort_direction=asc"))
                      :data
                      (map (juxt :model :name))))))
        (testing "sort direction desc"
          (is (= [["card" "AA"] ["card" "ZZ"] ["pulse" "AA"] ["pulse" "ZZ"] ["dashboard" "AA"] ["dashboard" "ZZ"]]
                 (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items?sort_column=model&sort_direction=desc"))
                      :data
                      (map (juxt :model :name))))))))))

(deftest collection-items-include-latest-revision-test
  (testing "GET /api/collection/:id/items"
    (testing "Results have the lastest revision timestamp"
      (t2.with-temp/with-temp [Collection {collection-id :id}              {:name "Collection with Items"}
                               User       {failuser-id :id}                {:first_name "failure" :last_name "failure" :email "failure@example.com"}
                               User       {passuser-id :id}                {:first_name "pass" :last_name "pass" :email "pass@example.com"}
                               Card       {card-id :id :as card}           {:name "card" :collection_id collection-id}
                               Dashboard  {dashboard-id :id :as dashboard} {:name "dashboard" :collection_id collection-id}
                               Revision   card-revision1 {:model    "Card"
                                                          :model_id card-id
                                                          :user_id  failuser-id
                                                          :object   (revision/serialize-instance card card-id card)}
                               Revision   card-revision2 {:model    "Card"
                                                          :model_id card-id
                                                          :user_id  failuser-id
                                                          :object   (revision/serialize-instance card card-id card)}
                               Revision   dash-revision1 {:model    "Dashboard"
                                                          :model_id dashboard-id
                                                          :user_id  failuser-id
                                                          :object   (revision/serialize-instance dashboard dashboard-id dashboard)}
                               Revision   dash-revision2 {:model    "Dashboard"
                                                          :model_id dashboard-id
                                                          :user_id  failuser-id
                                                          :object   (revision/serialize-instance dashboard dashboard-id dashboard)}]
        (letfn [(at-year [year] (ZonedDateTime/of year 1 1 0 0 0 0 (ZoneId/of "UTC")))]
          (t2/query-one {:update :revision
                         ;; in the past
                         :set    {:timestamp (at-year 2015)}
                         :where  [:in :id (map :id [card-revision1 dash-revision1])]})
          ;; mark the later revisions with the user with name "pass". Note important that its the later revision by
          ;; id. Query assumes increasing timestamps with ids
          (t2/query-one {:update :revision
                         :set    {:timestamp (at-year 2021)
                                  :user_id   passuser-id}
                         :where  [:in :id (map :id [card-revision2 dash-revision2])]}))
        (is (= ["pass" "pass"]
               (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items") :models ["dashboard" "card"])
                    :data
                    (map (comp :last_name :last-edit-info)))))))))

(deftest collection-items-include-authority-level-test
  (testing "GET /api/collection/:id/items"
    (testing "Results include authority_level"
      (t2.with-temp/with-temp [Collection {collection-id :id} {:name "Collection with Items"}
                               Collection _                   {:name "subcollection"
                                                               :location (format "/%d/" collection-id)
                                                               :authority_level "official"}
                               Card       _                   {:name "card" :collection_id collection-id}
                               Dashboard  _                   {:name "dash" :collection_id collection-id}]
        (let [items (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items")
                                               :models ["dashboard" "card" "collection"])
                         :data)]
          (is (= #{{:name "card"}
                   {:name "dash"}
                   {:name "subcollection" :authority_level "official"}}
                 (into #{} (map #(select-keys % [:name :authority_level]))
                       items))))))))

(deftest collection-items-include-datasets-test
  (testing "GET /api/collection/:id/items"
    (testing "Includes datasets"
      (t2.with-temp/with-temp [Collection {collection-id :id} {:name "Collection with Items"}
                               Collection _                   {:name "subcollection"
                                                               :location (format "/%d/" collection-id)
                                                               :authority_level "official"}
                               Card       _                   {:name "card" :collection_id collection-id}
                               Card       _                   {:name "dataset" :type :model :collection_id collection-id}
                               Dashboard  _                   {:name "dash" :collection_id collection-id}]
        (let [items (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" collection-id)
                                                 :models ["dashboard" "card" "collection"]))]
          (is (= #{"card" "dash" "subcollection"}
                 (into #{} (map :name) items))))
        (let [items  (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" collection-id)
                                                  :models ["dashboard" "card" "collection" "dataset"]))]
          (is (= #{"card" "dash" "subcollection" "dataset"}
                 (into #{} (map :name) items))))
        (let [items (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items")))]
          (is (= #{"card" "dash" "subcollection" "dataset"}
                 (into #{} (map :name) items))))))))

(deftest collection-items-include-here-and-below-test
  (testing "GET /api/collection/:id/items"
    (t2.with-temp/with-temp [:model/Collection {id1 :id} {:name "Collection with Items"}
                             :model/Collection {id2 :id} {:name "subcollection"
                                                                       :location (format "/%d/" id1)}]
      (let [item #(first (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" id1))))]
        (testing "the item has nothing in or below it"
          (is (nil? (:here (item))))
          (is (nil? (:below (item)))))
        (t2.with-temp/with-temp [:model/Collection {id3 :id} {:location (format "/%d/%d/" id1 id2)}]
          (testing "now the item has a collection in it"
            (is (= ["collection"] (:here (item)))))
          (testing "but nothing :below"
            (is (nil? (:below (item)))))
          (t2.with-temp/with-temp [:model/Collection _ {:location (format "/%d/%d/%d/" id1 id2 id3)}]
            (testing "the item still has a collection in it"
              (is (= ["collection"] (:here (item)))))
            (testing "the item now has a collection below it"
              (is (= ["collection"] (:below (item))))))
          (t2.with-temp/with-temp [:model/Card _ {:name "card" :collection_id id2}
                                   :model/Card _ {:name "dataset" :type :model :collection_id id2}]
            (testing "when the item has a card/dataset, that's reflected in `here` too"
              (is (= #{"collection" "card" "dataset"} (set (:here (item)))))
              (is (nil? (:below (item)))))
            (t2.with-temp/with-temp [:model/Card _ {:name "card" :collection_id id3}]
              (testing "when the item contains a collection that contains a card, that's `below`"
                (is (= #{"card"} (set (:below (item))))))))
          (t2.with-temp/with-temp [:model/Dashboard _ {:collection_id id2}]
            (testing "when the item has a dashboard, that's reflected in `here` too"
              (is (= #{"collection" "dashboard"} (set (:here (item))))))))))))

(deftest children-sort-clause-test
  ;; we always place "special" collection types (i.e. "Metabase Analytics") last
  (testing "Default sort"
    (doseq [app-db [:mysql :h2 :postgres]]
      (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
              [[[:case
                 [:= :collection_type nil] 0
                 [:= :collection_type collection/trash-collection-type] 1
                 :else 2]] :asc]
              [:%lower.name :asc]]
             (api.collection/children-sort-clause {:official-collections-first? true} app-db)))))
  (testing "Sorting by last-edited-at"
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
               [:= :collection_type nil] 0
               [:= :collection_type collection/trash-collection-type] 1
               :else 2]] :asc]
            [:%isnull.last_edit_timestamp]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-at
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :mysql)))
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
               [:= :collection_type nil] 0
               [:= :collection_type collection/trash-collection-type] 1
               :else 2]] :asc]
            [:last_edit_timestamp :nulls-last]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-at
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres))))
  (testing "Sorting by last-edited-by"
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
                 [:= :collection_type nil] 0
                 [:= :collection_type collection/trash-collection-type] 1
                 :else 2]] :asc]
            [:last_edit_last_name :nulls-last]
            [:last_edit_last_name :asc]
            [:last_edit_first_name :nulls-last]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-by
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres)))
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
               [:= :collection_type nil] 0
               [:= :collection_type collection/trash-collection-type] 1
               :else 2]] :asc]
            [:%isnull.last_edit_last_name]
            [:last_edit_last_name :asc]
            [:%isnull.last_edit_first_name]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-by
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :mysql))))
  (testing "Sorting by model"
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
               [:= :collection_type nil] 0
               [:= :collection_type collection/trash-collection-type] 1
               :else 2]] :asc]
            [:model_ranking :asc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :model
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres)))
    (is (= [[[[:case [:= :authority_level "official"] 0 :else 1]] :asc]
            [[[:case
               [:= :collection_type nil] 0
               [:= :collection_type collection/trash-collection-type] 1
               :else 2]] :asc]
            [:model_ranking :desc]
            [:%lower.name :asc]]
           (api.collection/children-sort-clause {:sort-column :model
                                                 :sort-direction :desc
                                                 :official-collections-first? true} :mysql)))))

(deftest snippet-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "Native query snippets should come back when fetching the items in a Collection in the `:snippets` namespace"
      (t2.with-temp/with-temp [Collection         collection {:namespace "snippets", :name "My Snippet Collection"}
                               NativeQuerySnippet snippet    {:collection_id (:id collection), :name "My Snippet"}
                               NativeQuerySnippet archived   {:collection_id (:id collection) , :name "Archived Snippet", :archived true}]
        (is (partial= [{:id        (:id snippet)
                        :name      "My Snippet"
                        :entity_id (:entity_id snippet)
                        :model     "snippet"}]
                      (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (:id collection))))))

        (testing "\nShould be able to fetch archived Snippets"
          (is (partial= [{:id        (:id archived)
                          :name      "Archived Snippet"
                          :entity_id (:entity_id archived)
                          :model     "snippet"}]
                        (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items?archived=true" (:id collection)))))))

        (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
          (is (partial= [{:id        (:id snippet)
                          :name      "My Snippet"
                          :entity_id (:entity_id snippet)
                          :model     "snippet"}]
                        (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items?model=snippet" (:id collection)))))))

        (testing "Snippets in nested collections should be returned as a flat list on OSS"
          (mt/with-premium-features #{}
            (t2.with-temp/with-temp [:model/Collection  sub-collection {:namespace "snippets"
                                                                        :name      "Nested Snippet Collection"
                                                                        :location  (collection/location-path collection)}
                                     :model/NativeQuerySnippet sub-snippet {:collection_id (:id sub-collection)
                                                                            :name          "Nested Snippet"}]
              (is (=?
                   [{:id (:id snippet), :name "My Snippet"}
                    {:id (:id sub-snippet), :name "Nested Snippet"}]
                   (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (:id collection)))))))))))))

;;; --------------------------------- Fetching Personal Collections (Ours & Others') ---------------------------------

(defn- lucky-personal-collection []
  (merge
   (mt/object-defaults Collection)
   {:slug                "lucky_pigeon_s_personal_collection"
    :can_restore         false
    :can_delete          false
    :can_write           true
    :name                "Lucky Pigeon's Personal Collection"
    :personal_owner_id   (mt/user->id :lucky)
    :effective_ancestors [{:metabase.models.collection.root/is-root? true
                           :name                                     "Our analytics"
                           :id                                       "root"
                           :authority_level                          nil
                           :can_write                                true
                           :is_personal                              false}]
    :effective_location  "/"
    :parent_id           nil
    :location            "/"
    :is_personal         true}
   (select-keys (collection/user->personal-collection (mt/user->id :lucky))
                [:id :entity_id :created_at])))

(defn- lucky-personal-collection-id
  []
  (u/the-id (collection/user->personal-collection (mt/user->id :lucky))))

(defn- api-get-lucky-personal-collection [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  (mt/user-http-request user-kw :get expected-status-code (str "collection/" (lucky-personal-collection-id))))

(defn- api-get-lucky-personal-collection-items [user-kw & {:keys [expected-status-code], :or {expected-status-code 200}}]
  (:data (mt/user-http-request user-kw :get expected-status-code (str "collection/" (lucky-personal-collection-id) "/items"))))

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
  (t2.with-temp/with-temp [Collection _ {:name     "Lucky's Personal Sub-Collection"
                                         :location (collection/children-location
                                                    (collection/user->personal-collection (mt/user->id :lucky)))}]
    (mt/boolean-ids-and-timestamps (api-get-lucky-personal-collection-items user-kw))))

(deftest fetch-personal-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "If we have a sub-Collection of our Personal Collection, that should show up"
      (is (partial= lucky-personal-subcollection-item
                    (api-get-lucky-personal-collection-with-subcollection :lucky))))

    (testing "sub-Collections of other's Personal Collections should show up for admins as well"
      (is (partial= lucky-personal-subcollection-item
                    (api-get-lucky-personal-collection-with-subcollection :crowberto))))))


;;; ------------------------------------ Effective Ancestors & Effective Children ------------------------------------

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
  [collection-or-id & additional-query-params]
  (format-ancestors (apply mt/user-http-request :rasta :get 200
                           (str "collection/" (u/the-id collection-or-id))
                           additional-query-params)))

(defn- api-get-collection-children
  [collection-or-id & additional-get-params]
  (mt/boolean-ids-and-timestamps (:data (apply mt/user-http-request :rasta
                                               :get 200 (str "collection/" (u/the-id collection-or-id) "/items")
                                               additional-get-params))))

;;; for the tests below, create hierarchy like
;;;
;;;     +-> B*
;;;     |
;;; A* -+-> C* +-> D* -> E
;;;            |
;;;            +-> F --> G*
;;;
;;; Grant perms for collections with a `*`. Should see
;;;
;;;     +-> B*
;;;     |
;;; A* -+-> C* +-> D*
;;;            |
;;;            +-> G*

(deftest effective-ancestors-and-children-test
  (testing "does a top-level Collection like A have the correct Children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (partial= (map collection-item ["B" "C"])
                      (api-get-collection-children a)))))))

(deftest effective-ancestors-and-children-second-level-collection-test
  (testing "does a second-level Collection have its parent and its children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (partial= (map collection-item ["D" "G"])
                      (api-get-collection-children c)))))))

(deftest effective-ancestors-and-children-third-level-collection-test
  (testing "Does a third-level Collection? have its parent and its children?"
    (with-collection-hierarchy [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}
                                      {:name "C", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d)))))))

(deftest effective-ancestors-and-children-of-d-test
  (testing (str "for D: if we remove perms for C we should only have A as an ancestor; effective_location should lie "
                "and say we are a child of A")
    (with-collection-hierarchy [a b d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))
  (testing "for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection."
    (with-collection-hierarchy [b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "C", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d)))))))

(deftest effective-ancestors-and-children-of-c-test
  (testing "for C: if we remove D we should get E and F as effective children"
    (with-collection-hierarchy [a b c e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (partial= (map collection-item ["E" "F"])
                      (api-get-collection-children c)))))))

(deftest effective-ancestors-and-children-collapse-multiple-generations-test
  (testing "Make sure we can collapse multiple generations. For A: removing C and D should move up E and F"
    (with-collection-hierarchy [a b e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (partial= (map collection-item ["B" "E" "F"])
                      (api-get-collection-children a)))))))

(deftest effective-ancestors-and-children-archived-test
  (testing "Let's make sure the 'archived` option works on Collections, nested or not"
    (with-collection-hierarchy [a b c]
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id b))
                            {:archived true})
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (partial= [(collection-item "C")]
                      (api-get-collection-children a)))))))

(deftest personal-collection-ancestors-test
  (testing "Effective ancestors of a personal collection will contain a :personal_owner_id"
    (let [root-owner-id   (u/the-id (test.users/fetch-user :rasta))
          root-collection (t2/select-one Collection :personal_owner_id root-owner-id)]
      (t2.with-temp/with-temp [Collection collection {:name     "Som Test Child Collection"
                                                      :location (collection/location-path root-collection)}]
        (is (= [{:metabase.models.collection.root/is-root? true,
                 :authority_level                          nil,
                 :name                                     "Our analytics",
                 :id                                       false,
                 :can_write                                true
                 :is_personal                              false}
                {:name              "Rasta Toucan's Personal Collection",
                 :id                true,
                 :type              nil
                 :personal_owner_id root-owner-id,
                 :can_write         true}]
               (:effective_ancestors (api-get-collection-ancestors collection))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/root                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-root-collection-test
  (testing "GET /api/collection/root"
    (testing "Check that we can see stuff that isn't in any Collection -- meaning they're in the so-called \"Root\" Collection"
      (is (= {:name                "Our analytics"
              :id                  "root"
              :can_write           true
              :can_restore         false
              :effective_location  nil
              :effective_ancestors []
              :authority_level     nil
              :parent_id           nil
              :is_personal         false
              :can_delete          false}
             (with-some-children-of-collection nil
               (mt/user-http-request :crowberto :get 200 "collection/root")))))))

(defn results-matching [collection-items parameters]
  (-> collection-items
      (set/index (keys parameters))
      (get parameters)
      vec))

(deftest fetch-root-items-collection-test
  (testing "GET /api/collection/root/items"
    (testing "Make sure you can see everything for Users that can see everything"
      (is (partial= [(-> {:name               "Birthday Card", :description nil, :model "card",
                          :collection_preview false, :display "table"}
                         default-item
                         (assoc :fully_parameterized true))
                     (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
                     (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})]
                    (with-some-children-of-collection nil
                      (-> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                          (remove-non-test-items &ids)
                          remove-non-personal-collections
                          mt/boolean-ids-and-timestamps)))))))

(deftest fetch-root-items-limit-and-offset-test
  (testing "GET /api/collection/root/items"
    (with-some-children-of-collection nil
      (letfn [(items [limit offset]
                (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"
                                             :limit (str limit), :offset (str offset))))]
        (let [[_a-1 b-1 :as items-1] (items 2 0)]
          (is (= 2
                 (count items-1)))
          (let [[a-2 _b-2 :as items-2] (items 2 1)]
            (is (= 2
                   (count items-2)))
            (is (= b-1 a-2))
            (is (not= items-1 items-2))))))))

(deftest fetch-root-items-total-test
  (testing "GET /api/collection/root/items"
    (testing "Include :total, even with limit and offset"
      (with-some-children-of-collection nil
        ;; `:total` should be at least 4 items based on `with-some-children-of-collection`. Might be a bit more if
        ;; other stuff was created
        (is (<= 4 (:total (mt/user-http-request :crowberto :get 200 "collection/root/items" :limit "2" :offset "1"))))))))

(deftest fetch-root-items-permissions-test
  (testing "GET /api/collection/root/items"
    (testing "we don't let you see stuff you wouldn't otherwise be allowed to see"
      (is (= []
             ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no collection_id
             (with-some-children-of-collection nil
               (-> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                   remove-non-personal-collections
                   mt/boolean-ids-and-timestamps))))
      (testing "...but if they have read perms for the Root Collection they should get to see them"
        (with-some-children-of-collection nil
          (t2.with-temp/with-temp [PermissionsGroup           group {}
                                   PermissionsGroupMembership _     {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
            (is (partial= [(-> {:name               "Birthday Card", :description nil, :model "card",
                                :collection_preview false,           :display     "table"}
                               default-item
                               (assoc :fully_parameterized true))
                           (default-item {:name "Dine & Dashboard", :description nil, :model "dashboard"})
                           (default-item {:name "Electro-Magnetic Pulse", :model "pulse"})]
                          (-> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                              (remove-non-test-items &ids)
                              remove-non-personal-collections
                              mt/boolean-ids-and-timestamps)))))))))

(deftest fetch-root-items-do-not-include-personal-collections-test
  (testing "GET /api/collection/root/items"
    (testing "Personal collections do not show up as collection items"
      (is (= []
             (->> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                  (filter #(str/includes? (:name %) "Personal Collection"))))))
    (testing "Even admins don't see their personal collection here"
      (is (= []
             (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                  (filter #(str/includes? (:name %) "Personal Collection")))))
      (testing "That includes sub-collections of Personal Collections! I shouldn't see them!"
        (t2.with-temp/with-temp [Collection _ {:name     "Lucky's Sub-Collection"
                                               :location (collection/children-location
                                                          (collection/user->personal-collection (mt/user->id :lucky)))}]
          (is (= []
                 (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                      (filter #(str/includes? (:name %) "Personal Collection"))))))))))

(deftest fetch-root-items-archived-test
  (testing "GET /api/collection/root/items"
    (testing "Can we look for `archived` stuff with this endpoint?"
      (t2.with-temp/with-temp [Card card {:name "Business Card", :archived true}]
        (is (partial=
             [{:name                "Business Card"
               :description         nil
               :collection_position nil
               :collection_preview  true
               :display             "table"
               :moderated_status    nil
               :entity_id           (:entity_id card)
               :model               "card"
               :fully_parameterized  true}]
             (-> (mt/user-http-request :crowberto :get 200
                                       "collection/root/items?archived=true")
                 :data
                 (results-matching {:name "Business Card", :model "card"}))))))))

(deftest fetch-root-items-fully-parameterized-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized of a card"
      (testing "can be false"
        (t2.with-temp/with-temp [Card card {:name          "Business Card"
                                            :dataset_query {:native {:template-tags {:param0 {:default 0}
                                                                                     :param1 {:required false}
                                                                                     :param2 {:required false}}
                                                                     :query         "select {{param0}}, {{param1}} [[ , {{param2}} ]]"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized false}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"}))))))

      (testing "is false even if a required field-filter parameter has no default"
        (t2.with-temp/with-temp [Card card {:name          "Business Card"
                                            :dataset_query {:native {:template-tags {:param0 {:default 0}
                                                                                     :param1 {:type "dimension", :required true}}
                                                                     :query         "select {{param0}}, {{param1}}"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized false}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"}))))))

      (testing "is false even if an optional required parameter has no default"
        (t2.with-temp/with-temp [Card card {:name          "Business Card"
                                            :dataset_query {:native {:template-tags {:param0 {:default 0}
                                                                                     :param1 {:required true}}
                                                                     :query         "select {{param0}}, [[ , {{param1}} ]]"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized false}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"}))))))

      (testing "is true if invalid parameter syntax causes a parsing exception to be thrown"
        (t2.with-temp/with-temp [Card card {:name          "Business Card"
                                            :dataset_query {:native {:query "select [[]]"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized true}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"}))))))

      (testing "is true if all obligatory parameters have defaults"
        (t2.with-temp/with-temp [Card card {:name          "Business Card"
                                            :dataset_query {:native {:template-tags {:param0 {:required false, :default 0}
                                                                                     :param1 {:required true, :default 1}
                                                                                     :param2 {}
                                                                                     :param3 {:type "dimension"}}
                                                                     :query "select {{param0}}, {{param1}} [[ , {{param2}} ]] from t {{param3}}"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized true}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"}))))))

      (testing "using a snippet without parameters is true"
        (t2.with-temp/with-temp [NativeQuerySnippet snippet {:content    "table"
                                                             :creator_id (mt/user->id :crowberto)
                                                             :name       "snippet"}
                                 Card card {:name          "Business Card"
                                            :dataset_query {:native {:template-tags {:param0  {:required false
                                                                                               :default  0}
                                                                                     :snippet {:name         "snippet"
                                                                                               :type         :snippet
                                                                                               :snippet-name "snippet"
                                                                                               :snippet-id   (:id snippet)}}
                                                                     :query "select {{param0}} from {{snippet}}"}}}]
          (is (partial= [{:name               "Business Card"
                          :entity_id          (:entity_id card)
                          :model              "card"
                          :fully_parameterized true}]
                        (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                            :data
                            (results-matching {:name "Business Card", :model "card"})))))))

    (testing "a card with only a reference to another card is considered fully parameterized (#25022)"
      (t2.with-temp/with-temp [Card card-1 {:dataset_query (mt/mbql-query venues)}]
        (let [card-tag (format "#%d" (u/the-id card-1))]
          (t2.with-temp/with-temp [Card card-2 {:name "Business Card"
                                                :dataset_query
                                                (mt/native-query {:template-tags
                                                                  {card-tag
                                                                   {:id (str (random-uuid))
                                                                    :name card-tag
                                                                    :display-name card-tag
                                                                    :type :card
                                                                    :card-id (u/the-id card-1)}}
                                                                  :query (format "SELECT * FROM {{#%d}}" (u/the-id card-1))})}]
            (is (partial= [{:name               "Business Card"
                            :entity_id          (:entity_id card-2)
                            :model              "card"
                            :fully_parameterized true}]
                          (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                              :data
                              (results-matching {:name "Business Card", :model "card"}))))))))))


;;; ----------------------------------- Effective Children, Ancestors, & Location ------------------------------------

(defn- api-get-root-collection-children
  [& additional-get-params]
  (mt/boolean-ids-and-timestamps (:data (apply mt/user-http-request :rasta :get 200 "collection/root/items" additional-get-params))))

(defn- remove-non-test-collections [items]
  (filter (fn [{collection-name :name}]
            (or (str/includes? collection-name "Personal Collection")
                (#{"A" "B" "C" "D" "E" "F" "G"} collection-name)))
          items))

(deftest fetch-root-collection-items-test
  (testing "sanity check"
    (is (collection/user->personal-collection (mt/user->id :rasta))))
  (testing "GET /api/collection/root/items"
    (testing "Do top-level collections show up as children of the Root Collection?"
      (with-collection-hierarchy [a b c d e f g]
        (testing "children"
          (is (partial= (map collection-item ["A"])
                        (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "...and collapsing children should work for the Root Collection as well"
      (with-collection-hierarchy [b d e f g]
        (testing "children"
          (is (partial= (map collection-item ["B" "D" "F"])
                        (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "does `archived` work on Collections as well?"
      (with-collection-hierarchy [a b d e f g]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id a))
                            {:archived true})
        (is (= [] (remove-non-test-collections (api-get-root-collection-children)))))
      (with-collection-hierarchy [a b d e f g]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id a))
                              {:archived true})
        (is (= [] (remove-non-test-collections (api-get-root-collection-children))))))

    (testing "\n?namespace= parameter"
      (t2.with-temp/with-temp [Collection {normal-id :id} {:name "Normal Collection"}
                               Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) coins-id)
        (letfn [(collection-names [items]
                  (->> (:data items)
                       (filter #(and (= (:model %) "collection")
                                     (#{normal-id coins-id} (:id %))))
                       (map :name)))]
          (testing "should only show Collections in the 'default' namespace by default"
            (is (= ["Normal Collection"]
                   (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items")))))

          (testing "By passing `:namespace` we should be able to see Collections in that `:namespace`"
            (testing "?namespace=currency"
              (is (= ["Coin Collection"]
                     (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=currency")))))
            (testing "?namespace=stamps"
              (is (= []
                     (collection-names (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=stamps")))))))))))

(deftest root-collection-snippets-test
  (testing "GET /api/collection/root/items?namespace=snippets"
    (testing "\nNative query snippets should come back when fetching the items in the root Collection of the `:snippets` namespace"
      (t2.with-temp/with-temp [NativeQuerySnippet snippet   {:name "My Snippet", :entity_id nil}
                               NativeQuerySnippet snippet-2 {:name "My Snippet 2", :entity_id nil}
                               NativeQuerySnippet archived  {:name "Archived Snippet", :archived true, :entity_id nil}
                               Dashboard          dashboard {:name "My Dashboard", :entity_id nil}]
        (letfn [(only-test-items [results]
                  (if (sequential? results)
                    (filter #(#{["snippet" (:id snippet)]
                                ["snippet" (:id snippet-2)]
                                ["snippet" (:id archived)]
                                ["dashboard" (:id dashboard)]} ((juxt :model :id) %))
                            results)
                    results))
                (only-test-item-names [results]
                  (let [items (only-test-items results)]
                    (if (sequential? items)
                      (map :name items)
                      items)))]
          (is (partial= [{:id        (:id snippet)
                          :name      "My Snippet"
                          :entity_id (:entity_id snippet)
                          :model     "snippet"}
                         {:id        (:id snippet-2)
                          :name      "My Snippet 2"
                          :entity_id (:entity_id snippet-2)
                          :model     "snippet"}]
                        (only-test-items (:data (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=snippets")))))

          (testing "\nSnippets should not come back for the default namespace"
            (is (= ["My Dashboard"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))))))

          (testing "\nSnippets shouldn't be paginated, because FE is not ready for it yet and default pagination behavior is bad"
            (is (= ["My Snippet", "My Snippet 2"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200 "collection/root/items?namespace=snippets&limit=1&offset=0"))))))

          (testing "\nShould be able to fetch archived Snippets"
            (is (= ["Archived Snippet"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200
                                                                      "collection/root/items?namespace=snippets&archived=true"))))))

          (testing "\nShould be able to pass ?model=snippet, even though it makes no difference in this case"
            (is (= ["My Snippet", "My Snippet 2"]
                   (only-test-item-names (:data (mt/user-http-request :rasta :get 200
                                                                      "collection/root/items?namespace=snippets&model=snippet")))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              POST /api/collection                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest create-collection-test
  (testing "POST /api/collection"
    (testing "\ntest that we can create a new collection"
      (mt/with-model-cleanup [Collection]
        (is (partial= (merge
                       (mt/object-defaults Collection)
                       {:name              "Stamp Collection"
                        :slug              "stamp_collection"
                        :archived          false
                        :location          "/"
                        :personal_owner_id nil})
                      (-> (mt/user-http-request :crowberto :post 200 "collection"
                                                {:name "Stamp Collection"})
                          (dissoc :id :entity_id))))))))

(deftest non-admin-create-collection-in-root-perms-test
  (testing "POST /api/collection"
    (testing "\ntest that non-admins aren't allowed to create a collection in the root collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "collection"
                                     {:name "Stamp Collection"})))))
    (testing "\nCan a non-admin user with Root Collection perms add a new collection to the Root Collection? (#8949)"
      (mt/with-model-cleanup [Collection]
        (mt/with-non-admin-groups-no-root-collection-perms
          (t2.with-temp/with-temp [PermissionsGroup           group {}
                                   PermissionsGroupMembership _     {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-collection-readwrite-permissions! group collection/root-collection)
            (is (partial= (merge
                           (mt/object-defaults Collection)
                           {:name     "Stamp Collection"
                            :location "/"
                            :slug     "stamp_collection"})
                          (dissoc (mt/user-http-request :rasta :post 200 "collection"
                                                        {:name "Stamp Collection"})
                                  :id :entity_id)))))))))

(deftest create-child-collection-test
  (testing "POST /api/collection"
    (testing "\nCan I create a Collection as a child of an existing collection?"
      (mt/with-model-cleanup [Collection]
        (with-collection-hierarchy [a c d]
          (is (partial= (merge
                         (mt/object-defaults Collection)
                         {:id          true
                          :entity_id   true
                          :name        "Trading Card Collection"
                          :slug        "trading_card_collection"
                          :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                          :location    "/A/C/D/"})
                        (-> (mt/user-http-request :crowberto :post 200 "collection"
                                                  {:name        "Trading Card Collection"
                                                   :description "Collection of basketball cards including limited-edition holographic Draymond Green"
                                                   :parent_id   (u/the-id d)})
                            (update :location collection-test/location-path-ids->names)
                            (update :id integer?)
                            (update :entity_id string?)))))))))

(deftest create-collection-different-namespace-test
  (testing "POST /api/collection"
    (testing "\nShould be able to create a Collection in a different namespace"
      (let [collection-name (mt/random-name)]
        (try
          (is (=? {:name      collection-name
                   :namespace "snippets"}
                  (mt/user-http-request :crowberto :post 200 "collection"
                                        {:name       collection-name
                                         :descrption "My SQL Snippets"
                                         :namespace  "snippets"})))
          (finally
            (t2/delete! Collection :name collection-name)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUT /api/collection/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-collection-test
  (testing "PUT /api/collection/:id"
    (testing "test that we can update a collection"
      (t2.with-temp/with-temp [Collection collection]
        (is (partial= (merge
                       (mt/object-defaults Collection)
                       {:id              (u/the-id collection)
                        :name            "My Beautiful Collection"
                        :slug            "my_beautiful_collection"
                        :entity_id       (:entity_id collection)
                        :location        "/"
                        :effective_ancestors [{:metabase.models.collection.root/is-root? true
                                               :name                                     "Our analytics"
                                               :id                                       "root"
                                               :authority_level                          nil
                                               :can_write                                true}]
                        :effective_location  "/"

                        :parent_id       nil})
                      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                            {:name "My Beautiful Collection"})))))
    (testing "check that users without write perms aren't allowed to update a Collection"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:name "My Beautiful Collection"}))))))))

(deftest archive-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Archiving a collection should delete any alerts associated with questions in the collection"
      (t2.with-temp/with-temp [Collection            {collection-id :id} {}
                               Card                  {card-id :id}       {:collection_id collection-id}
                               Pulse                 {pulse-id :id}      {:alert_condition  "rows"
                                                                          :alert_first_only false
                                                                          :creator_id       (mt/user->id :rasta)
                                                                          :name             "Original Alert Name"}
                               PulseCard             _                   {:pulse_id pulse-id
                                                                          :card_id  card-id
                                                                          :position 0}
                               PulseChannel          {pc-id :id}         {:pulse_id pulse-id}
                               PulseChannelRecipient _                   {:user_id          (mt/user->id :crowberto)
                                                                          :pulse_channel_id pc-id}
                               PulseChannelRecipient _                   {:user_id          (mt/user->id :rasta)
                                                                          :pulse_channel_id pc-id}]
        (mt/with-fake-inbox
          (mt/with-expected-messages 2
            (mt/user-http-request :crowberto :put 200 (str "collection/" collection-id)
                                  {:name "My Beautiful Collection", :archived true}))
          (testing "emails"
            (is (= (merge (mt/email-to :crowberto {:subject "One of your alerts has stopped working",
                                                   :body    {"the question was archived by Crowberto Corv" true}})
                          (mt/email-to :rasta {:subject "One of your alerts has stopped working",
                                               :body    {"the question was archived by Crowberto Corv" true}}))
                   (mt/regex-email-bodies #"the question was archived by Crowberto Corv"))))
          (testing "Pulse"
            (is (nil? (t2/select-one Pulse :id pulse-id)))))))))

(deftest archive-collection-perms-test
  (testing "PUT /api/collection/:id"
    (testing "I shouldn't be allowed to archive a Collection without proper perms"
      (mt/with-non-admin-groups-no-root-collection-perms
        (t2.with-temp/with-temp [Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:archived true})))))

      (testing "Perms checking should be recursive as well..."
        ;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you
        ;; would also need perms for B
        (mt/with-non-admin-groups-no-root-collection-perms
          (t2.with-temp/with-temp [Collection collection-a  {}
                                   Collection _collection-b {:location (collection/children-location collection-a)}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:archived true})))))))))

(deftest move-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Can I *change* the `location` of a Collection? (i.e. move it into a different parent Collection)"
      (with-collection-hierarchy [a b e]
        (is (partial= (merge
                       (mt/object-defaults Collection)
                       {:id        true
                        :entity_id true
                        :name      "E"
                        :slug      "e"
                        :location  "/A/B/"
                        :parent_id (u/the-id b)})
                      (-> (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id e))
                                                {:parent_id (u/the-id b)})
                          (update :location collection-test/location-path-ids->names)
                          (update :id integer?)
                          (update :entity_id string?))))))

    (testing "I shouldn't be allowed to move the Collection without proper perms."
      (testing "If I want to move A into B, I should need permissions for both A and B"
        (mt/with-non-admin-groups-no-root-collection-perms
          (t2.with-temp/with-temp [Collection collection-a {}
                                   Collection collection-b {}]
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:parent_id (u/the-id collection-b)}))))))

      (testing "Perms checking should be recursive as well..."
        (testing "Create A, B, and C; B is a child of A."
          (testing "Grant perms for A and B. Moving A into C should fail because we need perms for C"
            ;; (collections with readwrite perms marked below with a `*`)
            ;; A* -> B* ==> C -> A -> B
            (mt/with-non-admin-groups-no-root-collection-perms
              (t2.with-temp/with-temp [Collection collection-a {}
                                       Collection collection-b {:location (collection/children-location collection-a)}
                                       Collection collection-c {}]
                (doseq [collection [collection-a collection-b]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for A and C. Moving A into C should fail because we need perms for B."
            ;; A* -> B  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (t2.with-temp/with-temp [Collection collection-a  {}
                                       Collection _collection-b {:location (collection/children-location collection-a)}
                                       Collection collection-c  {}]
                (doseq [collection [collection-a collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for B and C. Moving A into C should fail because we need perms for A"
            ;; A -> B*  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (t2.with-temp/with-temp [Collection collection-a {}
                                       Collection collection-b {:location (collection/children-location collection-a)}
                                       Collection collection-c {}]
                (doseq [collection [collection-b collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)})))))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                          GET /api/collection/root|:id/timelines                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- timelines-request
  [collection include-events?]
  (if include-events?
    (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/timelines") :include "events")
    (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/timelines"))))

(defn- timeline-names [timelines]
  (->> timelines (map :name) set))

(defn- event-names [timelines]
  (->> timelines (mapcat :events) (map :name) set))

(deftest timelines-test
  (testing "GET /api/collection/root|id/timelines"
    (t2.with-temp/with-temp [Collection coll-a {:name "Collection A"}
                             Collection coll-b {:name "Collection B"}
                             Collection coll-c {:name "Collection C"}
                             Timeline tl-a      {:name          "Timeline A"
                                                 :collection_id (u/the-id coll-a)}
                             Timeline tl-b      {:name          "Timeline B"
                                                 :collection_id (u/the-id coll-b)}
                             Timeline _tl-b-old {:name          "Timeline B-old"
                                                 :collection_id (u/the-id coll-b)
                                                 :archived      true}
                             Timeline _tl-c     {:name          "Timeline C"
                                                 :collection_id (u/the-id coll-c)}
                             TimelineEvent _event-aa {:name        "event-aa"
                                                      :timeline_id (u/the-id tl-a)}
                             TimelineEvent _event-ab {:name        "event-ab"
                                                      :timeline_id (u/the-id tl-a)}
                             TimelineEvent _event-ba {:name        "event-ba"
                                                      :timeline_id (u/the-id tl-b)}
                             TimelineEvent _event-bb {:name        "event-bb"
                                                      :timeline_id (u/the-id tl-b)
                                                      :archived    true}]
      (testing "Timelines in the collection of the card are returned"
        (is (= #{"Timeline A"}
               (timeline-names (timelines-request coll-a false)))))
      (testing "Timelines in the collection have a hydrated `:collection` key"
        (is (= #{(u/the-id coll-a)}
               (->> (timelines-request coll-a false)
                    (map #(get-in % [:collection :id]))
                    set))))
      (testing "check that `:can_write` key is hydrated"
        (is (every?
             #(contains? % :can_write)
             (map :collection (timelines-request coll-a false)))))
      (testing "Only un-archived timelines in the collection of the card are returned"
        (is (= #{"Timeline B"}
               (timeline-names (timelines-request coll-b false)))))
      (testing "Timelines have events when `include=events` is passed"
        (is (= #{"event-aa" "event-ab"}
               (event-names (timelines-request coll-a true)))))
      (testing "Timelines have only un-archived events when `include=events` is passed"
        (is (= #{"event-ba"}
               (event-names (timelines-request coll-b true)))))
      (testing "Timelines with no events have an empty list on `:events` when `include=events` is passed"
        (is (= '()
               (->> (timelines-request coll-c true) first :events)))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            GET /api/collection/graph and PUT /api/collection/graph                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest graph-test
  (t2.with-temp/with-temp [Collection       {default-a :id}   {:location "/"}
                           Collection       {default-ab :id}  {:location (format "/%d/" default-a)}
                           Collection       {currency-a :id}  {:namespace "currency", :location "/"}
                           Collection       {currency-ab :id} {:namespace "currency", :location (format "/%d/" currency-a)}
                           PermissionsGroup {group-id :id}    {}]
    (letfn [(nice-graph [graph]
              (let [id->alias {default-a   "Default A"
                               default-ab  "Default A -> B"
                               currency-a  "Currency A"
                               currency-ab "Currency A -> B"}]
                (transduce
                 identity
                 (fn
                   ([graph]
                    (-> (get-in graph [:groups group-id])
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
                 (nice-graph (mt/user-http-request :crowberto :get 200 "collection/graph")))))

        (testing "Should be able to fetch the permissions graph for a non-default namespace"
          (is (= {"Currency A" "read", "Currency A -> B" "read"}
                 (nice-graph (mt/user-http-request :crowberto :get 200 "collection/graph?namespace=currency")))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "collection/graph")))))

      (testing "PUT /api/collection/graph\n"
        (testing "Should be able to update the graph for the default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response (mt/user-http-request :crowberto :put 200 "collection/graph"
                                                 (assoc (graph/graph) :groups {group-id {default-ab :write, currency-ab :write}}))]
              (is (= {"Default A" "read", "Default A -> B" "write"}
                     (nice-graph response))))))

        (testing "Should be able to update the graph for a non-default namespace.\n"
          (testing "Should ignore updates to Collections outside of the namespace"
            (let [response (mt/user-http-request :crowberto :put 200 "collection/graph"
                                                 (assoc (graph/graph)
                                                        :groups {group-id {default-a :write, currency-a :write}}
                                                        :namespace :currency))]
              (is (= {"Currency A" "write", "Currency A -> B" "read"}
                     (nice-graph response))))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "collection/graph"
                                       (assoc (graph/graph)
                                              :groups {group-id {default-a :write, currency-a :write}}
                                              :namespace :currency)))))))))

(deftest cards-and-dashboards-get-can-write
  (t2.with-temp/with-temp [:model/Collection {collection-id :id :as collection} {}
                           :model/Card _ {:collection_id collection-id}
                           :model/Dashboard _ {:collection_id collection-id}
                           :model/Card _ {:collection_id collection-id
                                          :type :model}]

    (testing "`can_write` is `true` when appropriate"
      (perms/revoke-collection-permissions! (perms-group/all-users) collection)
      (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
      (is (= #{[true "card"] [true "dataset"] [true "dashboard"]}
             (into #{} (map (juxt :can_write :model) (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items"))))))))

    (testing "and `false` when appropriate"
      (perms/revoke-collection-permissions! (perms-group/all-users) collection)
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
      (is (= #{[false "card"] [false "dataset"] [false "dashboard"]}
             (into #{} (map (juxt :can_write :model) (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items"))))))))))

(deftest root-items-excludes-trash-by-default
  (testing "Trash collection is usually not included"
    (is (= [] (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                   (filter #(= (:name %) "Trash"))))))
  (testing "We can optionally request to include the Trash"
    (is (= [{:name "Trash"
             :id (collection/trash-collection-id)}]
           (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items" :archived true))
                (filter #(= (:id %) (collection/trash-collection-id)))
                (map #(select-keys % [:name :id])))))))

(deftest collection-tree-includes-trash-if-requested
  (testing "Trash collection is included by default"
    (is (some #(= (:id %) (collection/trash-collection-id)) (mt/user-http-request :crowberto :get 200 "collection/tree"))))
  (testing "Trash collection is NOT included if `exclude-archived` is passed"
    (is (not (some #(= (:id %) (collection/trash-collection-id)) (mt/user-http-request :crowberto :get 200 "collection/tree" :exclude-archived "true"))))))

(defn- get-item-with-id-in-coll
  [coll-id item-id]
  (->> (get-items :crowberto coll-id)
       (filter #(= (:id %) item-id))
       first))

(defn- get-item-with-id-in-root [id]
  (->> (mt/user-http-request :crowberto :get 200 (str "collection/root/items"))
       :data
       (filter #(= (:id %) id))
       first))

(deftest ^:parallel can-restore
  (testing "can_restore is correctly populated for dashboard"
    (testing "when I can actually restore it"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                               :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id subcollection)}]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard)) {:archived true})
        (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id dashboard)))))))
    (testing "and when I can't"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                               :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id subcollection)}]
        (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard)) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
        (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id dashboard))))))))
  (testing "can_restore is correctly populated for card"
    (testing "when I can actually restore it"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                               :model/Card card {:name "Card" :collection_id (u/the-id subcollection)}]
        (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:archived true})
        (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id card)))))))
    (testing "and when I can't"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                               :model/Card card {:name "Card" :collection_id (u/the-id subcollection)}]
        (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
        (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id card))))))))
  (testing "can_restore is correctly populated for collection"
    (testing "when I can actually restore it"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
        (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id subcollection)))))))
    (testing "and when I can't"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
        (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id subcollection)))))))
    (testing "and when I can't because its parent was the one that was trashed"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                               :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
        (is (false? (:can_restore (get-item-with-id-in-coll (u/the-id collection) (u/the-id subcollection))))))))
  (testing "can_restore is correctly populated for collections trashed from the root collection"
    (testing "when I can actually restore it"
      (t2.with-temp/with-temp [:model/Collection collection {:name "A"}]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
        (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id collection))))))))
  (testing "can_restore is correctly populated for things in the root collection"
    (t2.with-temp/with-temp [:model/Collection collection {:name "A"}
                             :model/Dashboard dashboard {:name "Dashboard"}]
      (is (contains? (get-item-with-id-in-root (u/the-id dashboard)) :can_restore))
      (is (contains? (get-item-with-id-in-root (u/the-id collection)) :can_restore))
      (is (false? (:can_restore (get-item-with-id-in-root (u/the-id dashboard)))))
      (is (false? (:can_restore (get-item-with-id-in-root (u/the-id collection)))))))
  (testing "can_restore is correctly populated for things in other collections"
    (t2.with-temp/with-temp [:model/Collection collection {:name "container"}
                             :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id collection)}]
      (is (contains? (get-item-with-id-in-coll (u/the-id collection) (u/the-id dashboard)) :can_restore ))
      (is (false? (:can_restore (get-item-with-id-in-coll (u/the-id collection) (u/the-id dashboard))))))))

(deftest nothing-can-be-moved-to-the-trash
  (t2.with-temp/with-temp [:model/Dashboard dashboard {}
                           :model/Collection collection {}
                           :model/Card card {}]
    (testing "Collections can't be moved to the trash"
      (mt/user-http-request :crowberto :put 400 (str "collection/" (u/the-id collection)) {:parent_id (collection/trash-collection-id)})
      (is (not (t2/exists? :model/Collection :location (collection/trash-path)))))
    (testing "Dashboards can't be moved to the trash"
      (mt/user-http-request :crowberto :put 400 (str "dashboard/" (u/the-id dashboard)) {:collection_id (collection/trash-collection-id)})
      (is (not (t2/exists? :model/Dashboard :collection_id (collection/trash-collection-id)))))
    (testing "Cards can't be moved to the trash"
      (mt/user-http-request :crowberto :put 400 (str "card/" (u/the-id card)) {:collection_id (collection/trash-collection-id)})
      (is (not (t2/exists? :model/Card :collection_id (collection/trash-collection-id)))))))

(deftest skip-graph-skips-graph-on-graph-PUT
  (is (malli= [:map [:revision :int] [:groups :map]]
              (mt/user-http-request :crowberto
                                    :put 200
                                    "collection/graph"
                                    {:revision (c-perm-revision/latest-id) :groups {}})))
  (is (malli= [:map {:closed true} [:revision :int]]
              (mt/user-http-request :crowberto
                                    :put 200
                                    "collection/graph"
                                    {:revision (c-perm-revision/latest-id)
                                     :groups {}
                                     :skip_graph true}))
      "PUTs with skip_graph should not return the coll permission graph."))
