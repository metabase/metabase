(ns metabase-enterprise.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.query-definition :as query-definition]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.actions.core :as actions]
   [metabase.api.macros.defendpoint.closed-schemas :as closed-schemas]
   [metabase.lib.core :as lib]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Helpers ----------------------------------------------

(defn- create-app! []
  (t2/insert! :model/DataApp
              :name         "demo"
              :display_name "Demo"
              :bundle_path  "index.js"
              :bundle       (.getBytes "BUNDLE" "UTF-8")))

(def ^:private app-request
  {:name          "demo"
   :display_name  "Demo app"
   :bundle_path   "dist/index.js"
   :allowed_hosts ["https://api.example.com"]
   :bundle        "DEMOBUNDLE"})

;;; ---------------------------------------------- Permissions ----------------------------------------------

(deftest assigned-users-can-load-bundles-but-cannot-manage-apps-test
  ;; global mode so the `:data-apps` premium feature is visible to the real-HTTP
  ;; `user-real-request` calls below (which run on Jetty threads that don't inherit
  ;; a thread-local `binding`).
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (let [app (t2/select-one :model/DataApp :name "demo")
              {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)
              permission_group_id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Finches"}))]
          (testing "collection access alone does not assign an app"
            (perms/grant-collection-read-permissions! (perms/all-users-group) resource_collection_id)
            (mt/user-http-request :rasta :get 403 "apps/demo"))
          (testing "a member can open a data app"
            (group-access/add-groups! app [permission_group_id])
            (perms/add-user-to-group! (mt/user->id :rasta) permission_group_id)
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
    (mt/with-premium-features #{:data-apps}
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
                   :resource_collection_id pos-int?}
                  (mt/user-http-request :crowberto :get 200 "apps/demo")))
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "BUNDLE")))))))

(deftest read-only-remote-sync-blocks-data-app-changes-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup :model/RemoteSyncObject]
      (create-app!)
      (mt/with-temporary-setting-values [remote-sync-url  "https://github.com/test/repo.git"
                                         remote-sync-type :read-only]
        (testing "a read-only instance refuses to create, change, or delete an app"
          (mt/user-http-request :crowberto :post 403 "apps" (assoc app-request :name "other"))
          (is (not (t2/exists? :model/DataApp :name "other")))
          (mt/user-http-request :crowberto :put 403 "apps/demo" {:display_name "Renamed"})
          (mt/user-http-request :crowberto :put 403 "apps/demo" {:enabled false :display_name "Renamed"})
          (mt/user-http-request :crowberto :delete 403 "apps/demo")
          (is (=? {:display_name "Demo" :enabled true} (t2/select-one :model/DataApp :name "demo"))))
        (testing "enabling and disabling stays allowed"
          (is (=? {:enabled false}
                  (mt/user-http-request :crowberto :put 200 "apps/demo" {:enabled false})))))
      (mt/with-temporary-setting-values [remote-sync-url  "https://github.com/test/repo.git"
                                         remote-sync-type :read-write]
        (testing "a read-write instance allows changes"
          (is (=? {:display_name "Renamed"}
                  (mt/user-http-request :crowberto :put 200 "apps/demo" {:display_name "Renamed"}))))))))

(deftest enabling-a-data-app-is-not-a-synced-change-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup :model/RemoteSyncObject]
      (create-app!)
      (let [app-id (t2/select-one-pk :model/DataApp :name "demo")]
        (mt/user-http-request :crowberto :put 200 "apps/demo" {:enabled false})
        (is (not (t2/exists? :model/RemoteSyncObject :model_type "DataApp" :model_id app-id)))
        (mt/user-http-request :crowberto :put 200 "apps/demo" {:display_name "Renamed"})
        (is (=? {:model_name "demo" :status "update"}
                (t2/select-one :model/RemoteSyncObject :model_type "DataApp" :model_id app-id)))))))

(deftest ^:parallel query-definition-request-schema-is-closed-test
  (is (empty? (closed-schemas/findings ::query-definition/query-definition))))

(deftest data-app-write-endpoints-require-feature-token-test
  (mt/with-premium-features #{}
    (mt/user-http-request :crowberto :post 402 "apps/serialize-resources"
                          {:collection "goodAppCollection0000" :queries [] :actions []})))


