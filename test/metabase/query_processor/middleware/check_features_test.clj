(ns metabase.query-processor.middleware.check-features-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.check-features :as check-features]))

(driver/register! ::mock-driver, :abstract? true)

(defmethod driver/database-supports? [::mock-driver :standard-deviation-aggregations]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [::mock-driver :left-join]
  [_driver _feature _database]
  true)

(defmethod driver/database-supports? [::mock-driver :right-join]
  [_driver _feature _database]
  false)

(deftest ^:parallel check-join-strategies-test
  (driver/with-driver ::mock-driver
    (let [query-with-join (fn [strategy]
                            (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                                (lib/join (-> (lib/join-clause (meta/table-metadata :categories))
                                              (lib/with-join-strategy strategy)))))]
      (testing ":left-join should be ok"
        (let [query (query-with-join :left-join)]
          (is (= query
                 (check-features/check-features query)))))
      (testing ":right-join should trigger an error"
        (let [query (query-with-join :right-join)]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"\Qright-join is not supported by mock-driver driver.\E"
               (check-features/check-features query))))))))

(deftest ^:parallel check-standard-deviations-test
  (driver/with-driver ::mock-driver
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/aggregate (lib/stddev (meta/field-metadata :venues :price))))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\Qstandard-deviation-aggregations is not supported by mock-driver driver.\E"
           (check-features/check-features query))))))
