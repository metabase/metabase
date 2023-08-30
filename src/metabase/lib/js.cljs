(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves.

  Note that in JS we've made the decision to make the stage number always be required as an explicit parameter, so we
  DO NOT need to expose the `stage-index = -1` arities of functions below. Generally we probably only need to export
  one arity... see TypeScript wrappers for actual usage."
  (:refer-clojure
   :exclude
   [filter])
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.join :as lib.join]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.stage :as lib.stage]
   [metabase.mbql.js :as mbql.js]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util :as u]
   [metabase.util.log :as log]))

;;; this is mostly to ensure all the relevant namespaces with multimethods impls get loaded.
(comment lib.core/keep-me)

;; TODO: This pattern of "re-export some function and slap a `clj->js` at the end" is going to keep appearing.
;; Generalize the machinery in `metabase.domain-entities.malli` to handle this case, so we get schema-powered automatic
;; conversion for incoming args and outgoing return values. I'm imagining something like
;; `(mu/js-export lib.core/recognize-template-tags)` where that function has a Malli schema and it works like
;; `metabase.shared.util.namespaces/import-fn` plus wrapping it with conversion for all args and the return value.
(defn ^:export extract-template-tags
  "Extract the template tags from a native query's text.

  If the optional map of existing tags previously parsed is given, this will reuse the existing tags where
  they match up with the new one (in particular, it will preserve the UUIDs).

  Given the text of a native query, extract a possibly-empty set of template tag strings from it.

  These look like mustache templates. For variables, we only allow alphanumeric characters, eg. `{{foo}}`.
  For snippets they start with `snippet:`, eg. `{{ snippet: arbitrary text here }}`.
  And for card references either `{{ #123 }}` or with the optional human label `{{ #123-card-title-slug }}`.

  Invalid patterns are simply ignored, so something like `{{&foo!}}` is just disregarded."
  ([query-text] (extract-template-tags query-text {}))
  ([query-text existing-tags]
   (->> existing-tags
        lib.core/->TemplateTags
        (lib.core/extract-template-tags query-text)
        lib.core/TemplateTags->)))

(defn ^:export suggestedName
  "Return a nice description of a query."
  [query]
  (lib.core/suggested-name query))

(defn- pMBQL [query-map]
  (as-> query-map <>
    (js->clj <> :keywordize-keys true)
    (if (:type <>)
      <>
      (assoc <> :type :query))
    (mbql.normalize/normalize <>)
    (convert/->pMBQL <>)))

(defn ^:export metadataProvider
  "Convert metadata to a metadata provider if it is not one already."
  [database-id metadata]
  (if (lib.metadata.protocols/metadata-provider? metadata)
    metadata
    (js.metadata/metadata-provider database-id metadata)))

(defn ^:export query
  "Coerce a plain map `query` to an actual query object that you can use with MLv2."
  [database-id metadata query-map]
  (let [query-map (pMBQL query-map)]
    (log/debugf "query map: %s" (pr-str query-map))
    (lib.core/query (metadataProvider database-id metadata) query-map)))

(defn- fix-namespaced-values
  "This converts namespaced keywords to strings as `\"foo/bar\"`.

  `clj->js` supports overriding how keyword map keys get transformed, but it doesn't let you override how values are
  handled. So this function runs first and turns them into strings.

  As an example of such a value, `(get-in card [:template-tags \"some-tag\" :widget-type])` can be `:date/all-options`."
  [x]
  (cond
    (qualified-keyword? x) (str (namespace x) "/" (name x))
    (map? x)               (update-vals x fix-namespaced-values)
    (sequential? x)        (map fix-namespaced-values x)
    :else                  x))

(defn ^:export legacy-query
  "Coerce a CLJS pMBQL query back to (1) a legacy query (2) in vanilla JS."
  [query-map]
  (-> query-map convert/->legacy-MBQL fix-namespaced-values (clj->js :keyword-fn u/qualified-name)))

(defn ^:export append-stage
  "Adds a new blank stage to the end of the pipeline"
  [a-query]
  (lib.core/append-stage a-query))

(defn ^:export drop-stage
  "Drops the final stage in the pipeline"
  [a-query]
  (lib.core/drop-stage a-query))