(deftest assigned-group-reaches-only-copied-actions-test
  (testing "an action is reachable exactly when it lives in the data app collection"
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (mt/with-non-admin-groups-no-root-collection-perms
          (let [{:keys [resource_collection_id] :as app}
                (first (t2/insert-returning-instances! :model/DataApp
                                                       {:name         "action-perms-app"
                                                        :display_name "Action perms app"
                                                        :bundle_path  "data_apps/action-perms-app/index.js"}))
                permission_group_id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Action readers"}))
                _ (group-access/add-groups! app [permission_group_id])]
            (perms/add-user-to-group! (mt/user->id :rasta) permission_group_id)
            ;; an action on no model lives in a data actions collection, as a data app runs them
            (mt/with-temp [:model/Collection {source-collection-id :id} {:namespace :data-actions}]
              ;; A query action on no model, as a data app runs them, and its copy in the app's own collection.
              (let [action    {:name          "Rename venue"
                               :type          :query
                               :database_id   (mt/id)
                               :dataset_query (lib/native-query (mt/metadata-provider) "UPDATE venues SET name = 'x'")}
                    source-id (actions/insert! (assoc action :collection_id source-collection-id))
                    copied-id (actions/insert! (assoc action :collection_id resource_collection_id))]
                (testing "the assigned group reads the action copied into the app collection"
                  (is (=? {:id copied-id}
                          (mt/user-http-request :rasta :get 200 (str "action/" copied-id)))))
                (testing "the same group cannot read the source action it was copied from"
                  (is (= "You don't have permissions to do that."
                         (mt/user-http-request :rasta :get 403 (str "action/" source-id)))))
                (testing "a superuser still reads both"
                  (is (=? {:id source-id}
                          (mt/user-http-request :crowberto :get 200 (str "action/" source-id)))))))))))))

(deftest list-available-apps-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (t2/insert! :model/DataApp :name "ready" :display_name "Ready" :bundle_path "data_apps/ready/index.js")
      (t2/insert! :model/DataApp :name "disabled" :display_name "Disabled" :bundle_path "data_apps/disabled/index.js"
                  :enabled false)
      (is (=? [{:name "ready" :display_name "Ready"}]
              (mt/user-http-request :crowberto :get 200 "apps?available=true"))))))

(deftest outdated-apps-are-hidden-from-users-and-badged-for-admins-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (t2/insert! :model/DataApp :name "old" :display_name "Old" :bundle_path "data_apps/old/index.js"
                    :bundle (.getBytes "BUNDLE" "UTF-8") :bundle_hash "abc123" :version 1)
        (t2/insert! :model/DataApp :name "current" :display_name "Current" :bundle_path "data_apps/current/index.js"
                    :bundle (.getBytes "BUNDLE" "UTF-8") :bundle_hash "def456" :version 2)
        (let [group-id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Data app test group"}))]
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (doseq [slug ["old" "current"]
                  :let [app (t2/select-one :model/DataApp :name slug)]]
            (data-app.resources/ensure-resources! app)
            (group-access/add-groups! app [group-id])))
        (with-redefs [data-app.config/supported-app-version 2]
          (testing "a regular user is never told about the outdated app in a list"
            (doseq [url ["apps" "apps?available=true"]]
              (is (= [{:name "current" :display_name "Current"}]
                     (mt/user-http-request :rasta :get 200 url)))))
          (testing "for a regular user, opening an outdated app is a 409 that says what to do"
            (doseq [url ["apps/old" "apps/old/bundle"]]
              (is (=? {:error-code "data-app-outdated"
                       :message    #"This app was built for version 1 of data apps.*"}
                      (mt/user-http-request :rasta :get 409 url)))))
          (testing "the current app still opens"
            (is (= {:name "current" :display_name "Current"}
                   (mt/user-http-request :rasta :get 200 "apps/current")))
            (is (str/includes?
                 (str (mt/user-real-request :crowberto :get 200 "apps/current/bundle"))
                 "BUNDLE")))
          (testing "an admin sees the outdated app flagged, and can still read it to manage its groups"
            (is (=? [{:name "current" :version 2 :outdated false}
                     {:name "old" :version 1 :outdated true}]
                    (mt/user-http-request :crowberto :get 200 "apps")))
            (is (=? [{:name "current"}]
                    (mt/user-http-request :crowberto :get 200 "apps?available=true"))
                "but the navbar's available list leaves it out for admins too")
            (is (=? {:name "old" :version 1 :outdated true}
                    (mt/user-http-request :crowberto :get 200 "apps/old"))))
          (testing "nobody gets an outdated bundle"
            (is (=? {:error-code "data-app-outdated"}
                    (mt/user-http-request :crowberto :get 409 "apps/old/bundle"))))
          (testing "a management response carries the flag too"
            (is (=? {:name "old" :outdated true}
                    (mt/user-http-request :crowberto :put 200 "apps/old" {:enabled false})))))))))

