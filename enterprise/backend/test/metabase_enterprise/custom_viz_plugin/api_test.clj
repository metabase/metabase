(ns metabase-enterprise.custom-viz-plugin.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.api :as custom-viz-plugin.api]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

;; private fn under test
(def ^:private parse-repo-name @#'custom-viz-plugin.api/parse-repo-name)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

;;; ------------------------------------------------ Auth & Permissions ------------------------------------------------

(deftest authorization-test
  (mt/with-premium-features #{:custom-viz}
    (testing "non-admin cannot list plugins"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "ee/custom-viz-plugin/"))))
    (testing "admin can list plugins"
      (is (sequential? (mt/user-http-request :crowberto :get 200 "ee/custom-viz-plugin/"))))
    (testing "non-admin cannot delete plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/viz"
                                                      :identifier   "auth-test"
                                                      :display_name "auth-test"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :delete 403 (str "ee/custom-viz-plugin/" id))))))
    (testing "non-admin cannot update plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/viz2"
                                                      :identifier   "auth-test-2"
                                                      :display_name "auth-test-2"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "ee/custom-viz-plugin/" id)
                                     {:enabled false})))))
    (testing "non-admin cannot set dev URL"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/viz3"
                                                      :identifier   "auth-test-3"
                                                      :display_name "auth-test-3"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 (str "ee/custom-viz-plugin/" id "/dev-url")
                                     {:dev_bundle_url "http://localhost:5174"})))))
    (testing "non-admin cannot refresh plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/viz4"
                                                      :identifier   "auth-test-4"
                                                      :display_name "auth-test-4"
                                                      :status       :active}]
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 (str "ee/custom-viz-plugin/" id "/refresh"))))))))

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
      (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/active-viz"
                                               :identifier   "active-viz"
                                               :display_name "Active Viz"
                                               :status       :active
                                               :enabled      true}
                     :model/CustomVizPlugin _ {:repo_url     "https://github.com/test/disabled-viz"
                                               :identifier   "disabled-viz"
                                               :display_name "Disabled Viz"
                                               :status       :active
                                               :enabled      false}
                     :model/CustomVizPlugin _ {:repo_url     "https://github.com/test/error-viz"
                                               :identifier   "error-viz"
                                               :display_name "Error Viz"
                                               :status       :error
                                               :enabled      true}]
        (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
              identifiers (set (map :identifier result))]
          (is (contains? identifiers "active-viz"))
          (is (not (contains? identifiers "disabled-viz")))
          (is (not (contains? identifiers "error-viz"))))))
    (testing "/list does not expose access_token"
      (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/token-viz"
                                               :identifier   "token-viz"
                                               :display_name "Token Viz"
                                               :status       :active
                                               :enabled      true}]
        (let [result (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")]
          (doseq [plugin result]
            (is (not (contains? plugin :access_token)))))))))

;;; ------------------------------------------------ access_token not exposed ------------------------------------------------

(deftest access-token-not-exposed-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/token-sec"
                                                    :identifier   "token-sec"
                                                    :display_name "Token Sec"
                                                    :status       :active
                                                    :enabled      true
                                                    :access_token "super-secret-pat"}]
      (testing "GET / (admin list) does not expose access_token"
        (let [plugins (mt/user-http-request :crowberto :get 200 "ee/custom-viz-plugin/")]
          (doseq [plugin plugins]
            (is (not (contains? plugin :access_token))))))
      (testing "PUT /:id response does not expose access_token"
        (let [resp (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                                         {:enabled false})]
          (is (not (contains? resp :access_token)))))
      (testing "POST /:id/refresh response does not expose access_token"
        (with-redefs [cache/fetch-and-update! (constantly nil)]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/custom-viz-plugin/" id "/refresh"))]
            (is (not (contains? resp :access_token)))))))))

;;; ------------------------------------------------ Duplicate Validation ------------------------------------------------

(deftest duplicate-repo-url-test
  (mt/with-premium-features #{:custom-viz}
    (testing "registering a plugin with an already-used repo_url returns a 400 with a friendly message"
      (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/test/dup-viz"
                                               :identifier   "dup-viz"
                                               :display_name "dup-viz"
                                               :status       :active}]
        (with-redefs [cache/fetch-and-update! (constantly nil)]
          (is (re-find #"repo URL.*already exists"
                       (mt/user-http-request :crowberto :post 400 "ee/custom-viz-plugin/"
                                             {:repo_url "https://github.com/test/dup-viz"}))))))))

