(ns metabase.data-apps.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.data-apps.sync :as data-app.sync]
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
  "Render a per-app data_app.yml from `{:name :slug :path}`."
  [{:keys [name slug path]}]
  (format "name: %s\nslug: %s\npath: %s\n" name slug path))

(defn- app-files
  "Repo files for one data app under `data_apps/<dir>/`: its data_app.yml plus a
   bundle at `path` with `bundle` content."
  [dir {:keys [path bundle] :as cfg}]
  {(format "data_apps/%s/data_app.yml" dir) (app-config cfg)
   (format "data_apps/%s/%s" dir path)      bundle})

;;; ---------------------------------------------- Permissions ----------------------------------------------

(deftest non-superuser-is-forbidden-test
  (mt/with-model-cleanup [:model/DataApp]
    (create-app!)
    (testing "a non-superuser is forbidden from every data-app endpoint"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "data-app")))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "data-app/repo-status")))
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "data-app/demo")))
      (mt/user-real-request :rasta :get 403 "data-app/demo/bundle")
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "data-app/demo" {:enabled false}))))))

(deftest superuser-can-manage-and-view-test
  (mt/with-model-cleanup [:model/DataApp]
    (create-app!)
    (testing "a superuser can list, read metadata, and serve the bundle"
      (is (=? [{:name "demo" :display_name "Demo"}]
              (mt/user-http-request :crowberto :get 200 "data-app")))
      (is (=? {:name "demo"}
              (mt/user-http-request :crowberto :get 200 "data-app/demo")))
      (is (str/includes?
           (str (mt/user-real-request :crowberto :get 200 "data-app/demo/bundle"))
           "BUNDLE")))))

;;; ----------------------------------------------------- Sync -----------------------------------------------------

(deftest import-materializes-apps-test
  (mt/with-model-cleanup [:model/DataApp]
    (let [result (data-app.sync/import-from-snapshot!
                  (snapshot (merge (app-files "sales" {:name "Sales" :slug "sales" :path "dist/index.js" :bundle "SALES-BUNDLE"})
                                   (app-files "ops"   {:name "Ops"   :slug "ops"   :path "dist/app.js"   :bundle "OPS-BUNDLE"}))))]
      (is (=? {:synced 2} result))
      (is (= #{"sales" "ops"} (t2/select-fn-set :name :model/DataApp)))
      (let [sales (t2/select-one :model/DataApp :name "sales")]
        (is (= "SALES-BUNDLE" (String. ^bytes (:bundle sales) "UTF-8")))
        (is (= "Sales" (:display_name sales)))
        (is (= "data_apps/sales/dist/index.js" (:bundle_path sales)))
        (is (true? (:enabled sales)))
        (is (= fake-sha (:last_synced_sha sales)))
        (is (nil? (:sync_error sales)))))))

(deftest import-prunes-removed-apps-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (merge (app-files "keep" {:name "Keep" :slug "keep" :path "index.js" :bundle "KEEP"})
                      (app-files "drop" {:name "Drop" :slug "drop" :path "index.js" :bundle "DROP"}))))
    (is (= #{"keep" "drop"} (t2/select-fn-set :name :model/DataApp)))
    ;; a later snapshot without "drop" prunes it
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "keep" {:name "Keep" :slug "keep" :path "index.js" :bundle "KEEP"})))
    (is (= #{"keep"} (t2/select-fn-set :name :model/DataApp))
        "the removed app is pruned")))

(deftest import-preserves-enabled-across-syncs-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "V1"})))
    (t2/update! :model/DataApp :name "a" {:enabled false})
    ;; a new bundle must not flip the admin's enabled toggle back on
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "V2"})))
    (let [a (t2/select-one :model/DataApp :name "a")]
      (is (false? (:enabled a)) "the disabled toggle is preserved")
      (is (= "V2" (String. ^bytes (:bundle a) "UTF-8")) "the bundle is still updated"))))

(deftest import-per-app-error-test
  (testing "a missing bundle file fails just that app, not the whole import"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot (merge (app-files "good" {:name "Good" :slug "good" :path "index.js" :bundle "GOOD"})
                        ;; "bad" declares a path that doesn't exist
                        {"data_apps/bad/data_app.yml" (app-config {:name "Bad" :slug "bad" :path "missing.js"})})))
      (is (= #{"good" "bad"} (t2/select-fn-set :name :model/DataApp)))
      (let [good (t2/select-one :model/DataApp :name "good")
            bad  (t2/select-one :model/DataApp :name "bad")]
        (is (= "GOOD" (String. ^bytes (:bundle good) "UTF-8")))
        (is (nil? (:sync_error good)))
        (is (nil? (:bundle bad)))
        (is (str/includes? (:sync_error bad) "missing.js"))))))

