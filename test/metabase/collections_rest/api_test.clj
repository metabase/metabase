(ns metabase.collections-rest.api-test
  "Tests for /api/collection endpoints."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.collections-rest.api :as api.collection]
   [metabase.collections-rest.settings :as collections-rest.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection-test :as collection-test]
   [metabase.collections.test-helpers :refer [without-library]]
   [metabase.notification.api.notification-test :as api.notification-test]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.collection-permission-graph-revision :as c-perm-revision]
   [metabase.permissions.models.collection.graph :as graph]
   [metabase.permissions.models.collection.graph-test :as graph.test]
   [metabase.queries-rest.api.card-test :as api.card-test]
   [metabase.queries.models.card :as card]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time ZonedDateTime ZoneId)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users :test-users-personal-collections :row-lock))

(defmacro ^:private with-collection-hierarchy!
  "Totally-rad macro that creates a Collection hierarchy and grants the All Users group perms for all the Collections
  you've bound. See docs for [[metabase.collections.models.collection-test/with-collection-hierarchy]] for more details."
  {:style/indent 1}
  [collection-bindings & body]
  {:pre [(vector? collection-bindings)
         (every? symbol? collection-bindings)]}
  `(collection-test/with-collection-hierarchy! [{:keys ~collection-bindings}]
     ~@(for [collection-symb collection-bindings]
         `(perms/grant-collection-read-permissions! (perms/all-users-group) ~collection-symb))
     ~@body))

