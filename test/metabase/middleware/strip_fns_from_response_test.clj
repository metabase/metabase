(ns metabase.middleware.strip-fns-from-response-test
  (:require [expectations :refer :all]
            [metabase.middleware.strip-fns-from-response :refer :all]))

;; `strip-fns-from-response`, being a middleware function, expects a `handler`
;; and returns a function that actually affects the response.
;; Since we're just interested in testing the returned function pass it `identity` as a handler
;; so whatever we pass it is unaffected
(def strip (strip-fns-from-response identity))

;; check basic stripping
(expect {:a 1}
        (strip {:a 1
                :b (fn [] 2)}))

;; check recursive stripping w/ map
(expect {:response {:a 1}}
        (strip {:response {:a 1
                           :b (fn [] 2)}}))

;; check recursive stripping w/ array
(expect [{:a 1}]
        (strip [{:a 1
                 :b (fn [] 2)}]))

;; check combined recursive stripping
(expect [{:a [{:b 1}]}]
        (strip [{:a [{:b 1
                      :c (fn [] 2)} ]}]))