(deftest bundle-includes-allowed-hosts-header-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (t2/insert! :model/DataApp
                  :name          "demo"
                  :display_name  "Demo"
                  :bundle_path   "data_apps/demo/index.js"
                  :bundle        (.getBytes "BUNDLE" "UTF-8")
                  :bundle_hash   "abc123"
                  :allowed_hosts ["https://api.example.com"])
      ;; publish the app so its bundle is served (crowberto, as a superuser, can read the collection)
      (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :name "demo"))
      (testing "the bundle response normalizes the configured product analytics origin"
        (mt/with-temporary-setting-values
          [metaplow-url "HTTPS://product-analytics-ingestion.metabase.com/api/send"]
          (let [resp (mt/user-http-request-full-response :crowberto :get 200 "apps/demo/bundle")]
            (is (= (json/encode ["https://api.example.com"
                                 "https://product-analytics-ingestion.metabase.com"])
                   (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"]))))))
      (testing "the configured staging origin replaces the production origin"
        (mt/with-temporary-setting-values [metaplow-url "https://product-analytics-ingestion.staging.metabase.com/api/send"]
          (let [resp (mt/user-http-request-full-response :crowberto :get 200 "apps/demo/bundle")]
            (is (= (json/encode ["https://api.example.com"
                                 "https://product-analytics-ingestion.staging.metabase.com"])
                   (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"]))))))
      (testing "an unset product analytics URL leaves the app's allowlist unchanged"
        (mt/with-temporary-setting-values [metaplow-url nil]
          (let [resp (mt/user-http-request-full-response :crowberto :get 200 "apps/demo/bundle")]
            (is (= (json/encode ["https://api.example.com"])
                   (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"])))))))))

(deftest list-includes-allowed-hosts-test
  (mt/with-premium-features #{:data-apps}
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

;;; ------------------------------------------------- Create & update -------------------------------------------------

(deftest create-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (testing "a non-superuser cannot create an app"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "apps" app-request))))
        (testing "a superuser creates an app with its manifest fields and bundle"
          (is (=? {:name                   "demo"
                   :display_name           "Demo app"
                   :bundle_path            "dist/index.js"
                   :allowed_hosts          ["https://api.example.com"]
                   :version                1
                   :enabled                true
                   :bundle_hash            string?
                   :resource_collection_id pos-int?}
                  (mt/user-http-request :crowberto :post 200 "apps"
                                        (assoc app-request :bundle_path "./dist/index.js"))))
          (is (str/includes? (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
                             "DEMOBUNDLE")))
        (testing "a taken slug is refused"
          (is (= "A data app with this slug already exists."
                 (mt/user-http-request :crowberto :post 409 "apps" app-request))))
        (testing "invalid manifest fields are refused"
          (doseq [bad [{:name "Not A Slug"}
                       {:name "repo-status"}
                       {:bundle_path "../escape.js"}
                       {:allowed_hosts ["ftp://example.com"]}
                       {:version 0}]]
            (mt/user-http-request :crowberto :post 400 "apps" (merge app-request {:name "other"} bad))
            (is (not (t2/exists? :model/DataApp :name "other")) (str "should refuse: " (pr-str bad)))))))))

(deftest update-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (let [{:keys [bundle_hash]} (mt/user-http-request :crowberto :post 200 "apps" app-request)]
          (testing "a non-superuser cannot update an app"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 "apps/demo" {:display_name "Mine"}))))
          (testing "a superuser updates manifest fields and the bundle"
            (let [updated (mt/user-http-request :crowberto :put 200 "apps/demo"
                                                {:display_name  "Renamed"
                                                 :description   "  What it does  "
                                                 :allowed_hosts []
                                                 :bundle        "NEWBUNDLE"})]
              (is (=? {:display_name "Renamed" :description "What it does" :allowed_hosts []}
                      updated))
              (is (not= bundle_hash (:bundle_hash updated)))
              (is (str/includes? (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
                                 "NEWBUNDLE"))))
          (testing "invalid manifest fields are refused"
            (mt/user-http-request :crowberto :put 400 "apps/demo" {:bundle_path "/abs.js"})
            (is (= "dist/index.js" (t2/select-one-fn :bundle_path :model/DataApp :name "demo"))))
          (testing "updating a missing app 404s"
            (mt/user-http-request :crowberto :put 404 "apps/missing" {:enabled false})))))))

(deftest delete-endpoint-requires-a-superuser-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection]
      (create-app!)
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta), :group_id group-id}]
        (let [app (t2/select-one :model/DataApp :name "demo")]
          (data-app.resources/ensure-resources! app)
          (group-access/add-groups! app [group-id]))
        (testing "an assigned user can open the app"
          (mt/user-http-request :rasta :get 200 "apps/demo"))
        (testing "an assigned user cannot delete the app"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 "apps/demo")))
          (is (t2/exists? :model/DataApp :name "demo")))))))

