(ns metabase-enterprise.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
   [metabase-enterprise.data-apps.test-util :as data-app.test-util]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Helpers ----------------------------------------------

(defn- create-app! []
  (t2/insert! :model/DataApp
              :name         "demo"
              :display_name "Demo"
              :bundle_path  "data_apps/demo/index.js"
              :bundle       (.getBytes "BUNDLE" "UTF-8")
              :bundle_hash  "abc123"))

(defn- view-data-permission
  [group-id database-id table-id]
  (t2/select-one-fn :perm_value :model/DataPermissions
                    :group_id group-id
                    :db_id database-id
                    :table_id table-id
                    :perm_type :perms/view-data))

(def ^:private fake-sha "0123456789abcdef0123456789abcdef01234567")

(defn- snapshot
  "Build a snapshot (as the remote-sync import passes one) from a path->content
   map. `read-file` returns file text (a string) or nil; `list-dir` reuses the
   derivation the real non-git snapshots use, so the fake can't drift from it."
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha       sha
   :list-dir  (fn [dir] (source/paths->children (keys path->content) dir))
   :read-file (fn [p] (get path->content p))})

(defn- app-config!
  "Render a per-app data_app.yaml from `{:name :path :allowed_hosts}`. No slug: an
   app's slug is the name of the directory the config sits in."
  [slug {:keys [name path allowed_hosts]}]
  (let [{:keys [resource_collection_entity_id permission_group_entity_id]}
        (data-app.test-util/ensure-manifest-resources! slug)]
    (str (format (str "name: %s\npath: %s\n"
                      "resource_collection_entity_id: %s\n"
                      "permission_group_entity_id: %s\n")
                 name path resource_collection_entity_id permission_group_entity_id)
         (when (seq allowed_hosts)
           (apply str "allowed_hosts:\n"
                  (map #(format "  - %s\n" %) allowed_hosts))))))

(defn- app-files!
  "Repo files for one data app under `data_apps/<dir>/`: its data_app.yaml plus a
   bundle at `path` with `bundle` content."
  [dir {:keys [path bundle] :as cfg}]
  {(format "data_apps/%s/data_app.yaml" dir) (app-config! dir cfg)
   (format "data_apps/%s/%s" dir path)       bundle})

;;; ---------------------------------------------- Permissions ----------------------------------------------

(deftest data-app-access-requires-read-access-to-its-resource-collection-test
  ;; global mode so the `:data-apps-preview` premium feature is visible to the real-HTTP
  ;; `user-real-request` calls below (which run on Jetty threads that don't inherit
  ;; a thread-local `binding`).
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (let [app (t2/select-one :model/DataApp :name "demo")
              {:keys [permission_group_id]} (data-app.resources/ensure-resources! app)]
          (testing "a non-member cannot open a data app or load its bundle"
            (is (= [{:name "demo" :display_name "Demo"}]
                   (mt/user-http-request :rasta :get 200 "apps")))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "apps/demo")))
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "apps/demo/bundle"))))
          (testing "a member can open a data app"
            (perms/add-user-to-group! (mt/user->id :rasta) permission_group_id)
            (is (= {:name "demo" :display_name "Demo"}
                   (mt/user-http-request :rasta :get 200 "apps/demo")))
            (is (str/includes?
                 (str (mt/user-real-request :rasta :get 200 "apps/demo/bundle"))
                 "BUNDLE"))))
        (testing "a non-superuser is still forbidden from managing data apps"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "apps/repo-status")))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "apps/demo" {:enabled false}))))))))

(deftest superuser-can-manage-and-view-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (let [app (t2/select-one :model/DataApp :name "demo")
              {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
          (is (not (some #(= resource_collection_id (:id %))
                         (mt/user-http-request :rasta :get 200 "collection")))))
        (testing "a superuser can list, read metadata, and serve the bundle"
          (is (=? [{:name "demo" :display_name "Demo"}]
                  (mt/user-http-request :crowberto :get 200 "apps")))
          (is (=? {:name "demo"
                   :resource_collection_id pos-int?
                   :permission_group_id pos-int?}
                  (mt/user-http-request :crowberto :get 200 "apps/demo")))
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "BUNDLE")))))))

