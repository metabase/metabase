(ns metabase.lib.core
  "Currently this is mostly a convenience namespace for REPL and test usage. We'll probably have a slightly different
  version of this for namespace for QB and QP usage in the future -- TBD."
  (:refer-clojure :exclude [filter remove replace and or not = < <= > ->> >= not-empty case count distinct max min
                            + - * / time abs concat replace ref var float])
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
   [metabase.lib.drill-thru.column-extract :as lib.drill-thru.column-extract]
   [metabase.lib.drill-thru.pivot :as lib.drill-thru.pivot]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.extraction :as lib.extraction]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.update :as lib.filter.update]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.composed-provider :as lib.metadata.composed-provider]
   [metabase.lib.metric :as lib.metric]
   [metabase.lib.native :as lib.native]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.parse :as lib.parse]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema.util]
   [metabase.lib.segment :as lib.segment]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.swap :as lib.swap]
   [metabase.lib.table :as lib.table]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.util.namespaces :as shared.ns]))

(comment lib.aggregation/keep-me
         lib.binning/keep-me
         lib.breakout/keep-me
         lib.card/keep-me
         lib.column-group/keep-me
         lib.common/keep-me
         lib.convert/keep-me
         lib.database/keep-me
         lib.drill-thru.column-extract/keep-me
         lib.drill-thru.pivot/keep-me
         lib.drill-thru/keep-me
         lib.equality/keep-me
         lib.expression/keep-me
         lib.extraction/keep-me
         lib.fe-util/keep-me
         lib.field/keep-me
         lib.filter.update/keep-me
         lib.filter/keep-me
         lib.join/keep-me
         metabase.lib.join.util/keep-me
         lib.limit/keep-me
         lib.metadata.calculation/keep-me
         lib.metadata.composed-provider/keep-me
         lib.metric/keep-me
         lib.native/keep-me
         lib.normalize/keep-me
         metabase.lib.options/keep-me
         lib.order-by/keep-me
         lib.query/keep-me
         lib.ref/keep-me
         lib.remove-replace/keep-me
         metabase.lib.schema.util/keep-me
         lib.segment/keep-me
         lib.stage/keep-me
         lib.swap/keep-me
         lib.table/keep-me
         lib.temporal-bucket/keep-me
         lib.util/keep-me)

(shared.ns/import-fns
 [lib.aggregation
  aggregable-columns
  aggregate
  aggregation-clause
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
  distinct-where
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
  breakouts-metadata
  remove-all-breakouts]
 [lib.column-group
  columns-group-columns
  group-columns]
 [lib.common
  external-op]
 [lib.convert
  ->legacy-MBQL
  ->pMBQL
  without-cleaning]
 [lib.database
  database-id]
 [lib.drill-thru
  available-drill-thrus
  drill-thru]
 [lib.drill-thru.column-extract
  extractions-for-drill]
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
  resolve-expression
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
  date
  datetime
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
  get-day-of-week
  get-hour
  get-minute
  get-second
  get-quarter
  datetime-add
  datetime-subtract
  concat
  substring
  replace
  regex-match-first
  length
  trim
  ltrim
  rtrim
  upper
  lower
  offset
  text
  today
  split-part
  integer
  float]
 [lib.extraction
  column-extractions
  extract
  extraction-expression]
 [lib.fe-util
  dependent-metadata
  table-or-card-dependent-metadata
  expression-clause
  expression-parts
  string-filter-clause
  string-filter-parts
  number-filter-clause
  number-filter-parts
  coordinate-filter-clause
  coordinate-filter-parts
  boolean-filter-clause
  boolean-filter-parts
  specific-date-filter-clause
  specific-date-filter-parts
  relative-date-filter-clause
  relative-date-filter-parts
  exclude-date-filter-clause
  exclude-date-filter-parts
  time-filter-clause
  time-filter-parts
  default-filter-clause
  default-filter-parts
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
  filter-parts
  find-filter-for-legacy-filter
  find-filterable-column-for-legacy-ref
  and
  or
  not
  = !=
  < <=
  > >=
  in not-in
  between
  inside
  is-null not-null
  is-empty not-empty
  starts-with ends-with
  contains does-not-contain
  relative-time-interval
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
 [metabase.lib.join.util
  current-join-alias]
 [lib.metric
  available-metrics]
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
 [lib.native
  engine
  extract-template-tags
  has-template-tag-variables?
  has-write-permission
  native-extras
  native-query
  raw-native-query
  required-native-extras
  template-tag-card-ids
  template-tags-referenced-cards
  template-tags
  with-different-database
  with-native-extras
  with-native-query
  with-template-tags]
 [metabase.lib.options
  options
  update-options]
 [lib.order-by
  change-direction
  order-by
  order-by-clause
  order-bys
  orderable-columns]
 [lib.normalize
  normalize]
 [lib.parse
  parse]
 [lib.query
  ->query
  can-preview
  can-run
  can-save
  check-overwrite
  preview-query
  query
  query-from-legacy-inner-query
  stage-count
  uses-metric?
  uses-segment?
  with-different-table
  with-wrapped-native-query
  wrap-native-query-with-mbql]
 [lib.ref
  ref]
 [lib.remove-replace
  remove-clause
  remove-join
  rename-join
  replace-clause
  replace-join]
 [metabase.lib.schema.util
  ref-distinct-key]
 [lib.segment
  available-segments]
 [lib.stage
  append-stage
  drop-stage
  drop-empty-stages
  ensure-filter-stage
  has-clauses?]
 [lib.swap
  swap-clauses]
 [lib.temporal-bucket
  describe-temporal-unit
  describe-temporal-interval
  describe-relative-datetime
  available-temporal-buckets
  available-temporal-units
  raw-temporal-bucket
  temporal-bucket
  with-temporal-bucket]
 [lib.util
  fresh-uuids
  normalized-query-type
  previous-stage
  previous-stage-number
  query-stage
  source-table-id
  update-query-stage])