(defn ^:export orderable-columns
  "Return a sequence of Column metadatas about the columns you can add order bys for in a given stage of `a-query.` To
  add an order by, pass the result to [[order-by]]."
  [a-query stage-number]
  (to-array (lib.order-by/orderable-columns a-query stage-number)))

(defn- display-info-js
  "Converts the [[metabase.lib.metadata.calculation/display-info]] maps into a JS-friendly form - `camelCase` keys,
  namespaced keyword values as `\"foo/bar\"` strings, etc.
  Recurses into nested sequences and maps."
  [x]
  (cond
    (map? x)        (-> x
                        (update-keys u/->camelCaseEn)
                        (update-vals display-info-js))
    (sequential? x) (map display-info-js x)
    :else           x))

(defn ^:export display-info
  "Given an opaque Cljs object, return a plain JS object with info you'd need to implement UI for it.
  See `:metabase.lib.metadata.calculation/display-info` for the keys this might contain. Note that the JS versions of
  the keys are converted to the equivalent `camelCase` strings from the original `:kebab-case`."
  [a-query stage-number x]
  (-> a-query
      (lib.stage/ensure-previous-stages-have-metadata stage-number)
      (lib.core/display-info stage-number x)
      display-info-js
      (clj->js :keyword-fn u/qualified-name)))

(defn ^:export field-id
  "Find the field id for something or nil."
  [field-metadata]
  (lib.core/field-id field-metadata))

(defn ^:export order-by-clause
  "Create an order-by clause independently of a query, e.g. for `replace` or whatever."
  ([orderable]
   (order-by-clause orderable :asc))

  ([orderable direction]
   (lib.core/order-by-clause (lib.core/normalize (js->clj orderable :keywordize-keys true)) (keyword direction))))

(defn ^:export order-by
  "Add an `order-by` clause to `a-query`. Returns updated query."
  [a-query stage-number orderable direction]
  (lib.core/order-by a-query stage-number orderable (keyword direction)))

(defn ^:export order-bys
  "Get the order-by clauses (as an array of opaque objects) in `a-query` at a given `stage-number`.
  Returns an empty array if there are no order bys in the query."
  [a-query stage-number]
  (to-array (lib.core/order-bys a-query stage-number)))

(defn ^:export change-direction
  "Flip the direction of `current-order-by` in `a-query`."
  [a-query current-order-by]
  (lib.core/change-direction a-query current-order-by))

(defn ^:export breakoutable-columns
  "Return an array of Column metadatas about the columns that can be broken out by in a given stage of `a-query.`
  To break out by a given column, the corresponding element of the result has to be added to the query using
  [[breakout]]."
  [a-query stage-number]
  (to-array (lib.core/breakoutable-columns a-query stage-number)))

(defn ^:export breakouts
  "Get the breakout clauses (as an array of opaque objects) in `a-query` at a given `stage-number`.
  Returns an empty array if there are no order bys in the query."
  [a-query stage-number]
  (to-array (lib.core/breakouts a-query stage-number)))

(defn ^:export breakout
  "Add an `order-by` clause to `a-query`. Returns updated query."
  [a-query stage-number x]
  (lib.core/breakout a-query stage-number (lib.core/ref x)))

(defn ^:export binning
  "Retrieve the current binning state of a `:field` clause, field metadata, etc. as an opaque object, or `nil` if it
  does not have binning options set."
  [x]
  (lib.core/binning x))

(defn ^:export with-binning
  "Given `x` (a field reference) and a `binning` value, return a new `:field` clause with its `:binning` options set.

  If `binning` is `nil`, removes any `:binning` options currently present.

  `binning` can be one of the opaque values returned by [[available-binning-strategies]], or a literal
  [[metabase.lib.schema.binning/binning]] value."
  [x binning-option]
  (lib.core/with-binning x binning-option))

(defn ^:export available-binning-strategies
  "Get a list of available binning strategies for `x` (a field reference, generally) in the context of `a-query` and
  optionally `stage-number`. The returned list contains opaque objects which should be passed to [[display-info]]."
  ([a-query x]
   (-> (lib.core/available-binning-strategies a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-binning-strategies a-query stage-number x)
       to-array)))

