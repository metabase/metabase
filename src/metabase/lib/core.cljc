(ns metabase.lib.core
  "Exported interface for MBQL lib (formerly \"MLv2\").

  This namespace re-exports or wraps all the functions which are intentionally exported for use outside of
  `metabase.lib.*`. If you need something that this namespace doesn't provide, ask the Querying Platform team.

  ## Purpose

  This library exists to encapsulate the myriad details it takes to work with MBQL *correctly*. Queries are plain
  Clojure data structures, but they should not be directly read or modified outside of this library. It's too easy to
  introduce a bug by missing cases (*oops, I only handled `:field` refs and not `:expression` refs*), creating malformed
  MBQL, or making inconsistent edits.

  ## Terminology

  Clarifying some terminology that's used with care in these docs:

  - **query** refers to both MBQL and native queries.
  - **column** refers to any column in a query
      - **field** is the subset of columns which come directly from a table in the user's DWH
  - **metadata** is a map of information about a table, card, measure, segment, or *column*.
      - **Column metadata** is by far the most significant kind of metadata; much of the lib is concerned with this.
  - **clause** refers to a fragment of MBQL, describing e.g. and aggregation, breakout, join, etc.
      - Most clauses take the form of a vector like this: `[:operator-keyword {:options :map} ,,,]`.
  - **ref** means a reference to a column. Much of the lib is concerned with these.
      - We sometimes call these \"field refs\", since they're often represented as a `[:field ...]` clause, but that's
        too specific - `:field` clauses come in several flavours, and there are `:expression` and `:aggregation` refs.
      - *Refs are a code smell.* They are an internal detail of MBQL structures and it would be better if they had not
        leaked out of the lib so extensively that they're a major part of the API surface.

  ## Code health

  This API surface grew haphazardly, and there's a pile of functions exported from here that should not be. Rather than
  try to fix everything up front, we document the *health* of each exported function in its docstring, to guide usage.

  - **Healthy:** No issues; use these functions without concern.
  - **Smelly:** This function isn't going away, but it needs cleanup or improvement. Perhaps it's badly named, or
    somewhat duplicated.
  - **Single use:** Exists to support a specific use case; new calls should be avoided. Ask via code review if you have
    a legitimate use. In time Kondo will flag these as discouraged.
  - **Leak:** This function is legitimate internally, but it should not have been exported. Avoid new calls; remove
    existing calls when practical. Will be unexported when there are no callers left. Docstrings should suggest an
    alternative to calling these functions.
  - **Deprecated:** Stronger than Leak - the function should be removed altogether, not just unexported."
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
   [metabase.lib.metadata.result-metadata]
   [metabase.lib.metric :as lib.metric]
   [metabase.lib.native :as lib.native]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.page]
   [metabase.lib.parameters]
   [metabase.lib.parameters.parse :as lib.parameters.parse]
   [metabase.lib.parse :as lib.parse]
   [metabase.lib.query :as lib.query]
   [metabase.lib.query.test-spec :as lib.query.test-spec]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
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
   [metabase.util.malli :as mu]
   [metabase.util.namespaces :as shared.ns]))

;;; # Principle: Stages
;;; Queries have 1 or more **stages**. Each stage roughly corresponds to a SQL `SELECT`'s several parts:
;;;
;;; - A primary **source** - for stage 0 this is a table or card; for later stages it's implicitly "the previous stage".
;;; - Explicit **joins**, which add new sources and their columns to the query
;;; - **Expressions** (or "custom columns" in the UI) which compute a new column from other columns
;;; - **Filters** are boolean expressions, implicitly `AND`ed together to filter the rows of a query
;;; - **Aggregations** and **breakouts** together form a _summary_ step
;;;   - Breakouts generate SQL `GROUP BY`s; they divide the rows into groups which have all breakout values in common.
;;;   - Aggregations compute a single value from a set of rows - `COUNT`, `SUM(some_column)`, etc.
;;; - **Order by** controls the order of output rows, either ascending or descending
;;;   - Leftmost is the most significant, the others are cascading tiebreakers (like SQL `ORDER BY`)
;;;   - For an aggregated query, these refer to the *breakouts and aggregations*, not to input columns.
;;; - **Limit** restricts the number of rows returned from the stage
;;; - **Fields** lists allow a query to return only a subset of the available columns.
;;;   - In the UI, this is the drop-down list on each source that lets you choose a subset of the columns.
;;;   - For a summarized query, you can't choose a subset: all breakouts and aggregations are always returned.
;;;
;;; Inside the lib, stages are addressed by **stage number**. Stages are numbered 0, 1, 2, etc. Negative numbers
;;; count backwards, in the style of Python indexes: **-1 is the last stage**.
;;;
;;; Since the last stage is by far the most common target, many lib functions have an arity which omits the
;;; `stage-number`. It defaults to `-1`, ie. the last stage.
;;;
;;; Note that in the Notebook UI, you cannot arbitrarily add extra stages. The UI only adds stages when necessary,
;;; such as when adding a pre-aggregation operation like an expression or filter *after* the summary step. The lib
;;; is more flexible: **stages can be nested arbitrarily**, and can even be empty.
;;;
;;; # Principle: Implicit joins
;;; MBQL queries support _implicit joins_. These are offered in the UI when picking a column for e.g. a filter.
;;; There is a group of columns for each *foreign key* column that's in scope. Each group contains the columns of the
;;; target table of the FK. The groups are named after the FK, rather than the table - that's important if there are
;;; multiple FKs to the same table, consider Github issues which have `reporter` and `assignee`, both FKs to users but
;;; with a very different meaning.
;;;
;;; Of course databases don't support implicit joins, so the QP constructs explicit join clauses for them transparently.
;;;
;;; Implicit joins are only currently supported where the target is a Field on a Table, not for columns generally.
;;; There's some support for the FK to come from a model and target a Field, but it isn't a first class use case.
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
         metabase.lib.metadata.result-metadata/keep-me
         lib.metric/keep-me
         lib.native/keep-me
         lib.normalize/keep-me
         lib.options/keep-me
         lib.order-by/keep-me
         metabase.lib.parameters/keep-me
         lib.parse/keep-me
         lib.query/keep-me
         lib.query.test-spec/keep-me
         lib.ref/keep-me
         lib.remove-replace/keep-me
         lib.schema/keep-me
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

