(ns metabase-enterprise.custom-viz-plugin.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
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
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:repo_url         "https://github.com/test/viz"
                                                        :identifier       "test-viz"
                                                        :display_name     "test-viz"
                                                        :status           :active
                                                        :resolved_commit  "abc123"
                                                        :manifest         manifest}]
          (testing "returns nil for assets not in manifest whitelist"
            (is (nil? (cache/resolve-asset id "not-listed.png"))))
          (testing "returns nil for path traversal attempts"
            (is (nil? (cache/resolve-asset id "../../../etc/passwd"))))
          (testing "returns nil for absolute path attempts"
            (is (nil? (cache/resolve-asset id "/etc/passwd")))))))))
