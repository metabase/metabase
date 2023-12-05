(ns metabase.lib.drill-thru.pk-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel do-not-return-pk-for-nil-test
  (testing "do not return pk drills for nil cell values (#36126)"
    ;; simulate a table with multiple PK columns: mark orders.product-id as a PK column
    (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                             meta/metadata-provider
                             {:fields [{:id            (meta/id :orders :product-id)
                                        :semantic-type :type/PK}]})
          query             (lib/query metadata-provider (meta/table-metadata :orders))
          context           {:column     (meta/field-metadata :orders :id)
                             :column-ref (lib/ref (meta/field-metadata :orders :id))
                             :value      :null
                             :row        [{:column     (meta/field-metadata :orders :id)
                                           :column-ref (lib/ref (meta/field-metadata :orders :id))
                                           :value      nil}]}]
      (is (not (m/find-first #(= (:type %) :drill-thru/pk)
                             (lib/available-drill-thrus query -1 context)))))))
