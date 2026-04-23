(ns metabase.lib.core
  "Exported interface for MBQL lib (formerly \"MLv2\").

  This namespace re-exports or wraps all the functions which are intentionally exported for use outside of
  `metabase.lib.*`. If you need something that this namespace doesn't provide, ask the Querying Platform team.

  ## Purpose

  This library exists to encapsulate the myriad details it takes to work with MBQL *correctly*. Queries are plain
  Clojure data structures, but they should not be directly read or modified outside of this library. It's too easy to
  introduce a bug by missing cases (*oops, I only handled `:field` refs and not `:expression` refs*), creating malformed
  MBQL, or making inconsistent edits.

  ### Guiding Principles

  - MBQL created by the lib is always correctly structured.
  - Attempting to construct an invalid query is rejected with errors.
  - Focus on high-level, meaningful functions that return a consistent query.
      - E.g. \"remove this expression\" includes a cascading delete of all clauses that referenced it, transitively.

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
   [metabase.lib.join.util :as lib.join.util]
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
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
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
;;;   - Breakouts generate SQL `GROUP BY`s and `ORDER BY`s; they divide the rows into groups which have all breakout
;;;     values in common.
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
         lib.join.util/keep-me
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
;;; - Adding something new uses an imperative verb (usually):
;;;   - `filter`, `aggregate`, `breakout`, `join`, `order-by`, etc.
;;;   - `expression` breaks the pattern
;;; - Getting the list of current ones (on a stage) is a plural noun
;;;   - `filters`, `aggregations`, `expressions`, etc.
;;; - The relevant list of columns can be fetched with `fooable-columns`
;;;   - `expressionable-columns`, `filterable-columns`, `orderable-columns`
;;;
;;; There is no corresponding verb to delete or update a clause; instead the generic `remove-clause` and
;;; `replace-clause` functions are provided.

;;; ## Expressions
;;; Expressions are written as formulas in the Notebook UI, and given an arbitrary *name* by the user.
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
    expression-position :- [:maybe nat-int?]]
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

;;; ## Aggregations
;;; Aggregations are either "canned" aggregate functions like `Count`, `Sum` and `Max`, or a custom expression written
;;; by the user in the same expression editor as is used for expressions. The only columns in scope for custom
;;; aggregations are the breakouts and any aggregations to the left.
;;;
;;; Aggregations define new columns, which can be referenced by any custom aggregations to its right, in an Order By, or
;;; in later stages of the query.
;;;
;;; The canned aggregations come in four varieties:
;;;
;;; - No args: `count` and `distinct`
;;; - Single column: `sum`, `avg`, `max`, etc.
;;; - Single filter: `count-where` and `distinct-where`
;;; - Column and filter: `sum-where`
;;;
;;; ### Measures and Metrics
;;; Measures are effectively *saved aggregations*, defined outside of a query. They can be referenced as an aggregation
;;; on a query which has a source compatible with the measure's source.
;;;
;;; Semantically, referencing a measure is identical to pasting its definition into the query.
;;;
;;; The (deprecated?) Metrics v2 can be used similarly, though they allow several things that measures don't, such as
;;; embedding a filter.

(mu/defn aggregate :- ::lib.schema/query
  "Adds the given `aggregable` to the target stage of `a-query` as its rightmost aggregation.

  Valid `aggregable`s are:

  - Canned aggregation clauses like [[count]]
  - A `::lib.schema.common/external-op` AST from the custom aggregation editor
  - A measure
  - A (v2) metric

  **Code Health:** Healthy. This is a core API."
  ([a-query aggregable]
   (aggregate a-query -1 aggregable))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    aggregable   :- ::lib.aggregation/aggregable]
   (lib.aggregation/aggregate a-query stage-number aggregable)))

(mu/defn aggregations :- [:maybe [:sequential ::lib.schema.aggregation/aggregation]]
  "Returns the list of aggregation definitions on the target stage of `a-query`, or nil if there are none."
  ([a-query] (aggregations a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.aggregation/aggregations a-query stage-number)))

(mu/defn aggregable-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Returns the columns which are in scope for a custom aggregation expression.

  Takes `aggregation-position`, which is the index of the \"current\" aggregation while editing an existing aggregation,
  and nil when adding a new one.

  The columns in scope for an aggregation expression are:

  1. Any breakouts on this stage
  2. Any aggregations on this stage whose position is less than `aggregation-position`; all of them if it's nil.
  3. Any pre-aggregation columns (from the source, joins, or expressions)
     - **But** these are only legal when wrapped in an aggregation like `sum([Some Column])`.

  To illustrate, a custom expression can do top-level arithmetic on other aggregations like

      Unit Price = [Sum of Subtotal] / [Sum of Quantity]

  or directly aggregate pre-aggregation columns like

      Unit Price = sum([Subtotal]) / sum([Quantity])

  **Code Health:** Single use. This mainly exists for the custom editor in the UI.
  Prefer [[available-aggregation-operators]] and [[aggregation-operator-columns]] for more \"structured\" usages."
  ([a-query aggregation-position]
   (aggregable-columns a-query -1 aggregation-position))
  ([a-query              :- ::lib.schema/query
    stage-number         :- :int
    aggregation-position :- [:maybe nat-int?]]
   (lib.aggregation/aggregable-columns a-query stage-number aggregation-position)))

(mu/defn aggregation-operator-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Given an `aggregation-operator` map from [[available-aggregation-operators]], this returns the metadata of all
  available columns to which that operator can legally be applied.

  For aggregations which don't take an input column, like `:count`, this returns nil.

  **Code Health:** Healthy."
  [aggregation-operator :- ::lib.aggregation/operator-with-columns]
  (lib.aggregation/aggregation-operator-columns aggregation-operator))