(defn ^:export temporal-bucket
  "Get the current temporal bucketing options associated with something, if any."
  [x]
  (lib.core/temporal-bucket x))

(defn ^:export with-temporal-bucket
  "Add a temporal bucketing option to an MBQL clause (or something that can be converted to an MBQL clause)."
  [x bucketing-option]
  (lib.core/with-temporal-bucket x bucketing-option))

(defn ^:export available-temporal-buckets
  "Get a list of available temporal bucketing options for `x` (a field reference, generally) in the context of `a-query`
  and optionally `stage-number`. The returned list contains opaque objects which should be passed to [[display-info]]."
  ([a-query x]
   (-> (lib.core/available-temporal-buckets a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-temporal-buckets a-query stage-number x)
       to-array)))

(defn ^:export remove-clause
  "Removes the `target-clause` in the filter of the `query`."
  [a-query stage-number clause]
  (lib.core/remove-clause
   a-query stage-number
   (lib.core/normalize (js->clj clause :keywordize-keys true))))

(defn ^:export replace-clause
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  [a-query stage-number target-clause new-clause]
  (lib.core/replace-clause
   a-query stage-number
   (lib.core/normalize (js->clj target-clause :keywordize-keys true))
   (lib.core/normalize (js->clj new-clause :keywordize-keys true))))

