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
   [metabase.lib.common :as lib.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.database :as lib.database]
   [metabase.lib.drill-thru :as lib.drill-thru]
   [metabase.lib.drill-thru.pivot :as lib.drill-thru.pivot]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.update :as lib.filter.update]
   [metabase.lib.join :as lib.join]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider :as lib.metadata.composed-provider]
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
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.namespaces :as shared.ns]))

(comment lib.aggregation/keep-me
         lib.binning/keep-me
         lib.breakout/keep-me
         lib.card/keep-me
         lib.column-group/keep-me
         lib.common/keep-me
         lib.convert/keep-me
         lib.database/keep-me
         lib.drill-thru/keep-me
         lib.drill-thru.pivot/keep-me
         lib.equality/keep-me
         lib.expression/keep-me
         lib.field/keep-me
         lib.filter/keep-me
         lib.filter.update/keep-me
         lib.join/keep-me
         lib.limit/keep-me
         lib.metadata.calculation/keep-me
         lib.metadata.composed-provider/keep-me
         lib.metric/keep-me
         lib.native/keep-me
         lib.normalize/keep-me
         lib.order-by/keep-me
         lib.query/keep-me
         lib.ref/keep-me
         lib.segment/keep-me
         lib.stage/keep-me
         lib.table/keep-me
         lib.temporal-bucket/keep-me
         lib.util/keep-me)

(shared.ns/import-fns
 [lib.aggregation
  aggregate
  aggregation-clause
  aggregation-column
  aggregation-ref
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
  breakout-column
  breakoutable-columns
  breakouts
  breakouts-metadata]
 [lib.column-group
  columns-group-columns
  group-columns]
 [lib.common
  external-op]
 [lib.convert
  ->pMBQL]
 [lib.database
  database-id]
 [lib.drill-thru
  available-drill-thrus
  drill-thru]
 [lib.drill-thru.pivot
  pivot-columns-for-type
  pivot-types]
 [lib.equality
  find-column-for-legacy-ref
  find-matching-column]
 [lib.expression
  expression
  expressions
  expressions-metadata
  expressionable-columns
  expression-ref
  with-expression-name
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
 [lib.fe-util
  dependent-metadata
  expression-clause
  expression-parts
  filter-args-display-name]
 [lib.field
  add-field
  fieldable-columns
  fields
  find-visible-column-for-ref
  remove-field
  with-fields]
 [lib.filter
  filter
  filters
  filterable-columns
  filterable-column-operators
  filter-clause
  filter-operator
  find-filter-for-legacy-filter
  find-filterable-column-for-legacy-ref
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
 [lib.filter.update
  update-lat-lon-filter
  update-numeric-filter
  update-temporal-filter]
 [lib.join
  available-join-strategies
  join
  join-clause
  join-condition-lhs-columns
  join-condition-operators
  join-condition-rhs-columns
  join-condition-update-temporal-bucketing
  join-conditions
  join-fields
  join-lhs-display-name
  join-strategy
  joinable-columns
  joins
  raw-join-strategy
  suggested-join-conditions
  with-join-alias
  with-join-fields
  with-join-strategy
  with-join-conditions]
 [lib.limit
  current-limit
  limit]
 [lib.metadata.calculation
  column-name
  describe-query
  describe-top-level-key
  display-name
  display-info
  metadata
  returned-columns
  suggested-name
  type-of
  visible-columns]
 [lib.metadata.composed-provider
  composed-metadata-provider]
 [lib.metric
  available-metrics]
 [lib.native
  native-query
  raw-native-query
  with-native-query
  template-tags
  engine
  with-template-tags
  required-native-extras
  native-extras
  with-native-extras
  with-different-database
  has-write-permission
  extract-template-tags]
 [lib.order-by
  change-direction
  order-by
  order-by-clause
  order-bys
  orderable-columns]
 [lib.normalize
  normalize]
 [lib.query
  can-run
  query
  stage-count
  uses-metric?
  uses-segment?
  with-different-table]
 [lib.ref
  ref]
 [lib.remove-replace
  remove-clause
  remove-join
  rename-join
  replace-clause
  replace-join]
 [lib.segment
  available-segments]
 [lib.stage
  append-stage
  drop-stage
  drop-empty-stages
  has-clauses?]
 [lib.temporal-bucket
  describe-temporal-unit
  describe-temporal-interval
  describe-relative-datetime
  available-temporal-buckets
  temporal-bucket
  with-temporal-bucket]
 [lib.util
  source-table-id])