(deftest superuser-can-resolve-a-query-definition-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (create-app!)
      (let [response (mt/user-http-request
                      :crowberto :post 200 "apps/demo/query"
                      {:stages [{:source {:type "table" :id (mt/id :venues)}
                                 :limit  5}]})]
        (is (= (mt/id) (:database_id response)))
        (is (=? {:dataset_query {:lib/type "mbql/query"
                                 :database (mt/id)
                                 :stages [{:lib/type "mbql.stage/mbql"
                                           :source-table (mt/id :venues)
                                           :limit 5}]}}
                response))))))

(deftest resolved-query-includes-implicitly-joined-tables-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (create-app!)
      (let [orders-id            (mt/id :orders)
            products-id          (mt/id :products)
            product-id-field-id  (mt/id :orders :product_id)
            product-category-id  (mt/id :products :category)
            response             (mt/user-http-request
                                  :crowberto :post 200 "apps/demo/query"
                                  {:stages [{:source   {:type "table" :id orders-id}
                                             :breakout [[:field {:source-field product-id-field-id}
                                                         product-category-id]]}]})]
        (is (= #{orders-id products-id}
               (set (:table_ids response))))))))

(deftest superuser-can-reconcile-query-table-permissions-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [database-id (mt/id)
            first-table-id (mt/id :venues)
            second-table-id (mt/id :users)]
        (create-app!)
        (let [{group-id :permission_group_id}
              (mt/user-http-request :crowberto :put 200 "apps/demo/resources/permissions"
                                    {:table_ids [first-table-id]})]
          (is (nil? (view-data-permission group-id database-id nil)))
          (is (= :unrestricted (view-data-permission group-id database-id first-table-id)))
          (is (= :blocked (view-data-permission group-id database-id second-table-id)))
          (mt/user-http-request :crowberto :put 200 "apps/demo/resources/permissions"
                                {:table_ids [second-table-id]})
          (is (nil? (view-data-permission group-id database-id nil)))
          (is (= :blocked (view-data-permission group-id database-id first-table-id)))
          (is (= :unrestricted (view-data-permission group-id database-id second-table-id))))))))

(deftest query-table-permission-reconciliation-skips-unchanged-databases-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [table-id (mt/id :venues)]
        (create-app!)
        (mt/user-http-request :crowberto :put 200 "apps/demo/resources/permissions"
                              {:table_ids [table-id]})
        (let [original-set-database-permission! perms/set-database-permission!
              original-set-table-permissions!    perms/set-table-permissions!
              writes                             (atom 0)]
          (with-redefs [perms/set-database-permission!
                        (fn [& args]
                          (when (= :perms/view-data (nth args 3))
                            (swap! writes inc))
                          (apply original-set-database-permission! args))
                        perms/set-table-permissions!
                        (fn [& args]
                          (when (= :perms/view-data (nth args 1))
                            (swap! writes inc))
                          (apply original-set-table-permissions! args))]
            (mt/user-http-request :crowberto :put 200 "apps/demo/resources/permissions"
                                  {:table_ids [table-id]}))
          (is (zero? @writes)))))))

(deftest query-table-permission-reconciliation-rolls-back-on-error-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [database-id (mt/id)
            first-table-id (mt/id :venues)
            second-table-id (mt/id :users)]
        (create-app!)
        (let [{group-id :permission_group_id}
              (mt/user-http-request :crowberto :put 200 "apps/demo/resources/permissions"
                                    {:table_ids [first-table-id]})
              original-set-table-permissions! perms/set-table-permissions!
              view-data-calls                  (atom 0)]
          (with-redefs [perms/set-table-permissions!
                        (fn [& args]
                          (let [permission-type (nth args 1)]
                            (when (and (= permission-type :perms/view-data)
                                       (= 1 (swap! view-data-calls inc)))
                              (throw (ex-info "permission update failed" {})))
                            (apply original-set-table-permissions! args)))]
            (mt/user-http-request :crowberto :put 500 "apps/demo/resources/permissions"
                                  {:table_ids [second-table-id]}))
          (is (nil? (view-data-permission group-id database-id nil)))
          (is (= :unrestricted (view-data-permission group-id database-id first-table-id)))
          (is (= :blocked (view-data-permission group-id database-id second-table-id))))))))

(deftest query-definition-must-use-a-table-source-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp]
      (create-app!)
      (is (= "Data app query definitions must use a table source."
             (mt/user-http-request :crowberto :post 400 "apps/demo/query"
                                   {:stages [{:source {:type "card" :id 1}}]}))))))