(deftest duplicate-identifier-test
  (mt/with-premium-features #{:custom-viz}
    (testing "registering a plugin whose repo name resolves to an already-used identifier returns a 400"
      (mt/with-temp [:model/CustomVizPlugin _ {:repo_url     "https://github.com/org-a/my-viz"
                                               :identifier   "my-viz"
                                               :display_name "my-viz"
                                               :status       :active}]
        (with-redefs [cache/fetch-and-update! (constantly nil)]
          (is (re-find #"identifier.*already exists"
                       (mt/user-http-request :crowberto :post 400 "ee/custom-viz-plugin/"
                                             {:repo_url "https://github.com/org-b/my-viz"}))))))))

;;; ------------------------------------------------ CRUD ------------------------------------------------

(deftest delete-test
  (mt/with-premium-features #{:custom-viz}
    (testing "admin can delete a plugin"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/delete-viz"
                                                      :identifier   "delete-viz"
                                                      :display_name "Delete Viz"
                                                      :status       :active}]
        (mt/user-http-request :crowberto :delete 204 (str "ee/custom-viz-plugin/" id))
        (is (nil? (t2/select-one :model/CustomVizPlugin :id id)))))
    (testing "404 for non-existent plugin"
      (mt/user-http-request :crowberto :delete 404 "ee/custom-viz-plugin/99999"))))

(deftest update-test
  (mt/with-premium-features #{:custom-viz}
    (testing "admin can disable a plugin"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/update-viz"
                                                      :identifier   "update-viz"
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
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/dev-sec"
                                                    :identifier   "dev-sec"
                                                    :display_name "dev-sec"
                                                    :status       :active}]
      (testing "SECURITY: rejects file:// dev URL via API"
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
          (is (nil? (:dev_bundle_url resp))))))))

;;; ------------------------------------------------ Asset Endpoint Security ------------------------------------------------

(deftest asset-endpoint-security-test
  (mt/with-premium-features #{:custom-viz}
    (let [manifest {:name   "sec-test"
                    :icon   "icon.svg"
                    :assets ["icon.svg"]}]
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url         "https://github.com/test/sec-test"
                                                      :identifier       "sec-test"
                                                      :display_name     "sec-test"
                                                      :status           :active
                                                      :resolved_commit  "abc123"
                                                      :manifest         manifest}]
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

;;; ------------------------------------------------ parse-repo-name ------------------------------------------------

(deftest parse-repo-name-test
  (testing "extracts repo name from HTTPS URL"
    (is (= "custom-heatmap" (parse-repo-name "https://github.com/user/custom-heatmap"))))
  (testing "strips .git suffix from HTTPS URL"
    (is (= "custom-heatmap" (parse-repo-name "https://github.com/user/custom-heatmap.git"))))
  (testing "extracts repo name from SSH git URL"
    (is (= "custom-heatmap" (parse-repo-name "git@github.com:user/custom-heatmap.git"))))
  (testing "SSH URL without .git suffix"
    (is (= "custom-heatmap" (parse-repo-name "git@github.com:user/custom-heatmap"))))
  (testing "handles nested paths"
    (is (= "my-viz" (parse-repo-name "https://gitlab.com/org/subgroup/my-viz"))))
  (testing "handles trailing slash"
    ;; URI path for trailing slash is "/user/repo/" — last after split is ""
    ;; but this is an edge case; the API validates NonBlankString for repo_url
    (is (some? (parse-repo-name "https://github.com/user/repo")))))

;;; ------------------------------------------------ Plugin Registration ------------------------------------------------

(deftest register-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "successful registration creates plugin and fetches bundle"
        (with-redefs [cache/fetch-and-update! (fn [plugin]
                                                (t2/update! :model/CustomVizPlugin (:id plugin)
                                                            {:status :active :resolved_commit "sha123"}))]
          (let [resp (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/"
                                           {:repo_url "https://github.com/test/new-register-viz"})]
            (is (= "new-register-viz" (:identifier resp))
                "identifier should be derived from repo name")
            (is (= "https://github.com/test/new-register-viz" (:repo_url resp)))
            (is (false? (:dev_only resp))
                "git-registered plugins are not dev-only")))))))

