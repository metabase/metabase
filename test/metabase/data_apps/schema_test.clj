(ns metabase.data-apps.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- valid? [schema x]
  (mr/validate schema x))

(deftest data-app-create-requires-manifest-columns-test
  (is (valid? ::data-apps.schema/data-app.create {:slug "a" :name "A" :bundle_path "i.js"}))
  (doseq [k [:slug :name :bundle_path]]
    (is (not (valid? ::data-apps.schema/data-app.create
                     (dissoc {:slug "a" :name "A" :bundle_path "i.js"} k)))
        (str "should require " k))))

(deftest version-test
  (testing "a positive whole number is accepted"
    (is (valid? ::data-apps.schema/version 1)))
  (testing "anything else is rejected, not coerced"
    (doseq [bad [nil 0 -1 1.5 "1" "one" [1]]]
      (is (not (valid? ::data-apps.schema/version bad)) (str "should reject: " (pr-str bad))))))

(deftest description-test
  (testing "nil, an empty string and any text up to the length cap are accepted as they are"
    (doseq [ok [nil "" "   " "Pipeline health by region" "First line\n  second line\n" (apply str (repeat 255 "x"))]]
      (is (valid? ::data-apps.schema/description ok) (str "should accept: " (pr-str ok)))))
  (testing "a paragraph over the length cap is rejected, as it would be returned on every list request"
    (is (not (valid? ::data-apps.schema/description (apply str (repeat 256 "x"))))))
  (testing "a non-string description (a YAML list or mapping) is rejected"
    (doseq [bad [["foo" "bar"] {:key "value"}]]
      (is (not (valid? ::data-apps.schema/description bad)) (str "should reject: " (pr-str bad))))))

(deftest slug-test
  (testing "a slug is accepted as it is"
    (is (valid? ::data-apps.schema/slug "inventory-2")))
  (testing "a slug that can't appear in a URL as-is, or collides with an API sub-route, is rejected"
    (doseq [bad [nil "" "Sales" "my_app" "sales app" "-sales" "sales-" "sales\n" "repo-status"
                 (apply str (repeat 101 "a"))]]
      (is (not (valid? ::data-apps.schema/slug bad)) (str "should reject: " (pr-str bad))))))

(deftest name-test
  (is (valid? ::data-apps.schema/name "X"))
  (doseq [bad [nil "" "   "]]
    (is (not (valid? ::data-apps.schema/name bad)) (str "should reject: " (pr-str bad)))))

(deftest allowed-hosts-test
  (testing "lowercase origins, with an optional subdomain wildcard and port, are accepted"
    (is (valid? ::data-apps.schema/allowed-hosts ["https://api.example.com" "https://*.internal.acme.com" "http://localhost:3000"])))
  (testing "an empty list is accepted, nil and a non-list value are rejected"
    (is (valid? ::data-apps.schema/allowed-hosts []))
    (is (not (valid? ::data-apps.schema/allowed-hosts nil)))
    (is (not (valid? ::data-apps.schema/allowed-hosts "https://api.example.com"))))
  (testing "invalid entries (uppercase, trailing slash, bare *, path, non-http scheme, no scheme) are rejected"
    (doseq [bad ["https://API.example.com" "https://api.example.com/" "*" "https://example.com/path" "ftp://example.com" "example.com" "https://a.com\nx"]]
      (is (not (valid? ::data-apps.schema/allowed-hosts [bad])) (str "should reject: " bad)))))

(deftest bundle-path-test
  (testing "a relative path inside the app's directory is accepted"
    (is (valid? ::data-apps.schema/bundle-path "dist/app.js")))
  (testing "a missing path, one leaving the app's directory, or one with a `.` segment is rejected"
    (doseq [bad [nil "" "  " "./dist/app.js" "../other/dist/index.js" "dist/../../escape.js" "/etc/passwd" "dist//index.js"
                 "..\\..\\escape.js" "data_app.yaml"]]
      (is (not (valid? ::data-apps.schema/bundle-path bad)) (str "should reject: " (pr-str bad))))))

(deftest bundle-test
  (is (valid? ::data-apps.schema/bundle (byte-array 3)))
  (is (not (valid? ::data-apps.schema/bundle (byte-array (inc data-apps.schema/max-bundle-bytes))))))

(deftest query-spec-test
  (let [stage {:source {:type :table :id 1}}]
    (testing "a query spec has one stage on a table"
      (is (valid? ::data-apps.schema/query-spec {:stages [stage]})))
    (testing "a query spec of several stages, or none, is rejected"
      (doseq [stages [[] [stage stage]]]
        (is (not (valid? ::data-apps.schema/query-spec {:stages stages})) (str "should reject: " (pr-str stages)))))
    (testing "a stage on a card is rejected"
      (is (not (valid? ::data-apps.schema/query-spec {:stages [{:source {:type :card :id 1}}]}))))
    (testing "a stage holds no joins or custom expressions"
      (doseq [k [:joins :expressions]]
        (is (not (valid? ::data-apps.schema/query-spec {:stages [(assoc stage k [])]})) (str "should reject: " k))))))

(deftest action-spec-test
  (testing "an action spec is an implicit action of a known kind on a table"
    (is (valid? ::data-apps.schema/action-spec {:kind "row/update" :table {:id 1}})))
  (testing "an unknown kind, or a table without an ID, is rejected"
    (doseq [bad [{:kind "row/upsert" :table {:id 1}} {:kind "row/update" :table {}}]]
      (is (not (valid? ::data-apps.schema/action-spec bad)) (str "should reject: " (pr-str bad))))))