(deftest query-definition-source-must-be-valid-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp]
      (create-app!)
      (is (some? (mt/user-http-request :crowberto :post 400 "apps/demo/query"
                                       {:stages [{:source {:type 1 :id (mt/id :venues)}}]}))))))

(deftest non-superuser-cannot-resolve-a-query-definition-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (create-app!)
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "apps/demo/query"
                                   {:stages [{:source {:type "table" :id (mt/id :venues)}}]}))))))

(deftest non-superuser-cannot-reconcile-query-database-permissions-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-temp [:model/Database {database-id :id} {}]
        (create-app!)
        (let [group-id (t2/select-one-fn :permission_group_id :model/DataApp :name "demo")]
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "apps/demo/resources/permissions"
                                       {:database_ids [database-id]})))
          (is (not= :unrestricted (view-data-permission group-id database-id))
              "the refused call granted nothing"))))))

(deftest superuser-can-create-or-reuse-a-data-app-draft-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [first-response  (mt/user-http-request :crowberto :post 200 "apps/draft-app/draft")
            second-response (mt/user-http-request :crowberto :post 200 "apps/draft-app/draft")]
        (is (=? {:name "draft-app"
                 :resource_collection_id pos-int?
                 :permission_group_id pos-int?
                 :resource_collection_entity_id string?
                 :permission_group_entity_id string?}
                first-response))
        (is (= (select-keys first-response [:resource_collection_id :permission_group_id
                                            :resource_collection_entity_id :permission_group_entity_id])
               (select-keys second-response [:resource_collection_id :permission_group_id
                                             :resource_collection_entity_id :permission_group_entity_id])))
        (is (=? {:bundle nil :draft true}
                (t2/select-one :model/DataApp :name "draft-app")))))))

(deftest non-superuser-cannot-create-a-data-app-draft-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "apps/draft-app/draft")))
      (is (not (t2/exists? :model/DataApp :name "draft-app"))))))

(deftest data-app-draft-must-have-a-valid-slug-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp]
      (is (= "Data app draft slugs must use lowercase letters, numbers, and dashes."
             (mt/user-http-request :crowberto :post 400 "apps/Draft/draft")))
      (is (not (t2/exists? :model/DataApp :name "Draft"))))))

(deftest data-app-group-reaches-only-copied-actions-test
  (testing "an action is reachable exactly when its model lives in the data app collection"
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (mt/with-non-admin-groups-no-root-collection-perms
          ;; Its own slug: the `Data App: <slug>` group outlives other tests in
          ;; this namespace, so sharing "demo" collides on the group name.
          (let [{:keys [permission_group_id resource_collection_id]}
                (data-app.sync/ensure-draft! "action-perms-app")
                metadata-provider (mt/metadata-provider)
                venues            (lib.metadata/table metadata-provider (mt/id :venues))]
            (perms/add-user-to-group! (mt/user->id :rasta) permission_group_id)
            (mt/with-temp
              [:model/Collection {source-collection-id :id} {}
               :model/Card       {source-model-id :id}      {:type          :model
                                                             :collection_id source-collection-id
                                                             :dataset_query (lib/query metadata-provider venues)}
               ;; What `npm run sync-resources` produces: a copy of the model in the
               ;; app's own collection, carrying its own copy of the action.
               :model/Card       {copied-model-id :id}      {:type          :model
                                                             :collection_id resource_collection_id
                                                             :dataset_query (lib/query metadata-provider venues)}]
              (let [action     {:name "Create Venue", :type :implicit, :kind :row/create}
                    source-id  (actions/insert! (assoc action :model_id source-model-id))
                    copied-id  (actions/insert! (assoc action :model_id copied-model-id))]
                (testing "the app's group reads the action copied into its collection"
                  (is (=? {:id copied-id}
                          (mt/user-http-request :rasta :get 200 (str "action/" copied-id)))))
                (testing "the same group cannot read the source action it was copied from"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :get 403 (str "action/" source-id)))))
                (testing "copying does not widen access to the source model"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :get 403 (str "card/" source-model-id)))))
                (testing "a superuser still reads both"
                  (is (=? {:id source-id}
                          (mt/user-http-request :crowberto :get 200 (str "action/" source-id)))))))))))))

