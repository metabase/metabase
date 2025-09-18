(ns metabase.api.common.internal-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common.internal :as internal]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(deftest ^:parallel route-arg-keywords-test
  (are [route expected] (= expected
                           (internal/route-arg-keywords route))
    "/"             []
    "/:id"          [:id]
    "/:id/card"     [:id]
    "/:id/etc/:org" [:id :org]
    "/:card-id"     [:card-id]))

(deftest ^:parallel infer-regex-test
  (are [schema expected] (=? expected
                             (internal/->matching-regex schema))
    `ms/PositiveInt
    #"[1-9]\d*"

    [:or ms/PositiveInt ms/NanoIdString]
    #"(?:(?:[1-9]\d*)|(?:^[A-Za-z0-9_\-]{21}$))"))
