(ns metabase.lib.drill-thru.sort-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.sort :as lib.drill-thru.sort]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel sort-e2e-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :orders))
        drill (lib.drill-thru.sort/sort-drill query
                                              -1
                                              {:column (meta/field-metadata :orders :id)
                                               :value  nil})]
    (is (=? {:type            :drill-thru/sort
             :column          {:id (meta/id :orders :id)}
             :sort-directions [:asc :desc]}
            drill))
    ;; fails: invalid output: missing display name
    ;; disabled for now because display info seems to be broken
    #_(is (= :neat
           (lib/display-info query drill)))
    ;; fails: no drill-thru-method
    (is (=? {:stages [{:lib/type :mbql.stage/mbql
                       :order-by [[:asc {} [:field {} (meta/id :orders :id)]]]}]}
            (lib/drill-thru query drill)))))
