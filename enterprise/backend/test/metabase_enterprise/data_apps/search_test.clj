(ns metabase-enterprise.data-apps.search-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-apps.config]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

;; The index table is created here, outside the tests' rollback-only `with-temp`: creating it is DDL, which commits.
(use-fixtures :each (fn [thunk] (search.tu/with-appdb-search-if-available-otherwise-legacy (thunk))))

(def ^:private search-term "sandpiper")

(defn- found-data-apps
  "The name and slug of the data apps that `user` finds searching for [[search-term]] with `params`, by id."
  [user & params]
  (->> (apply mt/user-http-request user :get 200 "search" :q search-term params)
       :data
       (filter (comp #{"data-app"} :model))
       (into {} (map (juxt :id #(select-keys % [:name :data_app_slug]))))))

(defn- offers-data-app-type?
  "Whether the search page's type filter offers data apps to `user` searching for [[search-term]]."
  [user]
  (-> (mt/user-http-request user :get 200 "search" :q search-term :calculate_available_models true)
      :available_models
      set
      (contains? "data-app")))

(defn- semantic-engine-offers-data-app-type?
  "Whether the semantic search engine's type filter offers data apps to `user` searching for [[search-term]]."
  [user]
  (mt/with-current-user (mt/user->id user)
    (-> (search/search-context {:current-user-id       api/*current-user-id*
                                :current-user-perms    @api/*current-user-permissions-set*
                                :is-superuser?         api/*is-superuser?*
                                :is-impersonated-user? false
                                :is-sandboxed-user?    false
                                :is-routed-user?       false
                                :models                nil
                                :search-string         search-term})
        (assoc :search-engine :search.engine/semantic)
        search/model-set
        (contains? "data-app"))))

(defn- grant-app-access!
  "Grant the group with `group-id` read access to the resource collection of the data app with `app-id`."
  [group-id app-id]
  (perms/grant-collection-read-permissions! group-id (t2/select-one-fn :resource_collection_id :model/DataApp :id app-id)))

(defn- with-each-engine
  "Run `check!` with the index engine when the app DB supports it, then with the legacy engine."
  [check!]
  (check!)
  (search.tu/with-legacy-search (check!)))

(deftest search-finds-the-data-apps-the-user-can-read-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {slug-match-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                       :bundle_path "sightings.js"}
                   :model/DataApp {granted-id :id} {:name "plovers" :display_name "Sandpiper counts"
                                                    :bundle_path "counts.js"}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! group-id granted-id)
      (with-each-engine
        (fn []
          (testing "an admin finds every app, by its slug or its display name"
            (is (= #{slug-match-id granted-id}
                   (set (keys (found-data-apps :crowberto :models "data-app"))))))
          (testing "another user finds the apps whose collection one of their groups can read, with display name and slug"
            (is (= {granted-id {:name "Sandpiper counts" :data_app_slug "plovers"}}
                   (found-data-apps :rasta :models "data-app"))))
          (testing "a user in no group with access finds none"
            (is (= {} (found-data-apps :lucky :models "data-app"))))
          (testing "a search that names no models, as global search does, finds them too"
            (is (= #{slug-match-id granted-id}
                   (set (keys (found-data-apps :crowberto)))))))))))

(deftest search-finds-disabled-and-outdated-data-apps-the-user-can-read-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {current-id :id} {:name "sandpiper-dunlin" :display_name "Dunlin"
                                                    :bundle_path "dunlin.js" :version 2}
                   :model/DataApp {outdated-id :id} {:name "sandpiper-knot" :display_name "Knot"
                                                     :bundle_path "knot.js" :version 1}
                   :model/DataApp {disabled-id :id} {:name "sandpiper-sanderling" :display_name "Sanderling"
                                                     :bundle_path "sanderling.js" :version 2 :enabled false}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! group-id current-id)
      (grant-app-access! group-id outdated-id)
      (grant-app-access! group-id disabled-id)
      (with-redefs [data-apps.config/supported-app-version 2]
        (with-each-engine
          (fn []
            (doseq [params [[] [:models "data-app"]]]
              (testing (str "an admin searching with " (pr-str params) " finds disabled and outdated apps too")
                (is (= #{current-id outdated-id disabled-id}
                       (set (keys (apply found-data-apps :crowberto params))))))
              (testing (str "another user searching with " (pr-str params) " finds outdated apps, but no disabled one")
                (is (= #{current-id outdated-id}
                       (set (keys (apply found-data-apps :rasta params)))))))))))))

(deftest search-without-models-finds-only-the-data-apps-the-user-can-read-test
  (mt/with-premium-features #{:data-apps :tenants}
    (mt/with-temporary-setting-values [use-tenants true]
      (mt/with-temp [:model/Tenant tenant {:name "Tenant"}
                     :model/User tenant-user {:tenant_id (:id tenant)}
                     :model/DataApp {enabled-id :id} {:name "plovers" :display_name "Sandpiper counts"
                                                      :bundle_path "counts.js"}
                     :model/DataApp {disabled-id :id} {:name "sandpiper-drafts" :display_name "Drafts"
                                                       :enabled false :bundle_path "drafts.js"}
                     :model/DataApp {ungranted-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                        :bundle_path "sightings.js"}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
        (grant-app-access! group-id enabled-id)
        (grant-app-access! group-id disabled-id)
        (with-each-engine
          (fn []
            (testing "an admin finds every app"
              (is (= #{enabled-id disabled-id ungranted-id} (set (keys (found-data-apps :crowberto))))))
            (testing "another user finds only the enabled apps whose collection one of their groups can read"
              (is (= #{enabled-id} (set (keys (found-data-apps :rasta))))))
            (testing "a user in no group with access finds none"
              (is (= {} (found-data-apps :lucky))))
            (testing "a tenant user finds none"
              (is (= {} (found-data-apps (:id tenant-user)))))))))))

(deftest type-filter-offers-data-apps-only-to-users-who-can-read-one-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {enabled-id :id} {:name "plovers" :display_name "Sandpiper counts"
                                                    :bundle_path "counts.js"}
                   :model/DataApp {disabled-id :id} {:name "sandpiper-drafts" :display_name "Drafts"
                                                     :enabled false :bundle_path "drafts.js"}
                   :model/PermissionsGroup {other-group-id :id} {}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! other-group-id enabled-id)
      (grant-app-access! group-id disabled-id)
      (with-each-engine
        (fn []
          (testing "an admin is offered data apps"
            (is (offers-data-app-type? :crowberto)))
          (testing "a user in no group with access is not offered data apps"
            (is (not (offers-data-app-type? :lucky))))
          (testing "a user whose groups can read only a disabled app's collection is not offered data apps"
            (is (not (offers-data-app-type? :rasta)))))))))

(deftest type-filter-offers-no-data-apps-without-the-feature-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/DataApp {app-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                :bundle_path "s.js"}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! group-id app-id)
      (with-each-engine
        (fn []
          (doseq [user [:crowberto :rasta :lucky]]
            (testing (str user " is not offered data apps")
              (is (not (offers-data-app-type? user))))))))))

(defn- without-app-db-index
  "Run `thunk` as on an app DB that cannot hold the search index, such as MySQL and MariaDB."
  [thunk]
  (search.tu/with-legacy-search
    (mt/with-dynamic-fn-redefs [search.index/active-table (constantly nil)]
      (thunk))))

(deftest semantic-type-filter-offers-data-apps-only-to-users-who-can-read-one-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {app-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                :bundle_path "s.js"}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! group-id app-id)
      (doseq [[app-db with-app-db] [["this app DB" (fn [thunk] (thunk))]
                                    ["an app DB without the search index" without-app-db-index]]]
        (with-app-db
          (fn []
            (testing app-db
              (testing "an admin is offered data apps"
                (is (semantic-engine-offers-data-app-type? :crowberto)))
              (testing "a user in a group with access is offered data apps"
                (is (semantic-engine-offers-data-app-type? :rasta)))
              (testing "a user in no group with access is not offered data apps"
                (is (not (semantic-engine-offers-data-app-type? :lucky)))))))))))

(deftest search-by-ids-finds-the-requested-data-app-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {app-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                :bundle_path "sightings.js"}
                   :model/DataApp {other-id :id} {:name "plovers" :display_name "Sandpiper counts"
                                                  :bundle_path "counts.js"}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}]
      (grant-app-access! group-id app-id)
      (grant-app-access! group-id other-id)
      (with-each-engine
        (fn []
          (doseq [user [:crowberto :rasta]]
            (testing (str user " finds only the data app with the requested id")
              (is (= #{app-id}
                     (set (keys (found-data-apps user :models "data-app" :ids app-id))))))))))))

(deftest search-finds-no-data-apps-without-the-feature-test
  (mt/with-premium-features #{}
    (mt/with-temp [:model/DataApp _ {:name "sandpiper-sightings" :display_name "Shorebirds" :bundle_path "s.js"}]
      (with-each-engine
        #(is (= {} (found-data-apps :crowberto :models "data-app")))))))

(deftest deleting-a-data-app-removes-it-from-the-index-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {app-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                :bundle_path "s.js"}]
      (is (contains? (found-data-apps :crowberto :models "data-app") app-id))
      (t2/delete! :model/DataApp app-id)
      (is (= {} (found-data-apps :crowberto :models "data-app"))))))
