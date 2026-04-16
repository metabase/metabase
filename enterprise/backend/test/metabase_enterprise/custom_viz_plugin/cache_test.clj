(ns metabase-enterprise.custom-viz-plugin.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.remote-sync.source.git :as rs.git]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Dev URL Validation ------------------------------------------------

(deftest dev-base-url-test
  (testing "accepts http URLs"
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174")))
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174/"))))
  (testing "accepts https URLs"
    (is (= "https://dev.example.com/" (cache/dev-base-url "https://dev.example.com"))))
  (testing "SECURITY: rejects file:// URLs (SSRF)"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "file:///etc/passwd"))))
  (testing "SECURITY: rejects ftp:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "ftp://evil.com/bundle"))))
  (testing "SECURITY: rejects jar:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "jar:file:///app.jar!/secret"))))
  (testing "SECURITY: rejects URLs with no scheme"
    (is (thrown? Exception
                 (cache/dev-base-url "localhost:5174")))))

(deftest set-or-clear-dev-bundle!-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/viz"
                                                    :identifier   "test-viz"
                                                    :display_name "test-viz"
                                                    :status       :active}]
      (testing "sets a valid http URL"
        (cache/set-or-clear-dev-bundle! id "http://localhost:5174")
        (is (= "http://localhost:5174"
               (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))
      (testing "clears the URL with nil"
        (cache/set-or-clear-dev-bundle! id nil)
        (is (nil? (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))
      (testing "clears the URL with empty string"
        (cache/set-or-clear-dev-bundle! id "http://localhost:5174")
        (cache/set-or-clear-dev-bundle! id "")
        (is (nil? (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))
      (testing "SECURITY: rejects file:// URLs at write time"
        (is (thrown-with-msg? Exception #"http or https"
                              (cache/set-or-clear-dev-bundle! id "file:///etc/passwd")))))))

;;; ------------------------------------------------ Asset Whitelist ------------------------------------------------

(deftest resolve-asset-whitelist-test
  (testing "SECURITY: resolve-asset enforces manifest whitelist"
    (mt/with-premium-features #{:custom-viz}
      (let [manifest {:name   "test-viz"
                      :icon   "icon.svg"
                      :assets ["icon.svg" "thumb.png"]}]
        (mt/with-temp [:model/CustomVizPlugin plugin {:repo_url         "https://github.com/test/viz"
                                                      :identifier       "test-viz"
                                                      :display_name     "test-viz"
                                                      :status           :active
                                                      :resolved_commit  "abc123"
                                                      :manifest         manifest}]
          (testing "returns nil for assets not in manifest whitelist"
            (is (nil? (cache/resolve-asset plugin "not-listed.png"))))
          (testing "returns nil for path traversal attempts"
            (is (nil? (cache/resolve-asset plugin "../../../etc/passwd"))))
          (testing "returns nil for absolute path attempts"
            (is (nil? (cache/resolve-asset plugin "/etc/passwd")))))))))

;;; ------------------------------------------------ fetch-and-update! state consistency ------------------------------------------------

(deftest fetch-and-update!-success-test
  (testing "successful fetch updates plugin to :active with manifest data"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/fetch-ok"
                                                      :identifier   "fetch-ok"
                                                      :display_name "fetch-ok"
                                                      :status       :pending}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/read-file        (fn [_snapshot path]
                                                (case path
                                                  "dist/index.js"          "console.log('hi')"
                                                  "metabase-plugin.json"   "{\"name\":\"My Viz\",\"icon\":\"icon.svg\"}"
                                                  nil))]
          (let [commit (cache/fetch-and-update! {:id id :repo_url "https://github.com/test/fetch-ok"
                                                 :identifier "fetch-ok"})]
            (is (= "abc123" commit) "should return the commit SHA")
            (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
              (is (= :active (:status plugin))
                  "plugin should be active after successful fetch")
              (is (nil? (:error_message plugin))
                  "error_message should be cleared on success")
              (is (= "abc123" (:resolved_commit plugin)))
              (is (= "My Viz" (:display_name plugin))
                  "display_name should come from manifest")
              (is (= "icon.svg" (:icon plugin))
                  "icon should come from manifest"))))))))

