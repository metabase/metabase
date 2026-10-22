(ns metabase-enterprise.data-apps.search-test
  (:require
   [clojure.test :refer :all]
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
  "The names of the data apps that `user` finds searching for [[search-term]] with `params`, by id."
  [user & params]
  (->> (apply mt/user-http-request user :get 200 "search" :q search-term params)
       :data
       (filter (comp #{"data-app"} :model))
       (into {} (map (juxt :id :name)))))

(defn- with-each-engine
  "Run `check!` with the index engine when the app DB supports it, then with the legacy engine."
  [check!]
  (check!)
  (search.tu/with-legacy-search (check!)))

(deftest search-finds-the-data-apps-the-user-can-read-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp {slug-match-id :id} {:name "sandpiper-sightings" :display_name "Shorebirds"
                                                       :bundle_path "sightings.js"}
                   :model/DataApp {assigned-id :id} {:name "plovers" :display_name "Sandpiper counts"
                                                     :bundle_path "counts.js"}
                   :model/PermissionsGroup {group-id :id} {}
                   :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                   :model/DataAppGroupAssignment _ {:data_app_id assigned-id :permission_group_id group-id}]
      (with-each-engine
        (fn []
          (testing "an admin finds every app, by its slug or its display name"
            (is (= #{slug-match-id assigned-id}
                   (set (keys (found-data-apps :crowberto :models "data-app"))))))
          (testing "another user finds the apps assigned to one of their groups, under their display name"
            (is (= {assigned-id "Sandpiper counts"}
                   (found-data-apps :rasta :models "data-app"))))
          (testing "a user in no assigned group finds none"
            (is (= {} (found-data-apps :lucky :models "data-app"))))
          (testing "a search that names no models finds none, since global search doesn't show data apps yet"
            (is (= {} (found-data-apps :crowberto)))))))))

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
