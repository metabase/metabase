(ns metabase.api.util-test
  (:require [expectations :refer :all]
            [metabase.api.util :refer :all]))

(def ^:dynamic *current-user*)

(defn my-mock-api-fn [{:keys [current-user]}]
  (with-or-404 (current-user)
    {:status 200
     :body (current-user)}))

; check that with-or-404 executes body if TEST is true
(expect {:status 200
         :body "Cam Saul"}
        (my-mock-api-fn {:current-user (fn [] "Cam Saul")}))

; check that 404 is returned otherwise
(expect {:status 404
         :body "Not found."}
        (my-mock-api-fn {:current-user (fn [] nil)}))