(deftest list-available-apps-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (t2/insert! :model/DataApp :name "ready" :display_name "Ready" :bundle_path "data_apps/ready/index.js")
      (t2/insert! :model/DataApp :name "disabled" :display_name "Disabled" :bundle_path "data_apps/disabled/index.js"
                  :enabled false)
      (t2/insert! :model/DataApp :name "failed" :display_name "Failed" :bundle_path "data_apps/failed/index.js"
                  :sync_error "Could not read bundle")
      (is (=? [{:name "ready" :display_name "Ready"}]
              (mt/user-http-request :rasta :get 200 "apps?available=true"))))))

(deftest bundle-includes-allowed-hosts-header-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (t2/insert! :model/DataApp
                  :name          "demo"
                  :display_name  "Demo"
                  :bundle_path   "data_apps/demo/index.js"
                  :bundle        (.getBytes "BUNDLE" "UTF-8")
                  :bundle_hash   "abc123"
                  :allowed_hosts ["https://api.example.com"])
      (testing "the bundle response carries the app's allowed_hosts as a JSON header"
        (let [resp (mt/user-http-request-full-response :crowberto :get 200 "apps/demo/bundle")]
          (is (= "[\"https://api.example.com\"]"
                 (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"])))))
      (testing "an app with no allowed_hosts still sends the header as an empty JSON array"
        (t2/update! :model/DataApp :name "demo" {:allowed_hosts []})
        (let [resp (mt/user-http-request-full-response :crowberto :get 200 "apps/demo/bundle")]
          (is (= "[]"
                 (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"]))))))))

(deftest list-includes-allowed-hosts-test
  (mt/with-premium-features #{:data-apps-preview}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (t2/insert! :model/DataApp
                  :name "withhosts" :display_name "With"
                  :bundle_path "data_apps/withhosts/index.js"
                  :allowed_hosts ["https://api.example.com"])
      ;; inserted without the column → stored NULL, exercising the read coercion
      (t2/insert! :model/DataApp
                  :name "nohosts" :display_name "No"
                  :bundle_path "data_apps/nohosts/index.js")
      (testing "the list endpoint returns allowed_hosts, always a list (NULL → [])"
        (let [by-name (->> (mt/user-http-request :crowberto :get 200 "apps")
                           (into {} (map (juxt :name identity))))]
          (is (= ["https://api.example.com"]
                 (get-in by-name ["withhosts" :allowed_hosts])))
          (is (= [] (get-in by-name ["nohosts" :allowed_hosts]))))))))

;;; ----------------------------------------------------- Sync -----------------------------------------------------

(deftest import-materializes-apps-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [result (data-app.sync/import-from-snapshot!
                  (snapshot (merge (app-files! "sales" {:name "Sales" :path "dist/index.js" :bundle "SALES-BUNDLE"})
                                   (app-files! "ops"   {:name "Ops"   :path "dist/app.js"   :bundle "OPS-BUNDLE"}))))]
      (is (=? {:synced 2} result))
      (is (= #{"sales" "ops"} (t2/select-fn-set :name :model/DataApp)))
      (let [sales (t2/select-one :model/DataApp :name "sales")]
        (is (= "SALES-BUNDLE" (String. ^bytes (:bundle sales) "UTF-8")))
        (is (= "Sales" (:display_name sales)))
        (is (= "data_apps/sales/dist/index.js" (:bundle_path sales)))
        (is (true? (:enabled sales)))
        (is (= fake-sha (:last_synced_sha sales)))
        (is (nil? (:sync_error sales)))))))

(deftest import-stores-allowed-hosts-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (testing "allowed_hosts from data_app.yaml are persisted on the row"
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "sales" {:name "Sales" :path "dist/index.js" :bundle "B"
                                      :allowed_hosts ["https://api.example.com" "https://*.acme.com"]})))
      (is (= ["https://api.example.com" "https://*.acme.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :name "sales")))))
    (testing "re-syncing without allowed_hosts clears them to an empty list"
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "sales" {:name "Sales" :path "dist/index.js" :bundle "B"})))
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp :name "sales")))))))

(deftest import-prunes-apps-absent-from-snapshot-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-app.sync/import-from-snapshot!
     (snapshot (merge (app-files! "keep" {:name "Keep" :path "index.js" :bundle "KEEP"})
                      (app-files! "gone" {:name "Gone" :path "index.js" :bundle "GONE"}))))
    (is (= #{"keep" "gone"} (t2/select-fn-set :name :model/DataApp)))
    ;; The connected repo is the source of truth: an app whose directory is gone
    ;; from a later snapshot is pruned. (An admin can also remove one explicitly
    ;; via DELETE /api/apps/:slug.)
    (is (=? {:removed 1}
            (data-app.sync/import-from-snapshot!
             (snapshot (app-files! "keep" {:name "Keep" :path "index.js" :bundle "KEEP"})))))
    (is (= #{"keep"} (t2/select-fn-set :name :model/DataApp))
        "the app absent from the later snapshot is pruned")))

(deftest delete-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (let [{:keys [resource_collection_id permission_group_id]}
              (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :name "demo"))]
          (testing "a non-superuser cannot remove an app"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :delete 403 "apps/demo")))
            (is (t2/exists? :model/DataApp :name "demo")))
          ; each data app owns a permission group and a collection
          ; containing saved questions and models
          (testing "a superuser removes the app and its resources"
            (is (nil? (mt/user-http-request :crowberto :delete 204 "apps/demo")))
            (is (not (t2/exists? :model/DataApp :name "demo")))
            (is (not (t2/exists? :model/Collection :id resource_collection_id)))
            (is (not (t2/exists? :model/PermissionsGroup :id permission_group_id))))
          (testing "removing a non-existent app 404s"
            (mt/user-http-request :crowberto :delete 404 "apps/missing")))))))