(defn- prep-query-for-equals [a-query field-ids]
  (-> a-query
      mbql.js/normalize-cljs
      ;; If `:native` exists, but it doesn't have `:template-tags`, add it.
      (m/update-existing :native #(merge {:template-tags {}} %))
      (m/update-existing :query (fn [inner-query]
                                  (let [fields (or (:fields inner-query)
                                                   (for [id field-ids]
                                                     [:field id nil]))]
                                    ;; We ignore the order of the fields in the lists, but need to make sure any dupes
                                    ;; match up. Therefore de-dupe with `frequencies` rather than simply `set`.
                                    (assoc inner-query :fields (frequencies fields)))))))

(defn ^:export query=
  "Returns whether the provided queries should be considered equal.

  If `field-ids` is specified, an input MBQL query without `:fields` set defaults to the `field-ids`.

  Currently this works only for legacy queries in JS form!
  It duplicates the logic formerly found in `query_builder/selectors.js`.

  TODO: This should evolve into a more robust, pMBQL-based sense of equality over time.
  For now it pulls logic that touches query internals into `metabase.lib`."
  ([query1 query2] (query= query1 query2 nil))
  ([query1 query2 field-ids]
   (let [n1 (prep-query-for-equals query1 field-ids)
         n2 (prep-query-for-equals query2 field-ids)]
     (= n1 n2))))

(defn ^:export group-columns
  "Given a group of columns returned by a function like [[metabase.lib.js/orderable-columns]], group the columns
  by Table or equivalent (e.g. Saved Question) so that they're in an appropriate shape for showing in the Query
  Builder. e.g a sequence of columns like

    [venues.id
     venues.name
     venues.category-id
     ;; implicitly joinable
     categories.id
     categories.name]

  would get grouped into groups like

    [{::columns [venues.id
                 venues.name
                 venues.category-id]}
     {::columns [categories.id
                 categories.name]}]

  Groups have the type `:metadata/column-group` and can be passed directly
  to [[metabase.lib.js/display-info]].
  Use [[metabase.lib.js/columns-group-columns]] to extract the columns from a group."
  [column-metadatas]
  (to-array (lib.core/group-columns column-metadatas)))

(defn ^:export columns-group-columns
  "Get the columns associated with a column group"
  [column-group]
  (to-array (lib.core/columns-group-columns column-group)))

(defn ^:export describe-temporal-unit
  "Get a translated description of a temporal bucketing unit."
  [n unit]
  (let [unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-temporal-unit n unit)))

(defn ^:export describe-temporal-interval
  "Get a translated description of a temporal bucketing interval."
  [n unit]
  (let [n    (if (string? n) (keyword n) n)
        unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-temporal-interval n unit)))

(defn ^:export describe-relative-datetime
  "Get a translated description of a relative datetime interval."
  [n unit]
  (let [n    (if (string? n) (keyword n) n)
        unit (if (string? unit) (keyword unit) unit)]
      (lib.core/describe-relative-datetime n unit)))

(defn ^:export aggregate
  "Adds an aggregation to query."
  [a-query stage-number an-aggregate-clause]
  (lib.core/aggregate a-query stage-number (js->clj an-aggregate-clause :keywordize-keys true)))

(defn ^:export aggregations
  "Get the aggregations in a given stage of a query."
  [a-query stage-number]
  (to-array (lib.core/aggregations a-query stage-number)))

(defn ^:export aggregation-clause
  "Returns a standalone aggregation clause for an `aggregation-operator` and
   a `column`.
   For aggregations requiring an argument `column` is mandatory, otherwise
   it is optional."
  ([aggregation-operator]
   (lib.core/aggregation-clause aggregation-operator))
  ([aggregation-operator column]
   (lib.core/aggregation-clause aggregation-operator column)))

(defn ^:export available-aggregation-operators
  "Get the available aggregation operators for the stage with `stage-number` of
  the query `a-query`.
  If `stage-number` is omitted, the last stage is used."
  [a-query stage-number]
  (to-array (lib.core/available-aggregation-operators a-query stage-number)))

(defn ^:export aggregation-operator-columns
  "Get the columns `aggregation-operator` can be applied to.
  The columns are valid for the stage of the query that was used in
  [[available-binning-strategies]] to get `available-aggregation`."
  [aggregation-operator]
  (to-array (lib.core/aggregation-operator-columns aggregation-operator)))

(defn ^:export selected-aggregation-operators
  "Mark the operator and the column (if any) in `agg-operators` selected by `agg-clause`."
  [agg-operators agg-clause]
  (to-array (lib.core/selected-aggregation-operators (seq agg-operators) agg-clause)))

(defn ^:export filterable-columns
  "Get the available filterable columns for the stage with `stage-number` of the query `a-query`."
  [a-query stage-number]
  (to-array (lib.core/filterable-columns a-query stage-number)))

(defn ^:export filterable-column-operators
  "Returns the operators for which `filterable-column` is applicable."
  [filterable-column]
  (to-array (lib.core/filterable-column-operators filterable-column)))

(defn ^:export filter-clause
  "Returns a standalone filter clause for a `filter-operator`,
  a `column`, and arguments."
  [filter-operator column & args]
  (apply lib.core/filter-clause filter-operator column args))

(defn ^:export filter-operator
  "Returns the filter operator of `filter-clause`."
  [a-query stage-number a-filter-clause]
  (lib.core/filter-operator a-query stage-number a-filter-clause))

(defn ^:export filter-parts
  "Returns the parts (operator, args, and optionally, options) of `filter-clause`."
  [a-query stage-number a-filter-clause]
  (let [{:keys [operator options column args]} (lib.core/filter-parts a-query stage-number a-filter-clause)]
    #js {:operator operator
         :options (clj->js (select-keys options [:case-sensitive :include-current]))
         :column column
         :args (to-array args)}))

(defn ^:export filter
  "Sets `boolean-expression` as a filter on `query`."
  [a-query stage-number boolean-expression]
  (lib.core/filter a-query stage-number (js->clj boolean-expression :keywordize-keys true)))

(defn ^:export filters
  "Returns the current filters in stage with `stage-number` of `query`.
  Logicaly, the filter attached to the query is the conjunction of the expressions
  in the returned list. If the returned list is empty, then there is no filter
  attached to the query."
  [a-query stage-number]
  (to-array (lib.core/filters a-query stage-number)))

(defn ^:export find-filter-for-legacy-filter
  "Return the filter clause in `a-query` at stage `stage-number` matching the legacy
  filter clause `legacy-filter`, if any."
  [a-query stage-number legacy-filter]
  (->> (js->clj legacy-filter :keywordize-keys true)
       (lib.core/find-filter-for-legacy-filter a-query stage-number)))

(defn ^:export find-filterable-column-for-legacy-ref
  "Given a legacy `:field` reference, return the filterable [[ColumnWithOperators]] that best fits it."
  [a-query stage-number legacy-ref]
  ;; [[lib.convert/legacy-ref->pMBQL]] will handle JS -> Clj conversion as needed
  (lib.core/find-filterable-column-for-legacy-ref a-query stage-number legacy-ref))

