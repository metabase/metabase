(ns metabase.driver-api.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver-api.core :as driver-api]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel cached-test
  (testing "make sure `cached` only evaluates its body once during the duration of a QP run"
    (let [eval-count   (atom 0)
          cached-value (fn []
                         (driver-api/cached :value
                                            (swap! eval-count inc)
                                            :ok))]
      (driver-api/with-metadata-provider meta/metadata-provider
        (is (= :ok (cached-value)))
        (is (= :ok (cached-value)))
        (is (= {:value :ok, :eval-count 1}
               {:value      (cached-value)
                :eval-count @eval-count}))))))