(deftest import-preserves-enabled-across-syncs-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files! "a" {:name "A" :path "index.js" :bundle "V1"})))
    (t2/update! :model/DataApp :name "a" {:enabled false})
    ;; a new bundle must not flip the admin's enabled toggle back on
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files! "a" {:name "A" :path "index.js" :bundle "V2"})))
    (let [a (t2/select-one :model/DataApp :name "a")]
      (is (false? (:enabled a)) "the disabled toggle is preserved")
      (is (= "V2" (String. ^bytes (:bundle a) "UTF-8")) "the bundle is still updated"))))

(deftest import-per-app-error-test
  (testing "a missing bundle file fails just that app, not the whole import"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files! "good" {:name "Good" :path "index.js" :bundle "GOOD"})
                        ;; "bad" declares a path that doesn't exist
                        {"data_apps/bad/data_app.yaml" (app-config! "bad" {:name "Bad" :path "missing.js"})})))
      (is (= #{"good" "bad"} (t2/select-fn-set :name :model/DataApp)))
      (let [good (t2/select-one :model/DataApp :name "good")
            bad  (t2/select-one :model/DataApp :name "bad")]
        (is (= "GOOD" (String. ^bytes (:bundle good) "UTF-8")))
        (is (nil? (:sync_error good)))
        (is (nil? (:bundle bad)))
        (is (str/includes? (:sync_error bad) "missing.js"))))))

(deftest import-serves-each-app-from-its-directory-test
  (testing "the directory an app lives in is the slug it's served at — two apps can't collide on one"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files! "one" {:name "One" :path "a.js" :bundle "A"})
                        (app-files! "two" {:name "Two" :path "b.js" :bundle "B"}))))
      (is (= #{"one" "two"} (t2/select-fn-set :name :model/DataApp))))))

(deftest import-isolates-bad-config-test
  (testing "a malformed data_app.yaml is isolated: sibling apps in the same repo still sync and are not pruned, the bad one is reported"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files! "existing" {:name "Existing" :path "i.js" :bundle "E"})))
      ;; The repo still holds "existing" and adds "good", alongside a broken "bad".
      ;; The broken config must not abort the others, nor prune its siblings.
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot (merge (app-files! "existing" {:name "Existing" :path "i.js" :bundle "E"})
                                     (app-files! "good" {:name "Good" :path "i.js" :bundle "GOOD"})
                                     {"data_apps/bad/data_app.yaml" "name: [unterminated"})))]
        (is (=? {:synced 2 :removed 0} result))
        (is (= 1 (count (:config-errors result))))
        (is (= #{"existing" "good"} (t2/select-fn-set :name :model/DataApp))
            "the bad config neither aborts nor prunes its sibling apps, and doesn't materialize itself")))))

