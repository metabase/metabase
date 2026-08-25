(ns ^:synchronized metabase-enterprise.custom-viz-plugin.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.cache :as cache]
   [metabase-enterprise.custom-viz-plugin.test-util :as cvp.tu]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each
  (fn [thunk]
    (mt/with-temporary-setting-values [csp-img-enabled true
                                       custom-viz-enabled true]
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
    (with-redefs [config/mb-version-info {:tag "v1.60.0"}
                  config/is-dev?         false]
      (let [bytes (cvp.tu/valid-bundle-bytes "ver-viz" {:metabase-version ">=1.60"})
            res   (cache/validate-bundle! bytes)]
        (is (= ">=1.60" (:version-str res)))))))

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

(deftest validate-bundle-rejects-tar-bomb-test
  (testing "SECURITY: validate-bundle! rejects archives that expand beyond the uncompressed cap"
    ;; A megabyte of NUL compresses to a few hundred bytes. With a tight cap on
    ;; uncompressed bytes the bomb is refused at extraction time.
    (let [bomb-payload (byte-array (* 32 1024 1024))
          bytes        (cvp.tu/make-tgz-bytes
                        [["metabase-plugin.json" (json/encode {:name "bomb-viz"})]
                         ["dist/index.js" "console.log('hi')"]
                         ["dist/assets/big.bin" bomb-payload]])]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"max uncompressed bytes"
                            (cache/validate-bundle! bytes))))))

(deftest validate-bundle-accepts-incompatible-version-test
  (testing "version incompatibilities never fail validation — they surface as soft warnings at read time"
    (with-redefs [config/mb-version-info {:tag "v1.60.0"}
                  config/is-dev?         false]
      (let [bytes (cvp.tu/valid-bundle-bytes "bad-ver" {:metabase-version ">=1.99.0"})
            res   (cache/validate-bundle! bytes)]
        (is (= ">=1.99.0" (:version-str res)))))))

(deftest validate-bundle-rejects-malformed-manifest-test
  (testing "manifest fields with wrong JSON types are rejected with a 400"
    (doseq [opts [{:sdk-version 2}
                  {:metabase-version 1.62}
                  {:icon 5}]]
      (let [bytes (cvp.tu/valid-bundle-bytes "bad-types" opts)
            e     (is (thrown-with-msg? Exception #"metabase-plugin\.json is invalid"
                                        (cache/validate-bundle! bytes))
                      (pr-str opts))]
        (is (= 400 (:status-code (ex-data e))) (pr-str opts)))))
  (testing "a non-string name is rejected before the blank-name check can choke on it"
    (let [bytes (cvp.tu/make-tgz-bytes
                 [["metabase-plugin.json" (json/encode {:name 123})]
                  ["dist/index.js" "console.log('hi')"]])]
      (is (thrown-with-msg? Exception #"metabase-plugin\.json is invalid"
                            (cache/validate-bundle! bytes))))))

(deftest loopback-host?-test
  (testing "the name localhost, and any loopback IP literal in either family"
    (doseq [host ["localhost" "127.0.0.1" "127.0.0.2" "127.1.2.3"
                  "::1" "0:0:0:0:0:0:0:1" "[::1]"]]
      (is (true? (cache/loopback-host? host)) host)))
  (testing "anything that is not loopback"
    (doseq [host ["10.0.0.5" "169.254.169.254" "0.0.0.0" "8.8.8.8" "" nil]]
      (is (false? (cache/loopback-host? host)) (pr-str host))))
  (testing "a name is never resolved, only parsed."
    (doseq [host ["evil.com" "host.docker.internal" "localhost.evil.com" "127.0.0.1.evil.com"]]
      (is (false? (cache/loopback-host? host)) host))))

