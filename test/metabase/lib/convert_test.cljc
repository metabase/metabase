(ns metabase.lib.convert-test
  (:require [clojure.test :refer [deftest is]]
            [metabase.lib.convert :as lib.convert])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel ->pMBQL-test
  (is (=? {:lib/type :mbql/query
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table 1}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}
                       :fields      [[:field {:lib/uuid string?} 2]
                                     [:field {:lib/uuid string?, :temporal-unit :month} 3]]
                       :aggregation [[:count {:lib/uuid string?}]]}]
           :database 1}
          (lib.convert/->pMBQL
           {:database 1
            :type     :query
            :query    {:source-query {:source-table 1}
                       :fields       [[:field 2 nil]
                                      [:field 3 {:temporal-unit :month}]]
                       :aggregation  [[:count]]}}))))
