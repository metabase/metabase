(ns metabase-enterprise.custom-viz-plugin.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.custom-viz-plugin.test-util :as cvp.tu]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [custom-viz-enabled true]
      (thunk))))

(defmacro ^:private with-dev-mode-enabled [& body]
  `(with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
     ~@body))

(defn- multipart-upload!
  "POST a multipart `bundle-bytes` tar.gz to `path` as user `user`, expecting `status`."
  [user status path ^bytes bundle-bytes]
  (mt/user-http-request user :post status path
                        {:request-options {:headers {"content-type" "multipart/form-data"}}}
                        {:file bundle-bytes}))

;;; ------------------------------------------------ Auth & Permissions ------------------------------------------------

(deftest authorization-test
  (mt/with-premium-features #{:custom-viz}
    (testing "non-admin cannot list plugins (admin list)"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/custom-viz-plugin/"))))
    (testing "admin can list plugins"
      (is (sequential? (mt/user-http-request :crowberto :get 200 "ee/custom-viz-plugin/"))))
    (testing "non-admin cannot delete plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-test"
                                                      :display_name "auth-test"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (str "ee/custom-viz-plugin/" id))))))
    (testing "non-admin cannot update plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-test-2"
                                                      :display_name "auth-test-2"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "ee/custom-viz-plugin/" id)
                                     {:enabled false})))))
    (testing "non-admin cannot set dev URL"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-test-3"
                                                      :display_name "auth-test-3"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "ee/custom-viz-plugin/" id "/dev-url")
                                     {:dev_bundle_url "http://localhost:5174"})))))
    (testing "non-admin cannot refresh plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-test-4"
                                                      :display_name "auth-test-4"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (str "ee/custom-viz-plugin/" id "/refresh"))))))
    (testing "non-admin cannot upload a new bundle"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-test-5"
                                                      :display_name "auth-test-5"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (multipart-upload! :rasta 403 (str "ee/custom-viz-plugin/" id "/bundle")
                                  (cvp.tu/valid-bundle-bytes "auth-test-5"))))))))

(deftest feature-flag-test
  (testing "endpoints require :custom-viz premium feature"
    (mt/with-premium-features #{}
      (mt/assert-has-premium-feature-error
       "Custom Visualizations"
       (mt/user-http-request :crowberto :get 402 "ee/custom-viz-plugin/")))))

;;; ------------------------------------------------ /list endpoint ------------------------------------------------

(deftest list-endpoint-test
  (mt/with-premium-features #{:custom-viz}
    (testing "/list is available to non-admin users"
      (is (sequential? (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list"))))
    (testing "/list only returns active and enabled plugins"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "active-viz"
                                               :display_name "Active Viz"
                                               :status       :active
                                               :enabled      true
                                               :bundle_hash  "active-hash"}
                     :model/CustomVizPlugin _ {:identifier   "disabled-viz"
                                               :display_name "Disabled Viz"
                                               :status       :active
                                               :enabled      false
                                               :bundle_hash  "disabled-hash"}
                     :model/CustomVizPlugin _ {:identifier   "error-viz"
                                               :display_name "Error Viz"
                                               :status       :error
                                               :enabled      true
                                               :bundle_hash  "error-hash"}]
        (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
              identifiers (set (map :identifier result))]
          (is (contains? identifiers "active-viz"))
          (is (not (contains? identifiers "disabled-viz")))
          (is (not (contains? identifiers "error-viz"))))))
    (testing "/list does not expose the raw bundle blob"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "bundle-viz"
                                               :display_name "Bundle Viz"
                                               :status       :active
                                               :enabled      true
                                               :bundle_hash  "abcd"}]
        (let [result (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")]
          (doseq [plugin result]
            (is (not (contains? plugin :bundle)))))))))

;;; ------------------------------------------------ Bundle bytes not exposed ------------------------------------------------

(deftest bundle-bytes-not-exposed-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "bytes-sec"
                                                    :display_name "Bytes Sec"
                                                    :status       :active
                                                    :enabled      true
                                                    :bundle       (.getBytes "pretend-zip-bytes" "UTF-8")
                                                    :bundle_hash  "feedface"}]
      (testing "GET / (admin list) does not expose :bundle"
        (let [plugins (mt/user-http-request :crowberto :get 200 "ee/custom-viz-plugin/")]
          (doseq [plugin plugins]
            (is (not (contains? plugin :bundle))))))
      (testing "PUT /:id response does not expose :bundle"
        (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                                         {:enabled false})]
          (is (not (contains? resp :bundle))))))))

;;; ------------------------------------------------ Duplicate Validation ------------------------------------------------

(deftest duplicate-identifier-test
  (mt/with-premium-features #{:custom-viz}
    (testing "uploading a bundle whose identifier already exists returns a 400"
      (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "dup-viz"
                                               :display_name "dup-viz"
                                               :status       :active}]
        (is (re-find #"identifier.*already exists"
                     (multipart-upload! :crowberto 400 "ee/custom-viz-plugin/"
                                        (cvp.tu/valid-bundle-bytes "dup-viz"))))))))

;;; ------------------------------------------------ CRUD ------------------------------------------------

(deftest delete-test
  (mt/with-premium-features #{:custom-viz}
    (testing "admin can delete a plugin"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "delete-viz"
                                                      :display_name "Delete Viz"
                                                      :status       :active}]
        (mt/user-http-request :crowberto :delete 204 (str "ee/custom-viz-plugin/" id))
        (is (nil? (t2/select-one :model/CustomVizPlugin :id id)))))
    (testing "404 for non-existent plugin"
      (mt/user-http-request :crowberto :delete 404 "ee/custom-viz-plugin/99999"))))

(deftest update-test
  (mt/with-premium-features #{:custom-viz}
    (testing "admin can disable a plugin"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "update-viz"
                                                      :display_name "Update Viz"
                                                      :status       :active
                                                      :enabled      true}]
        (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                                         {:enabled false})]
          (is (false? (:enabled resp))))))
    (testing "404 for non-existent plugin"
      (mt/user-http-request :crowberto :put 404 "ee/custom-viz-plugin/99999"
                            {:enabled false}))))

;;; ------------------------------------------------ Dev URL Security ------------------------------------------------

(deftest dev-url-security-test
  (mt/with-premium-features #{:custom-viz}
    (with-dev-mode-enabled
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "dev-sec"
                                                      :display_name "dev-sec"
                                                      :status       :active}]
        (testing "SECURITY: rejects file:// dev URL"
          (is (= 400
                 (:status-code
                  (ex-data
                   (try
                     (cache/set-or-clear-dev-bundle! id "file:///etc/passwd")
                     (catch Exception e e)))))))
        (testing "SECURITY: rejects ftp:// dev URL via API"
          (is (= 400
                 (:status-code
                  (ex-data
                   (try
                     (cache/set-or-clear-dev-bundle! id "ftp://evil.com/bundle")
                     (catch Exception e e)))))))
        (testing "admin can set valid http dev URL"
          (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id "/dev-url")
                                           {:dev_bundle_url "http://localhost:5174"})]
            (is (= "http://localhost:5174" (:dev_bundle_url resp)))))
        (testing "admin can clear dev URL"
          (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id "/dev-url")
                                           {:dev_bundle_url nil})]
            (is (nil? (:dev_bundle_url resp)))))))))

;;; ------------------------------------------------ Asset Endpoint Security ------------------------------------------------

(deftest asset-endpoint-security-test
  (mt/with-premium-features #{:custom-viz}
    (let [manifest {:name   "sec-test"
                    :icon   "icon.svg"
                    :assets ["icon.svg"]}]
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "sec-test"
                                                      :display_name "sec-test"
                                                      :status       :active
                                                      :bundle_hash  "abc123"
                                                      :manifest     manifest}]
        (testing "SECURITY: rejects unsupported asset types"
          (let [resp (mt/user-http-request :crowberto :get 404 (str "ee/custom-viz-plugin/" id "/asset")
                                           :path "script.js")]
            (is (some? resp))))
        (testing "SECURITY: rejects path traversal in asset path"
          (let [resp (mt/user-http-request :crowberto :get 404 (str "ee/custom-viz-plugin/" id "/asset")
                                           :path "../../../etc/passwd")]
            (is (some? resp))))
        (testing "SECURITY: rejects HTML files (XSS vector)"
          (let [resp (mt/user-http-request :crowberto :get 404 (str "ee/custom-viz-plugin/" id "/asset")
                                           :path "evil.html")]
            (is (some? resp))))
        (testing "404 for non-existent plugin"
          (mt/user-http-request :crowberto :get 404 "ee/custom-viz-plugin/99999/asset"
                                :path "icon.svg"))))))

;;; ------------------------------------------------ Plugin Registration ------------------------------------------------

(deftest register-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "successful registration creates plugin and persists manifest fields"
        (let [zip  (cvp.tu/make-tgz-bytes
                    [["metabase-plugin.json" (json/encode
                                              {:name     "new-register-viz"
                                               :icon     "icon.svg"
                                               :metabase {:version ">=1.59.0"}})]
                     ["dist/index.js" "console.log('hi')"]])
              resp (multipart-upload! :crowberto 200 "ee/custom-viz-plugin/" zip)
              row  (t2/select-one :model/CustomVizPlugin :identifier "new-register-viz")]
          (is (= "new-register-viz" (:identifier resp)))
          (is (false? (:dev_only resp))
              "upload-registered plugins are not dev-only")
          (is (= "new-register-viz" (:display_name row)))
          (is (= "icon.svg" (:icon row)))
          (is (= ">=1.59.0" (:metabase_version row)))
          (is (= :active (:status row)))
          (is (some? (:bundle_hash row)) "bundle_hash is populated"))))))

(deftest register-plugin-missing-manifest-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "POST returns 400 when zip is missing metabase-plugin.json"
        (let [zip  (cvp.tu/make-tgz-bytes [["dist/index.js" "console.log('hi')"]])
              resp (multipart-upload! :crowberto 400 "ee/custom-viz-plugin/" zip)]
          (is (re-find #"metabase-plugin\.json" (or (:message resp) (str resp)))))))))

(deftest register-plugin-missing-bundle-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "POST returns 400 when zip is missing dist/index.js"
        (let [zip  (cvp.tu/make-tgz-bytes
                    [["metabase-plugin.json" (json/encode {:name "no-bundle-viz"})]])
              resp (multipart-upload! :crowberto 400 "ee/custom-viz-plugin/" zip)]
          (is (re-find #"index\.js" (or (:message resp) (str resp)))))))))

(deftest register-plugin-invalid-manifest-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "POST returns 400 when manifest has no name field"
        (let [zip  (cvp.tu/make-tgz-bytes
                    [["metabase-plugin.json" (json/encode {:icon "icon.svg"})]
                     ["dist/index.js" "console.log('hi')"]])
              resp (multipart-upload! :crowberto 400 "ee/custom-viz-plugin/" zip)]
          (is (re-find #"\"name\"" (or (:message resp) (str resp)))))))))

(deftest register-plugin-not-a-zip-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "POST returns 400 when the uploaded bytes are not a zip"
        (let [resp (multipart-upload! :crowberto 400 "ee/custom-viz-plugin/"
                                      (.getBytes "this is plain text, not a zip" "UTF-8"))]
          (is (some? resp)))))))

(deftest register-dev-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (with-dev-mode-enabled
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (testing "dev plugin registration with manifest name"
          (with-redefs [cache/fetch-dev-manifest (constantly {:name "dev-chart" :icon "icon.svg"})
                        cache/set-or-clear-dev-bundle! (constantly nil)]
            (let [resp (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                                             {:dev_bundle_url "http://localhost:5174"})]
              (is (= "dev-chart" (:identifier resp)))
              (is (= "dev-chart" (:display_name resp))
                  "display_name comes from manifest name")
              (is (true? (:dev_only resp))
                  "dev-registered plugins are dev-only")
              (is (= "active" (:status resp))
                  "dev plugins are immediately active"))))
        (testing "dev plugin registration with explicit identifier overrides manifest"
          (with-redefs [cache/fetch-dev-manifest (constantly {:name "manifest-name"})
                        cache/set-or-clear-dev-bundle! (constantly nil)]
            (let [resp (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                                             {:dev_bundle_url "http://localhost:5174"
                                              :identifier     "my-override"})]
              (is (= "my-override" (:identifier resp))
                  "explicit identifier takes precedence over manifest name"))))
        (testing "dev plugin registration fails with helpful message when no identifier and no manifest"
          (with-redefs [cache/fetch-dev-manifest (constantly nil)]
            (let [resp (mt/user-http-request :crowberto :post 400 "ee/custom-viz-plugin/dev"
                                             {:dev_bundle_url "http://localhost:5174"})]
              (is (str/includes? resp "metabase-plugin.json")
                  "error should mention the manifest file"))))
        (testing "dev plugin registration fails with helpful message when manifest missing name"
          (with-redefs [cache/fetch-dev-manifest (constantly {:icon "icon.svg"})]
            (let [resp (mt/user-http-request :crowberto :post 400 "ee/custom-viz-plugin/dev"
                                             {:dev_bundle_url "http://localhost:5174"})]
              (is (str/includes? resp "name")
                  "error should mention the missing name field"))))))))

;;; ------------------------------------------------ Bundle Replace ------------------------------------------------

(deftest replace-bundle-test
  (mt/with-premium-features #{:custom-viz}
    (testing "POST /:id/bundle replaces an existing plugin's bundle and refreshes derived fields"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "replace-viz"
                                                      :display_name "old name"
                                                      :status       :active
                                                      :bundle       (.getBytes "old" "UTF-8")
                                                      :bundle_hash  "oldhash"}]
        (let [zip    (cvp.tu/make-tgz-bytes
                      [["metabase-plugin.json" (json/encode
                                                {:name "replace-viz"
                                                 :icon "new-icon.svg"})]
                       ["dist/index.js" "console.log('new')"]])
              resp   (multipart-upload! :crowberto 200
                                        (str "ee/custom-viz-plugin/" id "/bundle") zip)
              row    (t2/select-one :model/CustomVizPlugin :id id)]
          (is (= "replace-viz" (:identifier resp)))
          (is (= "new-icon.svg" (:icon row)))
          (is (not= "oldhash" (:bundle_hash row))
              "bundle_hash should change when a new bundle is uploaded"))))))

(deftest replace-bundle-identifier-mismatch-test
  (mt/with-premium-features #{:custom-viz}
    (testing "POST /:id/bundle refuses a zip whose manifest name differs from the plugin's identifier"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "mismatch-viz"
                                                      :display_name "mismatch-viz"
                                                      :status       :active
                                                      :bundle_hash  "abc"}]
        (let [zip  (cvp.tu/valid-bundle-bytes "some-other-identifier")
              resp (multipart-upload! :crowberto 400
                                      (str "ee/custom-viz-plugin/" id "/bundle") zip)]
          (is (re-find #"does not match" (or (:message resp) (str resp)))))))))

;;; ------------------------------------------------ Update / Refresh ------------------------------------------------

(deftest refresh-upload-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (testing "refresh returns 400 for upload-backed plugins (users should POST a new bundle instead)"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "refresh-upload"
                                                      :display_name "refresh-upload"
                                                      :status       :active
                                                      :bundle_hash  "abc"}]
        (let [resp (mt/user-http-request :crowberto :post 400
                                         (str "ee/custom-viz-plugin/" id "/refresh"))]
          (is (re-find #"upload a new bundle" (or (:message resp) (str resp)))))))))

(deftest refresh-dev-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (with-dev-mode-enabled
      (testing "refresh re-fetches manifest for dev-only plugins"
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier     "dev-refresh"
                                                        :display_name   "dev-refresh"
                                                        :status         :active
                                                        :dev_bundle_url "http://localhost:5174"}]
          (with-redefs [cache/resolve-dev-bundle (constantly "http://localhost:5174")
                        cache/fetch-dev-manifest (constantly {:name "Updated Name" :icon "new-icon.svg"})]
            (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/custom-viz-plugin/" id "/refresh"))]
              (is (= "Updated Name" (:display_name resp))))))))))

;;; ------------------------------------------------ /list compatibility filtering ------------------------------------------------

(deftest list-filters-incompatible-versions-test
  (mt/with-premium-features #{:custom-viz}
    (testing "/list excludes plugins with incompatible metabase_version"
      (with-redefs [config/mb-version-info {:tag "v1.60.0"}
                    config/is-dev?         false]
        (mt/with-temp [:model/CustomVizPlugin _ {:identifier        "compat-viz"
                                                 :display_name      "Compatible"
                                                 :status            :active
                                                 :enabled           true
                                                 :bundle_hash       "compat-hash"
                                                 :metabase_version  ">=1.59"}
                       :model/CustomVizPlugin _ {:identifier        "incompat-viz"
                                                 :display_name      "Incompatible"
                                                 :status            :active
                                                 :enabled           true
                                                 :bundle_hash       "incompat-hash"
                                                 :metabase_version  ">=1.99"}]
          (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
                identifiers (set (map :identifier result))]
            (is (contains? identifiers "compat-viz"))
            (is (not (contains? identifiers "incompat-viz")))))))))

;;; ------------------------------------------------ Bundle Endpoint ------------------------------------------------

(deftest bundle-endpoint-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "bundle-test"
                                                    :display_name "bundle-test"
                                                    :status       :active
                                                    :bundle_hash  "abc123"}]
      (testing "returns bundle with correct content-type and ETag"
        (with-redefs [cache/resolve-dev-bundle (constantly nil)
                      cache/resolve-bundle     (constantly {:content "console.log('hello')" :hash "deadbeef"})]
          (let [resp (mt/user-http-request :crowberto :get 200 (str "ee/custom-viz-plugin/" id "/bundle"))]
            (is (= "console.log('hello')" resp)))))
      (testing "returns 503 when bundle is not available"
        (with-redefs [cache/resolve-dev-bundle (constantly nil)
                      cache/resolve-bundle     (constantly nil)]
          (let [resp (mt/user-http-request :crowberto :get 503 (str "ee/custom-viz-plugin/" id "/bundle"))]
            (is (some? resp))))))))

(deftest bundle-and-list-auth-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "auth-bundle"
                                                    :display_name "auth-bundle"
                                                    :status       :active
                                                    :enabled      true
                                                    :bundle_hash  "abc123"}]
      (with-redefs [cache/resolve-dev-bundle (constantly nil)
                    cache/resolve-bundle     (constantly {:content "console.log('hi')" :hash "h1"})]
        (testing "authenticated non-admin user can access /bundle"
          (is (= "console.log('hi')"
                 (mt/user-http-request :rasta :get 200 (str "ee/custom-viz-plugin/" id "/bundle")))))
        (testing "unauthenticated user cannot access /bundle"
          (is (= "Unauthenticated"
                 (client/client :get 401 (str "ee/custom-viz-plugin/" id "/bundle"))))))
      (testing "authenticated non-admin user can access /list"
        (is (sequential? (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list"))))
      (testing "unauthenticated user cannot access /list"
        (is (= "Unauthenticated"
               (client/client :get 401 "ee/custom-viz-plugin/list")))))))

;;; ------------------------------------------------ Audit Log ------------------------------------------------

(deftest audit-log-create-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "registering a plugin records a custom-viz-plugin-create audit event"
        (let [resp  (multipart-upload! :crowberto 200 "ee/custom-viz-plugin/"
                                       (cvp.tu/valid-bundle-bytes "audit-create-viz" {:icon "icon.svg"}))
              entry (mt/latest-audit-log-entry "custom-viz-plugin-create" (:id resp))]
          (is (partial=
               {:topic    :custom-viz-plugin-create
                :user_id  (mt/user->id :crowberto)
                :model    "CustomVizPlugin"
                :model_id (:id resp)
                :details  {:identifier   "audit-create-viz"
                           :display_name "audit-create-viz"
                           :status       "active"
                           :enabled      true}}
               entry))
          (is (some? (get-in entry [:details :bundle_hash]))
              "bundle_hash should be recorded in audit details"))))))

(deftest audit-log-create-dev-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (with-dev-mode-enabled
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (testing "registering a dev plugin records a custom-viz-plugin-create audit event"
          (with-redefs [cache/fetch-dev-manifest    (constantly {:name "audit-dev-chart" :icon "icon.svg"})
                        cache/set-or-clear-dev-bundle! (constantly nil)]
            (let [resp  (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                                              {:dev_bundle_url "http://localhost:5174"})
                  entry (mt/latest-audit-log-entry "custom-viz-plugin-create" (:id resp))]
              (is (partial=
                   {:topic    :custom-viz-plugin-create
                    :user_id  (mt/user->id :crowberto)
                    :model    "CustomVizPlugin"
                    :model_id (:id resp)}
                   entry))
              (is (= "audit-dev-chart" (get-in entry [:details :identifier]))))))))))

(deftest audit-log-delete-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "deleting a plugin records a custom-viz-plugin-delete audit event"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "audit-delete-viz"
                                                      :display_name "Audit Delete Viz"
                                                      :status       :active}]
        (mt/user-http-request :crowberto :delete 204 (str "ee/custom-viz-plugin/" id))
        (is (partial=
             {:topic    :custom-viz-plugin-delete
              :user_id  (mt/user->id :crowberto)
              :model    "CustomVizPlugin"
              :model_id id
              :details  {:identifier   "audit-delete-viz"
                         :display_name "Audit Delete Viz"
                         :status       "active"}}
             (mt/latest-audit-log-entry "custom-viz-plugin-delete" id)))))))

(deftest audit-log-update-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "updating a plugin records a custom-viz-plugin-update audit event with changed fields"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "audit-update-viz"
                                                      :display_name "Audit Update Viz"
                                                      :status       :active
                                                      :enabled      true}]
        (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                              {:enabled false})
        (let [entry (mt/latest-audit-log-entry "custom-viz-plugin-update" id)]
          (is (partial=
               {:topic    :custom-viz-plugin-update
                :user_id  (mt/user->id :crowberto)
                :model    "CustomVizPlugin"
                :model_id id}
               entry))
          (is (= {:previous {:enabled true}
                  :new      {:enabled false}}
                 (select-keys (:details entry) [:previous :new]))))))))

(deftest audit-log-replace-bundle-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "replacing a bundle records a custom-viz-plugin-update audit event"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "audit-replace-viz"
                                                      :display_name "audit-replace-viz"
                                                      :status       :active
                                                      :bundle       (.getBytes "old" "UTF-8")
                                                      :bundle_hash  "old-sha"}]
        (multipart-upload! :crowberto 200 (str "ee/custom-viz-plugin/" id "/bundle")
                           (cvp.tu/valid-bundle-bytes "audit-replace-viz"))
        (let [entry (mt/latest-audit-log-entry "custom-viz-plugin-update" id)]
          (is (partial=
               {:topic    :custom-viz-plugin-update
                :user_id  (mt/user->id :crowberto)
                :model    "CustomVizPlugin"
                :model_id id}
               entry))
          (is (= "old-sha" (get-in entry [:details :previous :bundle_hash]))
              "old bundle_hash is recorded under :previous")
          (is (not= "old-sha" (get-in entry [:details :new :bundle_hash]))
              "new bundle_hash differs from the old one"))))))

;;; ------------------------------------------------ Dev Mode Gating ------------------------------------------------

(deftest dev-mode-gating-test
  (mt/with-premium-features #{:custom-viz}
    (testing "POST /dev returns 403 when dev mode is disabled"
      (is (= "Custom visualization plugin dev mode is not enabled."
             (mt/user-http-request :crowberto :post 403 "ee/custom-viz-plugin/dev"
                                   {:dev_bundle_url "http://localhost:5174"}))))
    (testing "PUT /:id/dev-url returns 403 when dev mode is disabled"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "dev-gate"
                                                      :display_name "dev-gate"
                                                      :status       :active}]
        (is (= "Custom visualization plugin dev mode is not enabled."
               (mt/user-http-request :crowberto :put 403 (str "ee/custom-viz-plugin/" id "/dev-url")
                                     {:dev_bundle_url "http://localhost:5174"})))))
    (testing "GET /:id/dev-sse returns 403 when dev mode is disabled"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "dev-gate-sse"
                                                      :display_name "dev-gate-sse"
                                                      :status       :active}]
        (is (= "Custom visualization plugin dev mode is not enabled."
               (mt/user-http-request :crowberto :get 403 (str "ee/custom-viz-plugin/" id "/dev-sse"))))))
    (testing "dev endpoints work when dev mode is enabled"
      (with-dev-mode-enabled
        (mt/with-model-cleanup [:model/CustomVizPlugin]
          (with-redefs [cache/fetch-dev-manifest    (constantly {:name "gated-dev" :icon "icon.svg"})
                        cache/set-or-clear-dev-bundle! (constantly nil)]
            (let [resp (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/dev"
                                             {:dev_bundle_url "http://localhost:5174"})]
              (is (= "gated-dev" (:identifier resp))))))))))

(deftest list-excludes-dev-plugins-when-dev-mode-disabled-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin _ {:identifier   "upload-viz-list"
                                             :display_name "Upload Viz"
                                             :status       :active
                                             :enabled      true
                                             :bundle_hash  "abc"}
                   :model/CustomVizPlugin _ {:identifier     "dev-viz-list"
                                             :display_name   "Dev Viz"
                                             :status         :active
                                             :enabled        true
                                             :dev_bundle_url "http://localhost:5174"}]
      (testing "dev-only plugins are hidden from /list when dev mode is off"
        (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
              identifiers (set (map :identifier result))]
          (is (contains? identifiers "upload-viz-list"))
          (is (not (contains? identifiers "dev-viz-list")))))
      (testing "dev-only plugins are visible in /list when dev mode is on"
        (with-dev-mode-enabled
          (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
                identifiers (set (map :identifier result))]
            (is (contains? identifiers "upload-viz-list"))
            (is (contains? identifiers "dev-viz-list"))))))))