(mu/defn available-aggregation-operators :- [:maybe [:sequential ::lib.aggregation/operator-with-columns]]
  "Returns a map for each aggregation operator (`:count`, `:sum`, etc.) which can plausibly be applied to the target
  stage of `a-query`. This takes into account the operators the database engine can support, and omits any operators
  that require an input column when no suitable inputs are available.

  **Code Health:** Healthy. This is the correct way to determine the valid set of aggregation operators."
  ([a-query] (available-aggregation-operators a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.aggregation/available-aggregation-operators a-query stage-number)))

(mu/defn remove-all-aggregations :- ::lib.schema/query
  "Removes all aggregations from the target stage of `a-query`.

  **Code Health:** Healthy, though it's an unusual thing to do."
  ([a-query] (remove-all-aggregations a-query -1))
  ([a-query :- ::lib.schema/query
    stage-number :- :int]
   (lib.aggregation/remove-all-aggregations a-query stage-number)))

(mu/defn selected-aggregation-operators :- [:maybe [:sequential ::lib.aggregation/selected-operator-with-columns]]
  "Given the aggregation operator maps from [[available-aggregation-operators]], and a particular `agg-clause`, mark
  both the operator map and the selected column (if applicable) with `:selected? true`.

  This is useful when editing an aggregation to indicate its current settings.

  **Code Health:** Healthy. Mostly exists to support the UI, but it would be legitimate to add new calls."
  [agg-operators :- [:maybe [:sequential ::lib.aggregation/operator-with-columns]]
   agg-clause :- ::lib.schema.aggregation/aggregation]
  (lib.aggregation/selected-aggregation-operators agg-operators agg-clause))

(mu/defn aggregation-ref :- :mbql.clause/aggregation
  "Given the index of an aggregation in the [[aggregations]] of the target stage, return an `:aggregation` reference
  for use **within that stage**.

  This is useful for adding an [[order-by]] clause, since [[aggregations]] returns aggregation *definitions*, but
  [[order-by]] needs aggregation references."
  ([a-query agg-index]
   (aggregation-ref a-query -1 agg-index))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    agg-index    :- nat-int?]
   (lib.aggregation/aggregation-ref a-query stage-number agg-index)))

;;; These functions all directly construct an aggregation clause suitable for passing to [[aggregate]], taking
;;; input column and/or filter clauses as arguments, depending on the operator.
;;;
;;; **Code Health:** Healthy. Mainly used in tests, but any case where a known query is being constructed
;;; programatically is valid. UIs should generally be using [[available-aggregation-operators]] instead.
(shared.ns/import-fns
 [lib.aggregation
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
  cum-sum])

;;; **Code Health:** Leak. These helpers are only used in tests and should be avoided. To be unexported soon.
(shared.ns/import-fns
 [lib.aggregation
  aggregation-clause
  aggregations-metadata])

;;; ## Breakouts
;;; Breakouts (equivalent to SQL `GROUP BY`) divide the rows into 1 or more subsets of rows, where each set has the
;;; same values for all the breakouts.
;;;
;;; Each breakout implicitly adds an Order By (ascending), in the same order as the breakouts. However, if the user
;;; explicitly adds an Order By for the breakout column(s), then the order and direction (asc/desc) is preserved.
;;;
;;; Breakouts must be unique within the stage. That means there can be at most 1 breakout per input column, with one
;;; exception: a temporal column can have multiple breakouts with different units.
;;;
;;; Finally, note that it's legal (though unusual) to create a query with breakouts but no aggregations. The results
;;; are equivalent to `SELECT DISTINCT breakouts... FROM ... ORDER BY breakouts...`, ie. sorting and de-duplicating
;;; by the breakouts.

(mu/defn breakout :- ::lib.schema/query
  "Add a breakout on the provided column to the target stage of `a-query`.

  Silently does nothing if the requested breakout already exists. Multiple breakouts of a temporal column are allowed
  provided they all set different `:temporal-unit`s.

  **Code Health:** Healthy. This is a core API."
  ([a-query expr] (breakout a-query -1 expr))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    expr         :- some?]
   (lib.breakout/breakout a-query stage-number expr)))

