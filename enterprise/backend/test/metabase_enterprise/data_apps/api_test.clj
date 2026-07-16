(ns metabase-enterprise.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.sync :as data-app.sync]
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

(def ^:private fake-sha "0123456789abcdef0123456789abcdef01234567")

(defn- snapshot
  "Build a snapshot (as the remote-sync import passes one) from a path->content
   map. `read-file` returns file text (a string) or nil."
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha        sha
   :list-files (fn [] (vec (keys path->content)))
   :read-file  (fn [p] (get path->content p))})

(defn- app-config
  "Render a per-app data_app.yaml from `{:name :path :allowed_hosts}`. No slug: an
   app's slug is the name of the directory the config sits in."
  [{:keys [name path allowed_hosts]}]
  (str (format "name: %s\npath: %s\n" name path)
       (when (seq allowed_hosts)
         (apply str "allowed_hosts:\n"
                (map #(format "  - %s\n" %) allowed_hosts)))))

(defn- app-files
  "Repo files for one data app under `data_apps/<dir>/`: its data_app.yaml plus a
   bundle at `path` with `bundle` content."
  [dir {:keys [path bundle] :as cfg}]
  {(format "data_apps/%s/data_app.yaml" dir) (app-config cfg)
   (format "data_apps/%s/%s" dir path)       bundle})

;;; ---------------------------------------------- Permissions ----------------------------------------------

(deftest non-superuser-can-view-and-list-but-not-manage-test
  ;; global mode so the `:data-apps` premium feature is visible to the real-HTTP
  ;; `user-real-request` calls below (which run on Jetty threads that don't inherit
  ;; a thread-local `binding`).
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (create-app!)
        (testing "a non-superuser can view (open) a data app"
          (is (= [{:name "demo" :display_name "Demo"}]
                 (mt/user-http-request :rasta :get 200 "apps")))
          (is (= {:name "demo" :display_name "Demo"}
                 (mt/user-http-request :rasta :get 200 "apps/demo")))
          (is (str/includes?
               (str (mt/user-real-request :rasta :get 200 "apps/demo/bundle"))
               "BUNDLE")))
        (testing "but is still forbidden from managing data apps"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "apps/repo-status")))
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "apps/demo" {:enabled false}))))))))

(deftest superuser-can-manage-and-view-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (create-app!)
        (testing "a superuser can list, read metadata, and serve the bundle"
          (is (=? [{:name "demo" :display_name "Demo"}]
                  (mt/user-http-request :crowberto :get 200 "apps")))
          (is (=? {:name "demo"}
                  (mt/user-http-request :crowberto :get 200 "apps/demo")))
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "BUNDLE")))))))

(deftest list-available-apps-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp]
      (t2/insert! :model/DataApp :name "ready" :display_name "Ready" :bundle_path "data_apps/ready/index.js")
      (t2/insert! :model/DataApp :name "disabled" :display_name "Disabled" :bundle_path "data_apps/disabled/index.js"
                  :enabled false)
      (t2/insert! :model/DataApp :name "failed" :display_name "Failed" :bundle_path "data_apps/failed/index.js"
                  :sync_error "Could not read bundle")
      (is (=? [{:name "ready" :display_name "Ready"}]
              (mt/user-http-request :crowberto :get 200 "apps?available=true"))))))

(deftest bundle-includes-allowed-hosts-header-test
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp]
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
  (mt/with-premium-features #{:data-apps}
    (mt/with-model-cleanup [:model/DataApp]
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
  (mt/with-model-cleanup [:model/DataApp]
    (let [result (data-app.sync/import-from-snapshot!
                  (snapshot (merge (app-files "sales" {:name "Sales" :path "dist/index.js" :bundle "SALES-BUNDLE"})
                                   (app-files "ops"   {:name "Ops"   :path "dist/app.js"   :bundle "OPS-BUNDLE"}))))]
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
  (mt/with-model-cleanup [:model/DataApp]
    (testing "allowed_hosts from data_app.yaml are persisted on the row"
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "sales" {:name "Sales" :path "dist/index.js" :bundle "B"
                                     :allowed_hosts ["https://api.example.com" "https://*.acme.com"]})))
      (is (= ["https://api.example.com" "https://*.acme.com"]
             (:allowed_hosts (t2/select-one :model/DataApp :name "sales")))))
    (testing "re-syncing without allowed_hosts clears them to an empty list"
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "sales" {:name "Sales" :path "dist/index.js" :bundle "B"})))
      (is (= [] (:allowed_hosts (t2/select-one :model/DataApp :name "sales")))))))

(deftest import-keeps-apps-absent-from-snapshot-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (merge (app-files "keep" {:name "Keep" :path "index.js" :bundle "KEEP"})
                      (app-files "gone" {:name "Gone" :path "index.js" :bundle "GONE"}))))
    (is (= #{"keep" "gone"} (t2/select-fn-set :name :model/DataApp)))
    ;; A sync never deletes: an app missing from a later snapshot is kept, not
    ;; pruned. Removal is an explicit admin action (DELETE /api/apps/:slug).
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "keep" {:name "Keep" :path "index.js" :bundle "KEEP"})))
    (is (= #{"keep" "gone"} (t2/select-fn-set :name :model/DataApp))
        "the app absent from the later snapshot is kept")))