(defn ^:export fields
  "Get the current `:fields` in a query. Unlike the lib core version, this will return an empty sequence if `:fields` is
  not specified rather than `nil` for JS-friendliness."
  [a-query stage-number]
  (to-array (lib.core/fields a-query stage-number)))

(defn ^:export with-fields
  "Specify the `:fields` for a query. Pass an empty sequence or `nil` to remove `:fields`."
  [a-query stage-number new-fields]
  (lib.core/with-fields a-query stage-number new-fields))

(defn ^:export fieldable-columns
  "Return a sequence of column metadatas for columns that you can specify in the `:fields` of a query."
  [a-query stage-number]
  (to-array (lib.core/fieldable-columns a-query stage-number)))

(defn ^:export add-field
  "Adds a given field (`ColumnMetadata`, as returned from eg. [[visible-columns]]) to the fields returned by the query.
  Exactly what this means depends on the source of the field:
  - Source table/card, previous stage of the query, aggregation or breakout:
      - Add it to the `:fields` list
      - If `:fields` is missing, it's implicitly `:all`, so do nothing.
  - Implicit join: add it to the `:fields` list; query processor will do the right thing with it.
  - Explicit join: add it to that join's `:fields` list.
  - Custom expression: Do nothing - expressions are always included."
  [a-query stage-number column]
  (lib.core/add-field a-query stage-number column))

(defn ^:export remove-field
  "Removes the field (a `ColumnMetadata`, as returned from eg. [[visible-columns]]) from those fields returned by the
  query. Exactly what this means depends on the source of the field:
  - Source table/card, previous stage, aggregations or breakouts:
      - If `:fields` is missing, it's implicitly `:all` - populate it with all the columns except the removed one.
      - Remove the target column from the `:fields` list
  - Implicit join: remove it from the `:fields` list; do nothing if it's not there.
      - (An implicit join only exists in the `:fields` clause, so if it's not there then it's not anywhere.)
  - Explicit join: remove it from that join's `:fields` list (handle `:fields :all` like for source tables).
  - Custom expression: Throw! Custom expressions are always returned. To remove a custom expression, the expression
    itself should be removed from the query."
  [a-query stage-number column]
  (lib.core/remove-field a-query stage-number column))

(defn ^:export find-visible-column-for-legacy-ref
  "Like [[find-visible-column-for-ref]], but takes a legacy MBQL reference instead of a pMBQL one. This is currently
  only meant for use with `:field` clauses."
  [a-query stage-number legacy-ref]
  ;; [[lib.convert/legacy-ref->pMBQL]] will handle JS -> Clj conversion as needed
  (lib.core/find-visible-column-for-legacy-ref a-query stage-number legacy-ref))

(defn ^:export find-column-for-legacy-ref
  "Given a sequence of `columns` (column metadatas), return the one that is the best fit for `legacy-ref`."
  [a-query stage-number legacy-ref columns]
  ;; [[lib.convert/legacy-ref->pMBQL]] will handle JS -> Clj conversion as needed
  (lib.core/find-column-for-legacy-ref a-query stage-number legacy-ref columns))

(defn ^:export join-strategy
  "Get the strategy (type) of a given join as an opaque JoinStrategy object."
  [a-join]
  (lib.core/join-strategy a-join))

(defn ^:export with-join-strategy
  "Return a copy of `a-join` with its `:strategy` set to an opaque JoinStrategy."
  [a-join strategy]
  (lib.core/with-join-strategy a-join strategy))

(defn ^:export available-join-strategies
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/driver-features]]) as opaque JoinStrategy objects."
  [a-query stage-number]
  (to-array (lib.core/available-join-strategies a-query stage-number)))

(defn ^:export join-condition-lhs-columns
  "Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
  is the one that comes from the source Table/Card/previous stage of the query or a previous join.

  If you are changing the LHS of a condition for an existing join, pass in that existing join as `join-or-joinable` so
  we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
  for its own LHS) or added by later joins (joins can only depend on things from previous joins). Otherwise you can
  either pass in `nil` or something joinable (Table or Card metadata) we're joining against when building a new
  join. (Things other than joins are ignored, but this argument is flexible for consistency with the signature
  of [[join-condition-rhs-columns]].) See #32005 for more info.

  If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here."
  [a-query stage-number join-or-joinable lhs-column-or-nil rhs-column-or-nil]
  (to-array (lib.core/join-condition-lhs-columns a-query stage-number join-or-joinable lhs-column-or-nil rhs-column-or-nil)))