(mu/defn breakouts :- [:maybe [:sequential ::lib.schema.expression/expression]]
  "Returns the list of breakouts on the target stage of `a-query`, or nil if there are none.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (breakouts a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.breakout/breakouts a-query stage-number)))

(mu/defn breakout-column :- ::lib.schema.metadata/column
  "Given `a-query` and a breakout `clause` as returned by [[breakouts]], returns the column metadata for this
  breakout column.

  Strictly speaking a breakout column should be distinct from its input column; in practice their metadata is identical
  except that the breakout column has the `:temporal-unit` or `:binning` specified from the breakout clause.

  **Code Health:** Healthy."
  ([a-query breakout-clause] (breakout-column a-query -1 breakout-clause))
  ([a-query         :- ::lib.schema/query
    stage-number    :- :int
    breakout-clause :- ::lib.schema.ref/ref]
   (lib.breakout/breakout-column a-query stage-number breakout-clause)))

(mu/defn breakoutable-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Returns column metadata for all the columns on the target stage of `a-query` which could be used for a breakout.

  The columns can be used for a breakout are, in this order:

  1. Columns from the *source* - a table, card or previous stage.
  2. *Expressions* in this stage of the query are allowed.
  3. Columns from explicit joins on this stage.
  4. All columns which are *implicitly joinable* via any FKs in the above.

  **Code Health:** Healthy. This is a core API."
  ([a-query :- ::lib.schema/query] (breakoutable-columns a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.breakout/breakoutable-columns a-query stage-number)))

(mu/defn remove-all-breakouts :- ::lib.schema/query
  "Removes all breakouts (if any) from the target stage of `a-query`.

  The removal is done properly per [[remove-clause]], so any references to the deleted breakouts will also be deleted.

  **Code Health:** Healthy."
  ([a-query] (remove-all-breakouts a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.breakout/remove-all-breakouts a-query stage-number)))

;;; **Code Health:** Leak. These functions are only used in friends and tests, and should be avoided. To be unexported.
(shared.ns/import-fns
 [lib.breakout
  breakouts-metadata])

;;; ## Filters
;;; Filters are boolean expressions based on a row of a query. A stage of a query only returns (or aggregates) those
;;; rows for which the filters are `true`. They correspond to a SQL `WHERE` clause, of course.
;;;
;;; MBQL has a list of filter expressions, and they are implicitly `AND`ed together. The order of filters does not
;;; matter.
;;;
;;; Note that filters are *pre-aggregation* within their stage. If you want to filter based on the results of an
;;; aggregation, such a showing only those months with 1000+ orders, you need to [[append-stage]] and add the filter
;;; to the stage *after* the aggregations. (SQL has the `HAVING` clause for this, but there's no equivalent in MBQL.)

(mu/defn filter :- ::lib.schema/query
  "Adds the given `boolean-expression` to the target stage of `a-query`.

  If `boolean-expression` is an exact duplicate of an existing filter, this silently does nothing.

  **Code Health:** Healthy. This is a core API."
  ([a-query boolean-expression] (filter a-query -1 boolean-expression))
  ([a-query            :- ::lib.schema/query
    stage-number       :- :int
    boolean-expression :- some?]
   (lib.filter/filter a-query stage-number boolean-expression)))

(mu/defn filters :- [:maybe [:ref ::lib.schema/filters]]
  "Returns the list of filters on the target stage of `a-query`, or nil if there are none.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (filters a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.filter/filters a-query stage-number)))

(mu/defn filterable-columns :- [:maybe [:sequential ::lib.schema.metadata/column]]
  "Returns column metadata for all the columns that could be used for filtering on the target stage of `a-query`.

  The columns which can be used for filters are, in this order:

  1. Columns from the *source* - a table, a card or the previous stage.
  2. *Expressions* on this stage of the query.
  3. Columns from explicit joins on this stage.
  4. Columns which can be *implicitly joined* via any FKs in the above columns.

  Supports an optional third argument `options`, which can have these options:

  - `:include-sensitive-fields? true` will return fields with `:visibility-type :sensitive`. (Default false.)"
  ([a-query] (filterable-columns a-query -1))
  ([a-query stage-number] (filterable-columns a-query stage-number nil))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    options      :- [:maybe [:map [:include-sensitive-fields? :boolean]]]]
   (lib.filter/filterable-columns a-query stage-number options)))

;;; ### Building filters in code
;;; These functions build filter clauses in code. They're mainly used in tests, but they are a legitimate public API
;;; to use from production code too.
;;;
;;; **Code Health:** Healthy. However, UIs should generally be using [[filter-parts]] and [[string-filter-clause]]
;;; instead of calling these.
(shared.ns/import-fns
 [lib.filter
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
  segment]) ; TODO: Move segment to sit with the `lib.segment` functions.

;;; ## Joins
;;; Joins, often referred to as "explicit joins" to distinguish them from *implicit joins*, combine the source query
;;; (the "left-hand side" or LHS) with a new source or subquery (the "right-hand side" or RHS).
;;;
;;; The columns of the RHS are added to those of the LHS. Combining the data rows is more complicated, and depends
;;; on the *strategy* and *conditions*. Metabase supports four join strategies:
;;;
;;; - `:left-join` (the default) is a left outer join
;;; - `:right-join` is a right outer join
;;; - `:full-join` is a full outer join, the union of `:left-join` and `:right-join`
;;; - `:inner-join` is an inner join, returning exactly the intersection without `NULL`s
;;; - *Cross joins*, with one row for every pair of LHS and RHS rows regardless of the conditions, are not supported.
;;;
;;; Join *conditions* are similar to top-level filters, but there are three differences. First, only a handful of
;;; operators are supported. Second, there are no literals - the first argument is always a LHS column and the second
;;; always a RHS column. Third, one or both of those columns can have **temporal bucketing** applied before comparison.
;;; This only applies to the condition; those columns are not bucketed elsewhere in the query.
;;;
;;; ### Aliases
;;; Join *aliases* are stage-unique names for each join. They are not user editable in the current FE, though MBQL's
;;; data model would support it. Aliases are an arbitrary string, and default to the *display name of the RHS* - a
;;; table or card. If the aliases collides with another, it gets disambiguated as `foo_2`, `foo_3`, etc.

(mu/defn join :- ::lib.schema/query
  "Add an explicit join to the target stage of `a-query`.

  The `a-join-or-joinable` can be either a proper join clause as returned by [[join-clause]], or any *joinable*. See
  the docstring for [[join-clause]] for what can be passed in as a *joinable*.

  The new join can be incomplete in several ways; this function populates any missing join parameters with defaults:
  - Strategy defaults to `:left-join`.
  - Join aliases default to the display name of the RHS - the table' or card's display name.
  - Selected fields defaults to `:all` on the join, or nil if the target stage (of `a-query`) has aggregations or
    breakouts.
  - Conditions are complicated. See [[suggested-join-conditions]] for the details.

  The new join is appended as the last on the target stage.

  **Code Health:** Healthy. This is a core API."

  ([a-query a-join-or-joinable] (join a-query -1 a-join-or-joinable))
  ([a-query :- ::lib.schema/query
    stage-number :- :int
    a-join-or-joinable :- [:or ::lib.join.util/partial-join ::lib.join/joinable]]
   (lib.join/join a-query stage-number a-join-or-joinable)))

(mu/defn join-clause :- ::lib.join.util/partial-join
  "Construct a join clause from `a-joinable`, which can serve as the RHS of a join. This clause is \"freestanding\";
  it is not part of any particular query.

  The returned clause is also partially populated, since some details (alias, etc.) can't be specified until the clause
  is attached to a query.

  Valid *joinables* include:

  - Table metadata (`lib.metadata/table`)
  - Card metadata (`lib.metadata/card`)
  - Another query (MBQL or native)
  - A join clause - it's an identity function

  There are some optional arguments:

  - `conditions` is a list of boolean expressions or expression editor ASTs; see [[with-join-conditions]].
  - `strategy` is one of the strategy keywords: `:left-join`, `:right-join`, `:inner-join`, or `:full-join`.
      - See also [[available-join-strategies]], since some engines only support certain kinds of joins.

  **Code Health:** Healthy. This is a core API."
  ([a-joinable] (lib.join/join-clause a-joinable))
  ([a-joinable conditions] (lib.join/join-clause a-joinable conditions))
  ([a-joinable conditions strategy] (lib.join/join-clause a-joinable conditions strategy)))

(mu/defn joins :- [:maybe ::lib.schema.join/joins]
  "Return the list of all explicit join clauses on the target stage of `a-query`, or nil if there are none.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (joins a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.join/joins a-query stage-number)))

;;; ### Join Strategies

(mu/defn join-strategy :- ::lib.schema.join/strategy.option
  "Get the strategy (join type) of `a-join-clause`, a complete join clause either under construction with
  [[join-clause]] or returned by [[joins]].

  The return value is a map, not a bare keyword, to support [[display-name]] and similar functions.

  **Code Health:** Healthy. This is a core API."
  [a-join-clause :- ::lib.join.util/partial-join]
  (lib.join/join-strategy a-join-clause))

(mu/defn with-join-strategy :- ::lib.join.util/partial-join
  "Sets the strategy of `a-join-clause` to the provided `strategy`.

  The strategy can be either the raw keyword (e.g. `:left-join`) or a map from [[available-join-strategies]].

  **Code Health:** Healthy. This is a core API."
  [a-join-clause :- ::lib.join.util/partial-join
   strategy      :- [:or ::lib.schema.join/strategy ::lib.schema.join/strategy.option]]
  (lib.join/with-join-strategy a-join-clause strategy))

(mu/defn available-join-strategies :- [:sequential ::lib.schema.join/strategy.option]
  "Get the list of available join strategies for `a-query`.

  This doesn't really depend on the *query*, but on its target *database*, since different (versions of) database
  engines support different kinds of joins.

  The return value is a map, not a bare keyword. This allows the join strategies to answer [[display-name]] and similar
  generic calls. See the schema `::lib.schema.join/strategy.option` for the full details.

  `stage-number` is ignored and deprecated - the stage doesn't affect the possible joins.

  **Code Health:** Healthy with one arg, Deprecated with two args."
  ([a-query :- ::lib.schema/query]
   (lib.join/available-join-strategies a-query))
  ([a-query       :- ::lib.schema/query
    _stage-number :- :int]
   (available-join-strategies a-query)))

;;; ### Join Conditions
;;; Join conditions are a special case of boolean expressions. They differ from [[filters]] in three ways:
;;;
;;; - Only a few operators are supported (mainly `=` and similar)
;;; - First arg is always a column from the LHS (the containing stage), second arg from the RHS.
;;; - The columns can be bucketed by temporal unit, similar to breakouts, but without affecting the original columns.
;;;
;;; There can be multiple join conditions on a single join. The conditions are often based on a foreign key
;;; relationship, but they don't need to be.

(mu/defn join-conditions :- [:maybe ::lib.schema.join/conditions]
  "Returns the list of conditions on `a-join-clause`, either under construction with [[join-clause]] or from [[joins]].
  Nil if there are no conditions.

  **Code Health:** Healthy. This is a core API."
  [a-join-clause :- ::lib.join.util/partial-join]
  (lib.join/join-conditions a-join-clause))

(mu/defn with-join-conditions :- ::lib.join.util/partial-join
  "Replaces the conditions on `a-join` with the provided `conditions`, returning the updated join clause.

  Note that this **does not** update the query `a-join` is attached to! That requires a [[replace-clause]] call.
  For a join clause still under construction, note that `conditions` can also be passed directly to [[join-clause]]
  if that is more convenient.

  The conditions should be a sequence of either MBQL clauses or expression editor ASTs from [[expression-clause]].
  Passing `conditions` as nil will remove the conditions from this join clause.

  **Code Health:** Healthy. This is a core API."
  [a-join :- ::lib.join.util/partial-join
   conditions :- [:maybe [:sequential [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]]]]
  (lib.join/with-join-conditions a-join conditions))

(mu/defn suggested-join-conditions :- [:maybe [:sequential {:min 1} ::lib.schema.expression/boolean]]
  "Given `a-query` and `a-joinable` - the LHS and RHS of a (real or contemplated) join - return a suggested or default
  join condition. See [[join-clause]] for the definition of *joinables*.

  If `position` is provided, only joins at earlier indexes in [[joins]] than `position` are considered as sources of
  the LHS column for the suggested condition. This is necessary when editing a join in the UI. When `position` is nil
  (the default) then all joins on the target stage of `a-query` are considered.

  There are two cases for suggested joins, which are checked in this order:

  - A FK in the LHS points to a PK in the RHS, e.g. joining `Orders` to `Products` on `Orders.PRODUCT_ID`.
  - A FK in the RHS points back at a PK in the LHS, e.g. joining `Products` to `Orders` on `Orders.PRODUCT_ID`.

  When there are several FKs available which could be suggested, the *leftmost* is preferred. So FKs from the main
  source have priority over joined FKs, and earlier joins have priority over later ones. Of course all such FKs are
  *valid* join conditions! But the suggestion needs to pick just one, and it prefer the leftmost.

  If no plausible FK/PK pairs are found, this function returns nil and the join does not get a default condition.

  **Code Health:** Healthy. This is a core API."
  ([a-query a-joinable] (suggested-join-conditions a-query -1 a-joinable))
  ([a-query stage-number a-joinable] (suggested-join-conditions a-query stage-number a-joinable nil))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    a-joinable   :- ::lib.join/join-or-joinable
    position     :- [:maybe :int]]
   (lib.join/suggested-join-conditions a-query stage-number a-joinable position)))

