(ns metabase-enterprise.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.apps :as data-apps.apps]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------- Helpers ----------------------------------------------

(def ^:private app-bundle
  "The bundle of the apps these tests serve."
  (.getBytes "BUNDLE" "UTF-8"))

(def ^:private demo-app
  "The attributes of the app the endpoint tests serve."
  {:name          "demo"
   :display_name  "Demo app"
   :bundle_path   "dist/index.js"
   :allowed_hosts ["https://api.example.com"]
   :enabled       true
   :bundle        (.getBytes "DEMOBUNDLE" "UTF-8")})

;;; ---------------------------------------------- Permissions ----------------------------------------------

(deftest users-with-access-can-load-bundles-but-cannot-manage-apps-test
  ;; global mode so the `:data-apps` premium feature is visible to the real-HTTP
  ;; `user-real-request` calls below (which run on Jetty threads that don't inherit
  ;; a thread-local `binding`).
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp          app            {:bundle app-bundle}
                     :model/PermissionsGroup {group-id :id} {}]
        (testing "a user who cannot read the app's collection cannot open the app"
          (mt/user-http-request :rasta :get 403 (data-apps.tu/app-url app)))
        (testing "a member can open a data app"
          (group-access/add-groups! app [group-id])
          (perms/add-user-to-group! (mt/user->id :rasta) group-id)
          (is (str/includes? (str (mt/user-real-request :rasta :get 200 (data-apps.tu/app-url app "bundle")))
                             "BUNDLE")))
        (testing "a non-superuser is still forbidden from managing data apps"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/apps/repo-status")))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 (data-apps.tu/app-url app) {:enabled false}))))))))

(deftest superuser-can-manage-and-view-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp app {:bundle app-bundle}]
        (is (not (some #(= (:resource_collection_id app) (:id %))
                       (mt/user-http-request :rasta :get 200 "collection"))))
        (testing "a superuser can list, read metadata, and serve the bundle"
          (is (=? [{:name (:name app)}]
                  (mt/user-http-request :crowberto :get 200 "ee/apps")))
          (is (=? {:name (:name app) :resource_collection_id (:resource_collection_id app)}
                  (mt/user-http-request :crowberto :get 200 (data-apps.tu/app-url app))))
          (is (str/includes? (str (mt/user-real-request :crowberto :get 200 (data-apps.tu/app-url app "bundle")))
                             "BUNDLE")))))))

(deftest read-only-remote-sync-allows-enabling-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {}]
      (mt/with-temporary-setting-values [remote-sync-url  "https://github.com/test/repo.git"
                                         remote-sync-type :read-only]
        (testing "enabling and disabling an app is allowed on a read-only instance"
          (is (=? {:enabled false}
                  (mt/user-http-request :crowberto :put 200 (data-apps.tu/app-url app) {:enabled false}))))))))

(deftest enabling-a-data-app-is-not-a-synced-change-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/RemoteSyncObject]
      (mt/with-temp [:model/DataApp app {}]
        (mt/user-http-request :crowberto :put 200 (data-apps.tu/app-url app) {:enabled false})
        (is (not (t2/exists? :model/RemoteSyncObject :model_type "DataApp" :model_id (:id app))))))))

(deftest data-app-write-endpoints-require-feature-token-test
  (mt/with-premium-features #{}
    (mt/user-http-request :crowberto :put 402 "ee/apps/demo" {:enabled false})))

