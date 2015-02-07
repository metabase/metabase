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