(mu/defn join-condition-lhs-columns :- [:sequential ::lib.schema.metadata/column]
  "Returns the list of column metadata for those columns which can be used as the left-hand-side (source column) in a
  join condition for `a-joinable`.

  This is the LHS counterpart to [[join-condition-rhs-columns]].

  If `a-joinable` is a join clause already attached to the target stage of `a-query`, its own columns will be removed
  from the list, since they cannot be the LHS column.

  - `lhs-expression-or-nil` should be the current LHS column, if any. Then it can be marked as selected in the output.
  - `rhs-expression-or-nil` should be the current RHS column, if any.
      - Theoretically this could be used to return only LHS columns which can be compared with the chosen RHS.
      - In practice, this parameter is *unused* - we don't grok the comparisons different DBs (dis)allow well enough.

  **Code Health:** Healthy. This is the correct way to get the columns for software or a user to pick as the LHS of
  a join condition."
  ([a-query a-joinable lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-lhs-columns a-query -1 a-joinable lhs-expression-or-nil rhs-expression-or-nil))
  ([a-query               :- ::lib.schema/query
    stage-number          :- :int
    a-joinable            :- [:maybe ::lib.join/join-or-joinable]
    lhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]
    rhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]]
   (lib.join/join-condition-lhs-columns a-query stage-number a-joinable lhs-expression-or-nil rhs-expression-or-nil)))

