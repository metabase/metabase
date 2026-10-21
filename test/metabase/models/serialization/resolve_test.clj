(ns metabase.models.serialization.resolve-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel normalize-field-ref-reuses-cached-coercer-test
  (testing "normalizing :field refs hits the registry coercer cache after the first call"
    (let [misses (atom 0)]
      (binding [mr/*cache-miss-hook* (fn [k _schema _value]
                                       (when (= k ::lib.normalize/coercer)
                                         (swap! misses inc)))]
        (dotimes [_ 3]
          (#'resolve/normalize [:field 1 nil])
          (#'resolve/normalize [:field {:lib/uuid "00000000-0000-0000-0000-000000000001"} 1])))
      (is (<= @misses 1)))))
