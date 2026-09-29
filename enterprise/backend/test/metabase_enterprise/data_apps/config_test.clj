(ns metabase-enterprise.data-apps.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-app.config]))

(set! *warn-on-reflection* true)

(defn- ->bytes ^bytes [^String s]
  (.getBytes s "UTF-8"))

(defn- parse
  "Parse a `data_app.yaml` as if it sat in `dir` (default `data_apps/sales`, so the
   parsed slug is `sales` — the slug is the directory's name, never a config key)."
  ([s] (parse s "data_apps/sales"))
  ([s dir] (data-app.config/parse-app-config (->bytes s) dir)))

(deftest parse-valid-config-test
  (is (= {:slug "sales" :display_name "Sales dashboard" :description nil :version 1
          :path "dist/index.js" :allowed_hosts []}
         (parse "name: Sales dashboard
path: ./dist/index.js"))))

(deftest parse-version-test
  (testing "absent means 1: every app predates the field"
    (is (= 1 (:version (parse "name: X\npath: dist/index.js")))))
  (testing "a whole number is carried through"
    (is (= 3 (:version (parse "name: X\nversion: 3\npath: dist/index.js")))))
  (testing "anything but a positive whole number is rejected, not coerced or compared as-is"
    (doseq [bad ["0" "-1" "1.5" "'1'" "one" "[1]" "1.0.0"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"version.*positive whole number"
                            (parse (str "name: X\nversion: " bad "\npath: dist/index.js")))
          (str "should reject: " (pr-str bad))))))

(deftest template-manifest-declares-the-supported-version-test
  (testing "the scaffolding template stamps the version this Metabase serves, so a new app is never born outdated"
    (is (= data-app.config/supported-app-version
           (:version (parse (slurp "skills/metabase-data-app-setup/template/data_app.yaml")))))))

(deftest outdated-test
  (testing "an app below the supported version is outdated; one at it is not"
    (with-redefs [data-app.config/supported-app-version 2]
      (is (data-app.config/outdated? {:version 1}))
      (is (not (data-app.config/outdated? {:version 2}))))))

(deftest parse-description-test
  (testing "an optional one-liner is trimmed and carried through"
    (is (= "Pipeline health by region"
           (:description (parse "name: X\ndescription: '  Pipeline health by region  '\npath: dist/index.js")))))
  (testing "absent → nil (the field is optional)"
    (is (nil? (:description (parse "name: X\npath: dist/index.js")))))
  (testing "blank → nil, so an unfilled placeholder doesn't become an empty description"
    (doseq [blank ["" "'   '"]]
      (is (nil? (:description (parse (str "name: X\ndescription: " blank "\npath: dist/index.js"))))
          (str "should be nil for: " (pr-str blank)))))
  (testing "a YAML block scalar spanning several lines is folded onto one"
    (is (= "First line second line"
           (:description (parse "name: X\ndescription: |\n  First line\n  second line\npath: dist/index.js")))))
  (testing "a description at the length cap is accepted"
    (is (= 255
           (count (:description (parse (str "name: X\ndescription: " (apply str (repeat 255 "x"))
                                            "\npath: dist/index.js")))))))
  (testing "one over the cap is rejected — a paragraph here would be stored in full and returned on every list request"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"description.*255 characters or fewer"
                          (parse (str "name: X\ndescription: " (apply str (repeat 256 "x"))
                                      "\npath: dist/index.js")))))
  (testing "the cap applies to the folded value, not the raw YAML"
    (is (= 255
           (count (:description (parse (str "name: X\ndescription: >\n  " (apply str (repeat 255 "x"))
                                            "\npath: dist/index.js")))))))
  (testing "a non-string description (a YAML list or mapping) is rejected, not str-ified into the row"
    (doseq [bad ["description: [foo, bar]"
                 "description:\n  key: value"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"description.*must be a one-line string"
                            (parse (str "name: X\n" bad "\npath: dist/index.js")))
          (str "should reject: " (pr-str bad))))))

(deftest slug-comes-from-the-directory-test
  (testing "the app's slug is the name of the directory it lives in"
    (is (= "inventory" (:slug (parse "name: X\npath: dist/index.js" "data_apps/inventory")))))
  (testing "a directory name that isn't a usable slug is rejected — the app would have no URL to be served at"
    (doseq [bad ["Sales" "my_app" "sales app" "-sales" "sales-"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"lowercase letters, numbers, and dashes"
                            (parse "name: X\npath: dist/index.js" (str "data_apps/" bad)))
          (str "should reject the directory: " bad)))))

(deftest parse-allowed-hosts-test
  (testing "valid entries are lowercased, trailing-slash-stripped, and de-duplicated"
    (is (= ["https://api.example.com" "https://*.internal.acme.com"]
           (:allowed_hosts
            (parse "name: X\npath: dist/index.js\nallowed_hosts:\n  - https://API.example.com/\n  - https://*.internal.acme.com\n  - https://api.example.com")))))
  (testing "absent → empty vector"
    (is (= [] (:allowed_hosts (parse "name: X\npath: dist/index.js")))))
  (testing "a non-list value is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"allowed_hosts.*must be a list"
                          (parse "name: X\npath: dist/index.js\nallowed_hosts: https://api.example.com"))))
  (testing "invalid entries (bare *, path, non-http scheme, no scheme) are rejected"
    (doseq [bad ["*" "https://example.com/path" "ftp://example.com" "example.com"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not a valid allowed_hosts entry"
                            (parse (str "name: X\npath: dist/index.js\nallowed_hosts:\n  - \"" bad "\"")))
          (str "should reject: " bad)))))

(deftest parse-strips-leading-dot-slash-test
  (is (= "dist/app.js"
         (:path (parse "name: X\npath: ./dist/app.js")))))

(deftest unknown-fields-are-ignored-test
  (testing "unknown keys don't fail the parse — including a stray `slug`, which the directory name overrides"
    (is (= {:slug "sales" :display_name "X" :description nil :version 1 :path "dist/index.js" :allowed_hosts []}
           (parse "name: X\nslug: elsewhere\nfuture_option: 1\npath: dist/index.js")))))

(deftest parse-errors-test
  (testing "missing name"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"name"
                          (parse "path: dist/index.js"))))
  (testing "missing path"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"path"
                          (parse "name: X"))))
  (testing "malformed yaml"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Could not parse"
                          (parse "name: [unterminated"))))
  (testing "path traversal is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not contain"
                          (parse "name: X\npath: ../other/dist/index.js")))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not contain"
                          (parse "name: X\npath: dist/../../escape.js"))))
  (testing "a directory whose name collides with an API sub-route is rejected"
    (doseq [slug ["repo-status" "sandbox-host"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reserved slug"
                            (parse "name: X\npath: dist/index.js" (str "data_apps/" slug)))))))

(deftest parse-errors-carry-400-test
  (try
    (parse "name: X")
    (is false "should have thrown")
    (catch clojure.lang.ExceptionInfo e
      (is (= 400 (:status-code (ex-data e)))))))
