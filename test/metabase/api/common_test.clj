(ns metabase.api.common-test
  (:require [clojure.test :refer :all]
            [metabase.api.common :as api :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.server.middleware.exceptions :as mw.exceptions]
            [metabase.server.middleware.misc :as mw.misc]
            [metabase.server.middleware.security :as mw.security]
            [metabase.test.data :refer :all]
            [metabase.util.schema :as su]))

;;; TESTS FOR CHECK (ETC)

(def ^:private four-oh-four
  "The expected format of a 404 response."
  {:status  404
   :body    "Not found."
   :headers {"Cache-Control"                     "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             "Content-Security-Policy"           (str (-> (@#'mw.security/content-security-policy-header) vals first)
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

(defn- my-mock-api-fn []
  (mock-api-fn
   (fn [_]
     (check-404 @*current-user*)
     {:status 200
      :body   @*current-user*})))

(deftest check-404-test
  (testing "check that `check-404` doesn't throw an exception if `test` is true"
    (is (= {:status  200
            :body    "Cam Saul"
            :headers {"Content-Type" "text/plain"}}
           (binding [*current-user* (atom "Cam Saul")]
             (my-mock-api-fn)))))

  (testing "check that 404 is returned otherwise"
    (is (= four-oh-four
           (-> (my-mock-api-fn)
               (update-in [:headers "Last-Modified"] string?)))))

  (testing "let-404 should return nil if test fails"
    (is (= four-oh-four
           (-> (mock-api-fn
                (fn [_]
                  (let-404 [user nil]
                    {:user user})))
               (update-in [:headers "Last-Modified"] string?)))))

  (testing "otherwise let-404 should bind as expected"
    (is (= {:user {:name "Cam"}}
           ((mw.exceptions/catch-api-exceptions
             (fn [_ respond _]
               (respond
                (let-404 [user {:name "Cam"}]
                  {:user user}))))
            nil
            identity
            (fn [e] (throw e)))))))

(deftest defendpoint-test
  ;; replace regex `#"[0-9]+"` with str `"#[0-9]+" so expectations doesn't barf
  (binding [*auto-parse-types* (update-in *auto-parse-types* [:int :route-param-regex] (partial str "#"))]
    (is (= '(def GET_:id
              (compojure.core/GET ["/:id" :id "#[0-9]+"] [id]
                                  (metabase.api.common.internal/auto-parse [id]
                                    (metabase.api.common.internal/validate-param 'id id metabase.util.schema/IntGreaterThanZero)
                                    (metabase.api.common.internal/wrap-response-if-needed (do (select-one Card :id id))))))
           (macroexpand `(defendpoint GET "/:id" [~'id]
                           {~'id su/IntGreaterThanZero}
                           (~'select-one ~'Card :id ~'id)))))))
