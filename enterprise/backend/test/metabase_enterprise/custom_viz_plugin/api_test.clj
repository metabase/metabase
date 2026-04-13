(ns metabase-enterprise.custom-viz-plugin.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

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
