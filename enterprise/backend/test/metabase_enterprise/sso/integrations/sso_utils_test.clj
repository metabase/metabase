(ns metabase-enterprise.sso.integrations.sso-utils-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.sso.core :as sso]
   [metabase.sso.oidc.state :as oidc.state]
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

(deftest check-sso-redirect-returns-clean-400-test
  (mt/with-temporary-setting-values [site-url "http://localhost:3000"]
    (testing "a rejected redirect produces a 400 whose body is just the message"
      (let [supplied "http://example.com/somewhere"
            response (try
                       (sso-utils/check-sso-redirect supplied)
                       (is false "expected check-sso-redirect to throw")
                       (catch clojure.lang.ExceptionInfo e
                         (mw.exceptions/api-exception-response e {})))
            body     (:body response)]
        (is (= 400 (:status response)))
        (testing "the body is the plain message, not a serialized exception"
          (is (string? body))
          (is (not (str/includes? body ":trace")))
          (is (not (str/includes? body ":via"))))
        (testing "the body does not contain the supplied value"
          (is (not (str/includes? body supplied))))))))

(defn- verdict
  "Run `validate!` on `url` and report whether it accepted or rejected the value."
  [validate! url]
  (try
    (validate! url)
    ::accepted
    (catch clojure.lang.ExceptionInfo _
      ::rejected)))

(deftest oidc-redirect-validation-is-consistent-test
  (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
    (testing "the OIDC initiate path validates with the same origin comparison used to build the state cookie"
      ;; `sso-initiate` and `create-oidc-state` both validate the redirect with this one predicate, so a value is
      ;; classified the same way at both points.
      (are [url expected] (= expected (verdict sso/validate-redirect-url! url))
        ;; scheme differs from the site-url's -- the origin comparison covers scheme, host and port
        "http://metabase.example.com/somewhere"  ::rejected
        "https://metabase.example.com/somewhere" ::accepted
        "https://other.example/somewhere"        ::rejected
        "/foo/bar"                               ::accepted))
    (testing "a value the OIDC path accepts is still acceptable when the state cookie is built"
      (is (= "/foo/bar"
             (:redirect (oidc.state/create-oidc-state {:state    "s"
                                                       :nonce    "n"
                                                       :redirect "/foo/bar"
                                                       :provider :oidc-test})))))))

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
