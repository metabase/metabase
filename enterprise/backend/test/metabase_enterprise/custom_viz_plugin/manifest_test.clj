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
      (is (true? (manifest/compatible? {:metabase_version ">=59"})))))
  (testing "returns false for a range the current version does not satisfy"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.58.0"}]
      (is (false? (manifest/compatible? {:metabase_version ">=59"})))))
  (testing "SNAPSHOT pre-release versions satisfy ranges (pre-release is stripped)"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.61.1-SNAPSHOT"}]
      (is (true? (manifest/compatible? {:metabase_version ">=59"}))))
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.58.0-SNAPSHOT"}]
      (is (false? (manifest/compatible? {:metabase_version ">=59"})))))
  (testing "build metadata is stripped for version comparison"
    (with-redefs [config/is-dev? false
                  config/mb-version-info {:tag "v1.60.0+build123"}]
      (is (true? (manifest/compatible? {:metabase_version ">=59"})))))
  (testing "returns true in dev mode regardless of version"
    (with-redefs [config/is-dev? true]
      (is (true? (manifest/compatible? {:metabase_version ">=99.0.0"})))))
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
  (testing "filters to allowed extensions"
    (is (= ["icon.svg" "thumb.png"]
           (manifest/asset-paths {:assets ["icon.svg" "thumb.png" "malware.exe"]}))))
  (testing "includes icon from manifest"
    (is (some #{"icon.svg"} (manifest/asset-paths {:icon "icon.svg"}))))
  (testing "allows JSON assets (for locale translations)"
    (is (some #{"en.json"} (manifest/asset-paths {:assets ["en.json"]}))))
  (testing "rejects non-image non-JSON assets"
    (is (not (some #{"script.js"} (manifest/asset-paths {:assets ["script.js"]}))))
    (is (not (some #{"data.csv"} (manifest/asset-paths {:assets ["data.csv"]})))))
  (testing "rejects assets with path traversal"
    (is (empty? (manifest/asset-paths {:assets ["../../../etc/passwd"]}))))
  (testing "rejects absolute asset paths"
    (is (empty? (manifest/asset-paths {:assets ["/etc/passwd"]}))))
  (testing "rejects icon with traversal"
    (is (not (some #{"../secret.svg"} (manifest/asset-paths {:icon "../secret.svg"})))))
  (testing "deduplicates"
    (is (= ["icon.svg"]
           (manifest/asset-paths {:icon "icon.svg" :assets ["icon.svg"]}))))
  (testing "icon is auto-included without being listed in assets"
    (is (= #{"icon.svg" "thumbs-up.png" "thumbs-down.png"}
           (set (manifest/asset-paths {:icon   "icon.svg"
                                       :assets ["thumbs-up.png" "thumbs-down.png"]}))))))

;;; ------------------------------------------------ Content Type ------------------------------------------------

(deftest asset-content-type-test
  (testing "recognizes image types"
    (is (= "image/svg+xml" (manifest/asset-content-type "icon.svg")))
    (is (= "image/png" (manifest/asset-content-type "thumb.png")))
    (is (= "image/jpeg" (manifest/asset-content-type "photo.jpg"))))
  (testing "recognizes JSON"
    (is (= "application/json" (manifest/asset-content-type "en.json"))))
  (testing "returns nil for disallowed types"
    (is (nil? (manifest/asset-content-type "script.js")))
    (is (nil? (manifest/asset-content-type "style.css")))
    (is (nil? (manifest/asset-content-type "data.csv"))))
  (testing "returns nil for non-image MIME types"
    ;; .html has MIME text/html — should be rejected
    (is (nil? (manifest/asset-content-type "page.html")))))
