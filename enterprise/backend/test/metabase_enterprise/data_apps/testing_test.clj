(ns metabase-enterprise.data-apps.testing-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase-enterprise.data-apps.testing :as data-apps.testing]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-app!
  "Create the data app `request` describes as an admin, as the `/api/testing` endpoint does."
  [request]
  (mt/with-current-user (mt/user->id :crowberto)
    (data-apps.testing/create-data-app! request)))

(deftest create-data-app-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection]
      (testing "an app created from its slug alone is enabled, with an empty bundle and its own collection"
        (is (=? {:name                   "demo"
                 :display_name           "demo"
                 :bundle_path            "dist/index.js"
                 :enabled                true
                 :resource_collection_id pos-int?}
                (create-app! {:name "demo"})))
        (is (= 0 (alength ^bytes (t2/select-one-fn :bundle :model/DataApp :name "demo")))))
      (testing "its collection is in the data-apps namespace, and no group but Administrators reads it"
        (let [collection-id (t2/select-one-fn :resource_collection_id :model/DataApp :name "demo")]
          (is (=? {:name "Data App: demo" :namespace :data-apps :location "/"}
                  (t2/select-one :model/Collection :id collection-id)))
          (is (= #{} (perms/collection-read-access-group-ids collection-id)))))
      (testing "a taken slug is refused, without leaving a collection behind"
        (let [collection-count (t2/count :model/Collection)]
          (is (thrown? Exception (create-app! {:name "demo"})))
          (is (= collection-count (t2/count :model/Collection))))))))

(deftest replace-data-app-bundle-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp _ {:name "demo"}]
        (testing "the new bundle is what the app serves"
          (let [{:keys [bundle_hash]} (data-apps.testing/replace-data-app-bundle! "demo" "V1")]
            (is (str/includes? (str (mt/user-real-request :crowberto :get 200 "ee/apps/demo/bundle")) "V1"))
            (is (not= bundle_hash (:bundle_hash (data-apps.testing/replace-data-app-bundle! "demo" "V2"))))
            (is (str/includes? (str (mt/user-real-request :crowberto :get 200 "ee/apps/demo/bundle")) "V2"))))
        (testing "a missing app 404s"
          (is (thrown-with-msg? Exception #"Not found"
                                (data-apps.testing/replace-data-app-bundle! "missing" "V1"))))))))

(deftest delete-data-app-preserves-groups-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (mt/with-temp [:model/DataApp          app            {}
                     :model/PermissionsGroup {group-id :id} {}
                     :model/Card             {card-id :id}  {:collection_id (:resource_collection_id app)
                                                             :dataset_query (data-apps.tu/venues-query)}]
        (group-access/add-groups! app [group-id])
        (data-apps.testing/delete-data-app! (:name app))
        (is (not (t2/exists? :model/DataApp :id (:id app))))
        (is (not (t2/exists? :model/Collection :id (:resource_collection_id app))))
        (is (not (t2/exists? :model/Card :id card-id)))
        (is (not (t2/exists? :model/Permissions :group_id group-id
                             :object (perms/collection-read-path (:resource_collection_id app)))))
        (is (t2/exists? :model/PermissionsGroup :id group-id))))))

(defn- create-question!
  "A table question named `card-name` in the collection with `collection-id`, reading `query`, created by an admin."
  [collection-id card-name query]
  (mt/user-http-request :crowberto :post 200 "card" {:name                   card-name
                                                     :collection_id          collection-id
                                                     :display                "table"
                                                     :visualization_settings {}
                                                     :dataset_query          query}))

(deftest data-app-typed-schema-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (mt/with-actions-enabled
        (mt/with-model-cleanup [:model/Card :model/Action]
          (mt/with-temp [:model/DataApp {collection-id :resource_collection_id} {:name "demo"}]
            (let [mp     (mt/metadata-provider)
                  card   (create-question! collection-id "Venues by category"
                                           (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                               (lib/aggregate (lib/count))
                                               (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id)))))
                  action (mt/user-http-request :crowberto :post 200 "action"
                                               {:name          "Rename venue"
                                                :type          "implicit"
                                                :kind          "row/update"
                                                :table_id      (mt/id :venues)
                                                :collection_id collection-id})
                  body   (data-apps.testing/data-app-typed-schema "demo")]
              (testing "a question is a card source addressed by its entity ID and typed by its result columns"
                (is (str/includes? body "export const queries = {\n  venuesByCategory: defineQuery({"))
                (is (str/includes? body (str "entityId: \"" (:entity_id card) "\"")))
                (is (str/includes? body "name: \"count\"")))
              (testing "an action is addressed by its entity ID and typed by its parameters"
                (is (str/includes? body "export const actions = {\n  renameVenue: defineAction({"))
                (is (str/includes? body (str "id: \"" (t2/select-one-fn :entity_id :model/Action :id (:id action)) "\"")))
                (is (str/includes? body "slug: \"name\""))))))))))
