(ns metabase-enterprise.custom-viz-plugin.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.remote-sync.source.git :as rs.git]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [custom-viz-enabled true]
      (thunk))))

;;; ------------------------------------------------ URL Validation ------------------------------------------------

(deftest validate-repo-url-test
  (testing "accepts http URLs"
    (is (nil? (cache/validate-repo-url! "http://github.com/user/repo"))))
  (testing "accepts https URLs"
    (is (nil? (cache/validate-repo-url! "https://github.com/user/repo"))))
  (testing "accepts file:// URLs in test mode"
    (is (nil? (cache/validate-repo-url! "file:///tmp/repo"))))
  (testing "SECURITY: rejects ssh:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/validate-repo-url! "ssh://git@github.com/user/repo"))))
  (testing "SECURITY: rejects ftp:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/validate-repo-url! "ftp://evil.com/repo"))))
  (testing "SECURITY: rejects gopher:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/validate-repo-url! "gopher://evil.com/repo"))))
  (testing "SECURITY: rejects file:// URLs in prod mode"
    (with-redefs [config/is-test? false]
      (is (thrown-with-msg? Exception #"http or https"
                            (cache/validate-repo-url! "file:///etc/passwd"))))))

(deftest dev-base-url-test
  (testing "accepts http URLs"
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174")))
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174/"))))
  (testing "accepts https URLs"
    (is (= "https://dev.example.com/" (cache/dev-base-url "https://dev.example.com"))))
  (testing "accepts file:// URLs in test mode"
    (is (= "file:///tmp/bundle/" (cache/dev-base-url "file:///tmp/bundle"))))
  (testing "SECURITY: rejects ftp:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "ftp://evil.com/bundle"))))
  (testing "SECURITY: rejects jar:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "jar:file:///app.jar!/secret"))))
  (testing "SECURITY: rejects URLs with no scheme"
    (is (thrown? Exception
                 (cache/dev-base-url "localhost:5174"))))
  (testing "SECURITY: rejects file:// URLs in prod mode"
    (with-redefs [config/is-test? false]
      (is (thrown-with-msg? Exception #"http or https"
                            (cache/dev-base-url "file:///etc/passwd"))))))

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
      (testing "accepts file:// URLs in test mode"
        (cache/set-or-clear-dev-bundle! id "file:///tmp/bundle")
        (is (= "file:///tmp/bundle"
               (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id id))))
      (testing "SECURITY: rejects file:// URLs in prod mode"
        (with-redefs [config/is-test? false]
          (is (thrown-with-msg? Exception #"http or https"
                                (cache/set-or-clear-dev-bundle! id "file:///etc/passwd"))))))))

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

;;; ------------------------------------------------ fetch-and-save! state consistency ------------------------------------------------

(deftest fetch-and-save!-success-test
  (testing "successful fetch updates plugin to :active with manifest data"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/fetch-ok"
                                                      :identifier   "fetch-ok"
                                                      :display_name "fetch-ok"
                                                      :status       :error}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/file-size        (constantly 100)
                      rs.git/read-file        (fn [_snapshot path]
                                                (case path
                                                  "dist/index.js"          "console.log('hi')"
                                                  "metabase-plugin.json"   "{\"name\":\"My Viz\",\"icon\":\"icon.svg\"}"
                                                  nil))]
          (let [result (cache/fetch-and-save! {:id id :repo_url "https://github.com/test/fetch-ok"
                                               :identifier "fetch-ok"})]
            (is (= :active (:status result))
                "plugin should be active after successful fetch")
            (is (nil? (:error_message result))
                "error_message should be cleared on success")
            (is (= "abc123" (:resolved_commit result)))
            (is (= "My Viz" (:display_name result))
                "display_name should come from manifest")
            (is (= "icon.svg" (:icon result))
                "icon should come from manifest")))))))

(deftest fetch-and-save!-insert-test
  (testing "fetch-and-save! inserts a new row when no :id is provided"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/file-size        (constantly 100)
                      rs.git/read-file        (fn [_snapshot path]
                                                (case path
                                                  "dist/index.js"        "console.log('hi')"
                                                  "metabase-plugin.json" "{\"name\":\"New Viz\"}"
                                                  nil))]
          (let [result (cache/fetch-and-save! {:repo_url   "https://github.com/test/insert-new"
                                               :identifier "insert-new"})]
            (is (some? (:id result)) "should return a row with an id")
            (is (= :active (:status result)))
            (is (= "New Viz" (:display_name result)))
            (is (= "abc123" (:resolved_commit result)))))))))

(deftest fetch-and-save!-failure-throws-test
  (testing "failed fetch throws — caller decides how to handle"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/fetch-fail"
                                                      :identifier   "fetch-fail"
                                                      :display_name "fetch-fail"
                                                      :status       :active}]
        (with-redefs [rs.git/git-source     (fn [& _] (throw (ex-info "Connection refused" {})))]
          (is (thrown-with-msg? Exception #"Connection refused"
                                (cache/fetch-and-save! {:id id :repo_url "https://github.com/test/fetch-fail"
                                                        :identifier "fetch-fail"}))))))))

(deftest fetch-and-save!-missing-bundle-throws-test
  (testing "missing index.js in repo throws"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/no-bundle"
                                                      :identifier   "no-bundle"
                                                      :display_name "no-bundle"
                                                      :status       :active}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/read-file        (constantly nil)]
          (is (thrown-with-msg? Exception #"index\.js.*not found"
                                (cache/fetch-and-save! {:id id :repo_url "https://github.com/test/no-bundle"
                                                        :identifier "no-bundle"}))))))))

(deftest fetch-and-save!-incompatible-version-throws-test
  (testing "plugin requiring incompatible Metabase version throws"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url     "https://github.com/test/bad-ver"
                                                      :identifier   "bad-ver"
                                                      :display_name "bad-ver"
                                                      :status       :active}]
        (with-redefs [rs.git/git-source      (constantly nil)
                      rs.git/snapshot-at-ref  (constantly {:version "abc123"})
                      rs.git/file-size        (constantly 100)
                      rs.git/read-file        (fn [_snapshot path]
                                                (case path
                                                  "dist/index.js"        "console.log('hi')"
                                                  "metabase-plugin.json" (str "{\"name\":\"Bad Ver\","
                                                                              "\"metabase\":{\"version\":\">=1.99.0\"}}")
                                                  nil))
                      config/mb-version-info {:tag "v1.60.0"}
                      config/is-dev?         false]
          (is (thrown-with-msg? Exception #"version"
                                (cache/fetch-and-save! {:id id :repo_url "https://github.com/test/bad-ver"
                                                        :identifier "bad-ver"}))))))))

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
