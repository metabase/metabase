(ns metabase.api.notify-test
  (:require [clj-http.client :as client]
            [expectations :refer :all]
            (metabase [http-client :as http]
                      [middleware :as middleware])))


;; ## /api/notify/* AUTHENTICATION Tests
;; We assume that all endpoints for a given context are enforced by the same middleware, so we don't run the same
;; authentication test on every single individual endpoint

(expect (get middleware/response-forbidden :body) (http/client :post 403 "notify/db/100"))


;; ## POST /api/notify/db/:id
;; database must exist or we get a 404
(expect
  {:status 404
   :body "Not found."}
  (try (client/post (http/build-url "notify/db/10000" {}) {:accept  :json
                                                           :headers {"X-METABASE-APIKEY" "test-api-key"}})
       (catch clojure.lang.ExceptionInfo e
         (select-keys (:object (ex-data e)) [:status :body]))))

;; TODO - how can we validate the normal scenario given that it just kicks off a background job?