;;; # Core APIs for building queries
;;; These are the heart of the Lib API: adding clauses to queries, getting a list of clauses on a stage, removing
;;; and replacing clauses, and getting lists of columns.

;;; For each part of a query - joins, expressions, aggregations, etc. - the lib has a set of functions that follow
;;; a naming convention:
;;;
;;; - Adding something new uses an imperative verb
;;;   - `filter`, `aggregate`, `breakout`, `join`, `expression`, etc.
;;; - Getting the list of current ones (on a stage) is a plural noun
;;;   - `filters`, `aggregations`, `expressions`, etc.
;;; - The relevant list of columns can be fetched with `fooable-columns`
;;;   - `expressionable-columns`, `filterable-columns`, `orderable-columns`
;;;
;;; There is no corresponding verb to delete or update a clause; instead there generic `remove-clause` and
;;; `replace-clause`.

;;; ## Expressions
;;; Expressions are written as spreadsheet-like formulas in the Notebook UI, and given an arbitrary *name* by the user.
;;; The spreadsheet formula is parsed to a tree of `[:operator {} args...]` clauses, where the args can be nested
;;; operators, references to columns, and constants.

(mu/defn expression :- ::lib.schema/query
  "Appends a new expression to the specified stage of `a-query`. The `expression-name` is a required parameter.
  The `expressionable` can be a constant, a column, a column ref, or an arbitrarily nested tree of clauses.

  The columns which are in scope for an expression can be fetched with [[expressionable-columns]]; see that function
  for details.

  Call this if you already have an `expr-clause` and want to attach it to the query directly. For interop with the
  expression parser and pretty-printer in the Notebook editor, see [[expression-clause]] and [[expression-parts]].

  **Code Health:** Healthy. This is a core API."
  ([a-query expression-name expressionable]
   (expression a-query -1 expression-name expressionable))
  ([a-query         :- ::lib.schema/query
    stage-number    :- [:maybe :int]
    expression-name :- ::lib.schema.common/non-blank-string
    expressionable]
   (lib.expression/expression a-query stage-number expression-name expressionable)))
; TODO: (bshepherdson, 2026-03-03) There's a third arity in `lib.expression/expression` that supports an options map
; but it's a bit "gory details" so it's omitted here. I think it's only called by QP.

(mu/defn expressions :- [:maybe ::lib.schema.expression/expressions]
  "Get the vector of expressions defined on the specified stage of `a-query`, or `nil` if there are no expressions.

  The expressions are represented as possibly nested clauses, the same as can be passed to [[expression]] when creating
  a new expression.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (expressions a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- [:maybe :int]]
   (lib.expression/expressions a-query stage-number)))

(mu/defn expressionable-columns :- [:sequential ::lib.schema.metadata/column]
  "Returns column metadata for all the columns that can be used in expressions at the target stage of `a-query`.

  The `expression-position` is needed because *earlier* expressions are visible to *later* expressions. This should
  be the index of an expression being edited, or nil if adding a new expression at the end.

  Columns in scope for an expression:

  1. Columns from the stage's primary source
  2. Columns from all explicit joins
  3. All earlier expressions on this stage, ie. those with a lower `expression-position`.
  4. All columns which are *implicitly joinable* through any FK in the above.

  **Code Health:** Healthy. This is a core API."
  ([a-query expression-position] (expressionable-columns a-query -1 expression-position))
  ([a-query             :- ::lib.schema/query
    stage-number        :- [:maybe :int]
    expression-position :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]]
   (lib.expression/expressionable-columns a-query stage-number expression-position)))

