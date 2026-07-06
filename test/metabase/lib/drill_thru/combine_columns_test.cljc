(ns metabase.lib.drill-thru.combine-columns-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest use-fixtures]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.types.isa :as lib.types.isa]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(use-fixtures :each lib.drill-thru.tu/with-native-card-id)

;; `combine-columns` has no BE application path (its drill-thru-method deliberately throws; the
;; FE adds the :concat expression directly), so the BE-testable surface is availability and the
;; returned drill.

(deftest ^:parallel combine-columns-availability-test
  (canned/canned-test
   :drill-thru/combine-columns
   (fn [test-case {:keys [column] :as _context} {:keys [click]}]
     ;; available only on header clicks of string columns of an mbql stage (never on a raw native query)
     (and (= click :header)
          (not (:native? test-case))
          (lib.types.isa/string? column)))))

(deftest ^:parallel combine-columns-drill-returned-test
  ;; runs against both MBQL and (card-wrapped) native sources - `combine-columns` must work on both.
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/combine-columns
    :click-type  :header
    :query-type  :unaggregated
    :query-table "PRODUCTS"
    :column-name "TITLE"
    :expected    {:type   :drill-thru/combine-columns
                  :column {:name "TITLE"}}}))