(defn- do-with-french-user-and-personal-collection! [f]
  (binding [collection/*allow-deleting-personal-collections* true]
    (mt/with-mock-i18n-bundles! {"fr" {:messages {"{0} {1}''s Personal Collection" "Collection personnelle de {0} {1}"}}}
      (mt/with-temp [:model/User       user       {:locale     "fr"
                                                   :first_name "Taco"
                                                   :last_name  "Bell"}
                     :model/Collection collection {:personal_owner_id (:id user)}]
        (f user collection)))))

(defmacro ^:private with-french-user-and-personal-collection!
  "Create a user with locale's fr and a collection associated with it"
  {:style/indent 2}
  [user collection & body]
  `(do-with-french-user-and-personal-collection!
    (fn [~user ~collection]
      ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                GET /collection                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest list-collections-test
  (testing "GET /api/collection"
    (testing "check that we can get a basic list of collections"
      ;; (for test purposes remove the personal collections)
      (mt/with-temp [:model/Collection collection]
        (is (= [{:parent_id           nil
                 :effective_location  nil
                 :effective_ancestors []
                 :can_write           true
                 :name                "Our analytics"
                 :authority_level     nil
                 :is_personal         false
                 :is_remote_synced    false
                 :id                  "root"
                 :can_restore         false
                 :can_delete          false}
                (assoc (into {:is_personal false} collection)
                       :can_write true
                       :can_delete false
                       :is_remote_synced false
                       :parent_id nil)]
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
      (with-french-user-and-personal-collection! user _collection
        (is (= [{:name "Collection personnelle de Taco Bell"
                 :slug "collection_personnelle_de_taco_bell"}]
               (->> (mt/user-http-request user :get 200 "collection")
                    (filter :personal_owner_id)
                    (map #(select-keys % [:name :slug])))))))))

(deftest list-collections-permissions-test
  (testing "GET /api/collection"
    (testing "check that we don't see collections if we don't have permissions for them"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection-1 {:name "Collection 1"}
                       :model/Collection _            {:name "Collection 2"}]
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection-1)
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
      (mt/with-temp [:model/Collection collection-1 {:name "Collection 1"}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) collection-1)
        (is (= ["Rasta Toucan's Personal Collection"]
               (->> (mt/user-http-request :rasta :get 200 "collection" :personal-only true)
                    (filter (fn [{collection-name :name}]
                              (or (#{"Our analytics" "Collection 1" "Collection 2"} collection-name)
                                  (str/includes? collection-name "Personal Collection"))))
                    (map :name))))))))

(deftest list-collections-personal-only-admin-test
  (testing "GET /api/collection?personal-only=true check that we see all personal collections if you are an admin."
    (mt/with-temp [:model/Collection collection-1 {:name "Collection 1"}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection-1)
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
    (mt/with-temp [:model/Collection {archived-col-id :id} {:name "Archived Collection"}
                   :model/Collection _ {:name "Regular Collection"}]
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
      (mt/with-temp [:model/Collection {normal-id :id} {:name "Normal Collection"}
                     :model/Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (letfn [(collection-names [collections]
                  (->> collections
                       (filter #(#{normal-id coins-id} (:id %)))
                       (map :name)))]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= ["Normal Collection"]
                   (collection-names (mt/user-http-request :rasta :get 200 "collection")))))

          (perms/grant-collection-read-permissions! (perms/all-users-group) coins-id)
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
      (with-collection-hierarchy! [a b c d e f g]
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
    (with-collection-hierarchy! [a b c d e f g]
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
    (with-collection-hierarchy! [a b]
      (let [personal-collection (collection/user->personal-collection (mt/user->id :rasta))]
        (mt/with-temp [:model/Card _ {:name "Personal Card"
                                      :collection_preview false
                                      :collection_id (:id personal-collection)}
                       :model/Card _ {:name "Personal Model"
                                      :type :model
                                      :collection_preview false
                                      :collection_id (:id personal-collection)}
                       :model/Card _ {:name "A Card"
                                      :collection_preview false
                                      :collection_id (:id a)}
                       :model/Card _ {:name "B Model"
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
    (with-collection-hierarchy! [a b c d e f g]
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
    (with-collection-hierarchy! [a b c d e f g]
      (let [personal-collection (collection/user->personal-collection (mt/user->id :crowberto))
            ids      (set (map :id (cons personal-collection [a b c d e f g])))]
        (mt/with-test-user :crowberto
          (testing "Make sure we get the expected collections when collection-id is nil"
            (let [collections (#'api.collection/select-collections {:archived                       false
                                                                    :exclude-other-user-collections false
                                                                    :namespaces #{nil}
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
                                                                    :namespaces #{nil}
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
        (mt/with-temp [:model/Collection ac {:name "Admin Child" :location (collection/location-path admin-collection)}
                       :model/Collection lc {:name "Lucky Child" :location (collection/location-path lucky-collection)}
                       :model/Collection a  {:name "A"}
                       :model/Collection b  {:name     "B"
                                             :location (collection/location-path a)}
                       :model/Collection c  {:name "C"}]
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
      (with-french-user-and-personal-collection! user collection
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
        (mt/with-temp [:model/Collection parent-collection {:name "Parent"}
                       :model/Collection child-collection  {:name "Child", :location (format "/%d/" (:id parent-collection))}]
          (perms/revoke-collection-permissions! (perms/all-users-group) parent-collection)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) child-collection)
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
      (mt/with-temp [:model/Collection {normal-id :id} {:name "Normal Collection"}
                     :model/Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (let [ids [normal-id coins-id]]
          (testing "shouldn't show Collections of a different `:namespace` by default"
            (is (= [{:name "Normal Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree")))))

          (perms/grant-collection-read-permissions! (perms/all-users-group) coins-id)
          (testing "By passing `:namespace` we should be able to see Collections of that `:namespace`"
            (testing "?namespace=currency"
              (is (= [{:name "Coin Collection", :children []}]
                     (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=currency")))))

            (testing "?namespace=stamps"
              (is (= []
                     (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespace=stamps")))))))))))

(deftest collection-tree-namespaces-parameter-test
  (testing "GET /api/collection/tree"
    (testing "namespaces parameter allows specifying multiple namespaces"
      (mt/with-temp [:model/Collection {normal-id :id} {:name "Normal Collection"}
                     :model/Collection {coins-id :id} {:name "Coin Collection", :namespace "currency"}
                     :model/Collection {stamps-id :id} {:name "Stamp Collection", :namespace "stamps"}]
        (let [ids [normal-id coins-id stamps-id]]
          (perms/grant-collection-read-permissions! (perms/all-users-group) coins-id)
          (perms/grant-collection-read-permissions! (perms/all-users-group) stamps-id)

          (testing "single namespace via namespaces param"
            (is (= [{:name "Coin Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespaces=currency")))))

          (testing "multiple namespaces via repeated namespaces param"
            (is (= [{:name "Coin Collection", :children []}
                    {:name "Stamp Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree" :namespaces ["currency" "stamps"])))))

          (testing "empty string in namespaces matches nil namespace (default collections)"
            (is (= [{:name "Normal Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree?namespaces=")))))

          (testing "combining nil namespace with other namespaces"
            (is (= [{:name "Coin Collection", :children []}
                    {:name "Normal Collection", :children []}]
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree" :namespaces ["currency" ""]))
                   (collection-tree-view ids (mt/user-http-request :rasta :get 200 "collection/tree" :namespaces ["currency" nil])))))

          (testing "namespace and namespaces params are mutually exclusive"
            (is (= "Invalid Request."
                   (mt/user-http-request :rasta :get 400 "collection/tree?namespace=currency&namespaces=stamps")))))))))

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
      (collection-test/with-collection-hierarchy! [{:keys [a b e f g], :as collections}]
        (doseq [collection [a b e f g]]
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection))
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

(defn- flatten-tree-types
  "Extract all collection types from a tree structure, including nested children."
  [collections]
  (mapcat (fn [collection]
            (cons (:type collection)
                  (when-let [children (:children collection)]
                    (flatten-tree-types children))))
          collections))

(deftest collection-tree-library-test
  (testing "GET /api/collection/tree"
    (without-library
     (let [_ (collection/create-library-collection!)]
       (testing "By default it does not include library items"
         (let [response (mt/user-http-request :rasta :get 200 "collection/tree")
               all-types (flatten-tree-types response)]
           (is (not-any? #{collection/library-collection-type} all-types))
           (is (not-any? #{collection/library-metrics-collection-type} all-types))
           (is (not-any? #{collection/library-data-collection-type} all-types))))
       (testing "Can choose to include include library items"
         (let [response (mt/user-http-request :rasta :get 200 "collection/tree" :include-library true)
               all-types (flatten-tree-types response)]
           (is (some #{collection/library-collection-type} all-types))
           (is (some #{collection/library-metrics-collection-type} all-types))
           (is (some #{collection/library-data-collection-type} all-types))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              GET /collection/:id                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest fetch-collection-test
  (testing "GET /api/collection/:id"
    (testing "check that we can see collection details"
      (mt/with-temp [:model/Collection collection {:name "Coin Collection"}]
        (is (=? {:name "Coin Collection"}
                (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection)))))))

    (testing "check that we can see collection details using entity ID"
      (mt/with-temp [:model/Collection collection {:name "Coin Collection"}]
        (is (=? {:name "Coin Collection"}
                (mt/user-http-request :rasta :get 200 (str "collection/" (:entity_id collection)))))))

    (testing "check that collections detail properly checks permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 (str "collection/" (u/the-id collection))))))))

    (testing "for personal collections, it should return name and slug in user's locale"
      (with-french-user-and-personal-collection! user collection
        (is (=? {:name "Collection personnelle de Taco Bell"
                 :slug "collection_personnelle_de_taco_bell"}
                (mt/user-http-request (:id user) :get 200 (str "collection/" (:id collection)))))))))

;;; ------------------------------------------------ Collection Items ------------------------------------------------

(defn- do-with-some-children-of-collection! [collection-or-id-or-nil f]
  (mt/with-non-admin-groups-no-root-collection-perms
    (let [collection-id-or-nil (when collection-or-id-or-nil
                                 (u/the-id collection-or-id-or-nil))]
      (mt/with-temp [:model/Card          {card-id :id}                     {:name               "Birthday Card"
                                                                             :collection_preview false
                                                                             :collection_id      collection-id-or-nil}
                     :model/Dashboard     {dashboard-id :id}                {:name          "Dine & Dashboard"
                                                                             :collection_id collection-id-or-nil}
                     :model/Pulse         {pulse-id :id, :as _pulse}        {:name          "Electro-Magnetic Pulse"
                                                                             :collection_id collection-id-or-nil}
                     ;; this is a dashboard subscription
                     :model/DashboardCard {dashboard-card-id :id}           {:dashboard_id dashboard-id
                                                                             :card_id      card-id}
                     :model/Pulse         {dashboard-sub-pulse-id :id}      {:name          "Acme Products"
                                                                             :collection_id collection-id-or-nil}
                     :model/PulseCard     {dashboard-sub-pulse-card-id :id} {:card_id           card-id
                                                                             :dashboard_card_id dashboard-card-id
                                                                             :pulse_id          dashboard-sub-pulse-id}]
        (f {:card-id                         card-id
            :dashboard-id                    dashboard-id
            :pulse-id                        pulse-id
            :dashboard-subscription-pulse-id dashboard-sub-pulse-id
            :dashboard-sub-pulse-card-id     dashboard-sub-pulse-card-id})))))

(defmacro ^:private with-some-children-of-collection! {:style/indent 1} [collection-or-id-or-nil & body]
  `(do-with-some-children-of-collection!
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
      (mt/with-temp [:model/Collection       collection             {}
                     :model/User             {user-id :id}          {:first_name "x" :last_name "x" :email "zzzz@example.com"}
                     :model/Card             {card-id :id :as card} {:collection_id (u/the-id collection)}
                     :model/ModerationReview _                      {:moderated_item_type "card"
                                                                     :moderated_item_id   card-id
                                                                     :status              "verified"
                                                                     :moderator_id        user-id
                                                                     :most_recent         true}]
        (is (= (mt/obj->json->obj
                [{:collection_id       (:id collection)
                  :dashboard_count     0
                  :dashboard           nil
                  :dashboard_id        nil
                  :can_write           true
                  :can_delete          false
                  :can_restore         false
                  :collection_namespace nil
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
                  :is_remote_synced    false
                  :model               "card"
                  :last_used_at        (:last_used_at card)
                  :fully_parameterized  true}])
               (mt/obj->json->obj
                (:data (mt/user-http-request :crowberto :get 200
                                             (str "collection/" (u/the-id collection) "/items"))))))))))

(deftest collection-items-based-on-upload-test
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
      (mt/with-temp [:model/Collection parent {}
                     :model/Collection child {:location (collection/children-location parent)}]
        (is (= {:id (:id child)
                :collection_id (:id parent)}
               (select-keys (first (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id parent) "/items?model=collection"))))
                            [:id :collection_id])))))))

(deftest collection-items-entity-id-test
  (testing "GET /api/collection/:id/items with entity ID"
    (mt/with-temp [:model/Collection collection {}
                   :model/Card       {} {:collection_id (u/the-id collection)}]
      (testing "Should be able to get collection items using entity ID"
        (is (= 1 (count (:data (mt/user-http-request :crowberto :get 200
                                                     (str "collection/" (:entity_id collection) "/items"))))))))))

(deftest collection-items-return-database-id-for-datasets-test
  (testing "GET /api/collection/:id/items"
    (testing "Database id is returned for items in which dataset is true"
      (mt/with-temp [:model/Collection collection      {}
                     :model/User       _               {:first_name "x" :last_name "x" :email "zzzz@example.com"}
                     :model/Card       {card-id-1 :id} {:type          :model
                                                        :collection_id (u/the-id collection)}
                     :model/Card       {card-id-2 :id} {:collection_id (u/the-id collection)}]
        (is (= #{{:id card-id-1 :database_id (mt/id)}
                 {:id card-id-2 :database_id (mt/id)}}
               (->> (:data (mt/user-http-request :crowberto :get 200
                                                 (str "collection/" (u/the-id collection) "/items")))
                    (map #(select-keys % [:id :database_id]))
                    set)))))))

(deftest collection-items-limit-offset-test
  (testing "GET /api/collection/:id/items"
    (testing "check that limit and offset work and total comes back"
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       _ {:collection_id (u/the-id collection)}
                     :model/Card       _ {:collection_id (u/the-id collection)}
                     :model/Card       _ {:collection_id (u/the-id collection)}]
        (is (= 2 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1")))))
        (is (= 1 (count (:data (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "2")))))
        (is (= 3 (:total (mt/user-http-request :crowberto :get 200 (str "collection/" (u/the-id collection) "/items") :limit "2" :offset "1"))))))))

(deftest collection-items-pinning-filtering-test
  (testing "GET /api/collection/:id/items"
    (testing "check that pinning filtering exists"
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       _ {:collection_id       (u/the-id collection)
                                          :collection_position 1
                                          :name                "pinned-1"}
                     :model/Card       _ {:collection_id       (u/the-id collection)
                                          :collection_position 1
                                          :name                "pinned-2"}
                     :model/Card       _ {:collection_id (u/the-id collection)
                                          :name          "unpinned-card"}
                     :model/Timeline   _ {:collection_id (u/the-id collection)
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
      (mt/with-temp [:model/Collection collection {:name "Debt Collection"}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
        (with-some-children-of-collection! collection
          (is (partial= (-> (mapv default-item [{:name "Acme Products", :model "pulse", :entity_id true}
                                                {:name               "Birthday Card", :description nil,     :model     "card",
                                                 :collection_preview false,           :display     "table", :entity_id true}
                                                {:name "Dine & Dashboard", :description nil, :model "dashboard", :entity_id true}
                                                {:name "Electro-Magnetic Pulse", :model "pulse", :entity_id true}])
                            (assoc-in [1 :fully_parameterized] true))
                        (mt/boolean-ids-and-timestamps
                         (:data (mt/user-http-request :rasta :get 200 (str "collection/" (u/the-id collection) "/items")))))))))))

(deftest collection-items-children-test-2
  (testing "GET /api/collection/:id/items"
    (testing "check that you get to see the children as appropriate"
      (testing "...and that you can also filter so that you only see the children you want to see"
        (mt/with-temp [:model/Collection collection {:name "Art Collection"}]
          (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
          (with-some-children-of-collection! collection
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
        (mt/with-temp [:model/Collection c1 {:name "C1"}
                       :model/Collection c2 {:name "C2"
                                             :location (path c1)}
                       :model/Collection c3 {:name "C3"
                                             :location (path c1 c2)}
                       :model/Collection c4 {:name "C4"
                                             :location (path c1 c2 c3)}]
          (perms/revoke-collection-permissions! (perms/all-users-group) c1)
          (perms/revoke-collection-permissions! (perms/all-users-group) c2)
          (perms/grant-collection-read-permissions! (perms/all-users-group) c3)
          (perms/grant-collection-read-permissions! (perms/all-users-group) c4)
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

(defn- set-of-item-names
  ([coll] (set-of-item-names :rasta coll))
  ([user coll] (->> (get-items user coll)
                    (map :name)
                    set)))

(deftest collections-are-moved-to-trash-when-archived
  (testing "I can trash something by marking it as archived"
    (mt/with-temp [:model/Collection collection {:name "Art Collection"}
                   :model/Collection _ {:name "Baby Collection"
                                        :location (collection/children-location collection)}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
      (is (partial= [{:name "Art Collection", :description nil, :model "collection"}]
                    (get-items :crowberto (collection/trash-collection-id))))
      (is (partial= [{:name "Baby Collection", :model "collection"}]
                    (get-items :crowberto collection)))))
  (testing "I can untrash something by marking it as not archived"
    (mt/with-temp [:model/Collection collection {:name "A"}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
      (is (= #{"A"} (set-of-item-names (collection/trash-collection))))
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived false})
      (is (= #{} (set-of-item-names (collection/trash-collection))))))
  (testing "I can untrash something to a specific location if desired"
    (mt/with-temp [:model/Collection collection-a {:name "A"}
                   :model/Collection collection-b {:name "B" :location (collection/children-location collection-a)}
                   :model/Collection destination {:name "Destination"}]
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection-a)
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection-b)
      (perms/grant-collection-read-permissions! (perms/all-users-group) destination)
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
      (is (= #{"A" "B"} (set-of-item-names :crowberto destination))))))

(deftest collection-permissions-work-correctly
  (mt/with-temp [:model/Collection collection-a {:name "A"}
                 :model/Collection subcollection-a {:name "sub-A" :location (collection/children-location collection-a)}
                 :model/Collection collection-b {:name "B"}
                 :model/Collection subcollection-b {:name "sub-B" :location (collection/children-location collection-b)}
                 :model/Collection collection-c {:name "C"}
                 :model/Collection subcollection-c {:name "sub-C" :location (collection/children-location collection-c)}]
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-a)
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-b)
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-c)
    (perms/grant-collection-read-permissions! (perms/all-users-group) collection-b)
    (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection-c)
    (testing "i can archive from a collection I have no permissions on"
      (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id subcollection-a)) {:archived true}))
    (testing "i can archive from a collection I have read permissions on"
      (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id subcollection-b)) {:archived true}))
    (testing "i can archive from a collection i have no permissions on"
      (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id subcollection-c)) {:archived true})))
  (mt/with-temp [:model/Collection collection-a {:name "A"}
                 :model/Collection subcollection-a {:name "sub-A" :location (collection/children-location collection-a)}
                 :model/Dashboard  dashboard-a {:name "dashboard-A" :collection_id (u/the-id collection-a)}
                 :model/Collection collection-b {:name "B"}
                 :model/Collection subcollection-b {:name "sub-B" :location (collection/children-location collection-b)}
                 :model/Dashboard  dashboard-b {:name "dashboard-B" :collection_id (u/the-id collection-b)}
                 :model/Collection collection-c {:name "C"}
                 :model/Collection subcollection-c {:name "sub-C" :location (collection/children-location collection-c)}
                 :model/Dashboard  dashboard-c {:name "dashboard-C" :collection_id (u/the-id collection-c)}]
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-a)
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-b)
    (perms/revoke-collection-permissions! (perms/all-users-group) collection-c)
    (perms/grant-collection-read-permissions! (perms/all-users-group) collection-b)
    (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection-c)
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
             (set-of-item-names (collection/trash-collection-id)))))))

(deftest collection-items-revision-history-and-ordering-test
  (testing "GET /api/collection/:id/items"
    (mt/test-helpers-set-global-values!
      (mt/with-temp
        [:model/Collection {collection-id :id}      {:name "Collection with Items"}
         :model/User       {user1-id :id}           {:first_name "Test" :last_name "AAAA" :email "aaaa@example.com"}
         :model/User       {user2-id :id}           {:first_name "Test" :last_name "ZZZZ" :email "zzzz@example.com"}
         :model/Card       {card1-id :id :as card1} {:name "Card with history 1" :collection_id collection-id}
         :model/Card       {card2-id :id :as card2} {:name "Card with history 2" :collection_id collection-id}
         :model/Card       _                        {:name "ZZ" :collection_id collection-id}
         :model/Card       _                        {:name "AA" :collection_id collection-id}
         :model/Revision   revision1                {:model    "Card"
                                                     :model_id card1-id
                                                     :user_id  user2-id
                                                     :object   (revision/serialize-instance card1 card1-id card1)}
         :model/Revision   _revision2               {:model    "Card"
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
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Collection with Items"}
                     :model/Card       _ {:name "ZZ" :collection_id collection-id}
                     :model/Card       _ {:name "AA" :collection_id collection-id}
                     :model/Dashboard  _ {:name "ZZ" :collection_id collection-id}
                     :model/Dashboard  _ {:name "AA" :collection_id collection-id}
                     :model/Pulse      _ {:name "ZZ" :collection_id collection-id}
                     :model/Pulse      _ {:name "AA" :collection_id collection-id}]
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
      (mt/with-temp [:model/Collection {collection-id :id}              {:name "Collection with Items"}
                     :model/User       {failuser-id :id}                {:first_name "failure" :last_name "failure" :email "failure@example.com"}
                     :model/User       {passuser-id :id}                {:first_name "pass" :last_name "pass" :email "pass@example.com"}
                     :model/Card       {card-id :id :as card}           {:name "card" :collection_id collection-id}
                     :model/Dashboard  {dashboard-id :id :as dashboard} {:name "dashboard" :collection_id collection-id}
                     :model/Revision   card-revision1 {:model    "Card"
                                                       :model_id card-id
                                                       :user_id  failuser-id
                                                       :object   (revision/serialize-instance card card-id card)}
                     :model/Revision   card-revision2 {:model    "Card"
                                                       :model_id card-id
                                                       :user_id  failuser-id
                                                       :object   (revision/serialize-instance card card-id card)}
                     :model/Revision   dash-revision1 {:model    "Dashboard"
                                                       :model_id dashboard-id
                                                       :user_id  failuser-id
                                                       :object   (revision/serialize-instance dashboard dashboard-id dashboard)}
                     :model/Revision   dash-revision2 {:model    "Dashboard"
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
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Collection with Items"}
                     :model/Collection _                   {:name "subcollection"
                                                            :location (format "/%d/" collection-id)
                                                            :authority_level "official"}
                     :model/Card       _                   {:name "card" :collection_id collection-id}
                     :model/Dashboard  _                   {:name "dash" :collection_id collection-id}]
        (let [items (->> (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items")
                                               :models ["dashboard" "card" "collection"])
                         :data)]
          (is (= #{{:name "card"}
                   {:name "dash"}
                   {:name "subcollection" :authority_level "official"}}
                 (into #{} (map #(select-keys % [:name :authority_level]))
                       items))))))))

(deftest collection-items-include-can-run-adhoc-query-test
  (testing "GET /api/collection/:id/items and GET /api/collection/root/items"
    (testing "include_can_run_adhoc_query parameter controls hydration of can_run_adhoc_query flag"
      (mt/with-temp [:model/Collection {collection-id :id} {}
                     :model/Card {card-id :id} {:collection_id collection-id}
                     :model/Card {root-card-id :id} {:collection_id nil}]
        (testing "When include_can_run_adhoc_query=false (default), can_run_adhoc_query is not included"
          (let [collection-items (:data (mt/user-http-request :rasta :get 200
                                                              (str "collection/" collection-id "/items")))
                root-items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))]
            (is (not (contains? (first collection-items) :can_run_adhoc_query)))
            (is (not (some #(contains? % :can_run_adhoc_query) root-items)))))

        (testing "When include_can_run_adhoc_query=true, can_run_adhoc_query is included for cards"
          (let [collection-items (:data (mt/user-http-request :rasta :get 200
                                                              (str "collection/" collection-id "/items")
                                                              :include_can_run_adhoc_query true))
                root-items (:data (mt/user-http-request :rasta :get 200 "collection/root/items"
                                                        :include_can_run_adhoc_query true))
                card-item (first (filter #(= (:id %) card-id) collection-items))
                root-card-item (first (filter #(= (:id %) root-card-id) root-items))]
            (is (contains? card-item :can_run_adhoc_query))
            (is (boolean? (:can_run_adhoc_query card-item)))
            (is (contains? root-card-item :can_run_adhoc_query))
            (is (boolean? (:can_run_adhoc_query root-card-item)))))

        (testing "can_run_adhoc_query is only added to card-like models (card, dataset, metric)"
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {:collection_id collection-id}
                         :model/Collection {subcoll-id :id} {:location (collection/children-location
                                                                        (t2/select-one :model/Collection :id collection-id))}]
            (let [items (:data (mt/user-http-request :rasta :get 200
                                                     (str "collection/" collection-id "/items")
                                                     :include_can_run_adhoc_query true))
                  dashboard-item (first (filter #(= (:id %) dashboard-id) items))
                  collection-item (first (filter #(= (:id %) subcoll-id) items))]
              (is (not (contains? dashboard-item :can_run_adhoc_query)))
              (is (not (contains? collection-item :can_run_adhoc_query))))))))))

(deftest can-run-adhoc-query-threshold-exceeded-test
  (testing "GET /api/collection/:id/items with include_can_run_adhoc_query=true"
    (testing "When card count exceeds threshold, can_run_adhoc_query returns true (skips permission check)"
      (let [card-query {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}]
            (mt/with-temporary-setting-values [collections-rest.settings/can-run-adhoc-query-check-threshold 2]
              (let [items (:data (mt/user-http-request :rasta :get 200
                                                       (str "collection/" collection-id "/items")
                                                       :include_can_run_adhoc_query true))]
                ;; With 3 cards and threshold of 2, all cards should have can_run_adhoc_query=true
                ;; even though user doesn't have data permissions (computation was skipped)
                (is (= 3 (count items)))
                (is (every? #(true? (:can_run_adhoc_query %)) items))))))))))

(deftest can-run-adhoc-query-threshold-not-exceeded-test
  (testing "GET /api/collection/:id/items with include_can_run_adhoc_query=true"
    (testing "When card count is at or below threshold, normal hydration occurs (returns false without perms)"
      (let [card-query {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}]
            (mt/with-temporary-setting-values [collections-rest.settings/can-run-adhoc-query-check-threshold 5]
              (let [items (:data (mt/user-http-request :rasta :get 200
                                                       (str "collection/" collection-id "/items")
                                                       :include_can_run_adhoc_query true))]
                ;; With 2 cards and threshold of 5, actual permission check occurs
                ;; User doesn't have data permissions, so all should be false
                (is (= 2 (count items)))
                (is (every? #(false? (:can_run_adhoc_query %)) items))))))))))

(deftest can-run-adhoc-query-threshold-disabled-test
  (testing "GET /api/collection/:id/items with include_can_run_adhoc_query=true"
    (testing "When threshold is 0, always compute permissions regardless of card count"
      (let [card-query {:database (mt/id)
                        :type     :query
                        :query    {:source-table (mt/id :venues)}}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Collection {collection-id :id} {}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}
                         :model/Card _ {:collection_id collection-id :dataset_query card-query}]
            (mt/with-temporary-setting-values [collections-rest.settings/can-run-adhoc-query-check-threshold 0]
              (let [items (:data (mt/user-http-request :rasta :get 200
                                                       (str "collection/" collection-id "/items")
                                                       :include_can_run_adhoc_query true))]
                ;; With threshold of 0, hydration should always occur
                ;; User doesn't have data permissions, so all should be false
                (is (= 3 (count items)))
                (is (every? #(false? (:can_run_adhoc_query %)) items))))))))))

(deftest collection-items-include-datasets-test
  (testing "GET /api/collection/:id/items"
    (testing "Includes datasets"
      (mt/with-temp [:model/Collection {collection-id :id} {:name "Collection with Items"}
                     :model/Collection _                   {:name "subcollection"
                                                            :location (format "/%d/" collection-id)
                                                            :authority_level "official"}
                     :model/Card       _                   {:name "card" :collection_id collection-id}
                     :model/Card       _                   {:name "dataset" :type :model :collection_id collection-id}
                     :model/Dashboard  _                   {:name "dash" :collection_id collection-id}]
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
    (mt/with-temp [:model/Collection {id1 :id} {:name "Collection with Items"}
                   :model/Collection {id2 :id} {:name "subcollection"
                                                :location (format "/%d/" id1)}]
      (let [item #(first (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" id1))))]
        (testing "the item has nothing in or below it"
          (is (nil? (:here (item))))
          (is (nil? (:below (item)))))
        (mt/with-temp [:model/Collection {id3 :id} {:location (format "/%d/%d/" id1 id2)}]
          (testing "now the item has a collection in it"
            (is (= ["collection"] (:here (item)))))
          (testing "but nothing :below"
            (is (nil? (:below (item)))))
          (mt/with-temp [:model/Collection _ {:location (format "/%d/%d/%d/" id1 id2 id3)}]
            (testing "the item still has a collection in it"
              (is (= ["collection"] (:here (item)))))
            (testing "the item now has a collection below it"
              (is (= ["collection"] (:below (item))))))
          (mt/with-temp [:model/Card _ {:name "card" :collection_id id2}
                         :model/Card _ {:name "dataset" :type :model :collection_id id2}]
            (testing "when the item has a card/dataset, that's reflected in `here` too"
              (is (= #{"collection" "card" "dataset"} (set (:here (item)))))
              (is (nil? (:below (item)))))
            (mt/with-temp [:model/Card _ {:name "card" :collection_id id3}]
              (testing "when the item contains a collection that contains a card, that's `below`"
                (is (= #{"card"} (set (:below (item))))))))
          (mt/with-temp [:model/Dashboard _ {:collection_id id2}]
            (testing "when the item has a dashboard, that's reflected in `here` too"
              (is (= #{"collection" "dashboard"} (set (:here (item))))))))))))

(deftest dashboards-include-here
  (testing "GET /api/collection/:id/items"
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Collection with items"}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card-id :id} {:dashboard_id dash-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
      (testing "sanity check, only the dashboard is there"
        (is (= 1 (:total (mt/user-http-request :rasta :get 200 (format "collection/%d/items" coll-id))))))
      (testing "the dashboard has 'here'"
        (is (= [{:here ["card"]
                 :id dash-id}]
               (->> (mt/user-http-request :rasta :get 200 (format "collection/%d/items" coll-id))
                    :data
                    (map #(select-keys % [:here :id])))))))))

(deftest ^:parallel children-sort-clause-test
  ;; we always place "special" collection types (i.e. "Metabase Analytics") last
  (testing "Default sort"
    (doseq [app-db [:mysql :h2 :postgres]]
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.name :asc]
              [:id :asc]]
             (api.collection/children-sort-clause {:official-collections-first? true} app-db))))))

(deftest ^:parallel children-sort-clause-test-2
  (testing "Sorting by last-edited-at"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:%isnull.last_edit_timestamp]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-at
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-test-2b
  (testing "Sorting by last-edited-at"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:last_edit_timestamp :nulls-last]
            [:last_edit_timestamp :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-at
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-2c
  (testing "Sorting by last-edited-by"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:last_edit_last_name :nulls-last]
            [:last_edit_last_name :asc]
            [:last_edit_first_name :nulls-last]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-by
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-2d
  (testing "Sorting by last-edited-by"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:%isnull.last_edit_last_name]
            [:last_edit_last_name :asc]
            [:%isnull.last_edit_first_name]
            [:last_edit_first_name :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :last-edited-by
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-test-3
  (testing "Sorting by model"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:model_ranking :asc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :model
                                                 :sort-direction :asc
                                                 :official-collections-first? true} :postgres)))))

(deftest ^:parallel children-sort-clause-test-3b
  (testing "Sorting by model"
    (is (= [[:authority_level :asc :nulls-last]
            [:type :asc :nulls-first]
            [:model_ranking :desc]
            [:%lower.name :asc]
            [:id :asc]]
           (api.collection/children-sort-clause {:sort-column :model
                                                 :sort-direction :desc
                                                 :official-collections-first? true} :mysql)))))

(deftest ^:parallel children-sort-clause-description-test
  (testing "Sorting by description"
    (testing "ascending"
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.description :asc :nulls-last]
              [:%lower.name :asc]
              [:id :asc]]
             (api.collection/children-sort-clause {:sort-column :description
                                                   :sort-direction :asc
                                                   :official-collections-first? true} :postgres))))
    (testing "descending"
      (is (= [[:authority_level :asc :nulls-last]
              [:type :asc :nulls-first]
              [:%lower.description :desc :nulls-last]
              [:%lower.name :asc]
              [:id :asc]]
             (api.collection/children-sort-clause {:sort-column :description
                                                   :sort-direction :desc
                                                   :official-collections-first? true} :postgres))))))

(deftest ^:parallel snippet-collection-items-test
  (testing "GET /api/collection/:id/items"
    ;; EE behavior is tested
    ;; by [[metabase-enterprise.snippet-collections.api.native-query-snippet-test/snippet-collection-items-test]]
    (testing "Native query snippets should come back when fetching the items in a Collection in the `:snippets` namespace"
      (testing "Snippets in nested collections should be returned as a flat list on OSS. In OSS Snippet collections are ignored"
        (mt/with-premium-features #{}
          (mt/with-temp [:model/Collection         collection     {:namespace "snippets", :name "My Snippet Collection"}
                         :model/NativeQuerySnippet snippet        {:collection_id (:id collection), :name "My Snippet"}
                         :model/NativeQuerySnippet _archived      {:collection_id (:id collection)
                                                                   :name "Archived Snippet"
                                                                   :archived true}
                         :model/Collection         sub-collection {:namespace "snippets"
                                                                   :name      "Nested Snippet Collection"
                                                                   :location  (collection/location-path collection)}
                         :model/NativeQuerySnippet sub-snippet    {:collection_id (:id sub-collection)
                                                                   :name          "Nested Snippet"}]
            ;; The response may contain snippets from other collections but should at least contain these two.
            (is (set/subset? #{{:id (:id snippet), :name "My Snippet"}
                               {:id (:id sub-snippet), :name "Nested Snippet"}}
                             (into #{}
                                   (map #(select-keys % [:id :name]))
                                   (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (:id collection)))))))))))))

;;; --------------------------------- Fetching Personal Collections (Ours & Others') ---------------------------------

(defn- lucky-personal-collection []
  (merge
   (mt/object-defaults :model/Collection)
   {:slug                "lucky_pigeon_s_personal_collection"
    :can_restore         false
    :can_delete          false
    :can_write           true
    :name                "Lucky Pigeon's Personal Collection"
    :personal_owner_id   (mt/user->id :lucky)
    :effective_ancestors [{:metabase.collections.models.collection.root/is-root? true
                           :name                                     "Our analytics"
                           :id                                       "root"
                           :authority_level                          nil
                           :can_write                                true
                           :is_remote_synced false
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
  (mt/with-temp [:model/Collection _ {:name     "Lucky's Personal Sub-Collection"
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
    (with-collection-hierarchy! [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (partial= (map collection-item ["B" "C"])
                      (api-get-collection-children a)))))))

(deftest effective-ancestors-and-children-second-level-collection-test
  (testing "does a second-level Collection have its parent and its children?"
    (with-collection-hierarchy! [a b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (partial= (map collection-item ["D" "G"])
                      (api-get-collection-children c)))))))

(deftest effective-ancestors-and-children-third-level-collection-test
  (testing "Does a third-level Collection? have its parent and its children?"
    (with-collection-hierarchy! [a b c d g]
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
    (with-collection-hierarchy! [a b d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d))))))
  (testing "for D: If, on the other hand, we remove A, we should see C as the only ancestor and as a root-level Collection."
    (with-collection-hierarchy! [b c d g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "C", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/C/"}
               (api-get-collection-ancestors d))))
      (testing "children"
        (is (= []
               (api-get-collection-children d)))))))

(deftest effective-ancestors-and-children-of-c-test
  (testing "for C: if we remove D we should get E and F as effective children"
    (with-collection-hierarchy! [a b c e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors [{:name "A", :type nil, :id true, :can_write false, :personal_owner_id nil}]
                :effective_location  "/A/"}
               (api-get-collection-ancestors c))))
      (testing "children"
        (is (partial= (map collection-item ["E" "F"])
                      (api-get-collection-children c)))))))

(deftest effective-ancestors-and-children-collapse-multiple-generations-test
  (testing "Make sure we can collapse multiple generations. For A: removing C and D should move up E and F"
    (with-collection-hierarchy! [a b e f g]
      (testing "ancestors"
        (is (= {:effective_ancestors []
                :effective_location  "/"}
               (api-get-collection-ancestors a))))
      (testing "children"
        (is (partial= (map collection-item ["B" "E" "F"])
                      (api-get-collection-children a)))))))

(deftest effective-ancestors-and-children-archived-test
  (testing "Let's make sure the 'archived` option works on Collections, nested or not"
    (with-collection-hierarchy! [a b c]
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
          root-collection (t2/select-one :model/Collection :personal_owner_id root-owner-id)]
      (mt/with-temp [:model/Collection collection {:name     "Som Test Child Collection"
                                                   :location (collection/location-path root-collection)}]
        (is (= [{:metabase.collections.models.collection.root/is-root? true,
                 :authority_level                          nil,
                 :name                                     "Our analytics",
                 :id                                       false,
                 :can_write                                true
                 :is_remote_synced false
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
              :is_remote_synced false
              :can_delete          false}
             (with-some-children-of-collection! nil
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
                    (with-some-children-of-collection! nil
                      (-> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                          (remove-non-test-items &ids)
                          remove-non-personal-collections
                          mt/boolean-ids-and-timestamps)))))))

(deftest collection-root-items-library-test
  (testing "GET /api/collection/root/items"
    (without-library
     (let [_ (collection/create-library-collection!)]
       (testing "By default it does not include library items"
         (let [response (mt/user-http-request :rasta :get 200 "collection/root/items")
               all-types (map :type (:data response))]
           (is (not-any? #{collection/library-collection-type} all-types))))
       (testing "Can choose to include include library items"
         (let [response (mt/user-http-request :rasta :get 200 "collection/root/items" :include_library true)
               all-types (map :type (:data response))]
           (is (some #{collection/library-collection-type} all-types))))))))

(deftest dashboard-question-candidates-simple-test
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Card is in single dashboard"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= #{card-id}
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))
        (is (= #{:id :name :description :sole_dashboard_info}
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    first
                    keys
                    (into #{}))))
        (is (= #{:id :name :description}
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    first
                    :sole_dashboard_info
                    keys
                    (into #{}))))))))

(deftest dashboard-question-candidates-can-be-paginated
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}

                   :model/Card {card-1-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-1-id}

                   :model/Card {card-2-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-2-id}

                   :model/Card {card-3-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-3-id}]
      (let [fetch (fn [& {:keys [limit offset] :or {limit 10 offset 0}}]
                    (let [resp (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates")
                                                     :limit limit :offset offset)]
                      (is (= 3 (:total resp)))
                      (->> resp :data (map :id))))]
        (testing "Selecting everything"
          (is (= [card-3-id card-2-id card-1-id]
                 (fetch))))
        (testing "Selecting the first one"
          (is (= [card-3-id]
                 (fetch :limit 1))))
        (testing "The second two"
          (is (= [card-2-id card-1-id]
                 (fetch :limit 2 :offset 1))))
        (testing "The first two"
          (is (= [card-3-id card-2-id]
                 (fetch :limit 2 :offset 0))))
        (testing "Only limit, no offset"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates")
                                                     :limit 2)]
            (is (= [card-3-id card-2-id]
                   (map :id data)))))
        (testing "Only offset, no limit"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates")
                                                     :offset 1)]
            (is (= [card-2-id card-1-id]
                   (map :id data)))))
        (testing "Zero limit"
          (is (= [] (fetch :limit 0))))))))

(deftest dashboard-question-candidates-card-is-in-two-dashboards-test
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Card is in two dashboards"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash1-id :id} {:collection_id coll-id}
                     :model/Dashboard {dash2-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card-id}
                     :model/DashboardCard _ {:dashboard_id dash2-id :card_id card-id}]
        (is (= #{}  ; Card should not be automovable when in multiple dashboards
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))))))

(deftest dashboard-question-candidates-card-not-in-any-dashboards-test
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Card is not in any dashboards"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Card _ {:collection_id coll-id}]
        (is (= #{}  ; Card should not be automovable when not in any dashboard
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))))))

(deftest get-dashboard-question-candidates-only-works-for-admins-test
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Non-admin request (using `:rasta` instead of `:crowberto`)"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (str "collection/" coll-id "/dashboard-question-candidates"))))))))

(deftest dashboard-question-candidates-excludes-archived-cards-test
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Card in archived dashboard"
      ;; Note that this should never happen - the card should be archived with the dashboard it's in. But just in case:
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id :archived true}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= #{}
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))))))

(deftest get-dashboard-question-candidates-excludes-cards-in-different-collections-from-dashboard
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Card in different collection from dashboard"
      (mt/with-temp [:model/Collection {coll1-id :id} {}
                     :model/Collection {coll2-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll1-id}
                     :model/Card {card-id :id} {:collection_id coll2-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= #{}  ; Card should not be automovable when in different collection
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll1-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))))))

(deftest get-dashboard-question-candidates-filters-by-collection
  (testing "Multiple cards in collection"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card1-id :id} {:collection_id coll-id}
                   :model/Card _ {:collection_id coll-id}
                   :model/Card _ {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card1-id}]
      (is (= #{card1-id}  ; Only card1 should be automovable
             (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                  :data
                  (map :id)
                  (into #{})))))))

(deftest get-dashboard-question-candidates-nonexistent-collection
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Returns 404 for non-existent collection"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "collection/99999999/dashboard-question-candidates"))))))

(deftest get-dashboard-question-candidates-excludes-archived-cards
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Archived cards are not included in candidates"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id :archived true}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= #{}  ; Archived card should not be automovable
               (->> (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))
                    :data
                    (map :id)
                    (into #{}))))))))

(deftest get-dashboard-question-candidates-excludes-existing-dashboard-questions
  (testing "GET /api/collection/:id/dashboard-question-candidates"
    (testing "Existing DQs are excluded"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:dashboard_id dash-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (= {:data [] :total 0}
               (mt/user-http-request :crowberto :get 200 (str "collection/" coll-id "/dashboard-question-candidates"))))))))

(deftest get-root-dashboard-question-candidates-single-dashboard-card
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Card is in single dashboard"
      (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id nil :name "Test Card"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (let [response (mt/user-http-request :crowberto :get 200
                                             "collection/root/dashboard-question-candidates")]
          (is (contains? (->> response :data (map :id) set) card-id))
          (is (= #{:id :name :description :sole_dashboard_info}
                 (->> response
                      :data
                      (filter #(= (:id %) card-id))
                      first
                      keys
                      set)))
          (is (= #{:id :name :description}
                 (->> response
                      :data
                      (filter #(= (:id %) card-id))
                      first
                      :sole_dashboard_info
                      keys
                      set))))))))

(deftest get-root-dashboard-question-candidates-multi-dashboard-card
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Card is in two dashboards"
      (mt/with-temp [:model/Dashboard {dash1-id :id} {:collection_id nil}
                     :model/Dashboard {dash2-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id nil :name "Multi-Dashboard Card"}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card-id}
                     :model/DashboardCard _ {:dashboard_id dash2-id :card_id card-id}]
        (is (not (contains? (->> (mt/user-http-request :crowberto :get 200
                                                       "collection/root/dashboard-question-candidates")
                                 :data
                                 (map :id)
                                 set)
                            card-id)))))))

(deftest get-root-dashboard-question-candidates-no-dashboard-card
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Card is not in any dashboards"
      (mt/with-temp [:model/Card {card-id :id} {:collection_id nil :name "No Dashboard Card"}]
        (is (not (contains? (->> (mt/user-http-request :crowberto :get 200
                                                       "collection/root/dashboard-question-candidates")
                                 :data
                                 (map :id)
                                 set)
                            card-id)))))))

(deftest get-root-dashboard-question-candidates-non-admin
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Non-admin request (using `:rasta` instead of `:crowberto`)"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "collection/root/dashboard-question-candidates"))))))

(deftest get-root-dashboard-question-candidates-archived-dashboard
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Card in archived dashboard"
      (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil :archived true}
                     :model/Card {card-id :id} {:collection_id nil :name "Archived Dashboard Card"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (not (contains? (->> (mt/user-http-request :crowberto :get 200
                                                       "collection/root/dashboard-question-candidates")
                                 :data
                                 (map :id)
                                 set)
                            card-id)))))))

(deftest get-root-dashboard-question-candidates-different-collection
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Card in different collection from dashboard"
      (mt/with-temp [:model/Collection {other-coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id other-coll-id :name "Different Collection Card"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (not (contains? (->> (mt/user-http-request :crowberto :get 200
                                                       "collection/root/dashboard-question-candidates")
                                 :data
                                 (map :id)
                                 set)
                            card-id)))))))

(deftest get-root-dashboard-question-candidates-multiple-cards
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Multiple cards in collection"
      (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card1-id :id} {:collection_id nil :name "Dashboard Card"}
                     :model/Card {card2-id :id} {:collection_id nil :name "Other Card 1"}
                     :model/Card {card3-id :id} {:collection_id nil :name "Other Card 2"}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card1-id}]
        (let [response-ids (->> (mt/user-http-request :crowberto :get 200
                                                      "collection/root/dashboard-question-candidates")
                                :data
                                (map :id)
                                set)]
          (is (contains? response-ids card1-id))
          (is (not (contains? response-ids card2-id)))
          (is (not (contains? response-ids card3-id))))))))

(deftest get-root-dashboard-question-candidates-nonexistent
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Non-existent collection"
      (is (= "Not found."
             (mt/user-http-request :crowberto :get 404 "collection/99999999/dashboard-question-candidates"))))))

(deftest get-root-dashboard-question-candidates-archived-card
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (testing "Archived card"
      (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id nil :name "Archived Card" :archived true}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (not (contains? (->> (mt/user-http-request :crowberto :get 200
                                                       "collection/root/dashboard-question-candidates")
                                 :data
                                 (map :id)
                                 set)
                            card-id)))))))

(deftest root-dashboard-question-candidates-can-be-paginated
  (testing "GET /api/collection/root/dashboard-question-candidates"
    (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil}

                   :model/Card {card-1-id :id} {:collection_id nil}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-1-id}

                   :model/Card {card-2-id :id} {:collection_id nil}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-2-id}

                   :model/Card {card-3-id :id} {:collection_id nil}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card-3-id}]
      (let [fetch (fn [& {:keys [limit offset] :or {limit 10 offset 0}}]
                    (let [resp (mt/user-http-request :crowberto :get 200 "collection/root/dashboard-question-candidates"
                                                     :limit limit :offset offset)]
                      (is (>= (:total resp) 3))
                      (->> resp :data (map :id))))]
        (testing "Selecting everything"
          (is (set/subset? #{card-3-id card-2-id card-1-id}
                           (set (fetch)))))
        (testing "Selecting the first one"
          (is (= [card-3-id]
                 (fetch :limit 1))))
        (testing "The second two"
          (is (= [card-2-id card-1-id]
                 (fetch :limit 2 :offset 1))))
        (testing "The first two"
          (is (= [card-3-id card-2-id]
                 (fetch :limit 2 :offset 0))))
        (testing "Only limit, no offset"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "collection/root/dashboard-question-candidates"
                                                     :limit 2)]
            (is (= [card-3-id card-2-id]
                   (map :id data)))))
        (testing "Only offset, no limit"
          (let [{:keys [data]} (mt/user-http-request :crowberto :get 200 "collection/root/dashboard-question-candidates"
                                                     :offset 1)]
            (is (set/subset? #{card-2-id card-1-id}
                             (into #{} (map :id) data)))))
        (testing "Zero limit"
          (is (= [] (fetch :limit 0))))))))

(deftest ^:parallel post-move-dashboard-question-candidates-success
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Successfully move card to dashboard"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id :dataset_query (mt/mbql-query venues)}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (is (nil? (t2/select-one-fn :dashboard_id :model/Card card-id)))
        (mt/user-http-request :crowberto :post 200 (format "collection/%d/move-dashboard-question-candidates" coll-id))
        (is (= dash-id (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest ^:parallel post-move-dashboard-question-candidates-root-collection
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Move card from root collection"
      (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id nil}
                     :model/Card {card-id :id} {:collection_id nil :dataset_query (mt/mbql-query venues)}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (mt/user-http-request :crowberto :post 200 "collection/root/move-dashboard-question-candidates")
        (is (= dash-id (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest ^:parallel post-move-dashboard-question-candidates-non-admin
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Non-admin request (using `:rasta` instead of `:crowberto`)"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (format "collection/%d/move-dashboard-question-candidates" coll-id))))))))

(deftest ^:parallel post-move-dashboard-question-candidates-multiple-dashboards
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Card in multiple dashboards should not be moved"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash1-id :id} {:collection_id coll-id}
                     :model/Dashboard {dash2-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id :dataset_query (mt/mbql-query venues)}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card-id}
                     :model/DashboardCard _ {:dashboard_id dash2-id :card_id card-id}]
        (mt/user-http-request :crowberto :post 200 (format "collection/%d/move-dashboard-question-candidates" coll-id))
        (is (nil? (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest post-move-dashboard-question-candidates-nonexistent
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Non-existent collection"
      (is (= "Not found."
             (mt/user-http-request :crowberto :post 404 "collection/99999999/move-dashboard-question-candidates"))))))

(deftest post-move-dashboard-question-candidates-archived-card
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Archived card should not be moved"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id}
                     :model/Card {card-id :id} {:collection_id coll-id :archived true}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (mt/user-http-request :crowberto :post 200 (format "collection/%d/move-dashboard-question-candidates" coll-id))
        (is (nil? (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest post-move-dashboard-question-candidates-archived-dashboard
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Card in archived dashboard should not be moved"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll-id :archived true}
                     :model/Card {card-id :id} {:collection_id coll-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (mt/user-http-request :crowberto :post 200 (format "collection/%d/move-dashboard-question-candidates" coll-id))
        (is (nil? (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest post-move-dashboard-question-candidates-different-collection
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "Card in different collection from dashboard should not be moved"
      (mt/with-temp [:model/Collection {coll1-id :id} {}
                     :model/Collection {coll2-id :id} {}
                     :model/Dashboard {dash-id :id} {:collection_id coll1-id}
                     :model/Card {card-id :id} {:collection_id coll2-id}
                     :model/DashboardCard _ {:dashboard_id dash-id :card_id card-id}]
        (mt/user-http-request :crowberto :post 200 (format "collection/%d/move-dashboard-question-candidates" coll2-id))
        (is (nil? (t2/select-one-fn :dashboard_id :model/Card card-id)))))))

(deftest post-move-dashboard-question-candidates-specific-cards
  (testing "POST /api/collection/:id/move-dashboard-question-candidates"
    (testing "It's possible to specify a specific set of card_ids to move"
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     :model/Dashboard {dash1-id :id} {:collection_id coll-id}
                     :model/Card {card1-id :id} {:collection_id coll-id :dataset_query (mt/mbql-query venues)}
                     :model/Card {card2-id :id} {:collection_id coll-id :dataset_query (mt/mbql-query checkins)}
                     :model/Card {card3-id :id} {:collection_id coll-id :dataset_query (mt/mbql-query venues)}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card1-id}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card2-id}
                     :model/DashboardCard _ {:dashboard_id dash1-id :card_id card3-id}]
        (testing "initially no cards should have dashboard_id set"
          (is (nil? (t2/select-one-fn :dashboard_id :model/Card card1-id)))
          (is (nil? (t2/select-one-fn :dashboard_id :model/Card card2-id)))
          (is (nil? (t2/select-one-fn :dashboard_id :model/Card card3-id))))

        (testing "move only card1 and card2"
          (mt/user-http-request :crowberto :post 200
                                (format "collection/%d/move-dashboard-question-candidates" coll-id)
                                {:card_ids #{card1-id card2-id}}))

        (testing "verify only specified cards were moved"
          (is (= dash1-id (t2/select-one-fn :dashboard_id :model/Card card1-id)))
          (is (= dash1-id (t2/select-one-fn :dashboard_id :model/Card card2-id)))
          (is (nil? (t2/select-one-fn :dashboard_id :model/Card card3-id))))))))

(deftest move-dashboard-question-candidates-is-atomic-test
  (testing "POST /api/collection/:id/move-dashboard-question-candidates is atomic"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Dashboard {dash-id :id} {:collection_id coll-id}
                   :model/Card {card1-id :id} {:collection_id coll-id}
                   :model/Card {card2-id :id} {:collection_id coll-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card1-id}
                   :model/DashboardCard _ {:dashboard_id dash-id :card_id card2-id}]
      ;; Initially no cards should have dashboard_id set
      (is (nil? (t2/select-one-fn :dashboard_id :model/Card card1-id)))
      (is (nil? (t2/select-one-fn :dashboard_id :model/Card card2-id)))

      ;; Mock card/update-card! to fail on the second call
      (mt/with-dynamic-fn-redefs [card/update-card!
                                  (let [call-count (atom 0)]
                                    (fn [& args]
                                      (swap! call-count inc)
                                      (when (= @call-count 2)
                                        (throw (ex-info "Simulated failure" {})))
                                      (apply (mt/dynamic-value card/update-card!) args)))]
        (mt/user-http-request :crowberto :post 500
                              (format "collection/%d/move-dashboard-question-candidates" coll-id)))

      ;; Verify neither card was moved (operation rolled back)
      (is (nil? (t2/select-one-fn :dashboard_id :model/Card card1-id)))
      (is (nil? (t2/select-one-fn :dashboard_id :model/Card card2-id))))))

(deftest ^:synchronized fetch-root-items-limit-and-offset-test
  (testing "GET /api/collection/root/items"
    (with-some-children-of-collection! nil
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
      (with-some-children-of-collection! nil
        ;; `:total` should be at least 4 items based on `with-some-children-of-collection`. Might be a bit more if
        ;; other stuff was created
        (is (=? {:total #(>= % 4)}
                (mt/user-http-request :crowberto :get 200 "collection/root/items" :limit "2" :offset "1")))))))

(deftest fetch-root-items-permissions-test
  (testing "GET /api/collection/root/items"
    (testing "we don't let you see stuff you wouldn't otherwise be allowed to see"
      (is (= []
             ;; if a User doesn't have perms for the Root Collection then they don't get to see things with no
             ;; collection_id
             (with-some-children-of-collection! nil
               (-> (:data (mt/user-http-request :rasta :get 200 "collection/root/items"))
                   remove-non-personal-collections
                   mt/boolean-ids-and-timestamps)))))))

(deftest fetch-root-items-permissions-test-2
  (testing "GET /api/collection/root/items"
    (testing "we don't let you see stuff you wouldn't otherwise be allowed to see"
      (testing "...but if they have read perms for the Root Collection they should get to see them"
        (with-some-children-of-collection! nil
          (mt/with-temp [:model/PermissionsGroup           group {}
                         :model/PermissionsGroupMembership _     {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-permissions! group (perms/collection-read-path {:metabase.collections.models.collection.root/is-root? true}))
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
        (mt/with-temp [:model/Collection _ {:name     "Lucky's Sub-Collection"
                                            :location (collection/children-location
                                                       (collection/user->personal-collection (mt/user->id :lucky)))}]
          (is (= []
                 (->> (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))
                      (filter #(str/includes? (:name %) "Personal Collection"))))))))))

(deftest ^:parallel fetch-root-items-archived-test
  (testing "GET /api/collection/root/items"
    (testing "Can we look for `archived` stuff with this endpoint?"
      (mt/with-temp [:model/Card card {:name "Business Card", :archived true}]
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

(deftest ^:parallel fetch-root-items-fully-parameterized-can-be-false-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized of a card can be false"
      (mt/with-temp [:model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:template-tags {:param0 {:type         :number
                                                                                           :display-name "Param 0"
                                                                                           :default      0}
                                                                                  :param1 {:type         :number
                                                                                           :display-name "Param 1"
                                                                                           :required     false}
                                                                                  :param2 {:type         :number
                                                                                           :display-name "Param 2"
                                                                                           :required     false}}
                                                                  :query         "select {{param0}}, {{param1}} [[ , {{param2}} ]]"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized false}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-field-filter-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized is false even if a required field-filter parameter has no default"
      (mt/with-temp [:model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:template-tags {:param0 {:type         :number
                                                                                           :display-name "Param 0"
                                                                                           :default      0}
                                                                                  :param1 {:type         "dimension"
                                                                                           :display-name "Param 1"
                                                                                           :required     true
                                                                                           :dimension    [:field 1 nil]}}
                                                                  :query         "select {{param0}}, {{param1}}"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized false}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-optional-required-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized is false even if an optional required parameter has no default"
      (mt/with-temp [:model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:template-tags {:param0 {:type         :number
                                                                                           :display-name "Param 0"
                                                                                           :default      0}
                                                                                  :param1 {:type         :number
                                                                                           :display-name "Param 1"
                                                                                           :required     true}}
                                                                  :query         "select {{param0}}, [[ , {{param1}} ]]"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized false}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-parsing-exception-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized is true if invalid parameter syntax causes a parsing exception to be thrown"
      (mt/with-temp [:model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:query "select [[]]"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized true}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-all-defaults-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized is true if all obligatory parameters have defaults"
      (mt/with-temp [:model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:template-tags {:param0 {:type         :number
                                                                                           :display-name "Param 0"
                                                                                           :required     false
                                                                                           :default      0}
                                                                                  :param1 {:type         :number
                                                                                           :display-name "Param 1"
                                                                                           :required     true
                                                                                           :default      1}
                                                                                  :param2 {:type         :number
                                                                                           :display-name "Param 2"}
                                                                                  :param3 {:type         "dimension"
                                                                                           :dimension    [:field (mt/id :venues :id) nil]
                                                                                           :display-name "Param 3"}}
                                                                  :query         "select {{param0}}, {{param1}} [[ , {{param2}} ]] from t {{param3}}"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized true}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-snippet-test
  (testing "GET /api/collection/root/items"
    (testing "fully_parameterized using a snippet without parameters is true"
      (mt/with-temp [:model/NativeQuerySnippet snippet {:content    "table"
                                                        :creator_id (mt/user->id :crowberto)
                                                        :name       "snippet"}
                     :model/Card card {:name          "Business Card"
                                       :dataset_query {:database (mt/id)
                                                       :type     :native
                                                       :native   {:template-tags {:param0  {:type         :number
                                                                                            :display-name "Param 0"
                                                                                            :required     false
                                                                                            :default      0}
                                                                                  :snippet {:name         "snippet"
                                                                                            :display-name "Snippet"
                                                                                            :type         :snippet
                                                                                            :snippet-name "snippet"
                                                                                            :snippet-id   (:id snippet)}}
                                                                  :query         "select {{param0}} from {{snippet}}"}}}]
        (is (partial= [{:name               "Business Card"
                        :entity_id          (:entity_id card)
                        :model              "card"
                        :fully_parameterized true}]
                      (-> (mt/user-http-request :crowberto :get 200 "collection/root/items")
                          :data
                          (results-matching {:name "Business Card", :model "card"}))))))))

(deftest ^:parallel fetch-root-items-fully-parameterized-card-reference-test
  (testing "GET /api/collection/root/items"
    (testing "a card with only a reference to another card is considered fully parameterized (#25022)"
      (mt/with-temp [:model/Card card-1 {:dataset_query (mt/mbql-query venues)}]
        (let [card-tag (format "#%d" (u/the-id card-1))]
          (mt/with-temp [:model/Card card-2 {:name "Business Card"
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

(deftest fetch-root-items-collection-type-filter-test
  (testing "GET /api/collection/root/items"
    (testing "collection_type parameter filters collections to only those with matching type"
      (testing "collection_type=remote-synced returns only remote-synced collections"
        (mt/with-temp [:model/Collection _ {:name "Normal Collection"}
                       :model/Collection _ {:name "Remote Synced Collection"
                                            :is_remote_synced true}
                       :model/Collection _ {:name "Another Remote Collection"
                                            :is_remote_synced true}
                       :model/Collection _ {:name "Second Normal Collection"}]
          (let [response (mt/user-http-request :crowberto :get 200 "collection/root/items"
                                               :collection_type "remote-synced")
                collections (->> (:data response)
                                 (filter #(= (:model %) "collection")))
                collection-names (set (map :name collections))]
            (testing "should include remote-synced collections"
              (is (contains? collection-names "Remote Synced Collection"))
              (is (contains? collection-names "Another Remote Collection")))
            (testing "should not include normal collections"
              (is (not (contains? collection-names "Normal Collection")))
              (is (not (contains? collection-names "Second Normal Collection"))))
            (testing "should include is_remote_synced field in response"
              (doseq [coll collections]
                (is (true? (:is_remote_synced coll))
                    (str "Collection " (:name coll) " should have is_remote_synced=true")))))))
      (testing "without collection_type parameter, all collections are returned"
        (mt/with-temp [:model/Collection _ {:name "Normal Collection Test"}
                       :model/Collection _ {:name "Remote Synced Collection Test"
                                            :is_remote_synced true}]
          (let [response (mt/user-http-request :crowberto :get 200 "collection/root/items")
                collection-names (->> (:data response)
                                      (filter #(= (:model %) "collection"))
                                      (map :name)
                                      set)]
            (testing "should include both normal and remote-synced collections"
              (is (contains? collection-names "Normal Collection Test"))
              (is (contains? collection-names "Remote Synced Collection Test")))))))))

(deftest fetch-root-items-shared-tenant-collection-namespace-test
  (testing "GET /api/collection/root/items"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (testing "collections with namespace 'shared-tenant-collection' at root are returned when namespace parameter is set"
          (mt/with-temp [:model/Collection {normal-id :id} {:name "Normal Root Collection"
                                                            :location "/"}
                         :model/Collection {tenant-id :id} {:name "Shared Tenant Collection"
                                                            :location "/"
                                                            :namespace "shared-tenant-collection"}]
            (letfn [(collection-names [items]
                      (->> (:data items)
                           (filter #(and (= (:model %) "collection")
                                         (#{normal-id tenant-id} (:id %))))
                           (map :name)))]
              (mt/with-temporary-setting-values [use-tenants true]
                (testing "should only show collections in the default namespace by default"
                  (is (= ["Normal Root Collection"]
                         (collection-names (mt/user-http-request :crowberto :get 200 "collection/root/items")))))
                (testing "should show shared-tenant-collection namespace when requested"
                  (is (= ["Shared Tenant Collection"]
                         (collection-names (mt/user-http-request :crowberto :get 200 "collection/root/items?namespace=shared-tenant-collection"))))))
              (mt/with-temporary-setting-values [use-tenants false]
                (testing "should not show shared tenant collection when setting is off"
                  (is (empty?
                       (collection-names (mt/user-http-request :crowberto :get 200 "collection/root/items?namespace=shared-tenant-collection")))))))))))))

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
      (with-collection-hierarchy! [a b c d e f g]
        (testing "children"
          (is (partial= (map collection-item ["A"])
                        (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "...and collapsing children should work for the Root Collection as well"
      (with-collection-hierarchy! [b d e f g]
        (testing "children"
          (is (partial= (map collection-item ["B" "D" "F"])
                        (remove-non-test-collections (api-get-root-collection-children)))))))

    (testing "does `archived` work on Collections as well?"
      (with-collection-hierarchy! [a b d e f g]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id a))
                              {:archived true})
        (is (= [] (remove-non-test-collections (api-get-root-collection-children)))))
      (with-collection-hierarchy! [a b d e f g]
        (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id a))
                              {:archived true})
        (is (= [] (remove-non-test-collections (api-get-root-collection-children))))))

    (testing "\n?namespace= parameter"
      (mt/with-temp [:model/Collection {normal-id :id} {:name "Normal Collection"}
                     :model/Collection {coins-id :id}  {:name "Coin Collection", :namespace "currency"}]
        (perms/grant-collection-read-permissions! (perms/all-users-group) coins-id)
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
      (mt/with-temp [:model/NativeQuerySnippet snippet   {:name "My Snippet", :entity_id nil}
                     :model/NativeQuerySnippet snippet-2 {:name "My Snippet 2", :entity_id nil}
                     :model/NativeQuerySnippet archived  {:name "Archived Snippet", :archived true, :entity_id nil}
                     :model/Dashboard          dashboard {:name "My Dashboard", :entity_id nil}]
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
      (mt/with-model-cleanup [:model/Collection]
        (is (partial= (merge
                       (mt/object-defaults :model/Collection)
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
      (mt/with-model-cleanup [:model/Collection]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/PermissionsGroup           group {}
                         :model/PermissionsGroupMembership _     {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-collection-readwrite-permissions! group collection/root-collection)
            (is (partial= (merge
                           (mt/object-defaults :model/Collection)
                           {:name     "Stamp Collection"
                            :location "/"
                            :slug     "stamp_collection"})
                          (dissoc (mt/user-http-request :rasta :post 200 "collection"
                                                        {:name "Stamp Collection"})
                                  :id :entity_id)))))))))

(deftest create-child-collection-test
  (testing "POST /api/collection"
    (testing "\nCan I create a Collection as a child of an existing collection?"
      (mt/with-model-cleanup [:model/Collection]
        (with-collection-hierarchy! [a c d]
          (is (partial= (merge
                         (mt/object-defaults :model/Collection)
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
                                         :description "My SQL Snippets"
                                         :namespace  "snippets"})))
          (finally
            (t2/delete! :model/Collection :name collection-name)))))))

(deftest create-child-collection-namespace-inheritance-test
  (testing "POST /api/collection"
    (testing "Child collection should inherit namespace from parent when namespace not provided"
      (mt/with-model-cleanup [:model/Collection]
        (let [;; Create a parent collection with snippets namespace
              parent-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                      {:name "Parent Snippets Collection"
                                                       :namespace "snippets"})
              parent-id (:id parent-collection)
              ;; Create child collection without specifying namespace
              child-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                     {:name "Child Collection"
                                                      :parent_id parent-id})]
          (is (= "snippets" (:namespace child-collection))
              "Child collection should inherit namespace from parent"))))))

(deftest create-child-collection-explicit-namespace-works-test
  (testing "POST /api/collection"
    (testing "Child collection should use explicit namespace when provided (even if nil)"
      (mt/with-model-cleanup [:model/Collection]
        (let [parent-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                      {:name "Parent Snippets Collection"
                                                       :namespace "snippets"})
              parent-id (:id parent-collection)]
          (is (partial= {:namespace "snippets"}
                        (mt/user-http-request :crowberto :post 200 "collection"
                                              {:name "Child Collection"
                                               :parent_id parent-id
                                               :namespace "snippets"}))
              "Child collection uses the same namespace as parent"))))))

(deftest create-child-collection-explicit-namespace-fails-test
  (testing "POST /api/collection"
    (testing "Child collection should use explicit namespace when provided (unless nil)"
      (mt/with-model-cleanup [:model/Collection]
        (let [;; Create a parent collection with snippets namespace
              parent-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                      {:name "Parent Snippets Collection"
                                                       :namespace "snippets"})
              parent-id (:id parent-collection)]
          (is (= {:errors {:location "Collection must be in the same namespace as its parent"}}
                 (mt/user-http-request :crowberto :post 400 "collection"
                                       {:name "Child Collection"
                                        :parent_id parent-id
                                        :namespace "not-snippets"}))
              "Child namespace validation is still enforced"))))))

(deftest create-root-collection-namespace-test
  (testing "POST /api/collection"
    (testing "Root collection should use provided namespace or default to nil"
      (mt/with-model-cleanup [:model/Collection]
        (let [;; Create root collection without specifying namespace
              root-collection-no-ns (mt/user-http-request :crowberto :post 200 "collection"
                                                          {:name "Root Collection No NS"})
              ;; Create root collection with explicit namespace
              root-collection-with-ns (mt/user-http-request :crowberto :post 200 "collection"
                                                            {:name "Root Collection With NS"
                                                             :namespace "snippets"})]
          (is (nil? (:namespace root-collection-no-ns))
              "Root collection without parent should have nil namespace when not specified")
          (is (= "snippets" (:namespace root-collection-with-ns))
              "Root collection should use explicitly provided namespace"))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            PUT /api/collection/:id                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest update-collection-test
  (testing "PUT /api/collection/:id"
    (testing "test that we can update a collection"
      (mt/with-temp [:model/Collection collection]
        (is (partial= (merge
                       (mt/object-defaults :model/Collection)
                       {:id              (u/the-id collection)
                        :name            "My Beautiful Collection"
                        :slug            "my_beautiful_collection"
                        :entity_id       (:entity_id collection)
                        :location        "/"
                        :effective_ancestors [{:metabase.collections.models.collection.root/is-root? true
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
        (mt/with-temp [:model/Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:name "My Beautiful Collection"}))))))))

(deftest archive-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Archiving a collection should delete any alerts associated with questions in the collection"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (notification.tu/with-channel-fixtures [:channel/email]
          (api.notification-test/with-send-messages-sync!
            (notification.tu/with-card-notification
              [notification {:card     {:name "YOLO"
                                        :collection_id coll-id}
                             :handlers [{:channel_type :channel/email
                                         :recipients  [{:type    :notification-recipient/user
                                                        :user_id (mt/user->id :crowberto)}
                                                       {:type    :notification-recipient/user
                                                        :user_id (mt/user->id :rasta)}
                                                       {:type    :notification-recipient/raw-value
                                                        :details {:value "ngoc@metabase.com"}}]}]}]
              (let [[email] (notification.tu/with-mock-inbox-email!
                              (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id)
                                                    {:name "My Beautiful Collection", :archived true}))]
                (is (=? {:bcc     #{"rasta@metabase.com" "crowberto@metabase.com" "ngoc@metabase.com"}
                         :subject "One of your alerts has stopped working"
                         :body    [{"the question was archived by Crowberto Corv" true}]}
                        (mt/summarize-multipart-single-email email #"the question was archived by Crowberto Corv"))))
              (= nil (t2/select-one :model/Notification :id (:id notification))))))))))

(deftest archive-collection-perms-test
  (testing "PUT /api/collection/:id"
    (testing "I shouldn't be allowed to archive a Collection without proper perms"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection))
                                       {:archived true})))))

      (testing "Perms checking should be recursive as well..."
        ;; Create Collections A > B, and grant permissions for A. You should not be allowed to archive A because you
        ;; would also need perms for B
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/Collection collection-a  {}
                         :model/Collection _collection-b {:location (collection/children-location collection-a)}]
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:archived true})))))))))

(deftest archive-collection-with-archived-descendants-test
  (testing "PUT /api/collection/:id"
    (testing "I should be allowed to archive a collection if I have perms on it and all non-archived descendants"
      ;; Create hierarchy A > B > C where C is already archived
      ;; Grant perms for A and B only
      ;; User should be able to archive A because C (which they don't have perms on) is archived
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection-a {}
                       :model/Collection collection-b {:location (collection/children-location collection-a)}
                       :model/Collection _collection-c {:location (collection/children-location collection-b)
                                                        :archived true}]
          (doseq [collection [collection-a collection-b]]
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
          ;; This should succeed because C is archived and excluded from permission checks
          (is (some? (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id collection-a))
                                           {:archived true}))))))))

(deftest move-collection-test
  (testing "PUT /api/collection/:id"
    (testing "Can I *change* the `location` of a Collection? (i.e. move it into a different parent Collection)"
      (with-collection-hierarchy! [a b e]
        (is (partial= (merge
                       (mt/object-defaults :model/Collection)
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
          (mt/with-temp [:model/Collection collection-a {}
                         :model/Collection collection-b {}]
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection-a)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                         {:parent_id (u/the-id collection-b)}))))))

      (testing "Perms checking should be recursive as well..."
        (testing "Create A, B, and C; B is a child of A."
          (testing "Grant perms for A and B. Moving A into C should fail because we need perms for C"
            ;; (collections with readwrite perms marked below with a `*`)
            ;; A* -> B* ==> C -> A -> B
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Collection collection-a {}
                             :model/Collection collection-b {:location (collection/children-location collection-a)}
                             :model/Collection collection-c {}]
                (doseq [collection [collection-a collection-b]]
                  (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for A and C. Moving A into C should fail because we need perms for B."
            ;; A* -> B  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Collection collection-a  {}
                             :model/Collection _collection-b {:location (collection/children-location collection-a)}
                             :model/Collection collection-c  {}]
                (doseq [collection [collection-a collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)}))))))

          (testing "Grant perms for B and C. Moving A into C should fail because we need perms for A"
            ;; A -> B*  ==>  C -> A -> B
            ;; C*
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Collection collection-a {}
                             :model/Collection collection-b {:location (collection/children-location collection-a)}
                             :model/Collection collection-c {}]
                (doseq [collection [collection-b collection-c]]
                  (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
                (is (= "You don't have permissions to do that."
                       (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id collection-a))
                                             {:parent_id (u/the-id collection-c)})))))))))))

(deftest move-collection-with-archived-descendants-test
  (testing "PUT /api/collection/:id"
    (testing "I should be allowed to move a collection if I have perms on it and all non-archived descendants"
      ;; Create hierarchy A > B > C, plus destination D, where C is already archived
      ;; Grant perms for A, B, and D only
      ;; User should be able to move A into D because C (which they don't have perms on) is archived
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection collection-a {}
                       :model/Collection collection-b {:location (collection/children-location collection-a)}
                       :model/Collection _collection-c {:location (collection/children-location collection-b)
                                                        :archived true}
                       :model/Collection collection-d {}]
          (doseq [collection [collection-a collection-b collection-d]]
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection))
          ;; This should succeed because C is archived and excluded from permission checks
          (is (some? (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id collection-a))
                                           {:parent_id (u/the-id collection-d)}))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            GET /api/collection/graph and PUT /api/collection/graph                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest graph-test
  (mt/with-temp [:model/Collection       {default-a :id}   {:location "/"}
                 :model/Collection       {default-ab :id}  {:location (format "/%d/" default-a)}
                 :model/Collection       {currency-a :id}  {:namespace "currency", :location "/"}
                 :model/Collection       {currency-ab :id} {:namespace "currency", :location (format "/%d/" currency-a)}
                 :model/PermissionsGroup {group-id :id}    {}]
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

        (testing "Should require a `revision` parameter equal to the current graph's revision"
          (is (= (str "Looks like someone else edited the permissions and your data is out of date. "
                      "Please fetch new data and try again.")
                 (mt/user-http-request :crowberto :put 409 "collection/graph"
                                       (-> (graph/graph)
                                           (update :revision dec))))))

        (testing "Should be able to override the need for a `revision` parameter by passing `force=true`"
          (let [response (mt/user-http-request :crowberto :put 200 "collection/graph?force=true"
                                               (-> (graph/graph)
                                                   (assoc :groups {group-id {default-ab :read}})
                                                   (dissoc :revision)))]
            (is (= {"Default A" "read", "Default A -> B" "read"}
                   (nice-graph response)))))

        (testing "have to be a superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "collection/graph"
                                       (assoc (graph/graph)
                                              :groups {group-id {default-a :write, currency-a :write}}
                                              :namespace :currency)))))))))

(deftest graph-excludes-archived-collections-test
  (mt/with-temp [:model/Collection {archived-id :id} {:archived true}
                 :model/Collection {not-archived-id :id} {:archived false}
                 :model/PermissionsGroup {group-id :id}    {}]
    (letfn [(nice-graph [graph]
              (let [id->alias {archived-id     "Archived Collection"
                               not-archived-id "Not Archived Collection"}]
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
      (doseq [collection [archived-id not-archived-id]]
        (perms/grant-collection-read-permissions! group-id collection))
      (testing "GET /api/collection/graph\n"
        (testing "Should be able to fetch the permissions graph for the default namespace"
          (is (= {"Not Archived Collection" "read"}
                 (nice-graph (mt/user-http-request :crowberto :get 200 "collection/graph")))))))))

(deftest cards-and-dashboards-get-can-write
  (mt/with-temp [:model/Collection {collection-id :id :as collection} {}
                 :model/Card _ {:collection_id collection-id}
                 :model/Dashboard _ {:collection_id collection-id}
                 :model/Card _ {:collection_id collection-id
                                :type :model}]

    (testing "`can_write` is `true` when appropriate"
      (perms/revoke-collection-permissions! (perms/all-users-group) collection)
      (perms/grant-collection-readwrite-permissions! (perms/all-users-group) collection)
      (is (= #{[true "card"] [true "dataset"] [true "dashboard"]}
             (into #{} (map (juxt :can_write :model) (:data (mt/user-http-request :rasta :get 200 (str "collection/" collection-id "/items"))))))))

    (testing "and `false` when appropriate"
      (perms/revoke-collection-permissions! (perms/all-users-group) collection)
      (perms/grant-collection-read-permissions! (perms/all-users-group) collection)
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
  (->> (mt/user-http-request :crowberto :get 200 "collection/root/items")
       :data
       (filter #(= (:id %) id))
       first))

(deftest can-restore-dashboard-restorable-test
  (testing "can_restore is correctly populated for dashboard when I can actually restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                   :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id subcollection)}]
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard)) {:archived true})
      (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id dashboard))))))))

(deftest can-restore-dashboard-not-restorable-test
  (testing "can_restore is correctly populated for dashboard when I can't restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                   :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id subcollection)}]
      (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dashboard)) {:archived true})
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
      (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id dashboard))))))))

(deftest can-restore-card-restorable-test
  (testing "can_restore is correctly populated for card when I can actually restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                   :model/Card card {:name "Card" :collection_id (u/the-id subcollection) :dataset_query (mt/mbql-query venues)}]
      (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:archived true})
      (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id card))))))))

(deftest can-restore-card-not-restorable-test
  (testing "can_restore is correctly populated for card when I can't restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}
                   :model/Card card {:name "Card" :collection_id (u/the-id subcollection) :dataset_query (mt/mbql-query venues)}]
      (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:archived true})
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
      (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id card))))))))

(deftest can-restore-collection-restorable-test
  (testing "can_restore is correctly populated for collection when I can actually restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
      (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id subcollection))))))))

(deftest can-restore-collection-not-restorable-parent-archived-test
  (testing "can_restore is correctly populated for collection when I can't restore it because parent archived"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id subcollection)) {:archived true})
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
      (is (false? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id subcollection))))))))

(deftest can-restore-collection-not-restorable-parent-trashed-test
  (testing "can_restore is correctly populated for collection when I can't restore it because its parent was the one that was trashed"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Collection subcollection {:name "sub-A" :location (collection/children-location collection)}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
      (is (false? (:can_restore (get-item-with-id-in-coll (u/the-id collection) (u/the-id subcollection))))))))

(deftest can-restore-collection-from-root-test
  (testing "can_restore is correctly populated for collections trashed from the root collection when I can actually restore it"
    (mt/with-temp [:model/Collection collection {:name "A"}]
      (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection)) {:archived true})
      (is (true? (:can_restore (get-item-with-id-in-coll (collection/trash-collection-id) (u/the-id collection))))))))

(deftest can-restore-items-in-root-collection-test
  (testing "can_restore is correctly populated for things in the root collection"
    (mt/with-temp [:model/Collection collection {:name "A"}
                   :model/Dashboard dashboard {:name "Dashboard"}]
      (is (contains? (get-item-with-id-in-root (u/the-id dashboard)) :can_restore))
      (is (contains? (get-item-with-id-in-root (u/the-id collection)) :can_restore))
      (is (false? (:can_restore (get-item-with-id-in-root (u/the-id dashboard)))))
      (is (false? (:can_restore (get-item-with-id-in-root (u/the-id collection))))))))

(deftest can-restore-items-in-other-collections-test
  (testing "can_restore is correctly populated for things in other collections"
    (mt/with-temp [:model/Collection collection {:name "container"}
                   :model/Dashboard dashboard {:name "Dashboard" :collection_id (u/the-id collection)}]
      (is (contains? (get-item-with-id-in-coll (u/the-id collection) (u/the-id dashboard)) :can_restore))
      (is (false? (:can_restore (get-item-with-id-in-coll (u/the-id collection) (u/the-id dashboard))))))))

(deftest nothing-can-be-moved-to-the-trash
  (mt/with-temp [:model/Dashboard dashboard {}
                 :model/Collection collection {}
                 :model/Card card {}]
    (testing "Collections can't be moved to the trash"
      (mt/user-http-request :crowberto :put 403 (str "collection/" (u/the-id collection)) {:parent_id (collection/trash-collection-id)})
      (is (not (t2/exists? :model/Collection :id (u/the-id collection) :location (collection/trash-path)))))
    (testing "Dashboards can't be moved to the trash"
      (mt/user-http-request :crowberto :put 403 (str "dashboard/" (u/the-id dashboard)) {:collection_id (collection/trash-collection-id)})
      (is (not (t2/exists? :model/Dashboard :collection_id (collection/trash-collection-id)))))
    (testing "Cards can't be moved to the trash"
      (mt/user-http-request :crowberto :put 403 (str "card/" (u/the-id card)) {:collection_id (collection/trash-collection-id)})
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
                                    "collection/graph?skip-graph=true"
                                    {:revision (c-perm-revision/latest-id)
                                     :groups {}}))
      "PUTs with skip_graph should not return the coll permission graph."))

(deftest dashboard-internal-cards-do-not-appear-in-collection-items
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/Card {normal-card-id :id} {:collection_id coll-id}
                 :model/Card {dashboard-question-card-id :id} {:dashboard_id dash-id}]
    (testing "The dashboard appears and the normal card appears, but the dashboard-internal card does not"
      (is (= #{[normal-card-id "card"]
               [dash-id "dashboard"]}
             (set (map (juxt :id :model) (:data (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items"))))))))
    (testing "If I specifically ask to see dashboard questions, they appear"
      (is (= #{[normal-card-id "card"]
               [dashboard-question-card-id "card"]
               [dash-id "dashboard"]}
             (set (map (juxt :id :model)
                       (:data
                        (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items?show_dashboard_questions=true")))))))))
  (mt/with-temp [:model/Collection {parent-id :id :as parent} {}
                 :model/Collection {coll-id :id} {:location (collection/children-location parent)}
                 :model/Dashboard {dash-id :id} {:collection_id coll-id}
                 :model/Card _ {:dashboard_id dash-id}]
    (testing "Here and below are correct (they don't say a collection has a card if it's internal)"
      (is (= ["dashboard"]
             (:here (first (:data (mt/user-http-request :rasta :get 200 (str "collection/" parent-id "/items")))))))
      (testing "unless I ask to show dashboard questions!"
        (is (= ["dashboard" "card"]
               (:here
                (first
                 (:data (mt/user-http-request :rasta :get 200 (str "collection/" parent-id "/items?show_dashboard_questions=true")))))))))))

(deftest dashboard-questions-have-dashboard-hydrated
  (mt/with-temp [:model/Collection {coll-id :id} {}
                 :model/Dashboard {dash-id :id
                                   dash-name :name} {:collection_id coll-id}
                 :model/Card _ {:dashboard_id dash-id}]
    (testing "The card's dashboard details are hydrated"
      (is (= {:name dash-name
              :id dash-id
              :moderation_status nil}
             (->> (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items?show_dashboard_questions=true"))
                  :data
                  (filter #(= (:model %) "card"))
                  first
                  :dashboard))))
    (testing "If there are moderation reviews they're included too"
      (mt/with-temp [:model/ModerationReview _ {:moderated_item_type "dashboard"
                                                :moderated_item_id   dash-id
                                                :status              "verified"
                                                :moderator_id        (mt/user->id :rasta)
                                                :most_recent         true}]
        (is (= {:name dash-name :id dash-id :moderation_status "verified"}
               (->> (mt/user-http-request :rasta :get 200 (str "collection/" coll-id "/items?show_dashboard_questions=true"))
                    :data
                    (filter #(= (:model %) "card"))
                    first
                    :dashboard)))))))

(deftest delete-collection-with-descendants-permissions-test
  (testing "DELETE /api/collection/:id"
    (testing "Deleting a collection with descendants requires proper permissions"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection parent-collection {}
                       :model/Collection child-collection {:location (collection/children-location parent-collection)}
                       :model/Collection grandchild-collection {:location (collection/children-location child-collection)}]

          (testing "Should return 403 if user has no permissions for descendants"
            (perms/revoke-collection-permissions! (perms/all-users-group) parent-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) child-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) grandchild-collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) parent-collection)
            ;; No permissions for child or grandchild
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id parent-collection)) {:archived true}))))

          (testing "Should return 403 if user only has read permissions for descendants"
            (perms/revoke-collection-permissions! (perms/all-users-group) parent-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) child-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) grandchild-collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) parent-collection)
            (perms/grant-collection-read-permissions! (perms/all-users-group) child-collection)
            (perms/grant-collection-read-permissions! (perms/all-users-group) grandchild-collection)
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id parent-collection)) {:archived true}))))

          (testing "Should return 200 if user has read-write permissions for all descendants"
            (perms/revoke-collection-permissions! (perms/all-users-group) parent-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) child-collection)
            (perms/revoke-collection-permissions! (perms/all-users-group) grandchild-collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) parent-collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) child-collection)
            (perms/grant-collection-readwrite-permissions! (perms/all-users-group) grandchild-collection)
            (is (partial= {:archived true}
                          (mt/user-http-request :rasta :put 200 (str "collection/" (u/the-id parent-collection)) {:archived true})))
            ;; Verify the collections were actually archived
            (is (t2/exists? :model/Collection :id (u/the-id parent-collection) :archived true))
            (is (t2/exists? :model/Collection :id (u/the-id child-collection) :archived true))
            (is (t2/exists? :model/Collection :id (u/the-id grandchild-collection) :archived true))))))))

(deftest collections-can-be-deleted
  (mt/with-temp [:model/Collection {coll-a-id :id :as coll-a} {}
                 :model/Dashboard {dash-a-id :id} {:collection_id coll-a-id}
                 :model/Collection {coll-b-id :id :as coll-b} {:location (collection/children-location coll-a)}
                 :model/Dashboard {dash-b-id :id} {:collection_id coll-b-id}
                 :model/Collection {coll-c-id :id :as coll-c} {:location (collection/children-location coll-b)}
                 :model/Dashboard {dash-c-id :id} {:collection_id coll-c-id}
                 :model/Collection {coll-d-id :id :as _coll-d} {:location (collection/children-location coll-c)}]
    ;; archive collection C first, then collection A
    (mt/user-http-request :rasta :put 200 (str "/collection/" coll-c-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" coll-a-id) {:archived true})

    ;; now we have:
    ;; - collection A > B > C
    ;; - but collections A and C appear in the Trash (because they were archived separately)
    (mt/user-http-request :crowberto :delete 200 (str "/collection/" coll-a-id))
    (testing "B was deleted along with A, because it only appeared in the trash under A"
      (is (not (t2/exists? :model/Collection :id coll-b-id))))
    (testing "C was NOT deleted"
      (is (t2/exists? :model/Collection :id coll-c-id)))
    (testing "C was moved to the root collection (a's parent)"
      (is (= "/" (:location (t2/select-one :model/Collection coll-c-id)))))
    (testing "C is still archived"
      (is (:archived (t2/select-one :model/Collection coll-c-id))))
    (testing "Dashboards in A and B were deleted"
      (is (not (t2/exists? :model/Dashboard dash-a-id)))
      (is (not (t2/exists? :model/Dashboard dash-b-id))))
    (testing "Dashboard in C was not deleted"
      (is (t2/exists? :model/Dashboard dash-c-id)))
    (testing "Collection D still exists in C"
      (is (t2/exists? :model/Collection coll-d-id))
      (is (= (str "/" coll-c-id "/")
             (t2/select-one-fn :location :model/Collection coll-d-id))))))

(deftest collection-delete-middle-hoists-survivor
  (mt/with-temp [:model/Collection {a-id :id :as a} {}
                 :model/Collection {b-id :id :as b} {:location (collection/children-location a)}
                 :model/Collection {c-id :id :as _c} {:location (collection/children-location b)}]
    ;; archive c (op1), then archive b (op2), then hard-delete b
    (mt/user-http-request :rasta :put 200 (str "/collection/" c-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" b-id) {:archived true})
    (mt/user-http-request :crowberto :delete 200 (str "/collection/" b-id))
    (testing "b is gone"
      (is (not (t2/exists? :model/Collection :id b-id))))
    (testing "c survives + is still archived"
      (is (t2/exists? :model/Collection :id c-id))
      (is (:archived (t2/select-one :model/Collection c-id))))
    (testing "c hoisted under a"
      (is (= (str "/" a-id "/")
             (:location (t2/select-one :model/Collection c-id)))))))

(deftest collection-deep-prune-multiple-ancestors
  (mt/with-temp [:model/Collection {a-id :id :as a} {}
                 :model/Collection {b-id :id :as b} {:location (collection/children-location a)}
                 :model/Collection {c-id :id :as c} {:location (collection/children-location b)}
                 :model/Collection {d-id :id :as _d} {:location (collection/children-location c)}]
    (mt/user-http-request :rasta :put 200 (str "/collection/" c-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" a-id) {:archived true})
    (mt/user-http-request :crowberto :delete 200 (str "/collection/" a-id))
    (testing "a and b nuked"
      (is (not (t2/exists? :model/Collection :id a-id)))
      (is (not (t2/exists? :model/Collection :id b-id))))
    (testing "c at root"
      (is (= "/" (:location (t2/select-one :model/Collection c-id)))))
    (testing "d still under c"
      (is (= (str "/" c-id "/") (:location (t2/select-one :model/Collection d-id)))))))

(deftest collection-multiple-survivor-subtrees-hoist
  (mt/with-temp
    [:model/Collection {a-id :id :as a} {}
     :model/Collection {b1-id :id :as b1} {:location (collection/children-location a)}
     :model/Collection {b2-id :id :as b2} {:location (collection/children-location a)}
     :model/Collection {c1-id :id} {:location (collection/children-location b1)}
     :model/Collection {c2-id :id} {:location (collection/children-location b2)}]
    (mt/user-http-request :rasta :put 200 (str "/collection/" c1-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" c2-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" a-id) {:archived true})
    (mt/user-http-request :crowberto :delete 200 (str "/collection/" a-id))
    (testing "b branches deleted"
      (is (not (t2/exists? :model/Collection :id b1-id)))
      (is (not (t2/exists? :model/Collection :id b2-id))))
    (testing "c leaves survive, both at root and still archived"
      (doseq [cid [c1-id c2-id]]
        (is (t2/exists? :model/Collection :id cid))
        (is (= "/" (:location (t2/select-one :model/Collection cid))))
        (is (:archived (t2/select-one :model/Collection cid)))))))

(deftest collection-deletion-path-normalization-and-dashboard-cascade
  (mt/with-temp
    [:model/Collection {a-id :id :as a} {}
     :model/Dashboard {da-id :id} {:collection_id a-id}
     :model/Collection {b-id :id :as b} {:location (collection/children-location a)}
     :model/Dashboard {db-id :id} {:collection_id b-id}
     :model/Collection {c-id :id} {:location (collection/children-location b)}
     :model/Dashboard {dc-id :id} {:collection_id c-id}]
    ;; archive c separately so it should survive; archive a; delete a
    (mt/user-http-request :rasta :put 200 (str "/collection/" c-id) {:archived true})
    (mt/user-http-request :rasta :put 200 (str "/collection/" a-id) {:archived true})
    (mt/user-http-request :crowberto :delete 200 (str "/collection/" a-id))
    (testing "no double slashes; root is exactly '/'"
      (is (= "/" (:location (t2/select-one :model/Collection c-id)))))
    (testing "dashboards in deleted nodes gone; dashboard in survivor intact"
      (is (not (t2/exists? :model/Dashboard da-id)))
      (is (not (t2/exists? :model/Dashboard db-id)))
      (is (t2/exists? :model/Dashboard dc-id)))))

(deftest collection-deletion-prohibitions
  (mt/with-temp [:model/Collection {a-id :id} {}]
    (is (= "Collection must be trashed before deletion."
           (mt/user-http-request :crowberto :delete 400 (str "/collection/" a-id)))))
  (mt/with-temp [:model/Collection {a-id :id} {:namespace "flippity" :archived true}]
    (is (= "Collections in non-nil namespaces cannot be deleted."
           (mt/user-http-request :crowberto :delete 400 (str "/collection/" a-id)))))
  (mt/with-temp [:model/Collection {a-id :id} {:archived true}]
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :delete 403 (str "/collection/" a-id))))))

(deftest published-tables-not-in-collection-items-oss-test
  (testing "In OSS (without :data-studio feature), published tables should NOT appear in collection items"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Test Collection"}
                     :model/Card {card-id :id} {:collection_id coll-id :name "Test Card"}
                     :model/Table {table-id :id} {:collection_id coll-id
                                                  :is_published  true
                                                  :name          "Published Table"}]
        (let [items (:data (mt/user-http-request :crowberto :get 200
                                                 (str "collection/" coll-id "/items")))]
          (testing "Card should appear"
            (is (some #(= card-id (:id %)) items)
                "Card should be in collection items"))
          (testing "Published table should NOT appear"
            (is (not (some #(= table-id (:id %)) items))
                "Published table should NOT be in collection items in OSS"))))))
  (testing "In OSS (without :data-studio feature), published tables should NOT appear in root collection items"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Table {table-id :id} {:collection_id nil
                                                  :is_published  true
                                                  :name          "Root Published Table"}]
        (let [items (:data (mt/user-http-request :crowberto :get 200 "collection/root/items"))]
          (is (not (some #(= table-id (:id %)) items))
              "Published table should NOT be in root collection items in OSS"))))))

(deftest unarchive-collection-requires-curate-perms-on-destination-test
  (testing "PUT /api/collection/:id"
    (testing "Unarchiving a collection to a specific destination collection requires curate permissions on the destination"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection archived-collection {:name "Archived"}
                       :model/Collection destination {:name "Destination"}]
          ;; Give user curate permissions on the archived collection
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) archived-collection)
          ;; Revoke all permissions on the destination
          (perms/revoke-collection-permissions! (perms/all-users-group) destination)
          ;; Archive the collection first (as admin)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id archived-collection))
                                {:archived true})
          ;; Attempt to unarchive to destination without curate perms - should fail
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id archived-collection))
                                       {:archived false :parent_id (u/the-id destination)}))))))))

(deftest unarchive-collection-requires-curate-permissions-on-children-test
  (testing "PUT /api/collection/:id"
    (testing "Unarchiving a collection requires curate permissions on its children"
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-temp [:model/Collection archived-collection {:name "Archived"}
                       :model/Collection child-collection {:name "Archived Child" :location (collection/children-location archived-collection)}
                       :model/Collection dest-collection {}]
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) dest-collection)
          (perms/grant-collection-readwrite-permissions! (perms/all-users-group) archived-collection)
          (perms/revoke-collection-permissions! (perms/all-users-group) child-collection)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id archived-collection)) {:archived true})
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (str "collection/" (u/the-id archived-collection))
                                       {:archived false :parent_id (u/the-id dest-collection)}))))))))
