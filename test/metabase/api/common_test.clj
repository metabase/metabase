(ns metabase.api.common-test
  (:require
   [clojure.test :refer :all]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [metabase.api.common :as api]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.middleware.security :as mw.security]
   [methodical.core :as methodical]))

;;; TESTS FOR CHECK (ETC)

(def ^:private four-oh-four
  "The expected format of a 404 response."
  {:status  404
   :body    "Not found."
   :headers {"Cache-Control"                     "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             "Content-Security-Policy"           (str (-> (@#'mw.security/content-security-policy-header nil) vals first)
                                                      " frame-ancestors 'none';")
             "Content-Type"                      "text/plain"
             "Expires"                           "Tue, 03 Jul 2001 06:00:00 GMT"
             "Last-Modified"                     true ; this will be current date, so do update-in ... string?
             "Strict-Transport-Security"         "max-age=31536000"
             "X-Content-Type-Options"            "nosniff"
             "X-Frame-Options"                   "DENY"
             "X-Permitted-Cross-Domain-Policies" "none"
             "X-XSS-Protection"                  "1; mode=block"}})

(defn- mock-api-fn [response-fn]
  ((-> (fn [request respond _]
         (respond (response-fn request)))
       mw.exceptions/catch-uncaught-exceptions
       mw.exceptions/catch-api-exceptions
       mw.misc/add-content-type)
   {:uri "/api/my_fake_api_call"}
   identity
   (fn [e] (throw e))))

(defn my-mock-api-fn []
  (mock-api-fn
   (fn [_]
     (api/check-404 @api/*current-user*)
     {:status 200
      :body   @api/*current-user*})))

(deftest ^:parallel check-404-test
  (testing "check that `check-404` doesn't throw an exception if `test` is true"
    (is (= {:status  200
            :body    "Cam Saul"
            :headers {"Content-Type" "text/plain"}}
           (binding [api/*current-user* (atom "Cam Saul")]
             (my-mock-api-fn)))))

  (testing "check that 404 is returned otherwise"
    (is (= four-oh-four
           (-> (my-mock-api-fn)
               (update-in [:headers "Last-Modified"] string?)))))

  (testing "let-404 should return nil if test fails"
    (is (= four-oh-four
           (-> (mock-api-fn
                (fn [_]
                  (api/let-404 [user nil]
                    {:user user})))
               (update-in [:headers "Last-Modified"] string?)))))

  (testing "otherwise let-404 should bind as expected"
    (is (= {:user {:name "Cam"}}
           ((mw.exceptions/catch-api-exceptions
             (fn [_ respond _]
               (respond
                (api/let-404 [user {:name "Cam"}]
                  {:user user}))))
            nil
            identity
            (fn [e] (throw e)))))))

(methodical/defmethod hawk.approx/=?-diff [java.util.regex.Pattern clojure.lang.Symbol]
  [expected-re sym]
  (hawk.approx/=?-diff expected-re (name sym)))

(deftest parse-multi-values-param-test
  (testing "single value returns a vector with 1 elem"
    (is (= [1] (api/parse-multi-values-param "1" parse-long))))

  (testing "multi values a vector as well"
    (is (= [1 2 3] (api/parse-multi-values-param ["1" "2" "3"] parse-long)))))
