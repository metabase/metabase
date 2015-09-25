(ns metabase.api.util-test
  "Tests for /api/util"
  (:require [expectations :refer :all]
            [metabase.http-client :refer :all]
            (metabase.models [session :refer [Session]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :refer [random-name expect-eval-actual-first]]))


;; ## POST /api/util/password_check

;; Test for required params
(expect {:errors {:password "field is a required param."}}
  (client :post 400 "util/password_check" {}))

;; Test complexity check
(expect {:errors {:password "Insufficient password strength"}}
  (client :post 400 "util/password_check" {:password "blah"}))

;; Should be a valid password
(expect {:valid true}
  (client :post 200 "util/password_check" {:password "something1"}))
