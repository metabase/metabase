(ns metabase.api.common-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.test.data :refer :all]
            [metabase.util.schema :as su]))

;;; TESTS FOR CHECK (ETC)

(def ^:private four-oh-four
  "The expected format of a 404 response."
  {:status 404
   :body "Not found."})

(defn ^:private my-mock-api-fn [_]
  (catch-api-exceptions
   (check-404 @*current-user*)
   {:status 200
    :body @*current-user*}))

; check that `check-404` doesn't throw an exception if TEST is true
(expect {:status 200
         :body "Cam Saul"}
  (binding [*current-user* (atom "Cam Saul")]
    (my-mock-api-fn nil)))

; check that 404 is returned otherwise
(expect four-oh-four
  (my-mock-api-fn nil))

;;let-404 should return nil if test fails
(expect four-oh-four
  (catch-api-exceptions
    (let-404 [user nil]
      {:user user})))

;; otherwise let-404 should bind as expected
(expect {:user {:name "Cam"}}
  (catch-api-exceptions
    (let-404 [user {:name "Cam"}]
      {:user user})))

;; test the 404 thread versions

(expect four-oh-four
  (catch-api-exceptions
    (->404 nil
           (- 100))))

(expect -99
  (catch-api-exceptions
    (->404 1
           (- 100))))

(expect four-oh-four
  (catch-api-exceptions
    (->>404 nil
            (- 100))))

(expect 99
  (catch-api-exceptions
    (->>404 1
            (- 100))))


(defmacro ^:private expect-expansion
  "Helper to test that a macro expands the way we expect;
   Automatically calls `macroexpand-1` on MACRO."
  {:style/indent 0}
  [expected-expansion macro]
  `(let [actual-expansion# (macroexpand-1 '~macro)]
     (expect '~expected-expansion
       actual-expansion#)))


;;; TESTS FOR AUTO-PARSE
;; TODO - these need to be moved to `metabase.api.common.internal-test`. But first `expect-expansion` needs to be put somewhere central

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
        (metabase.api.common.internal/catch-api-exceptions
          (metabase.api.common.internal/auto-parse [id]
            (metabase.api.common.internal/validate-param 'id id su/IntGreaterThanZero)
            (metabase.api.common.internal/wrap-response-if-needed (do (->404 (select-one Card :id id))))))))
    (defendpoint GET "/:id" [id]
      {id su/IntGreaterThanZero}
      (->404 (select-one Card :id id)))))
