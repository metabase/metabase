(ns metabase.api.common-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer :all]))

(def four-oh-four
  "The expected format of a 404 response."
  {:status 404
   :body "Not found."})

(defn my-mock-api-fn [_]
  (with-or-404 (*current-user*)
    {:status 200
     :body (*current-user*)}))

; check that with-or-404 executes body if TEST is true
(expect {:status 200
         :body "Cam Saul"}
  (binding [*current-user* (constantly "Cam Saul")]
    (my-mock-api-fn nil)))

; check that 404 is returned otherwise
(expect four-oh-four
  (my-mock-api-fn nil))

;;let-or-404 should return nil if test fails
(expect four-oh-four
  (let-or-404 [user nil]
    {:user user}))

;; otherwise let-or-404 should bind as expected
(expect {:user {:name "Cam"}}
  (let-or-404 [user {:name "Cam"}]
    {:user user}))

;; test the 404 thread versions

(expect four-oh-four
  (or-404-> nil
    (- 100)))

(expect -99
  (or-404-> 1
    (- 100)))

(expect four-oh-four
  (or-404->> nil
    (- 100)))

(expect 99
  (or-404->> 1
    (- 100)))

;; test that functions created with defapi automatically wrap responses if needed
(defapi my-fn []
  {:a 100})

(expect {:status 200
         :body {:a 100}}
  (my-fn))

;; test that they don't wrap responses if you wrap them yourself
(defapi my-fn2 []
  {:status 404
   :body {:status "Not found."}})

(expect {:status 404
         :body {:status "Not found."}}
  (my-fn2))


(defmacro expect-expansion
  "Helper to test that a macro expands the way we expect;
   Automatically calls `macroexpand-1` on MACRO."
  [expected-expansion macro]
  `(let [actual-expansion# (macroexpand-1 '~macro)]
     (expect '~expected-expansion
       actual-expansion#)))


;;; TESTS FOR AUTO-PARSE
(binding [*auto-parse-types* {'id 'Integer/parseInt
                              'org_id 'Integer/parseInt}]

  ;; when auto-parse gets an args form where arg is present in *autoparse-types*
  ;; the appropriate let binding should be generated
  (expect-expansion (clojure.core/let [id (Integer/parseInt id)] 'body)
                    (auto-parse [id] 'body))

  ;; params not in *autoparse-types* should be ignored
  (expect-expansion (clojure.core/let [id (Integer/parseInt id)] 'body)
                    (auto-parse [id some-other-param] 'body))

  ;; make sure multiple autoparse params work correctly
  (expect-expansion (clojure.core/let [id (Integer/parseInt id)
                                       org_id (Integer/parseInt org_id)] 'body)
                    (auto-parse [id org_id] 'body))

  ;; make sure it still works if no autoparse params are passed
  (expect-expansion (clojure.core/let [] 'body)
                    (auto-parse [some-other-param] 'body))

  ;; should work with no params at all
  (expect-expansion (clojure.core/let [] 'body)
                    (auto-parse [] 'body)))


;;; TESTS FOR DEFENDPOINT

;; test that a basic `defendpoint` usage expands as expected
(expect-expansion
 (do
   (def GET_:id
     (GET "/:id" [id]
       (clojure.core/-> (metabase.api.common/auto-parse [id]
                          (or-404-> (sel :one Card :id id)))
                        metabase.api.common/wrap-response-if-needed)))
     (clojure.core/alter-meta! #'GET_:id clojure.core/assoc :is-endpoint? true))
 (defendpoint GET "/:id" [id]
   (or-404-> (sel :one Card :id id))))