(deftest group-with-access-reaches-only-copied-actions-test
  (testing "an action is reachable exactly when it lives in the data app collection"
    (mt/with-premium-features #{:data-apps}
      (data-apps.tu/with-published-tables! [(mt/id :venues)]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-temp [:model/DataApp          {app-collection-id :resource_collection_id :as app} {}
                         :model/PermissionsGroup {group-id :id}                                      {}
                         :model/Collection       {source-collection-id :id}                          {:namespace :data-actions}
                         :model/Action           {source-id :id}                                     {:type          :implicit
                                                                                                      :collection_id source-collection-id}
                         :model/ImplicitAction   _                                                   {:action_id source-id
                                                                                                      :kind      "row/update"
                                                                                                      :table_id  (mt/id :venues)}
                         :model/Action           {copied-id :id}                                     {:type          :implicit
                                                                                                      :collection_id app-collection-id}
                         :model/ImplicitAction   _                                                   {:action_id copied-id
                                                                                                      :kind      "row/update"
                                                                                                      :table_id  (mt/id :venues)}]
            (group-access/add-groups! app [group-id])
            (perms/add-user-to-group! (mt/user->id :rasta) group-id)
            (testing "the group with access reads the action copied into the app collection"
              (is (=? {:id copied-id}
                      (mt/user-http-request :rasta :get 200 (str "action/" copied-id)))))
            (testing "the same group cannot read the source action it was copied from"
              (is (= "You don't have permissions to do that."
                     (mt/user-http-request :rasta :get 403 (str "action/" source-id)))))
            (testing "a superuser still reads both"
              (is (=? {:id source-id}
                      (mt/user-http-request :crowberto :get 200 (str "action/" source-id)))))))))))

(deftest outdated-apps-are-hidden-from-users-and-badged-for-admins-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp          old            {:version 1}
                     :model/DataApp          current        {:bundle app-bundle :version 2}
                     :model/PermissionsGroup {group-id :id} {}]
        (perms/add-user-to-group! (mt/user->id :rasta) group-id)
        (doseq [app [old current]]
          (group-access/add-groups! app [group-id]))
        (with-redefs [data-app.config/supported-app-version 2]
          (testing "a regular user is never told about the outdated app in a list"
            (is (= [{:id (:id current) :name (:name current) :display_name (:display_name current) :enabled true :outdated false}]
                   (mt/user-http-request :rasta :get 200 "ee/apps"))))
          (testing "for a regular user, opening an outdated app is a 409 that says what to do"
            (doseq [url [(data-apps.tu/app-url old) (data-apps.tu/app-url old "bundle")]]
              (is (=? {:error-code "data-app-outdated"
                       :message    #"This app was built for version 1 of data apps.*"}
                      (mt/user-http-request :rasta :get 409 url)))))
          (testing "the current app still opens"
            (is (= {:id (:id current) :name (:name current) :display_name (:display_name current) :enabled true :outdated false}
                   (mt/user-http-request :rasta :get 200 (data-apps.tu/app-url current))))
            (is (str/includes? (str (mt/user-real-request :crowberto :get 200 (data-apps.tu/app-url current "bundle")))
                               "BUNDLE")))
          (testing "an admin sees the outdated app flagged, and can still read it to manage its groups"
            (is (=? #{{:name (:name current) :version 2 :outdated false}
                      {:name (:name old) :version 1 :outdated true}}
                    (set (map #(select-keys % [:name :version :outdated])
                              (mt/user-http-request :crowberto :get 200 "ee/apps")))))
            (is (=? {:name (:name old) :version 1 :outdated true}
                    (mt/user-http-request :crowberto :get 200 (data-apps.tu/app-url old)))))
          (testing "nobody gets an outdated bundle"
            (is (=? {:error-code "data-app-outdated"}
                    (mt/user-http-request :crowberto :get 409 (data-apps.tu/app-url old "bundle")))))
          (testing "a management response carries the flag too"
            (is (=? {:name (:name old) :outdated true}
                    (mt/user-http-request :crowberto :put 200 (data-apps.tu/app-url old) {:enabled false})))))))))

(deftest bundle-includes-allowed-hosts-header-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:bundle app-bundle :allowed_hosts ["https://api.example.com"]}]
      (testing "the bundle response includes only the app's configured allowed hosts"
        (let [resp (mt/user-http-request-full-response :crowberto :get 200 (data-apps.tu/app-url app "bundle"))]
          (is (= (json/encode ["https://api.example.com"])
                 (get-in resp [:headers "X-Metabase-Data-App-Allowed-Hosts"]))))))))

