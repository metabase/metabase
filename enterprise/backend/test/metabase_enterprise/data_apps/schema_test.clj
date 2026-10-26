(ns metabase-enterprise.data-apps.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-app.config]
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.lib.core :as lib]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- normalize [schema x]
  (lib/normalize schema x))

(defn- valid? [schema x]
  (mr/validate schema (normalize schema x)))

(deftest data-app-update-normalizes-each-column-it-is-given-test
  (is (= {:name "sales" :display_name "Sales dashboard" :description nil :version 1
          :bundle_path "dist/index.js" :allowed_hosts []}
         (normalize ::data-apps.schema/data-app.update
                    {:name "sales" :display_name " Sales dashboard " :description "  " :version nil
                     :bundle_path "./dist/index.js" :allowed_hosts nil})))
  (is (= {:enabled false} (normalize ::data-apps.schema/data-app.update {:enabled false}))))

(deftest data-app-insert-requires-the-manifest-columns-test
  (is (valid? ::data-apps.schema/data-app.insert {:name "a" :display_name "A" :bundle_path "i.js"}))
  (doseq [k [:name :display_name :bundle_path]]
    (is (not (valid? ::data-apps.schema/data-app.insert
                     (dissoc {:name "a" :display_name "A" :bundle_path "i.js"} k)))
        (str "should require " k))))

(deftest version-test
  (testing "nil means 1: every app predates the field"
    (is (= 1 (normalize ::data-apps.schema/version nil))))
  (testing "anything but a positive whole number is rejected, not coerced"
    (doseq [bad [0 -1 1.5 "1" "one" [1]]]
      (is (not (valid? ::data-apps.schema/version bad)) (str "should reject: " (pr-str bad))))))

(deftest outdated-test
  (testing "an app below the supported version is outdated; one at it is not"
    (with-redefs [data-app.config/supported-app-version 2]
      (is (data-app.config/outdated? {:version 1}))
      (is (not (data-app.config/outdated? {:version 2}))))))

(deftest description-test
  (testing "an optional one-liner is trimmed, and a multi-line value folded onto one line"
    (is (= "Pipeline health by region" (normalize ::data-apps.schema/description "  Pipeline health by region  ")))
    (is (= "First line second line" (normalize ::data-apps.schema/description "First line\n  second line\n"))))
  (testing "blank → nil, so an unfilled placeholder doesn't become an empty description"
    (doseq [blank [nil "" "   "]]
      (is (nil? (normalize ::data-apps.schema/description blank)) (str "should be nil for: " (pr-str blank)))))
  (testing "the length cap applies to the folded value — a paragraph here would be returned on every list request"
    (is (valid? ::data-apps.schema/description (apply str (repeat 255 "x"))))
    (is (not (valid? ::data-apps.schema/description (apply str (repeat 256 "x"))))))
  (testing "a non-string description (a YAML list or mapping) is rejected, not str-ified into the row"
    (doseq [bad [["foo" "bar"] {:key "value"}]]
      (is (not (valid? ::data-apps.schema/description bad)) (str "should reject: " (pr-str bad))))))

(deftest slug-test
  (testing "a slug is used verbatim"
    (is (= "inventory-2" (normalize ::data-apps.schema/slug "inventory-2"))))
  (testing "a slug that can't appear in a URL as-is, or collides with an API sub-route, is rejected"
    (doseq [bad [nil "" "Sales" "my_app" "sales app" "-sales" "sales-" "sales\n" "repo-status" "sandbox-host" "generate"
                 (apply str (repeat 101 "a"))]]
      (is (not (valid? ::data-apps.schema/slug bad)) (str "should reject: " (pr-str bad))))))

(deftest display-name-test
  (is (= "X" (normalize ::data-apps.schema/display-name "  X ")))
  (doseq [bad [nil "" "   "]]
    (is (not (valid? ::data-apps.schema/display-name bad)) (str "should reject: " (pr-str bad)))))

(deftest allowed-hosts-test
  (testing "valid entries are lowercased, trailing-slash-stripped, and de-duplicated"
    (is (= ["https://api.example.com" "https://*.internal.acme.com"]
           (normalize ::data-apps.schema/allowed-hosts
                      ["https://API.example.com/" "https://*.internal.acme.com" "https://api.example.com"]))))
  (testing "nil → empty vector"
    (is (= [] (normalize ::data-apps.schema/allowed-hosts nil))))
  (testing "a non-list value is rejected"
    (is (not (valid? ::data-apps.schema/allowed-hosts "https://api.example.com"))))
  (testing "invalid entries (bare *, path, non-http scheme, no scheme) are rejected"
    (doseq [bad ["*" "https://example.com/path" "ftp://example.com" "example.com" "https://a.com\nx"]]
      (is (not (valid? ::data-apps.schema/allowed-hosts [bad])) (str "should reject: " bad)))))

(deftest bundle-path-test
  (testing "a leading ./ is dropped"
    (is (= "dist/app.js" (normalize ::data-apps.schema/bundle-path "./dist/app.js"))))
  (testing "a missing path, or one leaving the app's directory, is rejected"
    (doseq [bad [nil "" "  " "../other/dist/index.js" "dist/../../escape.js" "/etc/passwd" "dist//index.js"
                 "..\\..\\escape.js" "data_app.yaml"]]
      (is (not (valid? ::data-apps.schema/bundle-path bad)) (str "should reject: " (pr-str bad))))))

(deftest bundle-test
  (is (valid? ::data-apps.schema/bundle (byte-array 3)))
  (is (not (valid? ::data-apps.schema/bundle (byte-array (inc data-apps.schema/max-bundle-bytes))))))