(defn ^:export join-condition-rhs-columns
  "Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
  is the one that belongs to the thing being joined, `join-or-joinable`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]]. You can also pass in an existing join.

  If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  If the right-hand-side column has already been chosen and we're UPDATING it, pass in `rhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  [a-query stage-number join-or-joinable lhs-column-or-nil rhs-column-or-nil]
  (to-array (lib.core/join-condition-rhs-columns a-query stage-number join-or-joinable lhs-column-or-nil rhs-column-or-nil)))

(defn ^:export join-condition-operators
  "Return a sequence of valid filter clause operators that can be used to build a join condition. In the Query Builder
  UI, this can be chosen at any point before or after choosing the LHS and RHS. Invalid options are not currently
  filtered out based on values of the LHS or RHS, but in the future we can add this -- see #31174."
  [a-query stage-number lhs-column-or-nil rhs-column-or-nil]
  (to-array (lib.core/join-condition-operators a-query stage-number lhs-column-or-nil rhs-column-or-nil)))

(defn ^:export expression
  "Adds an expression to query."
  [a-query stage-number expression-name an-expression-clause]
  (lib.core/expression a-query stage-number expression-name an-expression-clause))

(defn ^:export expressions
  "Get the expressions map from a given stage of a `query`."
  [a-query stage-number]
  (to-array (lib.core/expressions a-query stage-number)))

(defn ^:export expressionable-columns
  "Return an array of Column metadatas about the columns that can be used in an expression in a given stage of `a-query`.
   Pass the current `expression-position` or `null` for new expressions."
  ([a-query expression-position]
   (expressionable-columns a-query expression-position))
  ([a-query stage-number expression-position]
   (to-array (lib.core/expressionable-columns a-query stage-number expression-position))))

(defn ^:export suggested-join-condition
  "Return a suggested default join condition when constructing a join against `joinable`, e.g. a Table, Saved
  Question, or another query. A suggested condition will be returned if the source Table has a foreign key to the
  primary key of the thing we're joining (see #31175 for more info); otherwise this will return `nil` if no default
  condition is suggested."
  [a-query stage-number joinable]
  (lib.core/suggested-join-condition a-query stage-number joinable))

(defn ^:export join-fields
  "Get the `:fields` associated with a join."
  [a-join]
  (let [joined-fields (lib.core/join-fields a-join)]
    (if (keyword? joined-fields)
      (u/qualified-name joined-fields)
      (to-array joined-fields))))

(defn ^:export with-join-fields
  "Set the `:fields` for `a-join`."
  [a-join new-fields]
  (lib.core/with-join-fields a-join (cond-> new-fields
                                      (string? new-fields) keyword)))

(defn ^:export join-clause
  "Create a join clause (an `:mbql/join` map) against something `joinable` (Table metadata, a Saved Question, another
  query, etc.) with `conditions`, which should be an array of filter clauses. You can then manipulate this join clause
  with stuff like [[with-join-fields]], or add it to a query with [[join]]."
  [joinable conditions]
  (lib.core/join-clause joinable conditions))

(defn ^:export join
  "Add a join clause (as created by [[join-clause]]) to a stage of a query."
  [a-query stage-number a-join]
  (lib.core/join a-query stage-number a-join))

(defn ^:export join-conditions
  "Get the conditions (filter clauses) associated with a join."
  [a-join]
  (to-array (lib.core/join-conditions a-join)))

(defn ^:export with-join-conditions
  "Set the `:conditions` (filter clauses) for a join."
  [a-join conditions]
  (lib.core/with-join-conditions a-join (js->clj conditions :keywordize-keys true)))

(defn ^:export joins
  "Get the joins associated with a particular query stage."
  [a-query stage-number]
  (to-array (lib.core/joins a-query stage-number)))