(deftest fetch-and-update!-failure-sets-error-state-test
  (testing "failed fetch sets plugin to :error with error message"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/fetch-fail"
                                                      :identifier   "fetch-fail"
                                                      :display_name "fetch-fail"
                                                      :status       :active}]
        (with-redefs [rs.git/git-source     (fn [& _] (throw (ex-info "Connection refused" {})))]
          (let [result (cache/fetch-and-update! {:id id :repo_url "https://github.com/test/fetch-fail"
                                                 :identifier "fetch-fail"})]
            (is (nil? result) "should return nil on failure")
            (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
              (is (= :error (:status plugin))
                  "plugin should be in error state after failed fetch")
              (is (some? (:error_message plugin))
                  "error_message should be set on failure"))))))))

(deftest fetch-and-update!-missing-bundle-sets-error-test
  (testing "missing index.js in repo sets plugin to :error"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/no-bundle"
                                                      :identifier   "no-bundle"
                                                      :display_name "no-bundle"
                                                      :status       :pending}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/read-file        (constantly nil)]
          (let [result (cache/fetch-and-update! {:id id :repo_url "https://github.com/test/no-bundle"
                                                 :identifier "no-bundle"})]
            (is (nil? result))
            (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
              (is (= :error (:status plugin)))
              (is (re-find #"index\.js.*not found" (:error_message plugin))
                  "error message should mention the missing file"))))))))

(deftest fetch-and-update!-incompatible-version-sets-error-test
  (testing "plugin requiring incompatible Metabase version sets :error"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/bad-ver"
                                                      :identifier   "bad-ver"
                                                      :display_name "bad-ver"
                                                      :status       :pending}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/read-file        (fn [_snapshot path]
                                                (case path
                                                  "dist/index.js"        "console.log('hi')"
                                                  "metabase-plugin.json" (str "{\"name\":\"Bad Ver\","
                                                                              "\"metabase\":{\"version\":\">=1.99.0\"}}")
                                                  nil))
                      config/mb-version-info {:tag "v1.60.0"}
                      config/is-dev?         false]
          (let [result (cache/fetch-and-update! {:id id :repo_url "https://github.com/test/bad-ver"
                                                 :identifier "bad-ver"})]
            (is (nil? result))
            (let [plugin (t2/select-one :model/CustomVizPlugin :id id)]
              (is (= :error (:status plugin)))
              (is (re-find #"version" (:error_message plugin))
                  "error message should mention version incompatibility"))))))))

;;; ------------------------------------------------ resolve-bundle precedence ------------------------------------------------

(deftest resolve-bundle-dev-url-takes-precedence-test
  (testing "resolve-bundle prefers dev URL over git when both are available"
    (mt/with-premium-features #{:custom-viz}
      (with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url        "https://github.com/test/precedence"
                                                        :identifier      "precedence"
                                                        :display_name    "precedence"
                                                        :status          :active
                                                        :resolved_commit "abc123"
                                                        :dev_bundle_url  "http://localhost:5174"}]
          (let [dev-called? (atom false)
                git-called? (atom false)]
            (with-redefs [cache/fetch-dev-bundle (fn [_] (reset! dev-called? true) {:content "dev-js" :hash "d1"})
                          cache/get-bundle      (fn [_] (reset! git-called? true) {:content "git-js" :hash "g1"})]
              (let [result (cache/resolve-bundle {:id id})]
                (is (true? @dev-called?) "dev bundle fetch should be called")
                (is (false? @git-called?) "git bundle should not be called when dev URL is set")
                (is (= "dev-js" (:content result)))))))))))
