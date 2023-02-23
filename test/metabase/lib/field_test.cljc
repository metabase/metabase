(ns metabase.lib.field-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.resolve :as lib.resolve]
      [metabase.lib.test-metadata :as meta])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib :as lib]
      [metabase.lib.metadata :as lib.metadata]
      [metabase.lib.resolve :as lib.resolve]
      [metabase.lib.test-metadata :as meta])]))

(t/deftest ^:parallel field-test
  (t/is (= [:lib/field-placeholder {:field-name "ID", :table-name "VENUES"}]
           (lib/field "VENUES" "ID")))
  (t/is (= [:lib/field-placeholder {:field-name "ID"}]
           (lib/field "ID")
           (lib/field nil "ID"))))

(t/deftest ^:parallel field-from-database-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/metadata "VENUES" "ID")]
    (t/is (some? field-metadata))
    (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (lib/field field-metadata)))
    (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
              (lib.resolve/resolve meta/metadata field-metadata)))))

(t/deftest ^:parallel field-from-results-metadata-test
  (let [field-metadata (lib.metadata/field-metadata meta/results-metadata "ID")]
    (t/is (some? field-metadata))
    (t/is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
              (lib/field field-metadata)))))

(t/deftest ^:parallel resolve-field-placeholder-test
  (t/is (=? [:field (meta/id :venues :id) {:lib/uuid string?}]
            (lib.resolve/resolve
             meta/metadata
             [:lib/field-placeholder {:field-name "ID", :table-name "VENUES"}])))
  (t/is (=? [:field "ID" {:base-type :type/BigInteger, :lib/uuid string?}]
            (lib.resolve/resolve
             meta/results-metadata
             [:lib/field-placeholder {:field-name "ID"}]))))