(defn ^:export rename-join
  "Rename the join specified by `join-spec` in `a-query` at `stage-number` to `new-name`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If the specified join cannot be found, then `query` is returned as is.
  If renaming the join to `new-name` would clash with an existing join, a
  suffix is appended to `new-name` to make it unique."
  [a-query stage-number join-spec new-name]
  (lib.core/rename-join a-query stage-number join-spec new-name))

(defn ^:export remove-join
  "Remove the join specified by `join-spec` in `a-query` at `stage-number`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If the specified join cannot be found, then `a-query` is returned as is.
  Top level clauses containing references to the removed join are removed too."
  [a-query stage-number join-spec]
  (lib.core/remove-join a-query stage-number join-spec))

(defn ^:export joined-thing
  "Return metadata about the origin of `join` using `metadata-providerable` as the source of information."
  [a-query a-join]
  (lib.join/joined-thing a-query a-join))

(defn ^:export picker-info
  "Temporary solution providing access to internal IDs for the FE to pass on to MLv1 functions."
  [a-query metadata]
  (case (:lib/type metadata)
    :metadata/table #js {:databaseId (:database a-query)
                         :tableId (:id metadata)}
    :metadata/card  #js {:databaseId (:database a-query)
                         :tableId (str "card__" (:id metadata))
                         :cardId (:id metadata)
                         :isModel (:dataset metadata)}
    (do
      (log/warn "Cannot provide picker-info for" (:lib/type metadata))
      nil)))

(defn ^:export external-op
  "Convert the internal operator `clause` to the external format."
  [clause]
  (let [{:keys [operator options args]} (lib.core/external-op clause)]
    #js {:operator operator
         :options (clj->js options)
         :args (to-array args)}))

(defn ^:export native-query
  "Create a new native query.

  Native in this sense means a pMBQL query with a first stage that is a native query."
  [database-id metadata inner-query]
  (lib.core/native-query (metadataProvider database-id metadata) inner-query))

(defn ^:export with-native-query
  "Update the raw native query, the first stage must already be a native type.
   Replaces templates tags"
  [a-query inner-query]
  (lib.core/with-native-query a-query inner-query))

(defn ^:export with-template-tags
  "Updates the native query's template tags."
  [a-query tags]
  (lib.core/with-template-tags a-query (lib.core/->TemplateTags tags)))

(defn ^:export raw-native-query
  "Returns the native query string"
  [a-query]
  (lib.core/raw-native-query a-query))

(defn ^:export template-tags
  "Returns the native query's template tags"
  [a-query]
  (lib.core/TemplateTags-> (lib.core/template-tags a-query)))

(defn ^:export required-native-extras
  "Returns the extra keys that are required for this database's native queries, for example `:collection` name is
  needed for MongoDB queries."
  [database-id metadata]
  (to-array
   (map u/qualified-name
        (lib.core/required-native-extras (metadataProvider database-id metadata)))))

(defn ^:export with-different-database
  "Changes the database for this query. The first stage must be a native type.
   Native extras must be provided if the new database requires it."
  ([a-query database-id metadata]
   (with-different-database a-query database-id metadata nil))
  ([a-query database-id metadata native-extras]
   (lib.core/with-different-database a-query (metadataProvider database-id metadata) (js->clj native-extras :keywordize-keys true))))

(defn ^:export with-native-extras
  "Updates the extras required for the db to run this query. The first stage must be a native type. Will ignore extras
  not in `required-native-extras`."
  [a-query native-extras]
  (lib.core/with-native-extras a-query (js->clj native-extras :keywordize-keys true)))

(defn ^:export native-extras
  "Returns the extra keys for native queries associated with this query."
  [a-query]
  (clj->js (lib.core/native-extras a-query)))

(defn ^:export available-segments
  "Get a list of Segments that you may consider using as filters for a query. Returns JS array of opaque Segment
  metadata objects."
  [a-query]
  (to-array (lib.core/available-segments a-query)))

(defn ^:export available-metrics
  "Get a list of Metrics that you may consider using as aggregations for a query. Returns JS array of opaque Metric
  metadata objects."
  [a-query]
  (to-array (lib.core/available-metrics a-query)))

