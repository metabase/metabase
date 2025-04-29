(ns metabase.api.common.internal-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common.internal :as internal]))

(set! *warn-on-reflection* true)

(deftest ^:parallel route-arg-keywords-test
  (are [route expected] (= expected
                           (internal/route-arg-keywords route))
    "/"             []
    "/:id"          [:id]
    "/:id/card"     [:id]
    "/:id/etc/:org" [:id :org]
    "/:card-id"     [:card-id]))
