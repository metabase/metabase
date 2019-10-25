(ns metabase.api.common-test
  (:require [expectations :refer [expect]]
            [metabase.api.common :as api :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.middleware
             [exceptions :as mw.exceptions]
             [misc :as mw.misc]
             [security :as mw.security]]
            [metabase.test.data :refer :all]
            [metabase.util.schema :as su]))

;;; TESTS FOR CHECK (ETC)

(def ^:private four-oh-four
  "The expected format of a 404 response."
  {:status  404
   :body    "Not found."
   :headers {"Cache-Control"                     "max-age=0, no-cache, must-revalidate, proxy-revalidate"
             "Content-Security-Policy"           (-> @#'mw.security/content-security-policy-header vals first)
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

; check that `check-404` doesn't throw an exception if TEST is true
(expect
  {:status  200
   :body    "Cam Saul"
   :headers {"Content-Type" "text/plain"}}
  (binding [*current-user* (atom "Cam Saul")]
    (my-mock-api-fn)))

; check that 404 is returned otherwise
(expect
  four-oh-four
  (-> (my-mock-api-fn)
      (update-in [:headers "Last-Modified"] string?)))

;;let-404 should return nil if test fails
(expect
  four-oh-four
  (-> (mock-api-fn
       (fn [_]
         (let-404 [user nil]
           {:user user})))
      (update-in [:headers "Last-Modified"] string?)))

;; otherwise let-404 should bind as expected
(expect
  {:user {:name "Cam"}}
  ((mw.exceptions/catch-api-exceptions
    (fn [_ respond _]
      (respond
       (let-404 [user {:name "Cam"}]
         {:user user}))))
   nil
   identity
   (fn [e] (throw e))))


(defmacro ^:private expect-expansion
  "Helper to test that a macro expands the way we expect;
   Automatically calls `macroexpand-1` on MACRO."
  {:style/indent 0}
  [expected-expansion macro]
  `(let [actual-expansion# (macroexpand-1 '~macro)]
     (expect '~expected-expansion
       actual-expansion#)))


;;; TESTS FOR AUTO-PARSE
;; TODO - these need to be moved to `metabase.api.common.internal-test`. But first `expect-expansion` needs to be put
;; somewhere central

;; when auto-parse gets an args form where arg is present in *autoparse-types*
;; the appropriate let binding should be generated
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id] 'body))

;; params not in *autoparse-types* should be ignored
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id some-other-param] 'body))

;; make sure multiple autoparse params work correctly
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))
                                     org_id (clojure.core/when org_id (metabase.api.common.internal/parse-int org_id))] 'body)
                  (auto-parse [id org_id] 'body))

;; make sure it still works if no autoparse params are passed
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [some-other-param] 'body))

;; should work with no params at all
(expect-expansion (clojure.core/let [] 'body)
                  (auto-parse [] 'body))

;; should work with some wacky binding form
(expect-expansion (clojure.core/let [id (clojure.core/when id (metabase.api.common.internal/parse-int id))] 'body)
                  (auto-parse [id :as {body :body}] 'body))

;;; TESTS FOR DEFENDPOINT

;; replace regex `#"[0-9]+"` with str `"#[0-9]+" so expectations doesn't barf
(binding [*auto-parse-types* (update-in *auto-parse-types* [:int :route-param-regex] (partial str "#"))]
  (expect-expansion
    (def GET_:id
      (GET ["/:id" :id "#[0-9]+"] [id]
           (metabase.api.common.internal/auto-parse [id]
             (metabase.api.common.internal/validate-param 'id id su/IntGreaterThanZero)
             (metabase.api.common.internal/wrap-response-if-needed (do (select-one Card :id id))))))
    (defendpoint GET "/:id" [id]
      {id su/IntGreaterThanZero}
      (select-one Card :id id))))
