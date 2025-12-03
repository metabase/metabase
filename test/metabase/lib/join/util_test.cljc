(ns metabase.lib.join.util-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

;;; see also [[metabase.query-processor.util.add-alias-info-test/preserve-field-options-name-test]]
(deftest ^:parallel desired-alias-should-respect-ref-name-test
  (testing "Respect that :name specified in a ref for desired-column-alias calculation purposes"
    (let [query (lib/query
                 meta/metadata-provider
                 (lib.tu.macros/mbql-5-query orders
                   {:stages [{:fields [[:field {:name "__crazy__"} %id]]}]}))]
      (let [col (lib.field.resolution/resolve-field-ref query -1 (lib/normalize :mbql.clause/field [:field {:name "__crazy__"} (meta/id :orders :id)]))]
        (is (=? {:lib/ref-name "__crazy__"}
                col))
        (is (= "__crazy__"
               (lib.join.util/desired-alias query col))))
      (is (=? [{:lib/ref-name             "__crazy__"
                :lib/desired-column-alias "__crazy__"}]
              (lib/returned-columns query))))))