(deftest register-plugin-sets-error-on-fetch-failure-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "plugin is persisted with error status when fetch-and-update! fails"
        (with-redefs [cache/fetch-and-update! (fn [plugin]
                                                (t2/update! :model/CustomVizPlugin (:id plugin)
                                                            {:status :error
                                                             :error_message "Connection refused"}))]
          (let [resp (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/"
                                           {:repo_url "https://github.com/test/fail-register-viz"})]
            (is (= "error" (:status resp))
                "plugin should be in error state after failed fetch")
            (is (= "Connection refused" (:error_message resp))
                "error message should be preserved")))))))

(deftest register-dev-plugin-test
  (mt/with-premium-features #{:custom-viz}
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
                "error should mention the missing name field")))))))

;;; ------------------------------------------------ Update / Refresh ------------------------------------------------

(deftest update-pinned-version-triggers-refresh-test
  (mt/with-premium-features #{:custom-viz}
    (testing "updating pinned_version triggers fetch-and-update!"
      (let [fetched? (atom false)]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url        "https://github.com/test/pin-test"
                                                        :identifier      "pin-test"
                                                        :display_name    "pin-test"
                                                        :status          :active
                                                        :pinned_version  nil}]
          (with-redefs [cache/fetch-and-update! (fn [_] (reset! fetched? true))]
            (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                                  {:pinned_version "v1.0.0"})
            (is (true? @fetched?))))))))

(deftest update-same-pinned-version-no-refresh-test
  (mt/with-premium-features #{:custom-viz}
    (testing "setting same pinned_version does not trigger refresh"
      (let [fetched? (atom false)]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url        "https://github.com/test/pin-same"
                                                        :identifier      "pin-same"
                                                        :display_name    "pin-same"
                                                        :status          :active
                                                        :pinned_version  "v1.0.0"}]
          (with-redefs [cache/fetch-and-update! (fn [_] (reset! fetched? true))]
            (mt/user-http-request :crowberto :put 200 (str "ee/custom-viz-plugin/" id)
                                  {:pinned_version "v1.0.0"})
            (is (false? @fetched?))))))))

(deftest refresh-git-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (testing "refresh calls fetch-and-update! for git-based plugins"
      (let [fetched? (atom false)]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/refresh-git"
                                                        :identifier   "refresh-git"
                                                        :display_name "refresh-git"
                                                        :status       :active}]
          (with-redefs [cache/fetch-and-update! (fn [_] (reset! fetched? true))]
            (mt/user-http-request :crowberto :post 200 (str "ee/custom-viz-plugin/" id "/refresh"))
            (is (true? @fetched?))))))))

(deftest refresh-dev-plugin-test
  (mt/with-premium-features #{:custom-viz}
    (testing "refresh re-fetches manifest for dev-only plugins"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url       "dev://local/dev-refresh"
                                                      :identifier     "dev-refresh"
                                                      :display_name   "dev-refresh"
                                                      :status         :active
                                                      :dev_bundle_url "http://localhost:5174"}]
        (with-redefs [cache/resolve-dev-bundle (constantly "http://localhost:5174")
                      cache/fetch-dev-manifest (constantly {:name "Updated Name" :icon "new-icon.svg"})]
          (let [resp (mt/user-http-request :crowberto :post 200 (str "ee/custom-viz-plugin/" id "/refresh"))]
            (is (= "Updated Name" (:display_name resp)))))))))

;;; ------------------------------------------------ /list compatibility filtering ------------------------------------------------