(deftest list-includes-allowed-hosts-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp with-hosts    {:allowed_hosts ["https://api.example.com"]}
                   :model/DataApp without-hosts {}]
      (testing "the list endpoint returns allowed_hosts, always a list, also for an app stored with NULL (→ [])"
        (let [by-name (->> (mt/user-http-request :crowberto :get 200 "ee/apps")
                           (into {} (map (juxt :name identity))))]
          (is (= ["https://api.example.com"] (get-in by-name [(:name with-hosts) :allowed_hosts])))
          (is (= [] (get-in by-name [(:name without-hosts) :allowed_hosts]))))))))

;;; ---------------------------------------------------- Update ----------------------------------------------------

(deftest update-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp app {:display_name "Demo app"}]
        (let [url (data-apps.tu/app-url app)]
          (testing "a non-superuser cannot update an app"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 url {:enabled false}))))
          (testing "a superuser enables and disables an app"
            (is (=? {:enabled false} (mt/user-http-request :crowberto :put 200 url {:enabled false})))
            (is (=? {:enabled true} (mt/user-http-request :crowberto :put 200 url {:enabled true}))))
          (testing "anything else about an app changes only through an import"
            (mt/user-http-request :crowberto :put 400 url {:display_name "Renamed"})
            (is (= "Demo app" (t2/select-one-fn :display_name :model/DataApp :id (:id app)))))
          (testing "updating a missing app 404s"
            (mt/user-http-request :crowberto :put 404 "ee/apps/missing" {:enabled false})))))))

;;; ----------------------------------------------------- API -----------------------------------------------------

(deftest list-and-bundle-endpoints-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp _ demo-app]
        (testing "GET / lists the apps"
          (is (=? [{:name "demo" :display_name "Demo app"
                    :bundle_path "dist/index.js" :enabled true}]
                  (mt/user-http-request :crowberto :get 200 "ee/apps"))))
        (testing "GET /:slug/bundle serves the cached bytes"
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "ee/apps/demo/bundle"))
               "DEMOBUNDLE")))))))

(deftest repo-status-endpoint-test
  (mt/with-premium-features #{:data-apps}
    (testing "reports no repository when none is connected"
      (mt/with-dynamic-fn-redefs [data-apps.apps/repo-url (constantly nil)]
        (is (=? {:configured false :url nil}
                (mt/user-http-request :crowberto :get 200 "ee/apps/repo-status")))))
    (testing "reports the connected repository URL"
      (mt/with-dynamic-fn-redefs [data-apps.apps/repo-url (constantly "https://github.com/metabase/stats-remote-sync")]
        (is (=? {:configured true :url "https://github.com/metabase/stats-remote-sync"}
                (mt/user-http-request :crowberto :get 200 "ee/apps/repo-status")))))))

(deftest enable-disable-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-temp [:model/DataApp _ demo-app]
        (testing "PUT /:slug can disable an app"
          (is (=? {:name "demo" :enabled false}
                  (mt/user-http-request :crowberto :put 200 "ee/apps/demo" {:enabled false}))))
        (testing "a disabled app is not served to a user with access"
          (group-access/add-groups! (t2/select-one :model/DataApp :name "demo") [(:id (perms/all-users-group))])
          (mt/user-http-request :rasta :get 403 "ee/apps/demo")
          (mt/user-real-request :rasta :get 403 "ee/apps/demo/bundle"))
        (testing "a superuser still reads a disabled app's metadata and bundle"
          (is (=? {:name "demo" :enabled false}
                  (mt/user-http-request :crowberto :get 200 "ee/apps/demo")))
          (mt/user-real-request :crowberto :get 200 "ee/apps/demo/bundle"))
        (testing "re-enabling restores serving"
          (is (=? {:enabled true}
                  (mt/user-http-request :crowberto :put 200 "ee/apps/demo" {:enabled true})))
          (is (=? {:name "demo"} (mt/user-http-request :crowberto :get 200 "ee/apps/demo"))))))))

