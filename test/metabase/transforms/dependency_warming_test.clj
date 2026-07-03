(ns ^:mb/driver-tests metabase.transforms.dependency-warming-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql :as driver.sql]
   [metabase.test :as mt]
   [metabase.transforms.dependency-warming :as dependency-warming]
   [toucan2.core :as t2]))

(defn- default-schema-or-public []
  (or (and driver/*driver* (driver.sql/default-schema driver/*driver*)) "public"))

(defn- make-transform [query]
  (let [name (mt/random-name)]
    {:source {:type :query :query query}
     :name   (str "transform_" name)
     :target {:schema (default-schema-or-public) :name name :type :table}}))

(defn- uncache! [id]
  (t2/update! (t2/table-name :model/Transform) id {:table_dependencies nil}))

(deftest warm-transform-dependencies-test
  (mt/test-driver (mt/normal-driver-select {:+parent :sql-jdbc})
    (mt/with-temp [:model/Transform {id :id} (make-transform {:database (mt/id)
                                                              :type     "query"
                                                              :query    {:source-table (mt/id :orders)}})]
      (uncache! id)
      (mt/with-metadata-provider (mt/id)
        (testing "warms a transform whose deps are nil"
          (dependency-warming/warm-transform-dependencies! id)
          (is (= [{:table (mt/id :orders)}]
                 (t2/select-one-fn :table_dependencies :model/Transform id))))
        (testing "leaves an already-cached transform untouched"
          (t2/update! (t2/table-name :model/Transform) id {:table_dependencies "[{\"table\":-1}]"})
          (dependency-warming/warm-transform-dependencies! id)
          (is (= [{:table -1}]
                 (t2/select-one-fn :table_dependencies :model/Transform id))))))))

(deftest warm-all-table-dependencies-test
  (mt/test-driver (mt/normal-driver-select {:+parent :sql-jdbc})
    (mt/with-temp [:model/Transform {t1 :id} (make-transform {:database (mt/id)
                                                              :type     "query"
                                                              :query    {:source-table (mt/id :orders)}})
                   :model/Transform {t2 :id} (make-transform {:database (mt/id)
                                                              :type     "query"
                                                              :query    {:source-table (mt/id :products)}})]
      (uncache! t1)
      (uncache! t2)
      (mt/with-metadata-provider (mt/id)
        (is (= 2 (dependency-warming/warm-all-table-dependencies!)))
        (is (= [{:table (mt/id :orders)}] (t2/select-one-fn :table_dependencies :model/Transform t1)))
        (is (= [{:table (mt/id :products)}] (t2/select-one-fn :table_dependencies :model/Transform t2)))))))
