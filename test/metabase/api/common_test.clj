(ns metabase.api.common-test
  (:require
   [clojure.test :refer :all]
   [hawk.assert-exprs.approximately-equal :as hawk.approx]
   [metabase.api.common :as api]
   [metabase.api.common.internal :as api.internal]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.middleware.security :as mw.security]
   [methodical.core :as methodical]
   [ring.middleware.multipart-params :as mp]))

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

(deftest ^:parallel parse-defendpoint-args-test
  (is (= {:method      'POST
          :route       ["/:id/dimension" :id "[0-9]+"]
          :docstr      String
          :args        '[id :as {{dimension-type :type, dimension-name :name} :body}]
          :arg->schema '{dimension-type schema.core/Int, dimension-name schema.core/Str}
          :fn-name     'POST_:id_dimension}
         (-> (#'api/parse-defendpoint-args
              '[POST "/:id/dimension"
                "Sets the dimension for the given object with ID."
                [id :as {{dimension-type :type, dimension-name :name} :body}]
                {dimension-type schema.core/Int
                 dimension-name schema.core/Str}])
             (update :docstr class)
             ;; two regex patterns are not equal even if they're the exact same pattern so convert to string so we can
             ;; compare easily.
             (update-in [:route 2] str)))))

(methodical/defmethod hawk.approx/=?-diff [java.util.regex.Pattern clojure.lang.Symbol]
  [expected-re sym]
  (hawk.approx/=?-diff expected-re (name sym)))

(deftest ^:parallel defendpoint-test
  ;; replace regex `#"[0-9]+"` with str `"#[0-9]+" so expectations doesn't barf
  (binding [api.internal/*auto-parse-types* (update-in api.internal/*auto-parse-types* [:int :route-param-regex] (partial str "#"))]
    (testing "Standard defendpoint"
      ;; Can't quasi-quote here since that would fully qualify symbols like GET_:id
      (is (=? (list
               'def
               'GET_:id
               (list 'compojure.core/make-route
                     :get
                     {:source "/:id", :re #"/(#[0-9]+)", :keys [:id], :absolute? false}
                     (list identity
                           '(clojure.core/fn
                              [#"request__\d+__auto__"]
                              (metabase.api.common/validate-param-values #"request__\d+__auto__" '(id))
                              (compojure.core/let-request
                               [[id] #"request__\d+__auto__"]
                               (metabase.api.common.internal/auto-parse
                                   [id]
                                 (metabase.api.common.internal/validate-param 'id id metabase.util.schema/IntGreaterThanZero)
                                 (metabase.api.common.internal/wrap-response-if-needed (do (select-one Card :id id)))))))))
              (macroexpand '(metabase.api.common/defendpoint-schema compojure.core/GET "/:id" [id]
                              {id metabase.util.schema/IntGreaterThanZero}
                              (select-one Card :id id))))))
    (testing "Multipart"
      ;; Can't quasi-quote here since that would fully qualify symbols like GET_:id
      (is (=? (list
               'def
               'GET_:id
               (list 'compojure.core/make-route
                     :get
                     {:source "/:id", :re #"/(#[0-9]+)", :keys [:id], :absolute? false}
                     (list mp/wrap-multipart-params
                           '(clojure.core/fn
                              [#"request__\d+__auto__"]
                              (metabase.api.common/validate-param-values #"request__\d+__auto__" '(id))
                              (compojure.core/let-request
                               [[id] #"request__\d+__auto__"]
                               (metabase.api.common.internal/auto-parse
                                   [id]
                                 (metabase.api.common.internal/validate-param 'id id metabase.util.schema/IntGreaterThanZero)
                                 (metabase.api.common.internal/wrap-response-if-needed (do (select-one Card :id id)))))))))
              (macroexpand '(metabase.api.common/defendpoint-schema ^:multipart compojure.core/GET "/:id" [id]
                              {id metabase.util.schema/IntGreaterThanZero}
                              (select-one Card :id id))))))))