(deftest import-duplicate-slugs-test
  (mt/with-model-cleanup [:model/DataApp]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo #"share a slug"
         (data-app.sync/import-from-snapshot!
          (snapshot (merge (app-files "one" {:name "One" :slug "dup" :path "a.js" :bundle "A"})
                           (app-files "two" {:name "Two" :slug "dup" :path "b.js" :bundle "B"}))))))))

(deftest import-isolates-bad-config-test
  (testing "a malformed data_app.yml is isolated: other apps still sync, the bad one is reported, nothing is pruned"
    (mt/with-model-cleanup [:model/DataApp]
      ;; pre-existing app that must survive a sync where another config is broken
      (data-app.sync/import-from-snapshot!
       (snapshot (app-files "existing" {:name "Existing" :slug "existing" :path "i.js" :bundle "E"})))
      (let [result (data-app.sync/import-from-snapshot!
                    (snapshot (merge (app-files "good" {:name "Good" :slug "good" :path "i.js" :bundle "GOOD"})
                                     {"data_apps/bad/data_app.yml" "name: [unterminated"})))]
        (is (=? {:synced 1} result))
        (is (= 1 (count (:config-errors result))))
        (is (= #{"existing" "good"} (t2/select-fn-set :name :model/DataApp))
            "the good app is added and the pre-existing app is NOT pruned despite the bad config")))))

(deftest sync-from-snapshot!-never-throws-test
  (testing "a malformed data_app.yml is isolated into :config-errors; the app just doesn't appear, the sync doesn't throw"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot {"data_apps/x/data_app.yml" "name: [unterminated"}))]
        (is (seq (:config-errors result)))
        (is (empty? (t2/select-fn-set :name :model/DataApp))))))
  (testing "a clean sync materializes the app with no config errors"
    (mt/with-model-cleanup [:model/DataApp]
      (let [result (data-app.sync/sync-from-snapshot!
                    (snapshot (app-files "a" {:name "A" :slug "a" :path "index.js" :bundle "A"})))]
        (is (empty? (:config-errors result)))
        (is (= #{"a"} (t2/select-fn-set :name :model/DataApp)))))))

(deftest import-accepts-yaml-extension-test
  (testing "data_app.yaml (not just .yml) is discovered"
    (mt/with-model-cleanup [:model/DataApp]
      (data-app.sync/import-from-snapshot!
       (snapshot {"data_apps/y/data_app.yaml" (app-config {:name "Y" :slug "y" :path "i.js"})
                  "data_apps/y/i.js"          "YBUNDLE"}))
      (is (= #{"y"} (t2/select-fn-set :name :model/DataApp))))))

;;; ----------------------------------------------------- API -----------------------------------------------------

(deftest list-and-bundle-endpoints-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "demo" {:name "Demo app" :slug "demo" :path "dist/index.js" :bundle "DEMOBUNDLE"})))
    (testing "GET / lists the synced apps"
      (is (=? [{:name "demo" :display_name "Demo app"
                :bundle_path "data_apps/demo/dist/index.js" :enabled true}]
              (mt/user-http-request :crowberto :get 200 "data-app"))))
    (testing "GET /:slug/bundle serves the cached bytes"
      (is (str/includes?
           (str (mt/user-real-request :crowberto :get 200 "data-app/demo/bundle"))
           "DEMOBUNDLE")))))

(deftest repo-status-endpoint-test
  (testing "configured reflects whether a repository is connected"
    (mt/with-dynamic-fn-redefs [data-app.sync/repo-configured? (constantly false)]
      (is (=? {:configured false} (mt/user-http-request :crowberto :get 200 "data-app/repo-status"))))
    (mt/with-dynamic-fn-redefs [data-app.sync/repo-configured? (constantly true)]
      (is (=? {:configured true} (mt/user-http-request :crowberto :get 200 "data-app/repo-status"))))))

(deftest enable-disable-endpoint-test
  (mt/with-model-cleanup [:model/DataApp]
    (data-app.sync/import-from-snapshot!
     (snapshot (app-files "demo" {:name "Demo" :slug "demo" :path "index.js" :bundle "BUNDLE"})))
    (testing "PUT /:slug can disable an app"
      (is (=? {:name "demo" :enabled false}
              (mt/user-http-request :crowberto :put 200 "data-app/demo" {:enabled false}))))
    (testing "a disabled app is not served"
      (is (= "Not found." (mt/user-http-request :crowberto :get 404 "data-app/demo")))
      (mt/user-real-request :crowberto :get 404 "data-app/demo/bundle"))
    (testing "re-enabling restores serving"
      (is (=? {:enabled true}
              (mt/user-http-request :crowberto :put 200 "data-app/demo" {:enabled true})))
      (is (=? {:name "demo"} (mt/user-http-request :crowberto :get 200 "data-app/demo"))))))
