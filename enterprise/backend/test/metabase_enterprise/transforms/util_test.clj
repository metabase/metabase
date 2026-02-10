(ns metabase-enterprise.transforms.util-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(deftest is-temp-transform-tables-ee-test
  (testing "tables with schema"
    (let [table-with-schema    {:name (name (driver.u/temp-table-name :postgres :schema/orders))}
          table-without-schema {:name (name (driver.u/temp-table-name :postgres :orders))}]
      (mt/with-premium-features #{:hosting}
        (is (false? (transforms.util/is-temp-transform-table? table-with-schema)))
        (is (false? (transforms.util/is-temp-transform-table? table-without-schema))))
      (mt/with-premium-features #{}
        (is (transforms.util/is-temp-transform-table? table-without-schema))
        (is (transforms.util/is-temp-transform-table? table-with-schema)))
      (mt/with-premium-features #{:hosting :transforms}
        (is (transforms.util/is-temp-transform-table? table-without-schema))
        (is (transforms.util/is-temp-transform-table? table-with-schema)))))

  (testing "Ignores non-transform tables"
    (mt/with-premium-features #{:transforms}
      (is (false? (transforms.util/is-temp-transform-table? {:name :orders})))
      (is (false? (transforms.util/is-temp-transform-table? {:name :public/orders}))))))