(deftest delete-endpoint-404s-for-a-missing-app-test
  (mt/with-premium-features #{:data-apps}
    (mt/user-http-request :crowberto :delete 404 "apps/missing")))

(deftest data-app-write-endpoints-require-feature-token-test
  (mt/with-premium-features #{}
    (mt/user-http-request :crowberto :put 402 "apps/demo/table-dependencies" {:table_ids []})
    (mt/user-http-request :crowberto :post 402 "apps/demo/draft")))

(deftest delete-endpoint-preserves-assigned-groups-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (create-app!)
      (mt/with-temp [:model/PermissionsGroup group {}]
        (let [app (t2/select-one :model/DataApp :name "demo")
              {collection-id :resource_collection_id} (data-app.resources/ensure-resources! app)]
          (mt/with-temp [:model/Card {card-id :id} {:collection_id collection-id}]
            (group-access/add-groups! app [(:id group)])
            (mt/user-http-request :crowberto :delete 204 "apps/demo")
            (is (not (t2/exists? :model/DataApp :id (:id app))))
            (is (not (t2/exists? :model/Collection :id collection-id)))
            (is (not (t2/exists? :model/Card :id card-id)))
            (is (empty? (t2/select :model/DataAppGroupAssignment :data_app_id (:id app))))
            (is (t2/exists? :model/PermissionsGroup :id (:id group)))))))))

;;; ----------------------------------------------------- API -----------------------------------------------------

(deftest list-and-bundle-endpoints-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "apps" app-request)
        (testing "GET / lists the apps"
          (is (=? [{:name "demo" :display_name "Demo app"
                    :bundle_path "dist/index.js" :enabled true}]
                  (mt/user-http-request :crowberto :get 200 "apps"))))
        (testing "GET /:slug/bundle serves the cached bytes"
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "DEMOBUNDLE")))))))

(deftest repo-status-endpoint-test
  (mt/with-premium-features #{:data-apps}
    (testing "reports no repository when none is connected"
      (mt/with-dynamic-fn-redefs [data-apps.apps/repo-url (constantly nil)]
        (is (=? {:configured false :url nil}
                (mt/user-http-request :crowberto :get 200 "apps/repo-status")))))
    (testing "reports the connected repository URL"
      (mt/with-dynamic-fn-redefs [data-apps.apps/repo-url (constantly "https://github.com/metabase/stats-remote-sync")]
        (is (=? {:configured true :url "https://github.com/metabase/stats-remote-sync"}
                (mt/user-http-request :crowberto :get 200 "apps/repo-status")))))))

(deftest enable-disable-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (mt/user-http-request :crowberto :post 200 "apps" app-request)
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
  (mt/with-premium-features #{:data-apps}
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
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
        (create-app!)
        (is (= 200 (:status (mt/user-http-request-full-response
                             :crowberto :get 200 "apps/sandbox-host"))))))))