(deftest delete-endpoint-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (create-app!)
        (testing "a non-superuser cannot remove an app"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 "apps/demo")))
          (is (t2/exists? :model/DataApp :name "demo")))
        (testing "a superuser removes the app"
          (is (nil? (mt/user-http-request :crowberto :delete 204 "apps/demo")))
          (is (not (t2/exists? :model/DataApp :name "demo"))))
        (testing "removing a non-existent app 404s"
          (mt/user-http-request :crowberto :delete 404 "apps/missing"))))))

(deftest import-preserves-enabled-across-syncs-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "a" {:name "A" :path "index.js" :bundle "V1"})))
    (t2/update! :model/DataApp :name "a" {:enabled false})
    ;; a new bundle must not flip the admin's enabled toggle back on
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "a" {:name "A" :path "index.js" :bundle "V2"})))
    (let [a (t2/select-one :model/DataApp :name "a")]
      (is (false? (:enabled a)) "the disabled toggle is preserved")
      (is (= "V2" (String. ^bytes (:bundle a) "UTF-8")) "the bundle is still updated"))))

(deftest import-per-app-error-test
  (testing "a missing bundle file fails just that app, not the whole import"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "good" {:name "Good" :path "index.js" :bundle "GOOD"})
                        ;; "bad" declares a path that doesn't exist
                        {"data_apps/bad/data_app.yaml" (app-config {:name "Bad" :path "missing.js"})})))
      (is (= #{"good" "bad"} (t2/select-fn-set :name :model/DataApp)))
      (let [good (t2/select-one :model/DataApp :name "good")
            bad  (t2/select-one :model/DataApp :name "bad")]
        (is (= "GOOD" (String. ^bytes (:bundle good) "UTF-8")))
        (is (nil? (:sync_error good)))
        (is (nil? (:bundle bad)))
        (is (str/includes? (:sync_error bad) "missing.js"))))))

(deftest import-serves-each-app-from-its-directory-test
  (testing "the directory an app lives in is the slug it's served at — two apps can't collide on one"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "one" {:name "One" :path "a.js" :bundle "A"})
                        (app-files "two" {:name "Two" :path "b.js" :bundle "B"}))))
      (is (= #{"one" "two"} (t2/select-fn-set :name :model/DataApp))))))

(deftest import-isolates-bad-config-test
  (testing "a malformed data_app.yaml is isolated: other apps still sync, the bad one is reported, nothing is pruned"
    (mt/with-model-cleanup [:model/DataApp]
      ;; pre-existing app that must survive a sync where another config is broken
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "existing" {:name "Existing" :path "i.js" :bundle "E"})))
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot (merge (app-files "good" {:name "Good" :path "i.js" :bundle "GOOD"})
                                     {"data_apps/bad/data_app.yaml" "name: [unterminated"})))]
        (is (=? {:synced 1} result))
        (is (= 1 (count (:config-errors result))))
        (is (= #{"existing" "good"} (t2/select-fn-set :name :model/DataApp))
            "the good app is added and the pre-existing app is NOT pruned despite the bad config")))))

(deftest sync-from-snapshot!-never-throws-test
  (testing "a malformed data_app.yaml is isolated into :config-errors; the app just doesn't appear, the sync doesn't throw"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot {"data_apps/x/data_app.yaml" "name: [unterminated"}))]
        (is (seq (:config-errors result)))
        (is (empty? (t2/select-fn-set :name :model/DataApp))))))
  (testing "a clean sync materializes the app with no config errors"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot (app-files "a" {:name "A" :path "index.js" :bundle "A"})))]
        (is (empty? (:config-errors result)))
        (is (= #{"a"} (t2/select-fn-set :name :model/DataApp)))))))

;;; ----------------------------------------------------- API -----------------------------------------------------

(deftest list-and-bundle-endpoints-test
  (mt/test-helpers-set-global-values!
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (data-app.sync/import-from-snapshot!
         (snapshot (app-files "demo" {:name "Demo app" :path "dist/index.js" :bundle "DEMOBUNDLE"})))
        (testing "GET / lists the synced apps"
          (is (=? [{:name "demo" :display_name "Demo app"
                    :bundle_path "data_apps/demo/dist/index.js" :enabled true}]
                  (mt/user-http-request :crowberto :get 200 "apps"))))
        (testing "GET /:slug/bundle serves the cached bytes"
          (is (str/includes?
               (str (mt/user-real-request :crowberto :get 200 "apps/demo/bundle"))
               "DEMOBUNDLE")))))))

(deftest repo-status-endpoint-test
  (mt/with-premium-features #{:data-apps}
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
    (mt/with-premium-features #{:data-apps}
      (mt/with-model-cleanup [:model/DataApp]
        (data-app.sync/import-from-snapshot!
         (snapshot (app-files "demo" {:name "Demo" :path "index.js" :bundle "BUNDLE"})))
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