(mu/defn join-condition-rhs-columns :- [:sequential ::lib.schema.metadata/column]
  "Returns the list of column metadata for those columns which can be used as the right-hand-side (joined column) in a
  join condition for `a-joinable`.

  This is the RHS counterpart to [[join-condition-lhs-columns]].

  - `rhs-expression-or-nil` should be the current RHS column, if any. Then it can be marked as selected in the output.
  - `lhs-expression-or-nil` should be the current LHS column, if any.
      - Theoretically this could be used to return only RHS columns which can be compared with the chosen LHS.
      - In practice, this parameter is *unused* - we don't grok the comparisons different DBs (dis)allow well enough.

  **Code Health:** Healthy. This is the correct way to get the columns for software or a user to pick as the RHS of
  a join condition."
  ([a-query a-joinable lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-rhs-columns a-query -1 a-joinable lhs-expression-or-nil rhs-expression-or-nil))
  ([a-query               :- ::lib.schema/query
    stage-number          :- :int
    a-joinable            :- ::lib.join/join-or-joinable
    lhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]
    rhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]]
   (lib.join/join-condition-rhs-columns a-query stage-number a-joinable lhs-expression-or-nil rhs-expression-or-nil)))

(mu/defn join-condition-operators :- [:sequential ::lib.schema.join/condition.operator]
  "Return a sequence of filter clause operators that are valid for use in a join condition.

  The `lhs-expression-or-nil` and `rhs-expression-or-nil` parameters should be set to the LHS and RHS columns for this
  join condition, if already set. (See [[join-condition-lhs-columns]] and [[join-condition-rhs-columns]] for details.)
  However, this inputs are **currently ignored** because we do not grok what operators can be used for what column types
  on a given database well enough to get it right. See #31174.

  The returned operators are maps, so that they can support [[display-name]] etc.

  **Code Health:** Healthy."
  ([a-query lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-operators a-query -1 lhs-expression-or-nil rhs-expression-or-nil))
  ([a-query               :- ::lib.schema/query
    stage-number          :- :int
    lhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]
    rhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]]
   (lib.join/join-condition-operators a-query stage-number lhs-expression-or-nil rhs-expression-or-nil)))

(mu/defn join-condition-update-temporal-bucketing :- ::lib.schema.expression/boolean
  "Given a provided `join-condition` clause, and the context of `a-query` and target stage, adjusts the temporal
  bucketing of the columns in this condition and returns the updated condition.

  Note that this **does not** update the query, only return an adjusted condition clause.

  The condition must be a *standard* join condition, of the kind returned by [[suggested-join-conditions]], or this
  function will do nothing. That means the both arguments are simple columns and not subexpressions, constants, etc.

  If either of the columns does not support the requested unit (e.g. bucketing a date by `:hour`) then the bucketing
  of just that column is unchanged.

  Passing an `option-or-unit` of nil will un-set the bucketing of both arguments.

  **Code Health:** Healthy."
  ([a-query join-condition option-or-unit]
   (join-condition-update-temporal-bucketing a-query -1 join-condition option-or-unit))
  ([a-query :- ::lib.schema/query
    stage-number :- :int
    join-condition :- [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]
    option-or-unit :- [:maybe [:or ::lib.schema.temporal-bucketing/option ::lib.schema.temporal-bucketing/unit]]]
   (lib.join/join-condition-update-temporal-bucketing a-query stage-number join-condition option-or-unit)))

;;; ### Join columns and projection
;;; Like a main source, joins support selecting only a subset of fields to return from a query. By default, when a join
;;; clause is added to a query, all its fields are selected. The deselected fields are not returned, but they are not
;;; *hidden* either. You can deselect a field but still use it in a filter or expression on the same stage.

(mu/defn join-fields :- [:maybe ::lib.schema.join/fields]
  "Returns the list of column references for the fields selected on `a-join`, or the keyword `:all`, or nil.

  Nil means unspecified, which means \"none\" for joins. **Note** that this differs from the default on the main source!

  **Code Health:** Healthy. This is a core API."
  [a-join :- ::lib.join.util/partial-join]
  (lib.join/join-fields a-join))

(mu/defn with-join-fields :- ::lib.join.util/partial-join
  "Updates `a-join` to set the fields it should be returning to the provided `fields`.

  `fields` is one of the following:

  - `:all`, to return all the fields
  - `:none`, to confirm that no fields are returned
  - Nil, to remove the fields setting entirely and rely on the default (return nothing)
  - A list of column metadata or references for columns from the RHS of `a-join`.

  To get a list of all columns this join *could* return in order to filter them, see [[join-fieldable-columns]].

  **Code Health:** Healthy. This is a core API."
  {:style/indent [:form]}
  [a-join :- ::lib.join.util/partial-join
   fields :- [:maybe [:or [:enum :all :none] [:sequential some?]]]] ;; TODO: More precise schema.
  (lib.join/with-join-fields a-join fields))