(mu/defn expressions-metadata :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Similar to [[expressions]], but it returns the column metadata for the *output* columns of each expression on the
  stage, rather than the clauses which *define* those expressions.

  **Code Health:** Leak. Expression columns are properly included in e.g. [[filterable-columns]]; there should not be
  cause to care about the expression columns specifically outside of Lib."
  ([a-query] (expressions-metadata a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- [:maybe :int]]
   (lib.expression/expressions-metadata a-query stage-number)))

(mu/defn expression-ref :- :mbql.clause/expression
  "Given `a-query` and an `expression-name`, look up the corresponding expression in the target stage and return a ref
  to it.

  **Code Health:** Deprecated. This is a test helper that crept into the public API."
  ([a-query expression-name] (expression-ref a-query -1 expression-name))
  ([a-query         :- ::lib.schema/query
    stage-number    :- [:maybe :int]
    expression-name :- ::lib.schema.common/non-blank-string]
   (lib.expression/expression-ref a-query stage-number expression-name)))

(mu/defn with-expression-name :- ::lib.schema.expression/expression
  "Given `an-expression-clause`, returns an updated version of it with its expression name set to `new-name`.
  By *expression name* is meant the user-provided name at the bottom of the editor the user sees for an expression or
  custom aggregation.

  The provided clause can be either an expression or aggregation. For aggregations, this sets the `:display-name`
  option.

  **Code Health:** Healthy."
  [an-expression-clause :- ::lib.schema.expression/expression
   new-name :- :string]
  (lib.expression/with-expression-name an-expression-clause new-name))

;; ### Expression Functions
;; These functions are quite generic, so they are re-exported directly. Each of these functions takes a number of
;; arguments and returns an expression clause.
;;
;; **Code Health:** Leak. Nearly all of these are only used in tests and should Move to a test helper namespace.
(shared.ns/import-fns
 [lib.expression
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
  float])

;;; # IGNORE ME!
;;; <img src="https://i.redd.it/1b9z1mv805e61.jpg" />
;;; *These are the leftovers which are not properly wrapped in user documentation yet.*
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
  infer-has-field-values ; Single-use
  json-field? ; Single-use
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
 [metabase.lib.metadata.result-metadata
  normalize-result-metadata-column]
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
 [lib.options
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
  native?
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
 [lib.schema
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

#?(:clj
   (defmacro with-card-clean-hook
     "Arranges for `hook-fn` to be called during `lib.convert`'s query cleaning process, and executes the `body`
     as with [[do]].

     The `hook-fn` will be called whenever [[lib.convert/clean]] makes material changes to the query, with
     `(hook-fn pre-cleaning-query post-cleaning-query)`."
     [hook-fn & body]
     `(binding [lib.convert/*card-clean-hook* ~hook-fn]
        ~@body)))

(mu/defn primary-source-table-id :- [:maybe ::lib.schema.id/table]
  "If the first stage of `a-query` is an MBQL stage with a `:source-table`, return that table ID. For a native stage or
  a `:source-card`, returns nil.

  Prefer [[primary-source-table]] instead, when you want the `:metadata/table` rather than just its ID.

  **DO NOT** use this for permissions - this is only the *primary* source, not a complete list of table IDs required
  by `a-query`.

  **Code Health:** Discouraged; there are few legitimate use cases for working with raw table IDs outside lib."
  [a-query :- ::lib.schema/query]
  (lib.util/source-table-id a-query))

(mu/defn primary-source-card-id :- [:maybe ::lib.schema.id/card]
  "If the first stage of `a-query` is an MBQL stage with a `:source-card`, return that card ID. For a native stage or
  a `:source-table`, returns nil.

  Prefer [[primary-source-card]] instead, when you want the `:metadata/card` rather than just its ID.

  **DO NOT** use this for permissions - this is only the *primary* source, not a complete list of card IDs required
  by `a-query`.

  **Code Health:** Discouraged; there are few legitimate use cases for working with raw card IDs outside lib."
  [a-query :- ::lib.schema/query]
  (lib.util/source-card-id a-query))

(mu/defn display-name-without-id :- :string
  "Given a display name like `\"Something ID\"`, remove the \"ID\" portion and trim whitespace.

  Useful to turn a FK field's name into a pseudo table name, when doing an implicit join.

  **Code Health:** Healthy."
  [field-display-name :- :string]
  (lib.util/strip-id field-display-name))

(mu/defn ignore-case :- ::lib.schema.expression/boolean
  "Given a boolean expression on strings, sets the options to ignore case.

  Prefer this over setting the `:case-sensitive false` option directly."
  [boolean-expression :- ::lib.schema.expression/boolean]
  (lib.options/update-options boolean-expression assoc :case-sensitive false))