(deftest sandbox-host-endpoint-test
  (mt/with-premium-features #{:data-apps}
    (let [resp    (mt/user-http-request-full-response :crowberto :get 200 "ee/apps/sandbox-host")
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
      (mt/with-temp [:model/DataApp _ {}]
        (is (= 200 (:status (mt/user-http-request-full-response
                             :crowberto :get 200 "ee/apps/sandbox-host"))))))))

(deftest admins-write-the-resource-collection-through-the-api-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (mt/with-actions-enabled
        (mt/with-model-cleanup [:model/Card :model/Action]
          (mt/with-temp [:model/DataApp {collection-id :resource_collection_id} {}]
            (let [query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :venues)))]
              (testing "an admin creates a question in the app's collection"
                (is (=? {:collection_id collection-id}
                        (mt/user-http-request :crowberto :post 200 "card" {:name                   "Venues"
                                                                           :collection_id          collection-id
                                                                           :display                "table"
                                                                           :visualization_settings {}
                                                                           :dataset_query          query}))))
              (testing "an admin creates an action in the app's collection"
                (is (=? {:collection_id collection-id}
                        (mt/user-http-request :crowberto :post 200 "action"
                                              {:name          "Rename venues"
                                               :type          "implicit"
                                               :kind          "row/update"
                                               :table_id      (mt/id :venues)
                                               :collection_id collection-id}))))
              (testing "nobody else writes it"
                (mt/user-http-request :rasta :post 403 "card" {:name                   "Mine"
                                                               :collection_id          collection-id
                                                               :display                "table"
                                                               :visualization_settings {}
                                                               :dataset_query          query})))))))))