(mu/defn join-fieldable-columns :- ::lib.metadata.calculation/visible-columns
  "Returns the list of column metadata for the columns which are *visible* on the RHS of `a-joinable`, such as a table,
  card or join clause.

  These columns are exactly those which can correctly be passed to [[with-join-fields]]. If `a-joinable` is properly a
  join clause, the columns will be marked with `:selected true`.

  Note that this ignores any [[join-fields]] setting - this is about the visible columns from the RHS, not those which
  are selected to be returned.

  **Code Health:** Healthy. This is a core API."
  ([a-query a-joinable] (join-fieldable-columns a-query -1 a-joinable))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    a-joinable   :- ::lib.join/join-or-joinable]
   (lib.join/joinable-columns a-query stage-number a-joinable)))

;;; ### Display names and aliases

(mu/defn join-lhs-display-name :- ::lib.schema.common/non-blank-string
  "Get the display name to use for the **LHS** of `a-joinable`.

  The RHS gets its display name from the table, card, etc. being joined. But we render the LHS in the UI with a display
  name based on *where the LHS column of the first join condition came from*, if we can determine that safely.

  If we can't determine a good display name for the LHS, this function returns \"Previous results\".

  **Code Health:** Healthy, Single Use. This exists to support UIs, but it's well-defined and safe to call."
  ([a-query a-joinable]
   (join-lhs-display-name a-query a-joinable nil))
  ([a-query a-joinable condition-lhs-expression-or-nil]
   (join-lhs-display-name a-query -1 a-joinable condition-lhs-expression-or-nil))
  ([a-query :- ::lib.schema/query
    stage-number :- :int
    a-joinable :- [:maybe ::lib.join/join-or-joinable]
    condition-lhs-expression-or-nil :- [:maybe [:or ::lib.schema.metadata/column :mbql.clause/field]]]
   (lib.join/join-lhs-display-name a-query stage-number a-joinable condition-lhs-expression-or-nil)))

(mu/defn current-join-alias :- [:maybe ::lib.schema.join/alias]
  "Get the current join alias associated with a `column-or-join`, if it has one.

  **Code Health:** Leak. Join aliases are an internal detail and should not be exported. They're arbitrary and opaque
  on join clauses, and columns should come from lib already linked to their join. Don't roll your own column from
  elsewhere and then set its join alias."
  [field-or-join :- [:or
                     ::lib.schema.metadata/column
                     ::lib.join.util/partial-join
                     [:ref :mbql.clause/field]]]
  (lib.join.util/current-join-alias field-or-join))

(mu/defn with-join-alias :- [:or
                             ::lib.schema.metadata/column
                             ::lib.join.util/partial-join
                             [:ref :mbql.clause/field]]
  "Add **or remove** a specific `join-alias` to `field-or-join`, which must be column metadata, a column ref, or a join
  clause.

  This works on columns and clauses, not on queries. In particular, this won't change any references to a join's columns
  elsewhere in any query. If you want to update a join clause on a query *correctly*, making sure all its columns are
  still referenced correctly, use this function to update the join's alias, then use [[replace-clause]] to correctly
  update the query.

  **Code Health:** Leak. Join aliases should be treated as opaque, unique strings, so there should be no need to set
  them to any particular value on a join clause. For columns, the alias matters, but that should be internal to the lib.
  Users of lib should be getting columns from [[filterable-columns]] et al, not manually setting join aliases on column
  metadata or refs."
  {:style/indent [:form]}
  [field-or-join :- [:or
                     ::lib.schema.metadata/column
                     ::lib.join.util/partial-join
                     [:ref :mbql.clause/field]]
   join-alias    :- [:maybe ::lib.schema.common/non-blank-string]]
  (lib.join/with-join-alias field-or-join join-alias))

;;; **Code Health:** Leak. These helpers are only used from tests and the QP, and should be unexported.
(shared.ns/import-fns
 [lib.join
  join-fields-to-add-to-parent-stage ;; TODO: Unexport this; it's only used from tests and QP.
  raw-join-strategy])                ;; TODO: Unexport this; it's only used from tests.

;;; ## Column selection
;;; These functions control what subset of the available columns are returned from a given stage of a query. This is
;;; the final "step" in a stage - it does not limit what columns are available to use on this stage, only what columns
;;; get returned to the user or passed to the next stage. (This is similar to how `SELECT` clauses work in SQL.)

;;; These functions use the word "fields" since the MBQL clause is the `:fields` list, but this actually conflicts
;;; somewhat with the glossary above. A "field" should be the specific kind of "column" that comes right out of the
;;; user's DWH. We have to live with this inconsistency for now.

;;; Note that if the stage is *summarized* - that is, it contains aggregations, breakouts or both - then any previous
;;; *fields* selection is ignored and functions like `add-field` and `remove-field` become no-ops. A summarized stage
;;; always returns exactly the breakouts in order, followed by the aggregations in order.
;;;
;;; The subset of columns is specified as an **explicit allow-list**: it lists each of the columns to return. There is
;;; no way in present MBQL to say "everything but these two columns".
;;;
;;; The default with no explicit list is to return everything: the columns of the main source, any expressions, and any
;;; explicitly joined columns, in that order. Summarized queries return their breakouts and aggregations. It is not
;;; supported to define an expression and not return it; the expressions are always implicitly returned from
;;; non-summarized queries.

;; TODO: (bshepherdson, 2026-03-11) It's awkward that the split of `:fields` lists between one for the stage and one
;; for each join is exposed to users of lib. However that's represented internally, users should see and update a single
;; list.
(mu/defn fields :- [:maybe [:ref ::lib.schema/fields]]
  "Returns the selected subset of columns on the target stage of `a-query`. If there is no explicit selection applied,
  this returns nil, which should be understood to mean \"the default fields\" and not \"nothing\".

  It is illegal for this to be an empty list.

  This list **does not include joined columns**; each join clause tracks its list of returned columns separately. See
  [[join-fields]].

  This list can be adjusted with (preferably) [[add-field]] and [[remove-field]], or you can fully replace it with
  [[with-fields]]. [[fieldable-columns]] gives the list of columns which are valid to list here.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (fields a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.field/fields a-query stage-number)))

