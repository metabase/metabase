(ns metabase.api.common-test
  (:require [expectations :refer :all]
            [metabase.api.common :refer :all]))

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
(expect {:status 404
         :body "Not found."}
        (my-mock-api-fn nil))
