(ns metabase.lib.core
  "Currently this is mostly a convenience namespace for REPL and test usage. We'll probably have a slightly different
  version of this for namespace for QB and QP usage in the future -- TBD."
  (:refer-clojure :exclude [filter remove replace and or not = < <= > ->> >= not-empty case count distinct max min
                            + - * / time abs concat replace ref var float])
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.card]
   [metabase.lib.column-group :as lib.column-group]
   [metabase.lib.common :as lib.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.convert.metadata-to-legacy]
   [metabase.lib.database :as lib.database]
   [metabase.lib.dispatch]
   [metabase.lib.drill-thru :as lib.drill-thru]
   [metabase.lib.drill-thru.column-extract :as lib.drill-thru.column-extract]
   [metabase.lib.drill-thru.pivot :as lib.drill-thru.pivot]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.extraction :as lib.extraction]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.field.util]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.desugar]
   [metabase.lib.filter.negate]
   [metabase.lib.filter.simplify-compound]
   [metabase.lib.filter.update :as lib.filter.update]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util]
   [metabase.lib.limit :as lib.limit]
   [metabase.lib.measure :as lib.measure]
   [metabase.lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.column]
   [metabase.lib.metadata.composed-provider :as lib.metadata.composed-provider]
   [metabase.lib.metadata.protocols]
   [metabase.lib.metric :as lib.metric]
   [metabase.lib.native :as lib.native]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.page]
   [metabase.lib.parameters]
   [metabase.lib.parameters.parse :as lib.parameters.parse]
   [metabase.lib.parse :as lib.parse]
   [metabase.lib.query :as lib.query]
   [metabase.lib.query.test-spec :as lib.query.test-spec]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema]
   [metabase.lib.schema.util]
   [metabase.lib.segment :as lib.segment]
   [metabase.lib.serialize]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.swap :as lib.swap]
   [metabase.lib.table :as lib.table]
   [metabase.lib.template-tags :as lib.template-tags]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator]
   [metabase.lib.validate :as lib.validate]
   [metabase.lib.walk.util]
   [metabase.util.namespaces :as shared.ns]))