(deftest validate-dev-url-test
  (testing "normalizes an acceptable URL to a bare origin"
    (are [in out] (= out (cache/validate-dev-url! in "Dev server URL"))
      "http://LOCALHOST:5174/"  "http://localhost:5174"
      "http://localhost"       "http://localhost"
      "http://[::1]:5174"      "http://[::1]:5174"))
  (testing "rejects every scheme but http/https"
    (doseq [url ["ftp://localhost:5174" "file:///etc/passwd" "jar:file:///app.jar!/secret"
                 "javascript:alert(1)" "localhost:5174"]]
      (is (thrown-with-msg? Exception #"http or https|not a valid URL"
                            (cache/validate-dev-url! url "Dev server URL"))
          url)))
  (testing "a non-loopback host is refused, and named in the message"
    (is (thrown-with-msg? Exception #"must point at localhost, got: example\.com$"
                          (cache/validate-dev-url! "https://example.com" "Dev server URL")))
    (testing "a URL that merely reads like localhost is judged on its actual authority"
      (doseq [url ["http://localhost@example.com:5174" "http://example.com#@localhost"]]
        (is (thrown-with-msg? Exception #"must point at localhost, got: example\.com$"
                              (cache/validate-dev-url! url "Dev server URL"))
            url))))
  (testing "rejects anything richer than an origin, so only scheme://host[:port] reaches the header"
    (doseq [url ["http://localhost:5174/example" "http://localhost:5174?a=1" "http://localhost:5174#f"]]
      (is (thrown-with-msg? Exception #"bare origin"
                            (cache/validate-dev-url! url "Dev server URL"))
          url))))

(deftest set-or-clear-dev-bundle!-test
  (mt/with-premium-features #{:custom-viz}
    (mt/with-temp [:model/CustomVizPlugin {id :id} {:identifier   "test-viz"
                                                    :display_name "test-viz"
                                                    :status       :active}]
      (testing "stores a valid URL, normalized to a bare origin"
        (cache/set-or-clear-dev-bundle! id "http://LOCALHOST:5174/")
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
                              (cache/set-or-clear-dev-bundle! id "file:///etc/passwd"))))
      (testing "SECURITY: rejects a non-loopback host before it can reach the CSP"
        (is (thrown-with-msg? Exception #"must point at localhost"
                              (cache/set-or-clear-dev-bundle! id "https://evil.com")))))))

;;; ------------------------------------------------ Asset Whitelist ------------------------------------------------

(deftest resolve-asset-whitelist-test
  (testing "SECURITY: resolve-asset only serves the manifest icon"
    (mt/with-premium-features #{:custom-viz}
      (let [manifest {:name "test-viz"
                      :icon "icon.svg"}]
        (mt/with-temp [:model/CustomVizPlugin plugin {:identifier   "test-viz"
                                                      :display_name "test-viz"
                                                      :status       :active
                                                      :bundle_hash  "abc123"
                                                      :manifest     manifest}]
          (with-redefs [cache/get-asset (fn [_ asset-name] (.getBytes (str "bytes:" asset-name) "UTF-8"))]
            (testing "serves the manifest icon"
              (is (= "bytes:icon.svg"
                     (some-> (cache/resolve-asset plugin "icon.svg") (String. "UTF-8")))))
            (testing "returns nil for any asset other than the icon"
              (is (nil? (cache/resolve-asset plugin "thumb.png")))
              (is (nil? (cache/resolve-asset plugin "not-listed.png"))))
            (testing "returns nil for path traversal attempts"
              (is (nil? (cache/resolve-asset plugin "../../../etc/passwd"))))
            (testing "returns nil for absolute path attempts"
              (is (nil? (cache/resolve-asset plugin "/etc/passwd"))))))))))

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

;;; ------------------------------------------------ integrity check on serve ------------------------------------------------

(deftest get-bundle-rejects-mismatched-hash-test
  (testing "SECURITY: get-bundle refuses to serve when stored bytes don't match bundle_hash"
    (mt/with-premium-features #{:custom-viz}
      (mt/with-temp [:model/CustomVizPlugin plugin {:identifier   "tampered-viz"
                                                    :display_name "tampered-viz"
                                                    :status       :active
                                                    :bundle       (cvp.tu/valid-bundle-bytes "tampered-viz")
                                                    :bundle_hash  "deadbeef"}]
        (is (nil? (cache/get-bundle plugin))
            "mismatch between bundle bytes and bundle_hash must not be served")))))
