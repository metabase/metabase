(ns metabase-enterprise.custom-viz-plugin.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.settings :as custom-viz.settings]
   [metabase-enterprise.custom-viz-plugin.test-util :as cvp.tu]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [custom-viz-enabled true]
      (thunk))))

;;; ------------------------------------------------ validate-bundle! ------------------------------------------------

(deftest validate-bundle-happy-path-test
  (testing "validate-bundle! returns parsed manifest and a stable sha256"
    (let [bytes (cvp.tu/valid-bundle-bytes "my-viz" {:icon "icon.svg"})
          res   (cache/validate-bundle! bytes)]
      (is (= "my-viz" (get-in res [:manifest :name])))
      (is (= "icon.svg" (get-in res [:manifest :icon])))
      (is (bytes? (:bytes res)))
      (is (string? (:hash res)))
      (is (= 64 (count (:hash res))) "sha256 hex is 64 chars")
      (testing "hash is deterministic"
        (is (= (:hash res) (:hash (cache/validate-bundle! bytes))))))))

(deftest validate-bundle-captures-version-test
  (testing "metabase.version from the manifest is echoed as :version-str"
    (let [bytes (cvp.tu/valid-bundle-bytes "ver-viz" {:metabase-version ">=1.60"})
          res   (cache/validate-bundle! bytes)]
      (is (= ">=1.60" (:version-str res))))))

(deftest validate-bundle-rejects-empty-test
  (testing "empty bytes"
    (is (thrown-with-msg? Exception #"empty"
                          (cache/validate-bundle! (byte-array 0))))))

(deftest validate-bundle-rejects-non-archive-test
  (testing "plain text is not a tar.gz archive"
    (is (thrown-with-msg? Exception #"tar\.gz"
                          (cache/validate-bundle! (.getBytes "not an archive" "UTF-8"))))))

(deftest validate-bundle-requires-manifest-test
  (testing "archive without metabase-plugin.json is rejected"
    (let [bytes (cvp.tu/make-tgz-bytes [["dist/index.js" "console.log('hi')"]])]
      (is (thrown-with-msg? Exception #"metabase-plugin\.json"
                            (cache/validate-bundle! bytes))))))

(deftest validate-bundle-requires-index-js-test
  (testing "archive without dist/index.js is rejected"
    (let [bytes (cvp.tu/make-tgz-bytes
                 [["metabase-plugin.json" (json/encode {:name "no-bundle"})]])]
      (is (thrown-with-msg? Exception #"index\.js"
                            (cache/validate-bundle! bytes))))))

(deftest validate-bundle-requires-manifest-name-test
  (testing "manifest without :name is rejected"
    (let [bytes (cvp.tu/make-tgz-bytes
                 [["metabase-plugin.json" (json/encode {:icon "icon.svg"})]
                  ["dist/index.js" "console.log('hi')"]])]
      (is (thrown-with-msg? Exception #"\"name\""
                            (cache/validate-bundle! bytes))))))

(deftest validate-bundle-rejects-invalid-json-manifest-test
  (testing "non-JSON manifest is rejected"
    (let [bytes (cvp.tu/make-tgz-bytes
                 [["metabase-plugin.json" "not json at all"]
                  ["dist/index.js" "console.log('hi')"]])]
      (is (thrown-with-msg? Exception #"not valid JSON"
                            (cache/validate-bundle! bytes))))))

(deftest validate-bundle-rejects-incompatible-version-test
  (testing "plugin requiring incompatible Metabase version is rejected"
    (with-redefs [config/mb-version-info {:tag "v1.60.0"}
                  config/is-dev?         false]
      (let [bytes (cvp.tu/valid-bundle-bytes "bad-ver" {:metabase-version ">=1.99.0"})]
        (is (thrown-with-msg? Exception #"version"
                              (cache/validate-bundle! bytes)))))))

;;; ------------------------------------------------ dev-base-url URL validation ------------------------------------------------

