(ns metabase.lib.field-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel field-test
  (t/are [x] (fn? x)
    (lib/field "VENUES" "ID")
    (lib/field "ID")
    (lib/field nil "ID")))

(t/deftest ^:parallel field-from-database-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/metadata "VENUES" "ID")]
    (t/is (some? field-metadata))
    (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (lib/field {:lib/metadata meta/metadata} -1 field-metadata)))
    (let [f (lib/field field-metadata)]
      (t/is (fn? f))
      (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
                (f {:lib/metadata meta/metadata} -1)))
      (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
                (#'lib.field/->field {:lib/metadata meta/metadata} -1 f))))))

(t/deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/results-metadata "ID")]
    (t/is (=? {:lib/type :metadata/field
               :name     "ID"}
              field-metadata))
    (t/is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
              (#'lib.field/->field {} -1 field-metadata)))))