(mu/defn fieldable-columns :- ::lib.metadata.calculation/visible-columns
  "Returns a sequence of column metadata for columns that can be listed as [[fields]] on the target stage of `a-query`.
  These are the fields which are valid to pass to [[add-field]], [[remove-field]] and [[with-fields]].

  These are just the columns of the main source, in practice. Expressions are always returned from a query stage, and
  each join clause has a separate list of columns it should return. (See [[join-fields]] and [[with-join-fields]].)

  Each column returned has a `:selected?` key to indicate whether it is currently selected or not. Note that no explicit
  list is specified, then *all columns* are marked `:selected?`.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (fieldable-columns a-query -1))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int]
   (lib.field/fieldable-columns a-query stage-number)))

(mu/defn add-field :- ::lib.schema/query
  "Adds the given `column` to the explicit list of columns returned from the target stage of `a-query`, **or** the join
  clause the column comes from.

  If adding this field to the list makes it match the default behavior (return everything) then this function will
  remove the explicit list altogether.

  **Code Health:** Healthy. This is a core API."
  [a-query      :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.metadata.calculation/column-metadata-with-source]
  (lib.field/add-field a-query stage-number column))

(mu/defn remove-field :- ::lib.schema/query
  "Removes the given `column` to the explicit list of columns returned from the target stage of `a-query`, **or** the
  join clause the column comes from.

  If an explicit list exists, but this column is not in it, this function does nothing.

  **Code Health:** Healthy. This is a core API."
  [a-query      :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.metadata.calculation/column-metadata-with-source]
  (lib.field/remove-field a-query stage-number column))

;; FIXME: The docstrings in different places are inconsistent about whether expressions are included in the `:fields`
;; lists or not. Figure out what the code really does and make sure the docs are up to date. I would have said that they
;; are included implicitly, but I'm not 100% sure.

(mu/defn with-fields :- ::lib.schema/query
  "Replaces the explicit allow-list of fields on the target stage of `a-query` with the provided `fields-list`. If the
  input list is nil or empty, the explicit allow-list is removed from the stage, which has the effect of making the
  stage return *everything* again.

  **Code Health:** Healthy. This is a core API."
  ([a-query xs] (with-fields a-query -1 xs))
  ([a-query :- ::lib.schema/query
    stage-number :- :int
    xs :- [:maybe [:sequential [:or ::lib.schema.metadata/column ::lib.schema.ref/ref]]]]
   (lib.field/with-fields a-query stage-number xs)))

(shared.ns/import-fns
 [lib.field
  find-visible-column-for-ref
  infer-has-field-values ; Single-use
  json-field? ; Single-use
  ]
 [metabase.lib.field.util
  update-keys-for-col-from-previous-stage])

;;; # Details of columns and metadata
;;; A key part of working with queries is knowing what columns are available to use in clauses at any point in the
;;; query. Functions like [[experssionable-columns]] and [[filterable-columns]] are the main entry points for that.
;;;
;;; This section has some further functions for dealing with query, column, table, and other metadata.
;;;
;;; ## "Visible" and "Returned" columns
;;; MBQL inherits from SQL a distinction between the columns which are *visible* at various points in a query, and
;;; the columns which are *returned* from the query. You can for example write
;;; `SELECT id FROM Orders WHERE subtotal > 100`, which filters on a column that isn't returned. MBQL works the same
;;; way.
;;;
;;; [[filterable-columns]], [[expressionable-columns]], etc. all operate on *visible* columns based on the stage where
;;; we're considering adding a filter/expression/etc.

(mu/defn returned-columns :- [:maybe ::lib.metadata.calculation/returned-columns]
  "Returns a sequence with column metadata for all those columns which are expected to be **returned** from `x`.

  `x` can be anything for which a list of columns makes sense: a table, a card, a stage of a query, an entire query.
  The default for the 1-arity is the last stage of `a-query`. Note that `x` need not be part of `a-query` - when `x`
  is explicitly provided then `a-query` is only used to get a [[MetadataProvider]].

  **NOTE:** The columns returned by this function are relative to how they appear in the source `x`, not in any
  consumer! So the [[returned-columns]] for stage N give the columns as they appear in stage N, not in stage N+1.
  If you want to manipulate stage N+1, call [[filterable-columns]] and friends on stage N+1.

  The gory details of what's different about the columns between all these contexts is out of scope for a lib user.
  Indeed, *hiding* these details is a prime reason that lib exists at all. There are many subtleties that are best
  encapsulated and carefully tested.

  The `options` map controls two settings, which both default to `false`. These are only set to true in specific
  circumstances; generally you won't need to provide either option.

  - `:include-remaps?` to include the target columns for any *remapped* columns. See that section for details.
  - `:include-sensitive-fields?` returns fields the user has marked as *sensitive* in the Admin / Table Metadata screen.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (lib.metadata.calculation/returned-columns a-query))
  ([a-query x] (lib.metadata.calculation/returned-columns a-query x))
  ([a-query stage-number x] (lib.metadata.calculation/returned-columns a-query stage-number x))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    x
    options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
   (lib.metadata.calculation/returned-columns a-query stage-number x options)))

(mu/defn visible-columns :- ::lib.metadata.calculation/visible-columns
  "DEPRECATED. Return a sequence of columns that should be visible within a given stage of a query.

  This includes not just the columns which would be *returned* by the target stage (see [[returned-columns]]) but also
  includes those which can be implicitly joined via FKs visible on this stage.

  The `options` map allows controlling whether several kinds of columns are included: explicitly joined, expressions,
  implicitly joinable, remaps, sensitive fields. See the implementation function for details.

  **Code Health:** Deprecated. Should be unexported, and maybe removed outright. All callers should be calling
  [[filterable-columns]], [[breakoutable-columns]], etc. instead of this. If we really want to keep it, then its options
  should be removed and it should be renamed to better reflect what it returns; perhaps `pre-aggregation-columns`."
  ([a-query] (lib.metadata.calculation/visible-columns a-query))
  ([a-query stage-number] (lib.metadata.calculation/visible-columns a-query stage-number))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    options      :- ::lib.metadata.calculation/visible-columns.options]
   (lib.metadata.calculation/visible-columns a-query stage-number options)))

