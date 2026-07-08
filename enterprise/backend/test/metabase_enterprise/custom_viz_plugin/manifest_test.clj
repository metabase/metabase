(ns metabase-enterprise.custom-viz-plugin.manifest-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.custom-viz-plugin.manifest :as manifest]
   [metabase.config.core :as config]))

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
