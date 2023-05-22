(ns metabase.lib.dev-test
  (:require
   [clojure.test :refer [are deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

(deftest ^:parallel field-test
  (are [x] (fn? x)
    (lib/field "VENUES" "ID")
    (lib/field "ID")
    (lib/field nil "VENUES" "ID")))

(deftest ^:parallel field-from-database-metadata-test
  (let [f (lib/field "VENUES" "ID")]
    (is (fn? f))
    (is (=? [:field {:lib/uuid string?} (meta/id :venues :id)]
            (f {:lib/type :mbql/query, :lib/metadata meta/metadata-provider} -1)))))

(deftest ^:parallel query-for-table-name-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (dissoc :lib/metadata)))))
