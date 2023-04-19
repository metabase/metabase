(ns metabase.lib.metadata.calculation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel calculate-names-even-without-metadata-test
  (testing "Even if metadata is missing, we should still be able to calculate reasonable display names"
    (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                    (lib/order-by [:field
                                   {:lib/uuid  (str (random-uuid))
                                    :base-type :type/Text}
                                   "TOTAL"]))]
      (is (= "Venues, Sorted by Total ascending"
             (lib.metadata.calculation/suggested-name query))))))
