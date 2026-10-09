(ns metabase-enterprise.data-apps.generate.app-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-apps.config]
   [metabase-enterprise.data-apps.generate.app :as generate.app]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- file-yaml
  "The parsed YAML of the file at `path` among the `files` of a generated app."
  [{:keys [files]} path]
  (some-> (first (filter #(= path (:path %)) files)) :yaml yaml/parse-string))

(deftest generates-the-manifest-and-the-collection-file-test
  (let [result        (generate.app/generate {:name "Sales Ops"})
        app           (file-yaml result "data_apps/sales-ops/data_app.yaml")
        collection-id (:entity_id (file-yaml result (data-apps.tu/collection-path "Data App: sales-ops")))]
    (testing "a manifest and a collection file, each at the path a remote-sync export writes it"
      (is (= ["data_apps/sales-ops/data_app.yaml" "collections/data_apps/data_app__sales_ops.yaml"]
             (map :path (:files result)))))
    (testing "the manifest names the app, its bundle, its version and the collection it owns"
      (is (=? {:name        "Sales Ops"
               :slug        "sales-ops"
               :path        "./dist/index.js"
               :version     data-apps.config/supported-app-version
               :collection  collection-id
               :entity_id   string?
               :serdes/meta [{:model "DataApp"}]}
              app))
      (is (not (contains? app :description))))
    (testing "the collection is in the data-apps namespace, named after the app's slug as the instance names it"
      (is (=? {:name        "Data App: sales-ops"
               :namespace   "data-apps"
               :entity_id   string?
               :serdes/meta [{:model "Collection"}]}
              (file-yaml result "collections/data_apps/data_app__sales_ops.yaml"))))
    (testing "the entity IDs are new on each call"
      (is (not= (:entity_id app)
                (:entity_id (file-yaml (generate.app/generate {:name "Sales Ops"})
                                       "data_apps/sales-ops/data_app.yaml")))))))

(deftest keeps-the-description-and-an-explicit-slug-test
  (let [result (generate.app/generate {:name "Sales Ops" :slug "ops" :description "Pipeline health"})]
    (is (=? {:slug "ops" :description "Pipeline health"}
            (file-yaml result "data_apps/ops/data_app.yaml")))
    (testing "the collection is named after the slug, so apps sharing a display name don't share a collection file"
      (is (=? {:name "Data App: ops"} (file-yaml result "collections/data_apps/data_app__ops.yaml"))))))

(deftest derives-the-slug-from-the-name-test
  (are [app-name slug] (some? (file-yaml (generate.app/generate {:name app-name})
                                         (str "data_apps/" slug "/data_app.yaml")))
    "Sales Ops"        "sales-ops"
    "  Q3 -- Revenue!" "q3-revenue"
    "inventory 2"      "inventory-2"))

(deftest refuses-a-name-without-a-valid-slug-test
  (doseq [app-name ["???" "Generate"]]
    (is (= 400 (:status-code (ex-data (is (thrown? clojure.lang.ExceptionInfo
                                                   (generate.app/generate {:name app-name}))))))
        app-name))
  (testing "an explicit slug is checked too"
    (is (thrown? clojure.lang.ExceptionInfo (generate.app/generate {:name "Sales" :slug "Not A Slug"})))))

(deftest api-generates-the-files-test
  (mt/with-premium-features #{:data-apps}
    (testing "a superuser gets the files"
      (is (=? {:files [{:path "data_apps/sales-ops/data_app.yaml" :yaml string?}
                       {:path "collections/data_apps/data_app__sales_ops.yaml" :yaml string?}]}
              (mt/user-http-request :crowberto :post 200 "apps/generate/app" {:name "Sales Ops"}))))
    (testing "an explicit slug is kept"
      (is (=? {:files [{:path "data_apps/ops/data_app.yaml"} {}]}
              (mt/user-http-request :crowberto :post 200 "apps/generate/app" {:name "Sales Ops" :slug "ops"}))))
    (testing "only a superuser writes an app's repository"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "apps/generate/app" {:name "Sales Ops"}))))
    (testing "a name that gives no valid slug is refused"
      (mt/user-http-request :crowberto :post 400 "apps/generate/app" {:name "???"}))
    (testing "a reserved slug is refused"
      (mt/user-http-request :crowberto :post 400 "apps/generate/app" {:name "Sales Ops" :slug "generate"}))))