(deftest sync-from-snapshot!-never-throws-test
  (testing "a malformed data_app.yaml is isolated into :config-errors; the app just doesn't appear, the sync doesn't throw"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot {"data_apps/x/data_app.yaml" "name: [unterminated"}))]
        (is (seq (:config-errors result)))
        (is (empty? (t2/select-fn-set :name :model/DataApp))))))
  (testing "a clean sync materializes the app with no config errors"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot (app-files! "a" {:name "A" :path "index.js" :bundle "A"})))]
        (is (empty? (:config-errors result)))
        (is (= #{"a"} (t2/select-fn-set :name :model/DataApp)))))))

;;; ----------------------------------------------------- API -----------------------------------------------------

(deftest list-and-bundle-endpoints-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (data-app.sync/import-from-snapshot!
         (snapshot (app-files! "demo" {:name "Demo app" :path "dist/index.js" :bundle "DEMOBUNDLE"})))
        (testing "GET / lists the synced apps"
          (is (=? [{:name "demo" :display_name "Demo app"
                    :bundle_path "data_apps/demo/dist/index.js" :enabled true}]
                  (mt/user-http-request :crowberto :get 200 "apps"))))
        (testing "GET /:slug/bundle serves the cached bytes"
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "DEMOBUNDLE")))))))

(deftest repo-status-endpoint-test
  (mt/with-premium-features #{:data-apps-preview}
    (testing "reports no repository when none is connected"
      (mt/with-dynamic-fn-redefs [data-app.sync/repo-url (constantly nil)]
        (is (=? {:configured false :url nil}
                (mt/user-http-request :crowberto :get 200 "apps/repo-status")))))
    (testing "reports the connected repository URL"
      (mt/with-dynamic-fn-redefs [data-app.sync/repo-url (constantly "https://github.com/metabase/stats-remote-sync")]
        (is (=? {:configured true :url "https://github.com/metabase/stats-remote-sync"}
                (mt/user-http-request :crowberto :get 200 "apps/repo-status")))))))

(deftest enable-disable-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (data-app.sync/import-from-snapshot!
         (snapshot (app-files! "demo" {:name "Demo" :path "index.js" :bundle "BUNDLE"})))
        (testing "PUT /:slug can disable an app"
          (is (=? {:name "demo" :enabled false}
                  (mt/user-http-request :crowberto :put 200 "apps/demo" {:enabled false}))))
        (testing "a disabled app is not served"
          (is (= "Not found." (mt/user-http-request :crowberto :get 404 "apps/demo")))
          (mt/user-real-request :crowberto :get 404 "apps/demo/bundle"))
        (testing "re-enabling restores serving"
          (is (=? {:enabled true}
                  (mt/user-http-request :crowberto :put 200 "apps/demo" {:enabled true})))
          (is (=? {:name "demo"} (mt/user-http-request :crowberto :get 200 "apps/demo"))))))))

(deftest sandbox-host-endpoint-test
  (mt/with-premium-features #{:data-apps-preview}
    (let [resp    (mt/user-http-request-full-response :crowberto :get 200 "apps/sandbox-host")
          headers (:headers resp)]
      (testing "serves a minimal HTML document"
        (is (str/includes? (:body resp) "<!doctype html>"))
        (is (str/starts-with? (get headers "Content-Type") "text/html")))
      (testing "carries the per-document CSP that confines 'unsafe-eval' to the realm"
        ;; This grant is why the data-app document itself can drop 'unsafe-eval'
        ;; (see `data-app-unsafe-eval-test`), and `default-src 'none'` means the
        ;; realm has no network of its own rather than inheriting the data-app
        ;; document's `connect-src` (which includes the instance origin).
        (let [csp (get headers "Content-Security-Policy")]
          (is (some? csp))
          (is (str/includes? csp "default-src 'none'"))
          (is (str/includes? csp "script-src 'unsafe-eval'"))
          (is (str/includes? csp "frame-ancestors 'self'"))
          (testing "and the endpoint's CSP wins over the global middleware one"
            (is (not (str/includes? csp "'nonce-"))))))
      (testing "is framable same-origin, overriding the global X-Frame-Options"
        (is (= "SAMEORIGIN" (get headers "X-Frame-Options"))))
      (testing "hardening headers are present"
        (is (= "nosniff"     (get headers "X-Content-Type-Options")))
        (is (= "no-referrer" (get headers "Referrer-Policy")))
        (is (= "same-origin" (get headers "Cross-Origin-Resource-Policy"))))))
  ;; `slug-regex` must exclude this literal, or `/apps/sandbox-host` would be
  ;; routed as a data app named "sandbox-host" and 404.
  (testing "the route is not shadowed by the /:slug route"
    (mt/with-premium-features #{:data-apps-preview}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (is (= 200 (:status (mt/user-http-request-full-response
                             :crowberto :get 200 "apps/sandbox-host"))))))))
