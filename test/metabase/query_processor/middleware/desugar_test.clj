(ns metabase.query-processor.middleware.desugar-test
  (:require [metabase.query-processor.middleware.desugar :as desugar]
            [expectations :refer [expect]]))

(def ^:private ^{:arglists '([query])} desugar
  (desugar/desugar identity))

;; TODO - test `inside`

;; TODO - test `is-null`

;; TODO - test `not-null`

;;; --------------------------------------- desugaring `time-interval` clauses ---------------------------------------

;; `time-interval` with value > 1 or < -1 should generate a `between` clause
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:between
                             [:datetime-field [:field-id 1] :month]
                             [:relative-datetime 1 :month]
                             [:relative-datetime 2 :month]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:time-interval [:field-id 1] 2 :month]}}))

;; test the `include-current` option -- interval should start or end at `0` instead of `1`
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:between
                             [:datetime-field [:field-id 1] :month]
                             [:relative-datetime 0 :month]
                             [:relative-datetime 2 :month]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:time-interval [:field-id 1] 2 :month {:include-current true}]}}))

;; test using keywords like `:current`
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:=
                             [:datetime-field [:field-id 1] :week]
                             [:relative-datetime 0 :week]]}}

  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:time-interval [:field-id 1] :current :week]}}))


;; TODO - test `does-not-contain`

;;; ------------------------------------------ `=` and `!=` with extra args ------------------------------------------

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:or
                             [:= [:field-id 1] 2]
                             [:= [:field-id 1] 3]
                             [:= [:field-id 1] 4]
                             [:= [:field-id 1] 5]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:= [:field-id 1] 2 3 4 5]}}))

;; TODO - test `!=` with extra args


;;; ---------------------------- desugaring `:relative-datetime` clauses with `:current` -----------------------------

;; for cases when `:relative-datetime` is being compared to a `:datetime-field` clause, it should take the unit of the
;; clause it's being compared to
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:=
                             [:datetime-field [:field-id 1] :minute]
                             [:relative-datetime 0 :minute]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:=
                              [:datetime-field [:field-id 1] :minute]
                              [:relative-datetime :current]]}}))

;; otherwise it should just get a unit of `:default`
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:=
                             [:field-id 1]
                             [:relative-datetime 0 :default]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:=
                              [:field-id 1]
                              [:relative-datetime :current]]}}))

;; ok, we should be able to handle datetime fields even if they are nested inside another clause
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :filter       [:=
                             [:binning-strategy [:datetime-field [:field-id 1] :week] :default]
                             [:relative-datetime 0 :week]]}}
  (desugar
   {:database 1
    :type     :query
    :query    {:source-table 1
               :filter       [:=
                              [:binning-strategy [:datetime-field [:field-id 1] :week] :default]
                              [:relative-datetime :current]]}}))
