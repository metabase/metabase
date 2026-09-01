(ns metabase-enterprise.custom-viz-plugin.manifest-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase.config.core :as config]
   [metabase.util.json :as json]))

(deftest parse-manifest-test
  (testing "parses valid JSON"
    (is (= {:name "test-viz" :icon "icon.svg"}
           (manifest/parse-manifest "{\"name\": \"test-viz\", \"icon\": \"icon.svg\"}"))))
  (testing "returns nil for invalid JSON"
    (is (nil? (manifest/parse-manifest "not json"))))
  (testing "returns nil for nil input"
    (is (nil? (manifest/parse-manifest nil)))))

;;; ------------------------------------------------ Version ------------------------------------------------

(deftest compatible?-test
  (testing "returns true when no version range is specified"
    (is (true? (manifest/compatible? {})))
    (is (true? (manifest/compatible? {:metabase_version nil})))
    (is (true? (manifest/compatible? {:metabase_version ""}))))
  (testing "returns true for a range the current version satisfies"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.60.0"}]
      (is (true? (manifest/compatible? {:metabase_version ">=1.59"})))))
  (testing "returns false for a range the current version does not satisfy"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.58.0"}]
      (is (false? (manifest/compatible? {:metabase_version ">=1.59"})))))
  (testing "SNAPSHOT pre-release versions satisfy ranges (pre-release is stripped)"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.61.1-SNAPSHOT"}]
      (is (true? (manifest/compatible? {:metabase_version ">=1.59"}))))
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.58.0-SNAPSHOT"}]
      (is (false? (manifest/compatible? {:metabase_version ">=1.59"})))))
  (testing "build metadata is stripped for version comparison"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.60.0+build123"}]
      (is (true? (manifest/compatible? {:metabase_version ">=1.59"})))))
  (testing "returns true in dev mode regardless of version"
    (with-redefs [config/is-dev? true]
      (is (true? (manifest/compatible? {:metabase_version ">=1.99.0"})))))
  (testing "returns false for invalid semver range"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.60.0"}]
      (is (false? (manifest/compatible? {:metabase_version "not-a-version"})))))
  (testing "returns true when current version can't be coerced (e.g. vLOCAL_DEV in CI)"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "vLOCAL_DEV"}]
      (is (true? (manifest/compatible? {:metabase_version ">=1.59"}))))))

(deftest sdk-version-tested?-test
  (with-redefs [manifest/tested-sdk-version-range ">=2.0.0 <=2.0.3"]
    (testing "versions inside the range are tested, bounds inclusive"
      (is (true? (manifest/sdk-version-tested? "2.0.0")))
      (is (true? (manifest/sdk-version-tested? "2.0.2")))
      (is (true? (manifest/sdk-version-tested? "2.0.3"))))
    (testing "prereleases order below their release, so they fall inside the range"
      (is (true? (manifest/sdk-version-tested? "2.0.1-canary.2"))))
    (testing "versions outside the range are untested"
      (is (false? (manifest/sdk-version-tested? "2.0.4")))
      (is (false? (manifest/sdk-version-tested? "2.1.0")))
      (is (false? (manifest/sdk-version-tested? "3.0.0")))
      (is (false? (manifest/sdk-version-tested? "1.0.5"))))
    (testing "nil/blank means a pre-stamping bundle, i.e. SDK 1.x"
      (is (false? (manifest/sdk-version-tested? nil)))
      (is (false? (manifest/sdk-version-tested? ""))))
    (testing "malformed versions are untested"
      (is (false? (manifest/sdk-version-tested? "garbage"))))
    (testing "non-string versions (possible via serdes-imported manifests) are untested"
      (is (false? (manifest/sdk-version-tested? 2)))
      (is (false? (manifest/sdk-version-tested? 2.0)))
      (is (false? (manifest/sdk-version-tested? {:major 2}))))))

(deftest sdk-version-tested?-range-syntax-test
  (testing "a bare minor matches every patch of that minor"
    (with-redefs [manifest/tested-sdk-version-range "2.0"]
      (is (true? (manifest/sdk-version-tested? "2.0.0")))
      (is (true? (manifest/sdk-version-tested? "2.0.7")))
      (is (false? (manifest/sdk-version-tested? "2.1.0")))))
  (testing "hyphen ranges span tested minors, upper minor inclusive"
    (with-redefs [manifest/tested-sdk-version-range "2.0 - 2.1"]
      (is (true? (manifest/sdk-version-tested? "2.0.0")))
      (is (true? (manifest/sdk-version-tested? "2.1.9")))
      (is (false? (manifest/sdk-version-tested? "1.9.9")))
      (is (false? (manifest/sdk-version-tested? "2.2.0"))))))

(deftest tested-sdk-version-range-covers-current-sdk-test
  (testing "tested-sdk-version-range includes the @metabase/custom-viz version in package.json — bump the range in the same PR as the version (see custom-viz/dev.md)"
    (let [{:keys [version]} (json/decode+kw (slurp "enterprise/frontend/src/custom-viz/package.json"))]
      (is (true? (manifest/sdk-version-tested? version))
          (format "@metabase/custom-viz %s is outside tested-sdk-version-range %s"
                  version manifest/tested-sdk-version-range)))))

