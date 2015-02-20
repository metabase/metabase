(ns metabase.middleware.format-test
  (:require [expectations :refer :all]
            [metabase.middleware.format :refer :all]))

;; `format`, being a middleware function, expects a `handler`
;; and returns a function that actually affects the response.
;; Since we're just interested in testing the returned function pass it `identity` as a handler
;; so whatever we pass it is unaffected
(def fmt (format-response identity))

;; check basic stripping
(expect {:a 1}
        (fmt {:a 1
              :b (fn [] 2)}))

;; check recursive stripping w/ map
(expect {:response {:a 1}}
        (fmt {:response {:a 1
                         :b (fn [] 2)}}))

;; check recursive stripping w/ array
(expect [{:a 1}]
        (fmt [{:a 1
               :b (fn [] 2)}]))

;; check combined recursive stripping
(expect [{:a [{:b 1}]}]
        (fmt [{:a [{:b 1
                    :c (fn [] 2)} ]}]))
