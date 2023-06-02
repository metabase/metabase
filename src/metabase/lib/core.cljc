(ns metabase.lib.core
  "Currently this is mostly a convenience namespace for REPL and test usage. We'll probably have a slightly different
  version of this for namespace for QB and QP usage in the future -- TBD."
  (:refer-clojure :exclude [filter remove replace and or not = < <= > ->> >= not-empty case count distinct max min
                            + - * / time abs concat replace ref var])
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.card :as lib.card]
   [metabase.lib.column-group :as lib.column-group]
   [metabase.lib.dev :as lib.dev]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metric :as lib.metric]
   [metabase.lib.native :as lib.native]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.segment :as lib.segment]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.table :as lib.table]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.shared.util.namespaces :as shared.ns]))

(comment lib.aggregation/keep-me
         lib.binning/keep-me
         lib.breakout/keep-me
         lib.card/keep-me
         lib.column-group/keep-me
         lib.dev/keep-me
         lib.expression/keep-me
         lib.field/keep-me
         lib.filter/keep-me
         lib.join/keep-me
         lib.limit/keep-me
         lib.metadata.calculation/keep-me
         lib.metric/keep-me
         lib.native/keep-me
         lib.normalize/keep-me
         lib.order-by/keep-me
         lib.query/keep-me
         lib.ref/keep-me
         lib.segment/keep-me
         lib.stage/keep-me
         lib.table/keep-me
         lib.temporal-bucket/keep-me)

(shared.ns/import-fns
  [lib.aggregation
   aggregate
   aggregation-clause
   aggregation-operator-columns
   aggregations
   aggregations-metadata
   available-aggregation-operators
   selected-aggregation-operators
   count
   avg
   count-where
   distinct
   max
   median
   min
   percentile
   share
   stddev
   sum
   sum-where
   var
   cum-count
   cum-sum]
  [lib.binning
   available-binning-strategies
   binning
   with-binning]
  [lib.breakout
   breakout
   breakoutable-columns
   breakouts]
  [lib.column-group
   columns-group-columns
   group-columns]
  [lib.dev
   field
   query-for-table-id
   query-for-table-name
   table
   ref-lookup]
  [lib.expression
   expression
   expressions
   expressions-metadata
   +
   -
   *
   /
   case
   coalesce
   abs
   log
   exp
   sqrt
   ceil
   floor
   round
   power
   interval
   relative-datetime
   time
   absolute-datetime
   now
   convert-timezone
   get-week
   get-year
   get-month
   get-day
   get-hour
   get-minute
   get-second
   get-quarter
   datetime-add
   datetime-subtract
   concat
   substring
   replace
   regexextract
   length
   trim
   ltrim
   rtrim
   upper
   lower]
  [lib.field
   fields
   with-fields
   fieldable-columns]
  [lib.filter
   filter
   filters
   filterable-columns
   filterable-column-operators
   filter-clause
   and
   or
   not
   = !=
   < <=
   > >=
   between
   inside
   is-null not-null
   is-empty not-empty
   starts-with ends-with
   contains does-not-contain
   time-interval
   segment]
  [lib.join
   join
   join-clause
   join-conditions
   join-fields
   joins
   with-join-alias
   with-join-fields]
  [lib.limit
   current-limit
   limit]
  [lib.metadata.calculation
   column-name
   describe-query
   describe-top-level-key
   display-name
   display-info
   suggested-name
   type-of]
  [lib.native
   #?@(:cljs [->TemplateTags
              TemplateTags->])
   recognize-template-tags
   template-tags]
  [lib.order-by
   change-direction
   order-by
   order-by-clause
   order-bys
   orderable-columns]
  [lib.normalize
   normalize]
  [lib.query
   native-query
   query
   saved-question-query]
  [lib.ref
   ref]
  [lib.remove-replace
   remove-clause
   replace-clause]
  [lib.stage
   append-stage
   drop-stage]
  [lib.temporal-bucket
   describe-temporal-unit
   describe-temporal-interval
   describe-relative-datetime
   available-temporal-buckets
   temporal-bucket
   with-temporal-bucket])
