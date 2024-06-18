(ns metabase.xrays.automagic-dashboards.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card]]
   [metabase.test :as mt]
   [metabase.xrays.automagic-dashboards.core :as magic]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel ->field-test
  (testing "Demonstrate the stated methods in which ->fields works"
    (mt/with-test-user :crowberto
      (mt/dataset test-data
        (testing "->field checks for a table-based context"
          (let [table (t2/select-one :model/Table :id (mt/id :orders))
                root  (#'magic/->root table)]
            (testing "Looking up the field by name does not work"
              (is (nil? (magic.util/->field root "DISCOUNT"))))
            (testing "Looking up the field by id or id-field ref works."
              (is (=? {:id (mt/id :orders :discount)}
                      (magic.util/->field root (mt/id :orders :discount))))
              (is (=? {:id (mt/id :orders :discount)}
                      (magic.util/->field root [:field (mt/id :orders :discount) nil]))))))))))

(deftest ^:parallel ->field-test-2
  (testing "Demonstrate the stated methods in which ->fields works"
    (mt/with-test-user :rasta
      (mt/dataset test-data
        (testing "->field checks for a model-based context"
          (let [query (mt/native-query {:query "select * from orders"})]
            (t2.with-temp/with-temp [Card card (mt/card-with-source-metadata-for-query query)]
              (let [root (#'magic/->root card)]
                (testing "Looking up the field by id or id-field ref works"
                  (is (=? {:id (mt/id :orders :discount)}
                          (magic.util/->field root (mt/id :orders :discount))))
                  (is (=? {:id (mt/id :orders :discount)}
                          (magic.util/->field root [:field (mt/id :orders :discount) nil]))))
                (testing "Looking up the field by name or named field ref works,
                          returning the metadata description of the field."
                  (is (=? {:name      "DISCOUNT"
                           :field_ref [:field "DISCOUNT" {:base-type :type/Float}]}
                          (magic.util/->field root "DISCOUNT"))))
                (is (=? {:name      "DISCOUNT"
                         :field_ref [:field "DISCOUNT" {:base-type :type/Float}]}
                        (magic.util/->field root [:field "DISCOUNT" {:base-type :type/Float}])))))))))))
