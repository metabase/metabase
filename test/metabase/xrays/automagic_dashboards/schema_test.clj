(ns metabase.xrays.automagic-dashboards.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.xrays.automagic-dashboards.schema :as ads]))

(deftest ^:parallel normalize-cell-query-test
  (is (=? [:=
           {:lib/uuid string?}
           [:field {:base-type :type/Text, :lib/uuid string?} "SOURCE"]
           "Affiliate"]
          (lib/normalize ::ads/root.cell-query ["=" ["field" "SOURCE" {"base-type" "type/Text"}] "Affiliate"])))
  (is (=? [:and
           {:lib/uuid string?}
           [:= {:lib/uuid string?}
            [:expression {:lib/uuid string?} "TestColumn"]
            2]
           [:= {:lib/uuid string?}
            [:field {:temporal-unit :month, :lib/uuid string?}
             13]
            "2019-02-01T00:00:00Z"]]
          (lib/normalize ::ads/root.cell-query [:and
                                                [:= [:expression "TestColumn"] 2]
                                                [:=
                                                 [:field 13 {:temporal-unit :month}]
                                                 "2019-02-01T00:00:00Z"]]))))