(deftest warnings-test
  (with-redefs [config/is-dev? false
                config/mb-version-info {:tag "v1.64.0"}
                manifest/tested-sdk-version-range ">=2.0.0 <=2.0.0"]
    (testing "no warnings for a stamped, in-range, satisfied plugin"
      (is (= []
             (manifest/warnings {:metabase_version ">=1.60.0"
                                 :manifest         {:sdk {:version "2.0.0"}}}))))
    (testing "unstamped plugin warns as untested SDK 1.x"
      (is (= [{:type             "sdk-version-mismatch"
               :sdk_version      nil
               :tested_sdk_range ">=2.0.0 <=2.0.0"}]
             (manifest/warnings {:metabase_version nil
                                 :manifest         {}}))))
    (testing "a wrong-typed sdk.version (possible via serdes import) warns as unstamped instead of throwing"
      (is (= [{:type             "sdk-version-mismatch"
               :sdk_version      nil
               :tested_sdk_range ">=2.0.0 <=2.0.0"}]
             (manifest/warnings {:metabase_version nil
                                 :manifest         {:sdk {:version 2}}}))))
    (testing "unsatisfied metabase.version warns"
      (is (= [{:type             "metabase-version-mismatch"
               :metabase_version ">=1.99"
               :current_version  "v1.64.0"}]
             (manifest/warnings {:metabase_version ">=1.99"
                                 :manifest         {:sdk {:version "2.0.0"}}}))))
    (testing "both warnings can apply at once"
      (is (= ["sdk-version-mismatch" "metabase-version-mismatch"]
             (map :type (manifest/warnings {:metabase_version ">=1.99"
                                            :manifest         {:sdk {:version "1.0.5"}}})))))))

(deftest validation-error-test
  (testing "well-formed manifests produce no error, extra keys and nils included"
    (is (nil? (manifest/validation-error {:name "viz"})))
    (is (nil? (manifest/validation-error {:name     "viz"
                                          :icon     "icon.svg"
                                          :metabase {:version ">=1.60"}
                                          :sdk      {:version "2.0.0"}
                                          :extra    123})))
    (is (nil? (manifest/validation-error {:name nil :icon nil :metabase nil :sdk nil}))))
  (testing "wrong field types are reported"
    (is (= {:name ["should be a string"]}
           (manifest/validation-error {:name 123})))
    (is (= {:icon ["should be a string"]}
           (manifest/validation-error {:name "viz" :icon 5})))
    (is (= {:metabase {:version ["should be a string"]}}
           (manifest/validation-error {:name "viz" :metabase {:version 1.62}})))
    (is (= {:sdk {:version ["should be a string"]}}
           (manifest/validation-error {:name "viz" :sdk {:version 2}}))))
  (testing "non-object values for nested keys and the manifest itself are reported"
    (is (= {:metabase ["invalid type"]}
           (manifest/validation-error {:name "viz" :metabase "1.62"})))
    (is (= ["invalid type"]
           (manifest/validation-error [1 2 3])))))

;;; ------------------------------------------------ Path Safety ------------------------------------------------

(deftest safe-relative-path?-test
  (testing "accepts simple filenames"
    (is (true? (manifest/safe-relative-path? "icon.svg")))
    (is (true? (manifest/safe-relative-path? "assets/icon.svg"))))
  (testing "rejects directory traversal"
    (is (false? (manifest/safe-relative-path? "../etc/passwd")))
    (is (false? (manifest/safe-relative-path? "foo/../../etc/passwd")))
    (is (false? (manifest/safe-relative-path? ".."))))
  (testing "rejects absolute paths"
    (is (false? (manifest/safe-relative-path? "/etc/passwd")))
    (is (false? (manifest/safe-relative-path? "/tmp/file.js"))))
  (testing "normalizes path before checking"
    ;; foo/../bar normalizes to bar which is safe
    (is (true? (manifest/safe-relative-path? "foo/../bar.svg")))
    ;; but this resolves to ../secret
    (is (false? (manifest/safe-relative-path? "foo/../../secret")))))

;;; ------------------------------------------------ Asset Paths ------------------------------------------------

(deftest asset-paths-test
  (testing "returns the icon when it's a safe image"
    (is (= ["icon.svg"] (manifest/asset-paths {:icon "icon.svg"})))
    (is (= ["icon.png"] (manifest/asset-paths {:icon "icon.png"}))))
  (testing "returns nil when there is no icon"
    (is (nil? (manifest/asset-paths {})))
    (is (nil? (manifest/asset-paths {:icon nil}))))
  (testing "rejects a non-image icon"
    (is (nil? (manifest/asset-paths {:icon "icon.js"}))))
  (testing "rejects an icon with path traversal"
    (is (nil? (manifest/asset-paths {:icon "../secret.svg"})))
    (is (nil? (manifest/asset-paths {:icon "/etc/passwd.svg"}))))
  (testing "ignores a stray assets array — only the icon is ever served"
    (is (= ["icon.svg"]
           (manifest/asset-paths {:icon   "icon.svg"
                                  :assets ["thumbs-up.png" "thumbs-down.png" "en.json"]})))
    (is (nil? (manifest/asset-paths {:assets ["thumbs-up.png"]})))))

;;; ------------------------------------------------ Content Type ------------------------------------------------

(deftest asset-content-type-test
  (testing "recognizes image types"
    (is (= "image/svg+xml" (manifest/asset-content-type "icon.svg")))
    (is (= "image/png" (manifest/asset-content-type "thumb.png")))
    (is (= "image/jpeg" (manifest/asset-content-type "photo.jpg"))))
  (testing "returns nil for non-image types — assets (incl. JSON) are no longer served"
    (is (nil? (manifest/asset-content-type "en.json")))
    (is (nil? (manifest/asset-content-type "script.js")))
    (is (nil? (manifest/asset-content-type "style.css")))
    (is (nil? (manifest/asset-content-type "data.csv")))
    ;; .html has MIME text/html — should be rejected
    (is (nil? (manifest/asset-content-type "page.html")))))
