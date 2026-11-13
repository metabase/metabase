(ns metabase.cache.models.cache-config-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest can-check-keys-test
  (doseq [[operation can? full-instance] [[:read mi/can-read? {:model "root" :model_id nil}]
                                          [:write mi/can-write? {:model "root" :model_id nil}]]
          k                              (keys full-instance)]
    (testing (str operation " without " k)
      (is (thrown-with-msg? clojure.lang.ExceptionInfo (re-pattern (str "No " k " is set for a CacheConfig"))
                            (can? (t2/instance :model/CacheConfig (dissoc full-instance k))))))))