(mu/defn display-name :- :string
  "Calculate a human-friendly display name for `x`, which can be almost any lib entity.

  `style` can be either `:default` or `:long`. Note that the default is *not* `:default` - it's bound to a `^:dynamic`
  var so the default changes in some different contexts. An explicit `style` passed to `display-name` takes precedence
  over that dynamic var.

  If you pass only `a-query`, the query is also used as `x`.

  **Code Health:** Healthy. This is a core API."
  ([a-query] (display-name a-query a-query))
  ([a-query x] (display-name a-query -1 x))
  ([a-query stage-number x]
   (lib.metadata.calculation/display-name a-query stage-number x))
  ([a-query      :- ::lib.schema/query
    stage-number :- :int
    x
    style        :- ::lib.metadata.calculation/display-name-style]
   (lib.metadata.calculation/display-name a-query stage-number x style)))

;;; **Code Health:** Leak. These functions are only used in tests and modules closely coupled to lib. Don't add new
;;; calls to them.
(shared.ns/import-fns
 [lib.metadata.calculation
  column-name ; Friends and tests only.
  describe-query ; Tests only
  describe-top-level-key ; Used only by the Toucan models for segments and measures.
  display-info ; Tests and FE only, plus one use in lib-metric that could be replaced?
  metadata ; Opened a thread about this one!
  suggested-name ; Single use in a metrics v1 upgrade thing, and some tests.
  type-of ; Unexport: Friends and tests only
  ])

;;; ## Column Remapping
;;; Metabase supports two kinds of "remapping" for displaying more human-readable column values in the UI. From the
;;; lib's point of view these are **mostly invisible**! Logic in the QP adds extra columns with the remapped values,
;;; and the FE prefers using those to render the query. However, these extra columns are "ghosts" that don't appear in
;;; the metadata from e.g. [[returned-columns]] by default.
;;;
;;; - "Internal" remaps are for things like enums. The user writes human labels for each raw value in the admin UI,
;;;   and QP post-processing adds a new column derived from the raw value column.
;;; - "External" remaps are used to show some human-friendly foreign column in place of a number or UUID for an FK.
;;;   For example, rendering `Orders.PRODUCT_ID` as the name of the product, rather than `7`.

;;; # Working with Expressions as an AST
;;; Several parts of the FE want to work with clauses in a "white box" way, so it can render the details of the
;;; expression in a structured way, or convert the AST of the expression parser into an expression, aggregation or
;;; filter.
;;;
;;; That requirement is **directly opposed to one of Lib's primary objectives:** to encapsulate the details of MBQL
;;; queries and clauses.
;;;
;;; The solution to the dilemma is for Lib to publish a separate, non-MBQL syntax for expression ASTs, and to convert
;;; between that and MBQL clauses. That is the purpose of the [[expression-parts]] and [[filter-parts]] systems.
;;;
;;; [[expression-parts]] turns an MBQL expression (or aggregation) clause into an AST built out of nested maps. The
;;; only MBQL inside the AST is that MBQL *refs* are treated as opaque leaf nodes. See [[lib.fe-util/ExpressionParts]]
;;; for details on the schema.
;;;
;;; [[expression-clause]] is the reverse direction: turning an `ExpressionParts` AST into an MBQL clause suitable to
;;; pass to [[expression]] or [[aggregate]].

;;; ## Filter Parts
;;; In a similar vein to [[expression-parts]], [[filter-parts]] breaks down a filter expression to make it consumable
;;; without exposing MBQL internals. Filters are simpler than expressions, since they are never nested and have at most
;;; one column. See [[lib.filter/FilterParts]] for the output format.

(mu/defn filter-parts :- ::lib.filter/filter-parts
  "Exports an opaque MBQL filter clause as a transparent `::lib.filter/filter-parts` map.

  `a-query` and the target stage are required for context, since the output contains complete column metadata.

  See [[describe-filter-operator]] to get a human-readable, translated description of the filter operator keywords.

  **Code Health:** Healthy. This is deliberately public, including the output format."
  ([a-query a-filter-clause] (filter-parts a-query -1 a-filter-clause))
  ([a-query         :- ::lib.schema/query
    stage-number    :- :int
    a-filter-clause :- ::lib.schema.expression/boolean]
   (lib.filter/filter-parts a-query stage-number a-filter-clause)))

(mu/defn describe-filter-operator :- :string
  "Returns a human-readable, translated display name for a filter operation based on the `operator` keyword.
  (For example, the `:operator` field of a [[filter-parts]] map.)

  `variant` is optional, and controls how a few operators are displayed. Valid variants:

  - `:default` (the default, naturally) uses \"Is (not)\", \"Greater than\" and \"Less than\"
  - `:number` uses \"Equal to\" and \"Not equal to\"
  - `:temporal` uses \"After\" and \"Before\" for `:>` and `:<`"
  ([operator] (describe-filter-operator operator :default))
  ([operator :- :keyword ; TODO: (bshepherdson 2026-03-06) This could be more specific, if the list were in a schema.
    variant  :- [:enum :default :number :temporal]]
   (lib.filter/describe-filter-operator operator variant)))

;;; # IGNORE ME!
;;; <img src="https://i.redd.it/1b9z1mv805e61.jpg" />
;;; *These are the leftovers which are not properly wrapped in user documentation yet.*
(shared.ns/import-fns
 [lib.binning
  available-binning-strategies
  binning
  with-binning]
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
  ->mbql5
  legacy-default-join-alias
  with-aggregation-list
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
  parameter-target-stage-number
  parameter-target-template-tag-name
  update-parameter-target-dimension-options
  update-parameter-target-field-ref]
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
  all-referenced-entity-ids
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
