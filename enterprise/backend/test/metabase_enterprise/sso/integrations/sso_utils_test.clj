(ns metabase-enterprise.sso.integrations.sso-utils-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.test :as mt]))

(deftest check-sso-redirect-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "check-sso-redirect properly validates redirect URIs"
      (are [uri] (sso-utils/check-sso-redirect uri)
        "/"
        "/test"
        "localhost"
        "http://localhost:3000"
        "http://localhost:3000/dashboard/1-test-dashboard?currency=British%20Pound"))

    (testing "check-sso-redirect- throws an error for invalid redirect URIs"
      (are [uri] (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid redirect URL" (sso-utils/check-sso-redirect uri))
        "http://example.com"
        "//example.com"
        "not a url"
        "localhost:3000" ; URI thinks `localhost` here is scheme
        "http://localhost:3000?a=not a param"))))

(deftest ^:parallel stringify-valid-attributes-test
  (testing "string and number values are stringified"
    (is (= {"name" "alice" "age" "42"}
           (sso-utils/stringify-valid-attributes {:name "alice" :age 42}))))
  (testing "nil values are dropped"
    (is (= {"name" "alice"}
           (sso-utils/stringify-valid-attributes {:name "alice" :missing nil}))))
  (testing "map values are dropped"
    (is (= {"name" "alice"}
           (sso-utils/stringify-valid-attributes {:name "alice" :nested {:k "v"}}))))
  (testing "keys starting with @ are dropped"
    (is (= {"name" "alice"}
           (sso-utils/stringify-valid-attributes {:name "alice" (keyword "@reserved") "v"}))))
  (testing "multi-value sequential attributes are joined with commas (UXW-3921)"
    (testing "vectors (e.g. JWT JSON arrays)"
      (is (= {"roles" "admin,user"}
             (sso-utils/stringify-valid-attributes {:roles ["admin" "user"]}))))
    (testing "lazy seqs (e.g. SAML multi-value attributes)"
      (is (= {"dept" "a,b,c"}
             (sso-utils/stringify-valid-attributes {:dept (map identity ["a" "b" "c"])}))))
    (testing "lists"
      (is (= {"groups" "g1,g2"}
             (sso-utils/stringify-valid-attributes {:groups '("g1" "g2")}))))
    (testing "single-element collections still join cleanly"
      (is (= {"tag" "only"}
             (sso-utils/stringify-valid-attributes {:tag ["only"]}))))
    (testing "non-string sequential elements are stringified"
      (is (= {"ids" "1,2,3"}
             (sso-utils/stringify-valid-attributes {:ids [1 2 3]}))))))