(comment lib.aggregation/keep-me
         lib.binning/keep-me
         lib.breakout/keep-me
         metabase.lib.card
         lib.column-group/keep-me
         lib.common/keep-me
         lib.convert/keep-me
         metabase.lib.convert.metadata-to-legacy/keep-me
         lib.database/keep-me
         metabase.lib.dispatch/keep-me
         lib.drill-thru.column-extract/keep-me
         lib.drill-thru.pivot/keep-me
         lib.drill-thru/keep-me
         lib.equality/keep-me
         lib.expression/keep-me
         lib.extraction/keep-me
         lib.fe-util/keep-me
         lib.field/keep-me
         metabase.lib.field.util/keep-me
         lib.filter.update/keep-me
         metabase.lib.filter.desugar/keep-me
         metabase.lib.filter.negate/keep-me
         metabase.lib.filter.simplify-compound/keep-me
         lib.filter/keep-me
         lib.join/keep-me
         metabase.lib.join.util/keep-me
         lib.limit/keep-me
         metabase.lib.metadata/keep-me
         lib.metadata.calculation/keep-me
         metabase.lib.metadata.column/keep-me
         lib.metadata.composed-provider/keep-me
         metabase.lib.metadata.protocols/keep-me
         lib.metric/keep-me
         lib.native/keep-me
         lib.normalize/keep-me
         metabase.lib.options/keep-me
         lib.order-by/keep-me
         metabase.lib.parameters/keep-me
         lib.parse/keep-me
         lib.query/keep-me
         lib.query.test-spec/keep-me
         lib.ref/keep-me
         lib.remove-replace/keep-me
         metabase.lib.schema/keep-me
         metabase.lib.schema.util/keep-me
         lib.segment/keep-me
         lib.measure/keep-me
         metabase.lib.serialize/keep-me
         lib.stage/keep-me
         lib.swap/keep-me
         lib.table/keep-me
         lib.template-tags/keep-me
         lib.temporal-bucket/keep-me
         lib.util/keep-me
         metabase.lib.util.unique-name-generator/keep-me
         metabase.lib.walk.util/keep-me)

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
  remove-all-aggregations
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
 [metabase.lib.card
  card->underlying-query
  model-preserved-keys]
 [lib.column-group
  columns-group-columns
  group-columns]
 [lib.common
  external-op]
 [lib.convert
  ->legacy-MBQL
  ->pMBQL
  legacy-default-join-alias
  without-cleaning]
 [metabase.lib.convert.metadata-to-legacy
  lib-metadata-column->legacy-metadata-column
  lib-metadata-column-key->legacy-metadata-column-key]
 [lib.database
  database-id]
 [metabase.lib.dispatch
  dispatch-value]
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
  collate
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
 [metabase.lib.field.util
  update-keys-for-col-from-previous-stage]
 [lib.filter
  add-filter-to-stage
  filter
  filters
  filterable-columns
  filter-parts
  describe-filter-operator
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
 [metabase.lib.filter.desugar
  desugar-filter-clause]
 [metabase.lib.filter.negate
  negate-boolean-expression]
 [metabase.lib.filter.simplify-compound
  simplify-compound-filter
  simplify-filters]
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
  join-fields-to-add-to-parent-stage
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
  disable-default-limit
  limit
  max-rows-limit]
 [metabase.lib.metadata
  ->metadata-provider
  general-cached-value]
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
 [metabase.lib.metadata.column
  column-unique-key
  column-with-unique-key]
 [lib.metadata.composed-provider
  composed-metadata-provider]
 [metabase.lib.metadata.protocols
  cached-metadata-provider-with-cache?
  metadata-provider?
  metadata-providerable?]
 [lib.native
  add-parameters-for-template-tags
  engine
  extract-template-tags
  fully-parameterized-query?
  has-template-tag-variables?
  has-write-permission
  native-extras
  native-query
  raw-native-query
  recognize-template-tags
  required-native-extras
  native-query-card-ids
  native-query-snippet-ids
  native-query-table-references
  template-tags-referenced-cards
  template-tags
  with-different-database
  with-native-extras
  with-native-query
  with-template-tags]
 [metabase.lib.options
  ensure-uuid
  options
  update-options]
 [lib.order-by
  change-direction
  order-by
  order-by-clause
  order-bys
  orderable-columns]
 [lib.normalize
  normalize
  ->normalized-stage-metadata]
 [metabase.lib.page
  current-page
  with-page]
 [metabase.lib.parameters
  parameter-target-dimension-options
  parameter-target-expression-name
  parameter-target-expression-options
  parameter-target-expression-ref
  parameter-target-field-id
  parameter-target-field-name
  parameter-target-field-options
  parameter-target-field-ref
  parameter-target-is-dimension?
  parameter-target-template-tag-name
  update-parameter-target-dimension-options]
 [lib.parameters.parse
  match-and-normalize-tag-name]
 [lib.parse
  parse]
 [lib.query
  ->query
  can-preview
  can-run
  can-save
  check-card-overwrite
  preview-query
  query
  query-from-legacy-inner-query
  stage-count
  uses-metric?
  uses-segment?
  with-different-table
  with-wrapped-native-query
  wrap-native-query-with-mbql]
 [lib.query.test-spec
  test-native-query
  test-query]
 [lib.ref
  field-ref-id
  field-ref-name
  ref]
 [lib.remove-replace
  remove-clause
  remove-join
  rename-join
  replace-clause
  replace-join]
 [metabase.lib.schema
  native-only-query?]
 [metabase.lib.schema.util
  remove-lib-uuids]
 [lib.segment
  available-segments
  check-segment-overwrite]
 [lib.measure
  available-measures
  check-measure-cycles
  check-measure-overwrite]
 [metabase.lib.serialize
  prepare-for-serialization]
 [lib.stage
  append-stage
  drop-stage
  drop-empty-stages
  ensure-filter-stage
  has-clauses?]
 [lib.swap
  swap-clauses]
 [lib.template-tags
  template-tags->card-ids
  template-tags->snippet-ids]
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
  clause?
  clause-of-type?
  fresh-uuids
  mbql-stage?
  native-stage?
  normalized-query-type
  normalized-mbql-version
  previous-stage
  previous-stage-number
  query-stage
  source-table-id
  source-card-id
  update-query-stage]
 [metabase.lib.util.unique-name-generator
  non-truncating-unique-name-generator
  truncate-alias
  unique-name-generator
  unique-name-generator-with-options]
 [lib.validate
  duplicate-column-error
  find-bad-refs
  find-bad-refs-with-source
  missing-column-error
  missing-table-alias-error
  syntax-error
  validation-exception-error]
 [metabase.lib.walk.util
  all-field-ids
  all-implicitly-joined-field-ids
  all-implicitly-joined-table-ids
  all-measure-ids
  all-segment-ids
  all-source-card-ids
  all-source-table-ids
  all-template-tag-field-ids
  all-template-tag-snippet-ids
  all-template-tags
  all-template-tags-map
  all-template-tags-id->field-ids
  any-native-stage?
  any-native-stage-not-introduced-by-sandbox?])
