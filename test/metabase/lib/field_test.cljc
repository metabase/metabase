(ns metabase.lib.field-test
  (:require
   [clojure.test :as t]
   [metabase.lib.core :as lib]
   [metabase.lib.interface :as lib.interface]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(t/deftest ^:parallel field-test
  (t/is (= [:field/unresolved {:field-name "ID", :table-name "VENUES"}]
           (lib/field "VENUES" "ID")))
  (t/is (= [:field/unresolved {:field-name "ID"}]
           (lib/field "ID")
           (lib/field nil "ID"))))

(t/deftest ^:parallel field-from-database-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/metadata "VENUES" "ID")]
    (t/is (some? field-metadata))
    (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (lib/field field-metadata)))
    (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (lib.interface/resolve field-metadata meta/metadata)))))

(t/deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/results-metadata "ID")]
    (t/is (some? field-metadata))
    (t/is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
              (lib/field field-metadata)))))

(t/deftest ^:parallel resolve-field-placeholder-test
  (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
            (lib.interface/resolve
             [:field/unresolved {:field-name "ID", :table-name "VENUES"}]
             meta/metadata)))
  (t/is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
            (lib.interface/resolve
             [:field/unresolved {:field-name "ID"}]
             meta/results-metadata))))