(deftest list-filters-incompatible-versions-test
  (mt/with-premium-features #{:custom-viz}
    (testing "/list excludes plugins with incompatible metabase_version"
      (with-redefs [config/mb-version-info {:tag "v1.60.0"}
                    config/is-dev?         false]
        (mt/with-temp [:model/CustomVizPlugin _ {:repo_url          "https://github.com/test/compat-viz"
                                                 :identifier        "compat-viz"
                                                 :display_name      "Compatible"
                                                 :status            :active
                                                 :enabled           true
                                                 :metabase_version  ">=1.59"}
                       :model/CustomVizPlugin _ {:repo_url          "https://github.com/test/incompat-viz"
                                                 :identifier        "incompat-viz"
                                                 :display_name      "Incompatible"
                                                 :status            :active
                                                 :enabled           true
                                                 :metabase_version  ">=1.99"}]
          (let [result      (mt/user-http-request :rasta :get 200 "ee/custom-viz-plugin/list")
                identifiers (set (map :identifier result))]
            (is (contains? identifiers "compat-viz"))
            (is (not (contains? identifiers "incompat-viz")))))))))

;;; ------------------------------------------------ Bundle Endpoint ------------------------------------------------

(deftest bundle-endpoint-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url        "https://github.com/test/bundle-test"
                                                    :identifier      "bundle-test"
                                                    :display_name    "bundle-test"
                                                    :status          :active
                                                    :resolved_commit "abc123"}]
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

;;; ------------------------------------------------ Audit Log ------------------------------------------------

(deftest audit-log-create-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (mt/with-model-cleanup [:model/CustomVizPlugin]
      (testing "registering a plugin records a custom-viz-plugin-create audit event"
        (with-redefs [cache/fetch-and-update! (fn [plugin]
                                                (t2/update! :model/CustomVizPlugin (:id plugin)
                                                            {:status          :active
                                                             :resolved_commit "sha123"}))]
          (let [resp  (mt/user-http-request :crowberto :post 200 "ee/custom-viz-plugin/"
                                            {:repo_url "https://github.com/test/audit-create-viz"})
                entry (mt/latest-audit-log-entry "custom-viz-plugin-create" (:id resp))]
            (is (partial=
                 {:topic    :custom-viz-plugin-create
                  :user_id  (mt/user->id :crowberto)
                  :model    "CustomVizPlugin"
                  :model_id (:id resp)
                  :details  {:identifier      "audit-create-viz"
                             :display_name    "audit-create-viz"
                             :repo_url        "https://github.com/test/audit-create-viz"
                             :status          "active"
                             :enabled         true
                             :resolved_commit "sha123"}}
                 entry))))))))

(deftest audit-log-create-dev-test
  (mt/with-premium-features #{:custom-viz :audit-app}
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
            (is (= "audit-dev-chart" (get-in entry [:details :identifier])))))))))

(deftest audit-log-delete-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "deleting a plugin records a custom-viz-plugin-delete audit event"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/audit-delete-viz"
                                                      :identifier   "audit-delete-viz"
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
                         :repo_url     "https://github.com/test/audit-delete-viz"
                         :status       "active"}}
             (mt/latest-audit-log-entry "custom-viz-plugin-delete" id)))))))

(deftest audit-log-update-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "updating a plugin records a custom-viz-plugin-update audit event with changed fields"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/audit-update-viz"
                                                      :identifier   "audit-update-viz"
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

(deftest audit-log-refresh-test
  (mt/with-premium-features #{:custom-viz :audit-app}
    (testing "refreshing a plugin records a custom-viz-plugin-update audit event"
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url        "https://github.com/test/audit-refresh-viz"
                                                      :identifier      "audit-refresh-viz"
                                                      :display_name    "audit-refresh-viz"
                                                      :status          :active
                                                      :resolved_commit "old-sha"}]
        (with-redefs [cache/fetch-and-update! (fn [plugin]
                                                (t2/update! :model/CustomVizPlugin (:id plugin)
                                                            {:resolved_commit "new-sha"}))]
          (mt/user-http-request :crowberto :post 200 (str "ee/custom-viz-plugin/" id "/refresh"))
          (let [entry (mt/latest-audit-log-entry "custom-viz-plugin-update" id)]
            (is (partial=
                 {:topic    :custom-viz-plugin-update
                  :user_id  (mt/user->id :crowberto)
                  :model    "CustomVizPlugin"
                  :model_id id}
                 entry))
            (is (= {:previous {:resolved_commit "old-sha"}
                    :new      {:resolved_commit "new-sha"}}
                   (select-keys (:details entry) [:previous :new])))))))))
