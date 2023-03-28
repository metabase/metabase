(ns metabase.lib.metadata.calculation-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel return-nil-if-there-is-an-error-calculating-query-suggested-name-test
  ;; not really sure this behavior makes sense, but this is what MLv1 did, and I didn't want to update a million e2e
  ;; tests. At one point I was actually calculating halfway-decent names if stuff errored, but eventually I just
  ;; wanted to get the PR green and merged.
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
                  (lib/order-by [:field
                                 {:lib/uuid  (str (random-uuid))
                                  :base-type :type/Text}
                                 "TOTAL"]))]
    (is (nil? (lib.metadata.calculation/suggested-name query)))))

(deftest ^:parallel type-of-always-use-base-type-in-options-when-present-test
  (is (= :type/Text
         (lib.metadata.calculation/type-of
          lib.tu/venues-query
          [:sum
           {:name "sum_2", :display-name "My custom name", :base-type :type/Text}
           (lib.tu/field-clause :venues :price)]))))
