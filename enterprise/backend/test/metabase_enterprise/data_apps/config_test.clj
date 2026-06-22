(ns metabase-enterprise.data-apps.config-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.config :as data-app.config]))

(set! *warn-on-reflection* true)

(defn- ->bytes ^bytes [^String s]
  (.getBytes s "UTF-8"))

(defn- parse [s]
  (data-app.config/parse-app-config (->bytes s) "data_apps/sales"))

(deftest parse-valid-config-test
  (is (= {:slug "sales" :display_name "Sales dashboard" :path "dist/index.js" :allowed_hosts []}
         (parse "name: Sales dashboard
slug: sales
path: ./dist/index.js"))))

(deftest parse-allowed-hosts-test
  (testing "valid entries are lowercased, trailing-slash-stripped, and de-duplicated"
    (is (= ["https://api.example.com" "https://*.internal.acme.com"]
           (:allowed_hosts
            (parse "name: X\nslug: x\npath: dist/index.js\nallowed_hosts:\n  - https://API.example.com/\n  - https://*.internal.acme.com\n  - https://api.example.com")))))
  (testing "absent → empty vector"
    (is (= [] (:allowed_hosts (parse "name: X\nslug: x\npath: dist/index.js")))))
  (testing "a non-list value is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"allowed_hosts.*must be a list"
                          (parse "name: X\nslug: x\npath: dist/index.js\nallowed_hosts: https://api.example.com"))))
  (testing "invalid entries (bare *, path, non-http scheme, no scheme) are rejected"
    (doseq [bad ["*" "https://example.com/path" "ftp://example.com" "example.com"]]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not a valid allowed_hosts entry"
                            (parse (str "name: X\nslug: x\npath: dist/index.js\nallowed_hosts:\n  - \"" bad "\"")))
          (str "should reject: " bad)))))

(deftest parse-strips-leading-dot-slash-test
  (is (= "dist/app.js"
         (:path (parse "name: X\nslug: x\npath: ./dist/app.js")))))

(deftest parse-errors-test
  (testing "invalid slug"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"slug"
                          (parse "name: X\nslug: Not A Slug\npath: dist/index.js"))))
  (testing "missing name"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"name"
                          (parse "slug: x\npath: dist/index.js"))))
  (testing "missing path"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"path"
                          (parse "name: X\nslug: x"))))
  (testing "malformed yaml"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Could not parse"
                          (parse "name: [unterminated"))))
  (testing "path traversal is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not contain"
                          (parse "name: X\nslug: x\npath: ../other/dist/index.js")))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must not contain"
                          (parse "name: X\nslug: x\npath: dist/../../escape.js"))))
  (testing "a reserved slug that collides with an API sub-route is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"reserved slug"
                          (parse "name: X\nslug: repo-status\npath: dist/index.js")))))

(deftest parse-errors-carry-400-test
  (try
    (parse "name: X\nslug: x")
    (is false "should have thrown")
    (catch clojure.lang.ExceptionInfo e
      (is (= 400 (:status-code (ex-data e)))))))
