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
  (is (= {:slug "sales" :display_name "Sales dashboard" :path "dist/index.js" :allowed_hosts []}
         (parse "name: Sales dashboard
path: ./dist/index.js"))))

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
    (is (= {:slug "sales" :display_name "X" :path "dist/index.js" :allowed_hosts []}
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
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reserved slug"
                          (parse "name: X\npath: dist/index.js" "data_apps/repo-status")))))

(deftest parse-errors-carry-400-test
  (try
    (parse "name: X")
    (is false "should have thrown")
    (catch clojure.lang.ExceptionInfo e
      (is (= 400 (:status-code (ex-data e)))))))