(defn ^:export joinable-columns
  "Return information about the fields that you can pass to [[with-join-fields]] when constructing a join against
  something [[Joinable]] (i.e., a Table or Card) or manipulating an existing join. When passing in a join, currently
  selected columns (those in the join's `:fields`) will include `:selected true` information."
  [a-query stage-number join-or-joinable]
  (to-array (lib.core/joinable-columns a-query stage-number join-or-joinable)))

(defn ^:export table-or-card-metadata
  "Get TableMetadata if passed an integer `table-id`, or CardMetadata if passed a legacy-style `card__<id>` string.
  Returns `nil` if no matching metadata is found."
  [query-or-metadata-provider table-id]
  (lib.metadata/table-or-card query-or-metadata-provider table-id))

(defn ^:export join-lhs-display-name
  "Get the display name for whatever we are joining. For an existing join, pass in the join clause. When constructing a
  join, pass in the thing we are joining against, e.g. a TableMetadata or CardMetadata."
  [a-query stage-number join-or-joinable condition-lhs-column-or-nil]
  (lib.core/join-lhs-display-name a-query stage-number join-or-joinable condition-lhs-column-or-nil))

(defn ^:export database-id
  "Get the Database ID (`:database`) associated with a query. If the query is using
  the [[metabase.mbql.schema/saved-questions-virtual-database-id]] (used in some situations for queries with a
  `:source-card`)

    {:database -1337}

  we will attempt to resolve the correct Database ID by getting metadata for the source Card and returning its
  `:database-id`; if this is not available for one reason or another this will return `nil`."
  [a-query]
  (lib.core/database-id a-query))

(defn ^:export join-condition-update-temporal-bucketing
  "Updates the provided join-condition's fields' temporal-bucketing option.
   Must be called on a standard join condition as per [[standard-join-condition?]].
   This will sync both the lhs and rhs fields, and the fields that support the provided option will be updated.
   Fields that do not support the provided option will be ignored."
  [a-query stage-number join-condition bucketing-option]
  (lib.core/join-condition-update-temporal-bucketing a-query stage-number join-condition bucketing-option))

(defn- js-cells-by
  "Given a `col-fn`, returns a function that will extract a JS object like
  `{col: {name: \"ID\", ...}, value: 12}` into a CLJS map like `{:column-name \"ID\", :value 12}`.

  The spelling of the column key differs between multiple JS objects of this same general shape
  (`col` on data rows, `column` on dimensions), etc., hence the abstraction."
  [col-fn]
  (fn [^js cell]
    {:column-name (.-name (col-fn cell))
     :value       (.-value cell)}))

(def ^:private row-cell       (js-cells-by #(.-col ^js %)))
(def ^:private dimension-cell (js-cells-by #(.-column ^js %)))

(defn ^:export available-drill-thrus
  "Return an array (possibly empty) of drill-thrus given:
  - Required column
  - Nullable value
  - Nullable data row (the array of `{col, value}` pairs from `clicked.data`)
  - Nullable dimensions list (`{column, value}` pairs from `clicked.dimensions`)"
  [a-query stage-number column value row dimensions]
  (->> (merge {:column (js.metadata/parse-column column)
               :value  (cond
                         (undefined? value) nil   ; Missing a value, ie. a column click
                         (nil? value)       :null ; Provided value is null, ie. database NULL
                         :else              value)}
              (when row                    {:row        (mapv row-cell       row)})
              (when (not-empty dimensions) {:dimensions (mapv dimension-cell dimensions)}))
       (lib.core/available-drill-thrus a-query stage-number)
       to-array))

(defn ^:export drill-thru
  "Applies the given `drill-thru` to the specified query and stage. Returns the updated query.

  Each type of drill-thru has a different effect on the query."
  [a-query stage-number a-drill-thru]
  (lib.core/drill-thru a-query stage-number a-drill-thru))

(defn ^:export pivot-types
  "Returns an array of pivot types that are available in this drill-thru, which must be a pivot drill-thru."
  [a-drill-thru]
  (to-array (lib.core/pivot-types a-drill-thru)))

(defn ^:export pivot-columns-for-type
  "Returns an array of pivotable columns of the specified type."
  [a-drill-thru pivot-type]
  (lib.core/pivot-columns-for-type a-drill-thru pivot-type))
