(ns metabase.lib.field-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel field-test
  (are [x] (fn? x)
    (lib/field "VENUES" "ID")
    (lib/field "ID")
    (lib/field nil "ID")))

(deftest ^:parallel field-from-database-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/metadata "VENUES" "ID")
        base-query     (lib/query meta/metadata "VENUES")]
    (is (some? field-metadata))
    (is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
            (lib/field base-query -1 field-metadata)))
    (let [f (lib/field field-metadata)]
      (is (fn? f))
      (is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (f base-query -1)))
      (is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (#'lib.field/->field base-query -1 f))))))

(deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/results-metadata "ID")]
    (is (=? {:lib/type :metadata/field
             :name     "ID"}
            field-metadata))
    (is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
            (#'lib.field/->field {} -1 field-metadata)))))