(deftest disabled-apps-are-listed-only-to-superusers-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp app {:name "demo" :enabled false}]
      (group-access/add-groups! app [(:id (perms/all-users-group))])
      (testing "a user with access doesn't see the disabled app"
        (is (not-any? #(= "demo" (:name %)) (mt/user-http-request :rasta :get 200 "ee/apps"))))
      (testing "a superuser does"
        (is (some #(= "demo" (:name %)) (mt/user-http-request :crowberto :get 200 "ee/apps"))))
      (testing "a user with access sees it once it's enabled"
        (mt/user-http-request :crowberto :put 200 "ee/apps/demo" {:enabled true})
        (is (some #(= "demo" (:name %)) (mt/user-http-request :rasta :get 200 "ee/apps")))))))

(deftest apps-are-listed-only-to-users-who-can-read-their-collection-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-temp [:model/DataApp _ {:name "demo"}]
      (testing "a user without a grant on the app's collection doesn't see the app"
        (is (not-any? #(= "demo" (:name %)) (mt/user-http-request :rasta :get 200 "ee/apps"))))
      (testing "a user sees it once their group can read the collection"
        (group-access/add-groups! (t2/select-one :model/DataApp :name "demo") [(:id (perms/all-users-group))])
        (is (some #(= "demo" (:name %)) (mt/user-http-request :rasta :get 200 "ee/apps")))))))

;;; --------------------------------------------------- Generate ---------------------------------------------------

(def ^:private collection-entity-id "AppCollection12345678")

(deftest generate-schema-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (testing "a non-superuser cannot generate an app's files"
        (mt/user-http-request :rasta :get 403 "ee/apps/generate/schema"))
      (let [[{:keys [path contents]} :as files] (mt/user-http-request :crowberto :get 200 "ee/apps/generate/schema")]
        (is (= 1 (count files)))
        (is (= "src/metabase.schema.ts" path))
        (testing "the schema holds the published tables with their fields, and the Library's metrics"
          (is (str/includes? contents "const tables = {"))
          (is (str/includes? contents (str "id: " (mt/id :venues))))
          (is (str/includes? contents (str "fieldId: " (mt/id :venues :name))))
          (is (str/includes? contents "const metrics = {")))
        (testing "and no actions"
          (is (not (str/includes? contents "actions"))))))))

(deftest generate-queries-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (let [definition {:entityId "VenuesByCategory12345"
                        :query    {:stages [{:source       {:type "table" :id (mt/id :venues) :name "Venues"}
                                             :aggregations [{:type "operator" :operator "count" :args []}]
                                             :breakouts    [{:type        "column"
                                                             :name        "CATEGORY_ID"
                                                             :fieldId     (mt/id :venues :category_id)
                                                             :displayName "Category ID"
                                                             :jsType      "number"}]}]}}
            [{:keys [path contents]} :as files]
            (mt/user-http-request :crowberto :post 200 "ee/apps/generate/queries"
                                  {:collection collection-entity-id
                                   :queries    {:venuesByCategory definition}})]
        (is (= 1 (count files)))
        (testing "a question is named after its export and filed in the app's collection by its entity ID"
          (is (= "venuesbycategory.yaml" path))
          (is (str/includes? contents "name: venuesByCategory\n"))
          (is (str/includes? contents "entity_id: VenuesByCategory12345\n"))
          (is (str/includes? contents (str "collection_id: " collection-entity-id "\n"))))
        (testing "its query is the definition's, with portable references"
          (is (str/includes? contents "- count"))
          (is (str/includes? contents "- CATEGORY_ID")))))))

(defn- venues-definition
  "A definition of a question on venues with entity ID `entity-id`, with `stage` merged into its one stage."
  [entity-id stage]
  {:entityId entity-id
   :query    {:stages [(merge {:source {:type "table" :id (mt/id :venues) :name "Venues"}} stage)]}})

(deftest generate-queries-refuses-invalid-definitions-test
  (mt/with-premium-features #{:data-apps}
    (data-apps.tu/with-published-tables! [(mt/id :venues)]
      (testing "a definition that doesn't match its schema"
        (mt/user-http-request :crowberto :post 400 "ee/apps/generate/queries"
                              {:collection collection-entity-id
                               :queries    {:venues (venues-definition "Venues123456789012345" {:limit "five"})
                                            :valid  (venues-definition "Valid1234567890123456" {})}}))
      (testing "export names whose files have the same path"
        (mt/user-http-request :crowberto :post 400 "ee/apps/generate/queries"
                              {:collection collection-entity-id
                               :queries    {:venueList (venues-definition "VenueList123456789012" {})
                                            :VenueList (venues-definition "VenueList223456789012" {})}})))))

(deftest generate-actions-refuses-invalid-definitions-test
  (mt/with-premium-features #{:data-apps}
    (testing "a definition that doesn't match its schema"
      (mt/user-http-request :crowberto :post 400 "ee/apps/generate/actions"
                            {:collection collection-entity-id
                             :actions    {:updateVenue {:entityId "UpdateVenue1234567890"
                                                        :kind     "row/upsert"
                                                        :table    {:id (mt/id :venues)}}
                                          :valid       {:entityId "Valid1234567890123456"
                                                        :kind     "row/update"
                                                        :table    {:id (mt/id :venues)}}}}))
    (testing "export names whose files have the same path"
      (mt/user-http-request :crowberto :post 400 "ee/apps/generate/actions"
                            {:collection collection-entity-id
                             :actions    {:updateVenue {:entityId "UpdateVenue1234567890"
                                                        :kind     "row/update"
                                                        :table    {:id (mt/id :venues)}}
                                          :UpdateVenue {:entityId "UpdateVenue2234567890"
                                                        :kind     "row/update"
                                                        :table    {:id (mt/id :venues)}}}}))))

(deftest generate-actions-test
  (mt/with-premium-features #{:data-apps}
    (let [[{:keys [path contents]} :as files]
          (mt/user-http-request :crowberto :post 200 "ee/apps/generate/actions"
                                {:collection collection-entity-id
                                 :actions    {:updateVenue {:entityId "UpdateVenue1234567890"
                                                            :kind     "row/update"
                                                            :table    {:id (mt/id :venues) :name "Venues"}}}})]
      (is (= 1 (count files)))
      (testing "an implicit action is named after its export and filed in the app's collection by its entity ID"
        (is (= "updatevenue.yaml" path))
        (is (str/includes? contents "name: updateVenue\n"))
        (is (str/includes? contents "entity_id: UpdateVenue1234567890\n"))
        (is (str/includes? contents (str "collection_id: " collection-entity-id "\n")))
        (is (str/includes? contents "type: implicit\n"))
        (is (str/includes? contents "kind: row/update"))
        (is (str/includes? contents "- VENUES"))))))