(deftest dev-base-url-test
  (testing "accepts http URLs"
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174")))
    (is (= "http://localhost:5174/" (cache/dev-base-url "http://localhost:5174/"))))
  (testing "accepts https URLs"
    (is (= "https://dev.example.com/" (cache/dev-base-url "https://dev.example.com"))))
  (testing "SECURITY: rejects ftp:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "ftp://evil.com/bundle"))))
  (testing "SECURITY: rejects jar:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "jar:file:///app.jar!/secret"))))
  (testing "SECURITY: rejects URLs with no scheme"
    (is (thrown? Exception
                 (cache/dev-base-url "localhost:5174"))))
  (testing "SECURITY: rejects file:// URLs"
    (is (thrown-with-msg? Exception #"http or https"
                          (cache/dev-base-url "file:///etc/passwd")))))

(deftest set-or-clear-dev-bundle!-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "test-viz"
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
      (testing "SECURITY: rejects file:// URLs"
        (is (thrown-with-msg? Exception #"http or https"
                              (cache/set-or-clear-dev-bundle! id "file:///etc/passwd")))))))

;;; ------------------------------------------------ Asset Whitelist ------------------------------------------------

(deftest resolve-asset-whitelist-test
  (testing "SECURITY: resolve-asset enforces manifest whitelist"
    (mt/with-premium-features #{:custom-viz}
      (let [manifest {:name   "test-viz"
                      :icon   "icon.svg"
                      :assets ["icon.svg" "thumb.png"]}]
        (mt/with-temp [:model/CustomVizPlugin plugin {:identifier   "test-viz"
                                                      :display_name "test-viz"
                                                      :status       :active
                                                      :bundle_hash  "abc123"
                                                      :manifest     manifest}]
          (testing "returns nil for assets not in manifest whitelist"
            (is (nil? (cache/resolve-asset plugin "not-listed.png"))))
          (testing "returns nil for path traversal attempts"
            (is (nil? (cache/resolve-asset plugin "../../../etc/passwd"))))
          (testing "returns nil for absolute path attempts"
            (is (nil? (cache/resolve-asset plugin "/etc/passwd")))))))))

;;; ------------------------------------------------ insert-bundle!/save-bundle! state consistency ------------------------------------------------

(deftest insert-bundle-test
  (testing "insert-bundle! creates an :active row with derived fields from the manifest"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-model-cleanup [:model/CustomVizPlugin]
        (let [validated (cache/validate-bundle! (cvp.tu/valid-bundle-bytes "new-viz" {:icon "icon.svg"}))
              row       (cache/insert-bundle! "new-viz" validated)]
          (is (some? (:id row)))
          (is (= :active (:status row)))
          (is (= "new-viz" (:identifier row)))
          (is (= "new-viz" (:display_name row)))
          (is (= "icon.svg" (:icon row)))
          (is (= (:hash validated) (:bundle_hash row))
              "bundle_hash matches the validated sha256"))))))

(deftest save-bundle-test
  (testing "save-bundle! replaces an existing row's derived fields"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier    "save-viz"
                                                      :display_name  "old"
                                                      :status        :error
                                                      :error_message "something"
                                                      :bundle        (.getBytes "old" "UTF-8")
                                                      :bundle_hash   "oldhash"}]
        (let [validated (cache/validate-bundle! (cvp.tu/valid-bundle-bytes "save-viz" {:icon "new.svg"}))
              row       (cache/save-bundle! {:id id} validated)]
          (is (= :active (:status row))
              "plugin should be active after a successful save")
          (is (nil? (:error_message row))
              "error_message should be cleared")
          (is (= "new.svg" (:icon row)))
          (is (= (:hash validated) (:bundle_hash row)))
          (is (not= "oldhash" (:bundle_hash row))))))))

;;; ------------------------------------------------ resolve-bundle precedence ------------------------------------------------

(deftest resolve-bundle-dev-url-takes-precedence-test
  (testing "resolve-bundle prefers dev URL over the uploaded bundle when both are present"
    (mt/with-premium-features #{:custom-viz}
      (with-redefs [custom-viz.settings/custom-viz-plugin-dev-mode-enabled (constantly true)]
        (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier     "precedence"
                                                        :display_name   "precedence"
                                                        :status         :active
                                                        :bundle_hash    "abc123"
                                                        :dev_bundle_url "http://localhost:5174"}]
          (let [dev-called? (atom false)
                fs-called?  (atom false)]
            (with-redefs [cache/fetch-dev-bundle (fn [_] (reset! dev-called? true) {:content "dev-js" :hash "d1"})
                          cache/get-bundle      (fn [_] (reset! fs-called? true) {:content "fs-js" :hash "g1"})]
              (let [result (cache/resolve-bundle {:id id})]
                (is (true? @dev-called?) "dev bundle fetch should be called")
                (is (false? @fs-called?) "filesystem bundle should not be called when dev URL is set")
                (is (= "dev-js" (:content result)))))))))))
