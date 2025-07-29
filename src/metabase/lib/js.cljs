(ns metabase.lib.js
  "JavaScript-facing interface to MBQL Lib v2.

  Generally, these functions wrap [[lib.core]] with conversion of inputs from JS data structures, and occasionally
  from legacy MLv1 formats as well. Outputs are usually CLJS data structures intended to be treated as opaque in the FE.
  Returned lists are converted from CLJS sequences to JS arrays (of opaque CLJS values).

  On the TypeScript side, lint rules restrict importing this file to only the `frontend/src/metabase-lib/` directory.
  That directory contains TS wrapper functions which add types and replace mangled Clojure names with idiomatic TS ones;
  those wrappers are what get imported and used by the wider FE.

  ## Terms and types

  A reference of what is meant in these docs by \"column\", \"query\", etc. Most of the CLJS maps have a `:lib/type`
  key, the values are indicated here. TS types are also indicated as eg. `Lib.ColumnMetadata`.

  - **query** means a modern pMBQL query, represented as a CLJS map (`:mbql/query`, `Lib.Query`)
  - **legacy query** and **MLv1 query** mean the previous form of MBQL, represented as a JSON object
  - **column** means the full details of a column - its name, types, etc. (`:metadata/column`, `Lib.ColumnMetadata`)
      - Columns can come from several sources: source tables, cards/models, previous stages of this query, aggregations,
        etc.
      - **field** means specifically a *column* which really exists in the data warehouse
  - **clause** means a fragment of MBQL describing part of a query, such as an aggregation, breakout, join, etc.
  - **ref** means a reference to a column.
      - Often these are misleading called a \"field ref\", since they are represented as a `[:field ...]` clause in both
        legacy MBQL and pMBQL.
      - Refs are a code smell - they are an internal detail of MBQL structures that has leaked into many places in
        legacy. All mention of refs should be eliminated from this interface eventually.

  ## Code health

  This API surface grew mostly organically during the development of MLv2 and porting the query builder to use it.
  The result is that the API is not as systematic or clean as it could be. There are functions which are very specific
  to a particular use case in one part of the FE, and functions which support legacy compatibility but should be removed
  as those features are ported.

  Health info is surfaced on each function, using these categories:

  - **Healthy:** No issues; use these functions without concern.
  - **Smelly:** This function isn't going away, but it needs some cleanup or improvement. Eg. maybe it's badly named.
  - **Special use:** Exists to support a specific use case; new calls should generally be avoided. Ask if unsure.
  - **Legacy:** Exists to support interop with legacy MLv1 queries, columns, field refs, etc. Can be used if needed,
    but there will be notes on preferred alternatives that should be used if possible.
  - **Deprecated:** No new calls; remove existing calls as practical; remove this function if there are no callers.
    Docs will give an alternative to calling these functions that should cover all cases.

  Over time, the *Deprecated* functions will be removed, and the *Legacy* ones will become obsolete and get removed as
  legacy uses are ported to MLv2.

  ## Display Info
  The library functions typically return opaque CLJS data. We want to hide the library's internals, but we want it to be
  easy for the FE to consume queries, columns, aggregations, etc. and render them in the UI.

  This is accomplished using `display-info`; see that section for more details."
  (:refer-clojure
   :exclude
   [filter])
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [goog.object :as gobject]
   [medley.core :as m]
   [metabase.legacy-mbql.js :as mbql.js]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.cache :as lib.cache]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib.core]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.fe-util :as lib.fe-util]
   [metabase.lib.field :as lib.field]
   [metabase.lib.join :as lib.join]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.memoize :as memoize]
   [metabase.util.time :as u.time]))

;;; This ensures that all of metabase.lib.* is loaded, so all the `defmethod`s are properly registered.
(comment lib.core/keep-me)

(defn ^:export suggestedName
  "Return a nice description of a query.

  > **Code health:** Single use, smelly. Name is not idiomatic Clojure. Could it be merged with `display-name-method`?"
  [query]
  (lib.core/suggested-name query))

(defn ^:export metadataProvider
  "Convert the provided metadata container to an MLv2 metadata provider.

  > **Code health:** Smelly. Name is not idiomatic Clojure.

  If the `metadata` is already an MLv2 metadata provider, it is simply returned. If it is a JavaScript `Metadata`
  instance, it is wrapped with an MLv2 adapter."
  [database-id metadata]
  (if (lib.metadata.protocols/metadata-provider? metadata)
    metadata
    (js.metadata/metadata-provider database-id metadata)))

(defn ^:export query
  "Creates an MLv2 query from the provided input: either a table or card metadata, or a legacy MLv1 query in JSON form.

  > **Code health:** Healthy.

  There are two *arities* for this function:

  With two arguments `metadata-provider` and `table-or-card-metadata`, creates an MLv2 query for that table or card.

  With three arguments `database-id`, `metadata-provider`, and `query-map`, expects the `query-map` to be an MLv1 legacy
  query in JSON form. The query is converted to MLv2 form based on the metadata and the provided `database-id` (which is
  not always included on the `query-map`).

  <details>
  <summary>Caching</summary>
  Attaches a cache to `metadata-provider` so that subsequent calls with the same `database-id` and `query-map` return
  the same query object.

  It would be simpler to attach the MLv2 query to a (non-enumerable) property on the `query-map`, but the `query-map`
  might have been `Object.freeze`'d by Immer. So instead we attach a two-level cache to the `metadata-provider`. The
  outer key is `database-id`, and the inner cache is a JS `WeakMap`, using the `query-map` itself as the key.
  This cache is efficient to check, and because it uses a `WeakMap` it does not retain legacy queries if they would
  otherwise be garbage collected.

  If the metadata gets updated, the `metadata-provider` will be discarded and replaced, destroying the cache.
  </details>"
  ([metadata-provider table-or-card-metadata]
   (lib.core/query metadata-provider table-or-card-metadata))

  ([database-id metadata-provider query-map]
   ;; Since the query-map is possibly `Object.freeze`'d, we can't mutate it to attach the query.
   ;; Therefore, we attach a two-level cache to the metadata-provider:
   ;; The outer key is the database-id; the inner one i a weak ref to the legacy query-map (a JS object).
   ;; This should achieve efficient caching of legacy queries without retaining garbage.
   ;; (Except possibly for a few empty WeakMaps, if queries are cached and then GC'd.)
   ;; If the metadata changes, the metadata-provider is replaced, so all these caches are destroyed.
   (lib.cache/side-channel-cache-weak-refs
    (str database-id) metadata-provider query-map
    #(->> %
          lib.convert/js-legacy-query->pMBQL
          (lib.core/query metadata-provider))
    {:force? true})))

;; TODO: Lots of utilities and helpers in this file. It would be easier to consume the API if the helpers were moved to
;; a utility namespace. Better would be to "upstream" them into `metabase.util.*` if they're useful elsewhere.
(defn- fix-namespaced-values
  "Converts namespaced keywords to strings like `\"foo/bar\"`.

  [[clj->js]] supports overriding how keyword map *keys* get transformed, but it doesn't let you override how *values*
  are handled. So this function runs first to recursively transform keywords in value position into strings.

  As examples of such a value, `(get-in card [:template-tags \"some-tag\" :widget-type])` can be `:date/all-options`;
  and the `:base-type` of a column might be `:type/Text`."
  [x]
  (cond
    (qualified-keyword? x) (str (namespace x) "/" (name x))
    (map? x)               (update-vals x fix-namespaced-values)
    (sequential? x)        (map fix-namespaced-values x)
    :else                  x))

(defn ^:export legacy-query
  "Coerce an MLv2 query (pMBQL in CLJS data structures) into a legacy MLv1 query in vanilla JSON form.

  > **Code health:** Legacy. This has many legitimate uses (as of March 2024), but we should aim to reduce the places
  where a legacy query is still needed. Consider if it's practical to port the consumer of this legacy query to MLv2."
  [query-map]
  (-> (lib.query/->legacy-MBQL query-map)
      fix-namespaced-values (clj->js :keyword-fn u/qualified-name)))

(defn ^:export append-stage
  "Adds a new, blank *stage* to the provided `query`.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/append-stage a-query))

(defn ^:export drop-stage
  "Drops the final *stage* in the query, even if it's not empty. If there is only one stage, this is a no-op.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/drop-stage a-query))

(defn ^:export drop-empty-stages
  "Drops **all** stages which are empty from `a-query`. To be fully clear, this does not only drop empty final stages,
  it drops all empty middle stages as well.

  No-op if there are no empty stages. Note that the first stage is never empty, since it contains eg. `:source-table`.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/drop-empty-stages a-query))

(defn ^:export as-returned
  "When a query has aggregations in stage `N`, there's an important difference between adding an expression to stage `N`
  (with access to the colums before aggregation) or adding it to stage `N+1` (with access to the aggregations and
  breakouts).

  Given `a-query` and `stage-number`, this returns a **JS object** with `query` and `stageIndex` keys, for working with
  \"what it returns\". If there is already a later stage, that stage is reused. Appends a new stage if we were already
  looking at the last stage.

  > **Code health:** Healthy"
  [a-query stage-number card-id]
  (let [{a-query :query, :keys [stage-number]} (lib.core/wrap-native-query-with-mbql a-query stage-number card-id)]
    (if (and
         (empty? (lib.core/aggregations a-query stage-number))
         (empty? (lib.core/breakouts a-query stage-number)))
    ;; No extra stage needed with no aggregations.
      #js {:query      a-query
           :stageIndex stage-number}
    ;; An extra stage is needed, so see if one already exists.
      (if-let [next-stage (->> (lib.util/canonical-stage-index a-query stage-number)
                               (lib.util/next-stage-number a-query))]
      ;; Already an extra stage, so use it.
        #js {:query      a-query
             :stageIndex next-stage}
      ;; No new stage, so append one.
        #js {:query      (lib.core/append-stage a-query)
             :stageIndex -1}))))

(defn ^:export orderable-columns
  "Returns a JS Array of *column metadata* values for all columns which can be used to add an `ORDER BY` to `a-query` at
  `stage-number`.

  To add an `ORDER BY`, pass one of the columns to [[order-by]].

  Cached on `a-query`.

  > **Code health:** Healthy"
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "orderable-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (to-array (lib.order-by/orderable-columns a-query stage-number)))))

;; # Display Info
;;
;; The FE routinely needs to know some information about opaque CLJS values in order to render the UI. To get that
;; information, it calls [[display-info]], providing the query and stage for context along with the value it wants to
;; know about: `(display-info a-query stage-number x)` or in TS `ML.display_info(query, stageIndex, x)`.
;;
;; ## Life of a `display-info` call
;;
;; - FE calls [[display-info]] in this namespace
;; - Which calls [[lib.core/display-info]], defined in `metabase.lib.metadata.calculation`.
;; - Which delegates to a *multimethod* `display-info-method`
;; - This has implementations for many different MLv2 values - queries, stages, aggregations, expressions, columns, etc.
;;
;; These implementations return their info *in CLJS form*, as a map! That's because `display-info` calls are sometimes
;; nested, eg. a *column group*'s `display-info` includes the `display-info` for each column in the group.
;;
;; Conversion to JSON happens only at the last moment, in [[display-info]] in this namespace.
;;
;; ## Caching in detail
;;
;; `display-info` calls are frequent, often duplicated, and sometimes expensive to compute. Therefore caching pays off,
;; and we invest a fair bit of complexity here for the sake of performance.
;;
;; The outer surface is [[display-info]] in this file. It has a [[lib.cache/side-channel-cache]], so if
;; `display-info` is called multiple times on the same opaque CLJS value, it will be cached "end to end".
;;
;; [[display-info*]] is the inner implementation. It calls [[lib.core/display-info]] to get the CLJS form, then
;; [[display-info->js]] to convert it to JS.
;;
;; JS conversion in the tricky cases (maps and seqs) are handled by separate, *LRU-cached* functions
;; [[display-info-map->js]] and [[display-info-seq->js]]. Keywords are converted with [[u/qualified-name]], so they
;; retain their namespaces, eg. `"type/Text"`.
;;
;; [[display-info-map->js]] converts CLJS maps to JS objects. Keys are converted from `:kebab-case-keywords` to
;; `"camelCaseStrings"`. Values are recursively converted by [[display-info->js]]. (Note that this passes through the
;; LRU caches for nested maps and seqs again! This is important since many inner pieces are reused across eg. columns.)

;; [[display-info-seq->js]] converts CLJS `sequential?` things to JS arrays, recursively calling [[display-info->js]] on
;; each element. (Back through the LRU caches just like map values above.)

;; ### Subtlety: identity vs. value caching
;; It's possible for `visible-columns` on two different queries to return columns which are `=`. Since the different
;; queries might cause different display names or other values to be generated for those `=` columns, it's vital that
;; the caching of `display-info` is per-query.

;; The [[lib.cache/side-channel-cache]] caches attached to individual column instances are implicitly per-query (since
;; `visible-columns` always generates new ones even for the same query) so they work here.

;; In contrast, the CLJS -> JS conversion step doesn't know about queries, so it can use `=`-based LRU caches and be
;; correct.

(declare ^:private display-info->js)

(defn- cljs-key->js-key
  "Converts idiomatic Clojure keys (`:kebab-case-keywords`) into idiomatic JavaScript keys (`\"camelCaseStrings\"`).

  Namespaces are preserved. A `?` suffix in Clojure is replaced with an `\"is\"` prefix in JavaScript, eg.
  `:many-pks?` becomes `isManyPks`."
  [cljs-key]
  (let [key-str (u/qualified-name cljs-key)
        key-str (if (str/ends-with? key-str "?")
                  (str "is-" (str/replace key-str #"\?$" ""))
                  key-str)]
    (u/->camelCaseEn key-str)))

(defn- js-key->cljs-key
  "Converts idiomatic JavaScript keys (`\"camelCaseStrings\"`) into idiomatic Clojure keys (`:kebab-case-keywords`).

  A `\"is\"` prefix in JavaScript is replaced with a `?` suffix in Clojure , eg. `isManyPks` becomes `:many-pks?`."
  [js-key]
  (let [key-str (if (str/starts-with? js-key "is")
                  (str (subs js-key 2) "?")
                  js-key)]
    (-> key-str u/->kebab-case-en keyword)))

(defn- js-obj->cljs-map
  "Converts a JavaScript object with `\"camelCase\"` keys into a Clojure map with `:kebab-case` keys."
  [an-object]
  (-> an-object js->clj (update-keys js-key->cljs-key)))

(defn- cljs-map->js-obj
  "Converts a Clojure map with `:kebab-case` keys into a JavaScript object with `\"camelCase\"` keys."
  [a-map]
  (-> a-map (update-keys cljs-key->js-key) clj->js))

(defn- display-info-map->js* [x]
  (reduce (fn [obj [cljs-key cljs-val]]
            (let [js-key (cljs-key->js-key cljs-key)
                  js-val (display-info->js cljs-val)] ;; Recursing through the cache
              (gobject/set obj js-key js-val)
              obj))
          #js {}
          x))

(def ^:private display-info-map->js
  (memoize/lru display-info-map->js* :lru/threshold 256))

(defn- display-info-seq->js* [x]
  (to-array (map display-info->js x)))

(def ^:private display-info-seq->js
  (memoize/lru display-info-seq->js* :lru/threshold 256))

(defn- display-info->js
  "Converts CLJS [[lib.core/display-info]] results into JS objects for the FE to consume.
  Recursively converts CLJS maps and sequences into JS objects and arrays."
  [x]
  (cond
    ;; `(seqable? nil) ; => true`, so we need to check for it before
    (nil? x)     nil
    ;; Note that map? is only true for CLJS maps, not JS objects.
    (map? x)     (display-info-map->js x)
    (string? x)  x
    ;; Likewise, JS arrays are not seqable? while CLJS vectors, seqs and sets are.
    ;; (So are maps and strings, but those are already handled above.)
    (seqable? x) (display-info-seq->js x)
    (keyword? x) (u/qualified-name x)
    :else        x))

(defn- display-info*
  "Inner implementation of [[display-info]], which caches this function's results. See there for documentation."
  [a-query stage-number x]
  (-> a-query
      (lib.core/display-info stage-number x)
      display-info->js))

(defn ^:export display-info
  "Given an opaque CLJS value (in the context of `a-query` and `stage-number`), return a plain JS object with the info
  needed to render UI for that opaque value.

  The info returned depends on what kind of value `x` is; see [[metabase.lib.metadata.calculation/display-info]] for
  details.

  The JS objects returned by this function have all keys spelled as `\"camelCaseStrings\"`. Note that this spelling
  differs in a few cases from legacy, where there's a mix of `snake_case` and `\"kebab-case\"` mixed in.

  > **Code health:** Healthy

  Caches the result on `x`, in case this gets called again for the same object."
  [a-query stage-number x]
  ;; Attaches a cached display-info blob to `x`, in case it gets called again for the same object.
  ;; TODO: Keying by stage is probably unnecessary - if we eg. fetched a column from different stages, it would be a
  ;; different object. Test that idea and remove the stage from the cache key.
  (lib.cache/side-channel-cache
   (keyword "display-info-outer" (str "stage-" stage-number)) x
   #(display-info* a-query stage-number %)))

(defn ^:export order-by-clause
  "Create an `ORDER BY` clause and return it, independently of a query.

  `orderable` can be another [[order-by-clause]], a column, etc.

  `direction` is optional; if provided it should be either a keyword `:asc` or `:desc`, or string `\"asc\" or `\"desc\".
  The default is `:asc`.

  > **Code health:** Healthy"
  ([orderable]
   (order-by-clause orderable :asc))

  ([orderable direction]
   (lib.core/order-by-clause (lib.core/normalize (js->clj orderable :keywordize-keys true)) (keyword direction))))

(defn ^:export order-by
  "Add an `ORDER BY` clause to `a-query`. Returns the updated query.

  `orderable` and `direction` are the same as the arguments to [[order-by-clause]].

  > **Code health:** Smelly. This should be refactored to accept an [[order-by-clause]]; that is how [[aggregate]] and
  other analogous functions work. But don't hesitate to add calls to this function."
  [a-query stage-number orderable direction]
  (lib.core/order-by a-query stage-number orderable (keyword direction)))

(defn ^:export order-bys
  "Get the `ORDER BY` clauses in `a-query` at `stage-number`, as a JS array of opaque values.

  Returns an empty array if there are no order-bys in the given stage.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/order-bys a-query stage-number)))

(defn ^:export change-direction
  "Flip the direction of `current-order-by` in `a-query`.

  > **Code health:** Healthy"
  [a-query current-order-by]
  (lib.core/change-direction a-query current-order-by))

(defn ^:export breakoutable-columns
  "Returns a JS array of opaque columns representing the columns that can be used as breakouts in the given stage of
  `a-query.`

  Pass one of these values to [[breakout]] to add it to the query.

  > **Code health:** Healthy

  Caches the result on the query by stage."
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "breakoutable-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (to-array (lib.core/breakoutable-columns a-query stage-number)))))

(defn ^:export breakouts
  "Get the list of breakout clauses in `a-query` at the given `stage-number`, as a JS array of opaque values.

  Returns an empty array if there are no breakouts in the query.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/breakouts a-query stage-number)))

(defn ^:export breakout
  "Add a `breakout` clause to `a-query`. Returns the updated query.

  `breakoutable` should have come from [[breakoutable-columns]].

  > **Code health:** Healthy"
  [a-query stage-number breakoutable]
  (lib.core/breakout a-query stage-number (lib.core/ref breakoutable)))

(defn ^:export breakout-column
  "Given a `breakout-clause` from [[breakouts]], returns the column corresponding to `breakout-clause`.

  That column will include any temporal bucketing or binning settings on the breakout.

  > **Code health:** Healthy"
  [a-query stage-number breakout-clause]
  (lib.core/breakout-column a-query stage-number breakout-clause))

;; # Binning and Bucketing
;;
;; Metabase supports a few styles of "rounding" in breakouts, to group rows of raw data into meaningful units.
;;
;; The two fundamental kinds of rounding are **binning** and **temporal bucketing**.
;;
;; ## Binning
;;
;; Binning groups a column's values in one of two ways, by either controlling *number* of bins, or the *width* of each
;; bin.
;;
;; ### Fixed number of bins
;;
;; Any numeric column can be grouped into a **fixed number of bins** (say, 10), by dividing the range of the column's
;; values into `n` equal slices. For example, if a column's values range from 0 to 2000, `:num-bins 10` would split it
;; into 10 slices each 200 wide: 0-200, 200-400, 400-600, etc.

;; Aside: Fixed-width bins are different from quantiles! Quantiles would be slicing the other way: put an equal number
;; of *rows* into each bin, and let the endpoints between the bins vary.
;;
;; ### Fixed width bins
;;
;; When we understand the units in which the column is defined, we can give each bin a fixed width, and return as many
;; bins as necessary to hold all the rows. This is currently supported only for latitude and longitude columns.

(defn ^:export binning
  "Retrieves the binning settings for `a-column-or-clause`. Returns `nil` if binning is not set.

  > **Code health:** Healthy"
  [a-column-or-clause]
  (lib.core/binning a-column-or-clause))

(defn ^:export with-binning
  "Given `a-column-or-clause` and a `binning-option`, return a new column/clause with its binning settings updated.

  If `binning-option` is `nil`, removes any binning options currently present on `a-column-or-clause`.

  `binning-option` should be one of the opaque values returned by [[available-binning-strategies]].

  > **Code health:** Healthy"
  [a-column-or-clause binning-option]
  (lib.core/with-binning a-column-or-clause binning-option))

(defn ^:export available-binning-strategies
  "Returns a JS array of available binning strategies for `a-column-or-clause`, in the context of `a-query` and
  optionally `stage-number`. Defaults to the last stage.

  The list contains opaque values, which can be passed to [[display-info]] for rendering, or [[with-binning]] to
  attach them to `a-column-or-clause`.

  > **Code health:** Smelly. Stage numbers are required parameters nearly everywhere in this interface, and this
  function should be consistent."
  ([a-query x]
   (-> (lib.core/available-binning-strategies a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-binning-strategies a-query stage-number x)
       to-array)))

;; ## Temporal Bucketing

;; The other way to "round" a column's value is by units of time. This is a very common use case: looking at monthly
;; total sales, etc.

;; One subtlety is that some units are *cyclic* and others are *truncated*. For example, `:month-of-year` ranges from
;; 1 to 12 and puts data points from March 2024, March 2020, and March 1978 all in the same bucket. In contrast,
;; `:month` *truncates* the date values to midnight on the first day of the month, so it treats March 2024 separately
;; from March 2020.

;; For the purposes of the library, both styles are treated the same way: the unit is specified by name and passed on to
;; visualizations and to the query processor, which are responsible for interpreting the meaning of the unit.

(defn ^:export temporal-bucket
  "Get the current temporal bucketing setting of `a-clause-or-column`, if any.
  Returns `nil` if no temporal bucketing is set.

  > **Code health:** Healthy"
  [a-clause-or-column]
  (lib.core/temporal-bucket a-clause-or-column))

(defn ^:export with-temporal-bucket
  "Add the specified `bucketing-option` to `a-clause-or-column`, returning an updated form of the clause or column.

  If `bucketing-option` is `nil` (JS `undefined` or `null`), any existing temporal bucketing is removed.

  > **Code health:** Healthy"
  [a-clause-or-column bucketing-option]
  (lib.core/with-temporal-bucket a-clause-or-column bucketing-option))

(defn ^:export available-temporal-buckets
  "Get a list of available temporal bucketing options for `a-clause-or-column` in the context of `a-query`
  and `stage-number`. (Defaults to the last stage.)

  Returns a JS array of opaque values, which can be passed to [[display-info]] for rendering and
  [[with-temporal-bucket]] to set the bucketing on a clause or column.

  > **Code health:** Smelly. Most functions required `stage-number`, make it required here too for consistency."
  ([a-query x]
   (-> (lib.core/available-temporal-buckets a-query x)
       to-array))
  ([a-query stage-number x]
   (-> (lib.core/available-temporal-buckets a-query stage-number x)
       to-array)))

(defn ^:export available-temporal-units
  "The temporal bucketing units for date type expressions."
  []
  (to-array (map clj->js (lib.core/available-temporal-units))))

;; # Manipulating Clauses
;;
;; These three functions work on any kind of clause - aggregations, filters, breakouts, custom expressions, order-by.
;;
;; They are also intended to be smart, and leave the query in a good state. For example, removing a custom expression
;; will also remove anything that depended on it, recursively. Moving or replacing a clause will update any references
;; to it in other places (eg. an aggregation based on a custom expression that was just renamed).

(defn ^:export remove-clause
  "Removes the `target-clause` from the given stage of `a-query`.

  Use this to remove any clause (aggregations, breakouts, order by, filters, custom expressions, joins) from a query.

  The deletion *cascades*, recursively removing any other clauses that depended on the removed clause, such as a
  filter based on a custom expression.

  Does nothing if the clause can't be found.

  > **Code health:** Healthy."
  [a-query stage-number clause]
  (lib.core/remove-clause
   a-query stage-number
   (lib.core/normalize (js->clj clause :keywordize-keys true))))

(defn ^:export replace-clause
  "Replaces the `target-clause` with `new-clause` in the `query` stage.

  Does nothing if the `target-clause` cannot be found.

  > **Code health:** Healthy."
  [a-query stage-number target-clause new-clause]
  (lib.core/replace-clause
   a-query stage-number
   (lib.core/normalize (js->clj target-clause :keywordize-keys true))
   (lib.core/normalize (js->clj new-clause :keywordize-keys true))))

(defn ^:export swap-clauses
  "Exchanges the positions of two clauses of the same kind. Can be used for filters, aggregations, breakouts, and
  expressions.

  Returns the updated query. If it can't find both clauses in a single list, emits a warning and returns the query
  unchanged.

  > **Code health:** Healthy"
  [a-query stage-number source-clause target-clause]
  (lib.core/swap-clauses
   a-query stage-number
   (lib.core/normalize (js->clj source-clause :keywordize-keys true))
   (lib.core/normalize (js->clj target-clause :keywordize-keys true))))

(defn- unwrap [a-query]
  (let [a-query (mbql.js/unwrap a-query)]
    (cond-> a-query
      (map? a-query) (:dataset_query a-query))))

(defn- normalize-to-clj
  [a-query]
  (let [normalize-fn (fn [q]
                       (if (= (lib.util/normalized-query-type q) :mbql/query)
                         (lib.normalize/normalize q)
                         (mbql.normalize/normalize q)))]
    (-> a-query (js->clj :keywordize-keys true) unwrap normalize-fn)))

(defn ^:export normalize
  "Normalize the MBQL or pMBQL query `a-query`.

  Returns the JS form of the normalized query."
  [a-query]
  (-> a-query normalize-to-clj (clj->js :keyword-fn u/qualified-name)))

;; # Comparing queries
;; There are a few places in the FE where we need to compare two queries, typically to check whether the current
;; question has been changed and needs to be saved.

;; **This currently only works for legacy queries in JSON form.** At some point MLv2 queries will become the source of
;; truth, and the format used on the wire. At that point, we'll want a similar comparison for MLv2 queries.

;; TODO: These equality checks only seem to clean and check the last stages - does that really suffice?

(defn- prep-query-for-equals-legacy [a-query field-ids]
  (-> a-query
      ;; If `:native` exists, but it doesn't have `:template-tags`, add it.
      (m/update-existing :native #(merge {:template-tags {}} %))
      (m/update-existing :query (fn [inner-query]
                                  (let [fields (or (:fields inner-query)
                                                   (for [id field-ids]
                                                     [:field id nil]))]
                                    (-> inner-query
                                        ;; We ignore the order of the fields in the lists, but need to make sure any
                                        ;; dupes match up. Therefore de-dupe with `frequencies` rather than `set`.
                                        (assoc :fields (frequencies fields))
                                        ;; Remove the randomized idents, which are of course not going to match. These
                                        ;; are deprecated and should no longer be populated
                                        (dissoc :aggregation-idents :breakout-idents :expression-idents)))))
      ;; Ignore :info since it contains the randomized :card-entity-id. (This is no longer populated either.)
      (dissoc :info)))

(defn- prep-query-for-equals-pMBQL
  [a-query field-ids]
  (let [fields (or (some->> (lib.core/fields a-query)
                            (map #(assoc % 1 {})))
                   (mapv (fn [id] [:field {} id]) field-ids))]
    (lib.util/update-query-stage a-query -1
                                 #(-> %
                                      (assoc :fields (frequencies fields))
                                      lib.schema.util/remove-lib-uuids))))

(defn- prep-query-for-equals [a-query field-ids]
  (when-let [normalized-query (some-> a-query normalize-to-clj)]
    (if (contains? normalized-query :lib/type)
      (prep-query-for-equals-pMBQL normalized-query field-ids)
      (prep-query-for-equals-legacy normalized-query field-ids))))

(defn- compare-field-refs
  [[key1 id1 opts1]
   [key2 id2 opts2]]
  ;; A mismatch of `:base-type` or `:effective-type` when both x and y have values for it is a failure.
  ;; If either ref does not have the `:base-type` or `:effective-type` set, that key is ignored.
  (letfn [(clean-opts [o1 o2]
            (not-empty
             (cond-> o1
               (not (:base-type o2))      (dissoc :base-type)
               (not (:effective-type o2)) (dissoc :effective-type))))]
    (if (map? id1)
      (= [key1 (clean-opts id1 id2) opts1]
         [key2 (clean-opts id2 id1) opts2])
      (= [key1 id1 (clean-opts opts1 opts2)]
         [key2 id2 (clean-opts opts2 opts1)]))))

(defn- query=* [x y]
  (cond
    (and (vector? x)
         (vector? y)
         (= (first x) (first y) :field))
    (compare-field-refs x y)

    ;; Otherwise this is a duplicate of clojure.core/= except :lib/uuid values don't have to match.
    (and (map? x) (map? y))
    (let [x (dissoc x :lib/uuid)
          y (dissoc y :lib/uuid)]
      (and (= (set (keys x)) (set (keys y)))
           (every? (fn [[k v]]
                     (query=* v (get y k)))
                   x)))

    (and (sequential? x) (sequential? y))
    (and (= (count x) (count y))
         (every? true? (map query=* x y)))

    ;; Either mismatched map/sequence/nil/etc., or primitives like strings.
    ;; Either way, = does the right thing.
    :else (= x y)))

(defn ^:export query=
  "Returns whether the provided queries should be considered equal.

  If `field-ids` is specified, an input MBQL query without `:fields` set defaults to the `field-ids`.

  Currently this works only for legacy queries in JS form!
  It duplicates the logic formerly found in `query_builder/selectors.js`.

  > **Code health:** Legacy. New calls are acceptable if necessary. Eventually this will be replaced with an equivalent
  function that compares two pMBQL queries in CLJS form, but that needs pMBQL queries to be the source of truth on the
  wire, rather than legacy."
  ([query1 query2] (query= query1 query2 nil))
  ([query1 query2 field-ids]
   (let [ids (mapv js->clj field-ids)
         n1 (prep-query-for-equals query1 ids)
         n2 (prep-query-for-equals query2 ids)]
     (query=* n1 n2))))

;; # Column Groups
;; In many places in the FE we show a list of columns which might be used to filter, aggregate, etc. These are shown in
;; expandable groups by source: source table/previous stage first, then explicitly joined tables, then implicitly
;; joinable by different FKs.

(defn ^:export group-columns
  "Given the list of columns returned by a function like [[orderable-columns]], groups those columns by *source*,
  in the appropriate shape for rendering in the Query Builder.

  *Source* is any of:

  - source table/card/model
  - previous stage
  - explicitly joined table
  - implicitly joinable for each foreign key

  For example, given a sequence of columns like this:

      [venues.id
       venues.name
       venues.category-id
       ;; implicitly joinable
       categories.id
       categories.name]

  the groups would be:

      [{::columns [venues.id
                   venues.name
                   venues.category-id]}
       {::columns [categories.id
                   categories.name]}]

  Groups have the type `:metadata/column-group` and can be passed directly to [[display-info]].

  Use [[columns-group-columns]] to extract the columns from a group.

  > **Code health:** Healthy"
  [column-metadatas]
  (to-array (lib.core/group-columns column-metadatas)))

(defn ^:export columns-group-columns
  "Return the columns in this `column-group`.

  > **Code health:** Healthy"
  [column-group]
  (to-array (lib.core/columns-group-columns column-group)))

;; # Temporal unit descriptions
;; These return localized strings describing a temporal unit, interval, or relative date range.
;;
;; There's complex logic here, and it can be shared with BE for static viz, CSV downloads, etc.

(defn ^:export describe-temporal-unit
  "Get a translated description of a temporal bucketing unit.

  > **Code health:** Healthy"
  [n unit]
  (let [unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-temporal-unit n unit)))

(defn ^:export describe-temporal-interval
  "Get a translated description of a temporal bucketing interval.

  > **Code health:** Healthy"
  ([n unit]
   (describe-temporal-interval n unit {}))
  ([n unit opts]
   (let [n    (if (string? n) (keyword n) n)
         unit (if (string? unit) (keyword unit) unit)]
     (lib.core/describe-temporal-interval n unit (js->clj opts :keywordize-keys true)))))

(defn ^:export describe-relative-datetime
  "Get a translated description of a relative datetime interval.

  > **Code health:** Healthy"
  [n unit]
  (let [n    (if (string? n) (keyword n) n)
        unit (if (string? unit) (keyword unit) unit)]
    (lib.core/describe-relative-datetime n unit)))

;; # Aggregations

(defn ^:export aggregate
  "Adds an aggregation to `a-query`, returning the updated query.

  Construct `an-aggregation-clause` by calling [[aggregation-clause]].

  > **Code health:** Healthy"
  [a-query stage-number an-aggregate-clause]
  (lib.core/aggregate a-query stage-number (js->clj an-aggregate-clause :keywordize-keys true)))

(defn ^:export aggregations
  "Return a JS array of aggregations on a given stage of `a-query`.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/aggregations a-query stage-number)))

(defn ^:export aggregation-clause
  "Returns a standalone aggregation clause for an `aggregation-operator` and a `column`.

  For aggregations requiring an argument, `column` is mandatory, otherwise it is optional.

  Get a list of valid aggregation operators with [[available-aggregation-operators]].

  > **Code health:** Healthy"
  [aggregation-operator column]
  (if (undefined? column)
    (lib.core/aggregation-clause aggregation-operator)
    (lib.core/aggregation-clause aggregation-operator column)))

(defn ^:export available-aggregation-operators
  "Get the available aggregation operators for the stage with `stage-number` of the query `a-query`.

  These are opaque values that can be passed to [[display-info]], or to [[aggregation-clause]] to construct an
  aggregation.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/available-aggregation-operators a-query stage-number)))

(defn ^:export aggregation-operator-columns
  "Return a JS array of columns which `aggregation-operator` can be applied to.

  The columns are valid for the stage of the query that was used in
  [[available-aggregation-operators]] to get `aggregation-operator`."
  [aggregation-operator]
  (to-array (lib.core/aggregation-operator-columns aggregation-operator)))

(defn ^:export selected-aggregation-operators
  "Used when editing an aggregation. We need to show the list of possible aggregation operators with the selected one
  highlighted, and if it has a column, also the list of applicable columns with the selected one highlighted.

  Given a list of `agg-operators` from [[available-aggregation-operators]], goes through the operators and marks the
  operator used in `agg-clause` as `:selected? true`.

  If that operator needs a column, also searches the columns and marks the column from `agg-clause` as `:selected? true`
  as well.

  Returns the same list of `agg-operators` with those adjustments made.

  > **Code health:** Healthy"
  [agg-operators agg-clause]
  (to-array (lib.core/selected-aggregation-operators (seq agg-operators) agg-clause)))

;; # Filtering
;; Filters work in a similar way to aggregations and order-by, but are more complex since they can have several
;; parameters, which can be columns, several types of literal value, etc.
;;
;; The basic flow is: [[filterable-columns]] returns the list of columns which can be used for filtering, which include
;; the applicable filter operators. Call [[filter-clause]] with the operator, column and any more arguments, and pass
;; that clause to [[filter]].

(defn ^:export filterable-columns
  "Returns a JS array of columns available for filtering `a-query` on the given stage.

  The columns have extra information attached, giving the filter operators that can be used with that column.

  Cached on the query.

  > **Code health:** Healthy"
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "filterable-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (to-array (lib.core/filterable-columns a-query stage-number)))))

(defn ^:export filterable-column-operators
  "Returns the filter operators which can be used in a filter for `filterable-column`.

  `filterable-column` must be column coming from [[filterable-columns]]; this won't work with columns from other sources
  like [[visible-columns]].

  > **Code health:** Healthy"
  [filterable-column]
  (to-array (lib.core/filterable-column-operators filterable-column)))

(defn ^:export filter-clause
  "Given a `filter-operator`, `column`, and 0 or more extra arguments, returns a standalone filter clause.

  `filter-operator` comes from [[filterable-column-operators]], and `column` from [[filterable-columns]].

  > **Code health:** Healthy"
  [filter-operator column & args]
  (apply lib.core/filter-clause filter-operator column args))

(defn ^:export filter-operator
  "Returns the filter operator used in `a-filter-clause`.

  > **Code health:** Healthy"
  [a-query stage-number a-filter-clause]
  (lib.core/filter-operator a-query stage-number a-filter-clause))

(defn ^:export filter
  "Adds `a-filter-clause` as a filter on `a-query`."
  [a-query stage-number a-filter-clause]
  (lib.core/filter a-query stage-number (js->clj a-filter-clause :keywordize-keys true)))

(defn ^:export filters
  "Returns a JS array of all the filters on stage `stage-number` of `a-query`.

  Logically, the `WHERE` clause (or equivalent) of the query is the conjunction of these filters.

  If there are no filters on this query, returns an empty list.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/filters a-query stage-number)))

;; TODO: find-filter-for-legacy-filter is dead code and should be removed.

;; TODO: find-filterable-column-for-legacy-ref is dead code and should be removed.

;; # Expressions
;; Custom expressions are parsed from a string by a TS library, which returns legacy MBQL clauses. That may get ported
;; to Clojure someday, but perhaps not - it's quite standalone and there's no use case for that logic in the BE.

;; MLv2 expression clauses are constructed with [[expression-clause]] from an operator and list of args, typically
;; coming from that parser. An expression clause can be attached to a query with `expression`.

;; When rendering expressions, the FE calls [[expression-parts]], which returns a kind of AST for the expression.
;; This form is deliberately different from the MBQL representation.

(defn- expression-parts-like?
  "Test if [[x]] has the shape expression-parts, possible with missing :lib/type."
  [x]
  (and (map? x)
       (:operator x)
       (:args x)
       (or
        (and
         (not (:lib/type x))
         (not (:type x)))
        (= (:lib/type x) :mbql/expression-parts)
        (= (:type x) :mbql/expression-parts))))

(defn- expression-parts-js->cljs
  "When coming from js the expression parts will have no :lib/type, so we need to add
   it back in recursively for each node down the path."
  [x]
  (as-> x parts
    (js->clj parts :keywordize-keys true)
    (walk/postwalk
     #(cond-> %
        (expression-parts-like? %) (assoc :lib/type :mbql/expression-parts))
     parts)))

(defn ^:export expression-clause
  "Returns a standalone expression clause for the given `operator`, `options`, and list of arguments."
  ([x]
   (-> x
       expression-parts-js->cljs
       lib.core/expression-clause
       lib.core/normalize))
  ([an-operator args]
   (expression-clause an-operator args {}))
  ([an-operator args options]
   (expression-clause {:lib/type :mbql/expression-parts
                       :operator (keyword an-operator)
                       :args args
                       :options options})))

(defn ^:export expression-parts
  "Returns an AST for `an-expression-clause`.

  Each clause is transformed to a JS object like:

      {
        operator: \"=\",
        options: {\"case-sensitive\": true, \"include-current\": false},
        args: [column, 7],
      }

  Note that the `args` can contain nested expressions in the same form.

  > **Code health:** Healthy"
  [a-query stage-number an-expression-clause]
  (let [parts (lib.core/expression-parts a-query stage-number an-expression-clause)]
    (walk/postwalk
     (fn [node]
       (if (and (map? node) (= :mbql/expression-parts (:lib/type node)))
         (let [{:keys [operator options args]} node]
           #js {:operator (name operator)
                :options (fix-namespaced-values
                          (clj->js (select-keys options [:case-sensitive :include-current :base-type :mode]) :keyword-fn u/qualified-name))
                :args (to-array (map #(if (keyword? %) (u/qualified-name %) %) args))})
         node))
     parts)))

(defn ^:export string-filter-clause
  "Creates a string filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[string-filter-parts]]. To avoid mistakes the function requires `options` for all operators even
  though they might not be used. Note that the FE does not support `:is-null` and `:not-null` operators with string
  columns."
  [operator column values options]
  (lib.core/string-filter-clause (keyword operator)
                                 column
                                 (js->clj values)
                                 (js-obj->cljs-map options)))

(defn ^:export string-filter-parts
  "Destructures a string filter clause created by [[string-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape. To avoid mistakes the function returns `options` for all operators even though they might not be
  used. Note that the FE does not support `:is-null` and `:not-null` operators with string columns."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/string-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [operator column values options]} filter-parts]
      #js {:operator (name operator)
           :column   column
           :values   (to-array (map clj->js values))
           :options  (cljs-map->js-obj options)})))

(defn ^:export number-filter-clause
  "Creates a numeric filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[number-filter-parts]]."
  [operator column values]
  (lib.core/number-filter-clause (keyword operator)
                                 column
                                 (js->clj values)))

(defn ^:export number-filter-parts
  "Destructures a numeric filter clause created by [[number-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/number-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [operator column values]} filter-parts]
      #js {:operator (name operator)
           :column   column
           :values   (to-array (map clj->js values))})))

(defn ^:export coordinate-filter-clause
  "Creates a coordinate filter clause based on FE-friendly filter parts. It should be possible to destructure each
  created expression with [[coordinate-filter-parts]]."
  [operator column longitude-column values]
  (lib.core/coordinate-filter-clause (keyword operator)
                                     column
                                     longitude-column
                                     (js->clj values)))

(defn ^:export coordinate-filter-parts
  "Destructures a coordinate filter clause created by [[coordinate-filter-clause]]. Returns `nil` if the clause does not
  match the expected shape. Unlike regular numeric filters, coordinate filters do not support `:is-null` and
  `:not-null`. There is also a special `:inside` operator that requires both latitude and longitude columns."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/coordinate-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [operator column longitude-column values]} filter-parts]
      #js {:operator        (name operator)
           :column          column
           :longitudeColumn longitude-column
           :values          (to-array (map clj->js values))})))

(defn ^:export boolean-filter-clause
  "Creates a boolean filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[boolean-filter-parts]]."
  [operator column values]
  (lib.core/boolean-filter-clause (keyword operator)
                                  column
                                  (js->clj values)))

(defn ^:export boolean-filter-parts
  "Destructures a boolean filter clause created by [[boolean-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [a-query stage-boolean a-filter-clause]
  (when-let [filter-parts (lib.core/boolean-filter-parts a-query stage-boolean a-filter-clause)]
    (let [{:keys [operator column values]} filter-parts]
      #js {:operator (name operator)
           :column   column
           :values   (to-array (map clj->js values))})))

(defn ^:export specific-date-filter-clause
  "Creates a specific date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[specific-date-filter-parts]]."
  [operator column values with-time?]
  (lib.core/specific-date-filter-clause (keyword operator)
                                        column
                                        (js->clj values)
                                        with-time?))

(defn ^:export specific-date-filter-parts
  "Destructures a specific date filter clause created by [[specific-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/specific-date-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [operator column values with-time?]} filter-parts]
      #js {:operator (name operator)
           :column   column
           :values   (to-array (map clj->js values))
           :hasTime  with-time?})))

(defn ^:export relative-date-filter-clause
  "Creates a relative date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[relative-date-filter-parts]]."
  [column value unit offset-value offset-unit options]
  (lib.core/relative-date-filter-clause column
                                        value
                                        (keyword unit)
                                        offset-value
                                        (some-> offset-unit keyword)
                                        (js-obj->cljs-map options)))

(defn ^:export relative-date-filter-parts
  "Destructures a relative date filter clause created by [[relative-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/relative-date-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [column value unit offset-value offset-unit options]} filter-parts]
      #js {:column      column
           :value       value
           :unit        (name unit)
           :offsetValue offset-value
           :offsetUnit  (some-> offset-unit name)
           :options     (cljs-map->js-obj options)})))

(defn ^:export exclude-date-filter-clause
  "Creates an exclude date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[exclude-date-filter-parts]]."
  [operator column unit values]
  (lib.core/exclude-date-filter-clause (keyword operator)
                                       column
                                       (some-> unit keyword)
                                       (js->clj values)))

(defn ^:export exclude-date-filter-parts
  "Destructures an exclude date filter clause created by [[exclude-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [a-query stage-number a-filter-clause]
  (when-let [filter-parts (lib.core/exclude-date-filter-parts a-query stage-number a-filter-clause)]
    (let [{:keys [operator column unit values]} filter-parts]
      #js {:operator    (name operator)
           :column      column
           :unit        (some-> unit name)
           :values      (to-array (map clj->js values))})))

(defn ^:export time-filter-clause
  "Creates a time filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[time-filter-parts]]."
  [operator column values]
  (lib.core/time-filter-clause (keyword operator)
                               column
                               (js->clj values)))

(defn ^:export time-filter-parts
  "Destructures a time filter clause created by [[time-filter-clause]]. Returns `nil` if the clause does not match the
  expected shape."
  [a-query stage-boolean a-filter-clause]
  (when-let [filter-parts (lib.core/time-filter-parts a-query stage-boolean a-filter-clause)]
    (let [{:keys [operator column values]} filter-parts]
      #js {:operator (name operator)
           :column   column
           :values   (to-array (map clj->js values))})))

(defn ^:export default-filter-clause
  "Creates a default filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[default-filter-parts]]. This clause works as a fallback for more specialized column types."
  [operator column]
  (lib.core/default-filter-clause (keyword operator) column))

(defn ^:export default-filter-parts
  "Destructures a default filter clause created by [[default-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape or if the clause uses a string column; the FE allows only `:is-empty` and `:not-empty` operators
  for string columns."
  [a-query stage-boolean a-filter-clause]
  (when-let [filter-parts (lib.core/default-filter-parts a-query stage-boolean a-filter-clause)]
    (let [{:keys [operator column]} filter-parts]
      #js {:operator (name operator)
           :column   column})))

(defn ^:export join-condition-clause
  "Creates a join condition from the operator, LHS and RHS expressions. Expressions are opaque objects.

  > **Code health:** Healthy."
  [operator lhs-expression rhs-expression]
  (lib.fe-util/join-condition-clause (keyword operator) lhs-expression rhs-expression))

(defn ^:export join-condition-parts
  "Destructures a join condition created by [[join-condition-clause]]. Expressions are opaque objects.

  > **Code health:** Healthy."
  [condition]
  (when-let [parts (lib.fe-util/join-condition-parts condition)]
    (let [{:keys [operator lhs-expression rhs-expression]} parts]
      #js {:operator      (name operator)
           :lhsExpression lhs-expression
           :rhsExpression rhs-expression})))

(defn ^:export join-condition-lhs-or-rhs-literal?
  "Whether this LHS or RHS expression is a literal and not a custom expression.

  > **Code health:** Single use. This is used in the notebook editor."
  [lhs-or-rhs-expression]
  (lib.fe-util/join-condition-lhs-or-rhs-literal? lhs-or-rhs-expression))

(defn ^:export join-condition-lhs-or-rhs-column?
  "Whether this LHS or RHS expression is a column and not a custom expression.

  > **Code health:** Single use. This is used in the notebook editor."
  [lhs-or-rhs-expression]
  (lib.fe-util/join-condition-lhs-or-rhs-column? lhs-or-rhs-expression))

(defn ^:export column-metadata?
  "Returns true if arg is an MLv2 column, ie. has `:lib/type :metadata/column`.

  > **Code health:** Single use. This is used in the expression editor to parse and
  format expression clauses."
  [arg]
  (and (map? arg) (= :metadata/column (:lib/type arg))))

(defn ^:export metric-metadata?
  "Returns true if arg is named entity that can be used as an aggregation expression on its own, i.e., without
  wrapping it into an aggregating function.
  Currently, this can be an MLv2 metric (`:lib/type :metadata/metric`) or an aggregation column
  (`:lib/type :metadata/column` and `:lib/source :source/aggregations`).

  > **Code health:** Single use. This is used in the expression editor to parse and
  format expression clauses."
  [arg]
  (and (map? arg)
       (or (= (:lib/type arg) :metadata/metric)
           (and (= (:lib/type arg) :metadata/column)
                (= (:lib/source arg) :source/aggregations)))))

(defn ^:export segment-metadata?
  "Returns true if arg is an MLv2 metric, ie. has `:lib/type :metadata/segment`.

  > **Code health:** Single use. This is used in the expression editor to parse and
  format expression clauses."
  [arg]
  (and (map? arg) (= :metadata/segment (:lib/type arg))))

;; # Field selection
;; Queries can specify a subset of fields to return from their source table or previous stage. There are several
;; functions provided to inspect and manage that list of fields.

(defn ^:export fields
  "Get the list of fields currently set on `a-query` as a JS array.

  Returns `[]` if the fields are not set.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/fields a-query stage-number)))

(defn ^:export with-fields
  "Set the fields list for `a-query` to `new-fields`, a list of columns as returned by [[fieldable-columns]].

  This replaces any existing fields list. If `new-fields` is an empty array or `nil` (JS `null` or `undefined`), then
  the fields list on the query is cleared.

  > **Code health:** Healthy. But depending on what you're doing, it might be easier to call [[add-field]] and
  [[remove-field]]."
  [a-query stage-number new-fields]
  (lib.core/with-fields a-query stage-number new-fields))

(defn ^:export fieldable-columns
  "Return a JS array of columns that are valid to set in the fields list of `a-query`.

  Cached on the query.

  > **Code health:** Healthy"
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "fieldable-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (to-array (lib.core/fieldable-columns a-query stage-number)))))

(defn ^:export add-field
  "Adds a given `column` (as returned by [[fieldable-columns]]) to the fields returned by `a-query`.

  Exactly what this means depends on where the column comes from:

  - Source table/card, previous stage of the query, aggregation or breakout:
      - Add it to the fields list
      - If no fields list is set, it defaults to returning all fields, so do nothing.
  - Implicit join: add it to the fields list; the query processor will add the necessary join.
  - Explicit join: add it to the fields list on the join clause.
  - Custom expression: Do nothing - expressions are always included.

  > **Code health:** Healthy"
  [a-query stage-number column]
  (lib.core/add-field a-query stage-number column))

;; TODO: There's a mismatch here around aggregations and breakouts. They are treated like normal fields in `add-field`
;; but `remove-field` throws if you try to remove an aggregation or breakout, since they're always included.
;; I think the behavior of `remove-field` is the correct approach - removing a breakout or aggregation like this was
;; resulting in a broken query, see #34321. That being the case I think `add-field` on aggregations and breakouts should
;; also throw, since it's still a programming error.
;; Expressions should probably go the same way - throw on both sides.
;; Whichever way this goes, the code and docs here and in `metabase.lib.field` should be up to date.

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

;; # Visible and Returned Columns
;; These two sets of columns are fundamental.

;; ## Returned Columns
;; This is the set of columns that will go into the table viz, or become the previous stage columns for a later stage.
;; Stages with aggregations are handled differently from other stages.

;; With at least one aggregation, the returned columns are exactly the aggregations and breakouts from this stage, and
;; no more.

;; Otherwise, the returned columns come from several sources. The basic source is (a subset of) the columns from the
;; source table/card/model or the previous stage. If the fields list is set, it names a subset of those columns which
;; are included in this stage. With no fields list, all columns from the source are returned.

;; Next, each explicit join also has a fields list and defaults to including all the columns from the joined table.

;; Finally, custom expressions are always returned.
(defn- returned-columns*
  "Inner implementation for [[returned-columns]], which wraps this with caching."
  [a-query stage-number]
  (let [stage          (lib.util/query-stage a-query stage-number)
        unique-name-fn (lib.util/unique-name-generator)]
    (->> (lib.metadata.calculation/returned-columns a-query stage-number stage)
         (map #(-> %
                   (assoc :selected? true)
                   ;; Unique names are required by the FE for compatibility.
                   ;; This applies only for JS; Clojure usage should prefer `:lib/desired-column-alias` to `:name`, and
                   ;; that's already unique by construction.
                   ;;
                   ;; TODO (Cam 7/8/25) -- shouldn't this use `:lib/deduplicate-name` or something?? Shouldn't we do
                   ;; this generally everywhere? (Also, we're already doing this in the `returned-columns-method`
                   (update :name unique-name-fn)))
         to-array)))

(defn ^:export returned-columns
  "Return a JS array of columns which are returned from this stage of `a-query`.

  > **Code health:** Healthy"
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "returned-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (returned-columns* a-query stage-number))))

;; ## Visible Columns

;; *Visible* columns are all the columns which are in scope at the given stage of the query.

;; The most immediate source of columns for a first stage is the source table (or saved question, or model); for later
;; stages it's the previous stage's _returned columns_. Then any custom expressions on this stage are visible, as are
;; all the columns from any explicitly joined tables.

;; Finally, any foreign key in that set of columns can be implicitly joined, which brings in all the column from another
;; table. Note that implicitly joinable FKs are **not** recursively implicitly joinable!

;; Aggregations and breakouts are not part of the visible columns, since the visible columns are what's available on the
;; query to be aggregated or used as a breakout.

;; ## What about the other sets of columns?
;; This interface contains several other sets of columns, like [[filterable-columns]] and [[expressionable-columns]];
;; these are subsets of [[visible-columns]] possibly with extra information added, such as the set of filter operators
;; which can be used with that column.
(defn- visible-columns*
  "Inner implementation for [[visible-columns]], which wraps this with caching."
  [a-query stage-number]
  (let [stage       (lib.util/query-stage a-query stage-number)
        vis-columns (lib.metadata.calculation/visible-columns a-query stage-number stage)
        ret-columns (lib.metadata.calculation/returned-columns a-query stage-number stage)]
    (to-array (lib.equality/mark-selected-columns a-query stage-number vis-columns ret-columns))))

(defn ^:export visible-columns
  "Returns a JS array of all columns \"visible\" at the given stage of `a-query`.

  Does not pass any options to [[lib.core/visible-columns]], so it uses the defaults (which are to include everything).

  One important difference from the Clojure-facing [[lib.core/visible-columns]]: this marks all the columns which are
  returned from the query as `:selected? true` (`isSelected: true` in JS display info).

  > **Code health:** Slightly smelly. Generally the specialized subsets such as [[expressionable-columns]] should be
  preferred over calling [[visible-columns]] directly."
  ;; TODO: This may become unnecessary as legacy usages are ported.
  [a-query stage-number]
  ;; Attaches the cached columns directly to this query, in case it gets called again.
  (lib.cache/side-channel-cache
   (keyword "visible-columns" (str "stage-" stage-number)) a-query
   (fn [_]
     (visible-columns* a-query stage-number))))

;; ## Column keys
(defn ^:export column-key
  "Given a column, as returned by [[visible-columns]], [[returned-columns]] etc., return a string suitable for uniquely
  identifying the column on its query.

  This key will generally not be changed by unrelated edits to the query.

  (Currently this is powered by `:lib/desired-column-alias`, but it's deliberately opaque.)"
  [a-column]
  (or (:lib/desired-column-alias a-column)
      (:name a-column)))

;; ## Legacy refs
(defn- normalize-legacy-ref
  [a-ref]
  (if (#{:aggregation :metric :segment} (first a-ref))
    (subvec a-ref 0 2)
    (update a-ref 2 update-vals #(if (qualified-keyword? %)
                                   (u/qualified-name %)
                                   %))))

(defn- legacy-ref->pMBQL [a-legacy-ref]
  (-> a-legacy-ref
      (js->clj :keywordize-keys true)
      (update 0 keyword)
      (->> (mbql.normalize/normalize-fragment nil))
      lib.convert/->pMBQL
      (->> (lib.normalize/normalize ::lib.schema.ref/ref))))

(defn- ref->legacy-ref
  [a-ref]
  (-> a-ref
      lib.convert/->legacy-MBQL
      normalize-legacy-ref))

(defn ^:export legacy-ref
  "Given a column, metric or segment metadata from eg. [[fieldable-columns]] or [[available-segments]],
  return it as a legacy JSON field ref.

  For compatibility reasons, segment and metric references are always returned without options.

  > **Code health:** Legacy. New calls strongly discouraged; refs are a bad leak in the abstraction and we should aim
  to refactor the existing ones."
  [a-query stage-number column]
  (lib.convert/with-aggregation-list (:aggregation (lib.util/query-stage a-query stage-number))
    (-> column
        lib.core/ref
        ref->legacy-ref
        clj->js)))

(defn- ->column-or-ref [column]
  (if-let [^js legacy-column (when (object? column) column)]
    ;; Convert legacy columns like we do for metadata.
    (let [parsed (js.metadata/parse-column legacy-column)]
      (if (= (:lib/source parsed) :source/aggregations)
        ;; Special case: Aggregations need to be converted to a pMBQL :aggregation ref and :lib/source-uuid set.
        (let [agg-ref (legacy-ref->pMBQL (.-field_ref legacy-column))]
          (assoc parsed :lib/source-uuid (last agg-ref)))
        parsed))
    ;; It's already a :metadata/column map
    column))

(defn ^:export find-column-indexes-from-legacy-refs
  "Given a list of columns (either JS `data.cols` or MLv2 `ColumnMetadata`) and a list of legacy refs, find each ref's
  corresponding index into the list of columns.

  Returns a parallel list to the refs, with the corresponding index, or -1 if no matching column is found.

  > **Code health:** Legacy. This is used in several places, mostly because legacy field refs are used as the keys to
  identify a column in viz settings. Avoid new calls if you have an alternative way to find the column you need. But if
  you need it, no worries about a new call."
  [a-query stage-number legacy-columns legacy-refs]
  ;; Set up this query stage's `:aggregation` list as the context for [[lib.convert/->pMBQL]] to convert legacy
  ;; `[:aggregation 0]` refs into pMBQL `[:aggregation uuid]` refs.
  (lib.convert/with-aggregation-list (:aggregation (lib.util/query-stage a-query stage-number))
    (let [haystack      (mapv ->column-or-ref legacy-columns)
          needles       (map legacy-ref->pMBQL legacy-refs)
          column-refs   (into {} (keep-indexed (fn [i col]
                                                 [(-> col
                                                      lib.core/ref
                                                      lib.convert/->legacy-MBQL
                                                      normalize-legacy-ref)
                                                  i]))
                              legacy-columns)
          exact-matches (map #(-> %
                                  (js->clj :keywordize-keys true)
                                  (update 0 keyword)
                                  column-refs)
                             legacy-refs)]
      (if (every? #(and % (>= % 0)) exact-matches)
        (to-array exact-matches)
        #_{:clj-kondo/ignore [:discouraged-var]}
        (to-array (lib.equality/find-column-indexes-for-refs a-query stage-number needles haystack))))))

(defn ^:export source-table-or-card-id
  "Returns the ID of the source table (as a number) or the ID of the source card (as a string prefixed
  with \"card__\") of `a-query`. If `a-query` has none of these, nil is returned.

  > **Code health:** Legacy. This is exposing too much about cards and sources. Its callers will likely have to be
  updated to handle Metrics v2."
  ;; TODO: Figure out what the callers of this function really need it for, and consider an alternative design.
  ;; [[with-different-table]] should be included in that refactor.
  [a-query]
  (or (lib.util/source-table-id a-query)
      (some->> (lib.util/source-card-id a-query) (str "card__"))))

;; # Joins
;; Joins are a relatively complex component of a query. They specify a table (or model, in theory), 1 or more conditions
;; (which resemble filters), an optional subset of fields to include from the joined table, and one of a handful of join
;; *strategies* (`LEFT OUTER`, `RIGHT OUTER`, and `INNER`).
;;
;; These user-visible joins are referred to as *explicit* joins, to differentiate them from *implicit* joins, which
;; simply name a foreign column and the foreign key on this query which points to its table. The query processor will
;; collect these and unify them with the explicit joins to keep the size of the query down.

(defn ^:export join-strategy
  "Get the strategy (`INNER`, `LEFT`, `OUTER`) of `a-join` as an opaque value.

  > **Code health:** Healthy"
  [a-join]
  (lib.core/join-strategy a-join))

(defn ^:export with-join-strategy
  "Returns `a-join` with its *strategy* updated to the given `strategy`.

  `strategy` should be one of the opaque values returned by [[available-join-strategies]].

  > **Code health:** Healthy"
  [a-join strategy]
  (lib.core/with-join-strategy a-join strategy))

(defn ^:export available-join-strategies
  "Returns a JS array of available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/features]]), as opaque values suitable for passing to [[with-join-strategy]].

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/available-join-strategies a-query stage-number)))

(defn ^:export join-condition-lhs-columns
  "Returns a JS array of columns which are valid as the left-hand-side in a join condition. By \"left-hand-side\" is
  meant the *source column*, the one already present in the query. These columns come from the source table/card/model,
  a previous stage, or a *previous* join.

  When editing an existing join, `join-or-joinable` must be the original join clause, or this function will return
  incorrect results. That's what enables this function to know which joins are before this one, and therefore visible as
  a possible LHS. It doesn't make sense to show this join's own columns, or those of later joins.

  When creating a new join, `join-or-joinable` can be `nil` (JS `undefined` or `null`), or a *joinable*: a table or
  card.

  If you are changing the LHS of a condition for an existing join, pass in that existing join as `join-or-joinable` so
  we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
  for its own LHS) or added by later joins (joins can only depend on things from previous joins).

  When building a new join, either pass in `nil` or something joinable (Table or Card metadata) that we're joining to.
  (This argument is actually ignored if it's not a join, but these types are accepted for consistency with
  [[join-condition-rhs-columns]] which does use the argument. See #32005.)

  If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-expression-or-nil` so we can
  mark the current column as `:selected` in the return value.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI), pass
  it as `rhs-expression-or-nil`. In the future this may be used to restrict results to compatible columns; see #31174.

  Results will be returned in a 'somewhat smart' order, with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly joinable columns **are not** returned here.

  > **Code health:** Healthy"
  [a-query stage-number join-or-joinable lhs-expression-or-nil rhs-expression-or-nil]
  (to-array (lib.core/join-condition-lhs-columns a-query
                                                 stage-number
                                                 join-or-joinable
                                                 lhs-expression-or-nil
                                                 rhs-expression-or-nil)))

(defn ^:export join-condition-rhs-columns
  "Returns a JS array of columns which are valid as the right-hand side of a join condition. By \"right-hand side\" is
  meant the *target column*, the column on the table being joined into the query.

  `join-or-joinable` is either the current join clause being edited, or anything *joinable*: a table, saved question,
  model, etc.

  If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass it as `lhs-expression-or-nil`. (Currently this is ignored, but in the future it may be used to restrict results
  to compatible columns; see #31174.)

  If we're *editing* an existing join condition with the RHS column already chosen, pass it as `rhs-expression-or-nil`,
  so it can be marked as `:selected` in the returned list.

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  > **Code health:** Healthy"
  [a-query stage-number join-or-joinable lhs-expression-or-nil rhs-expression-or-nil]
  (to-array (lib.core/join-condition-rhs-columns a-query
                                                 stage-number
                                                 join-or-joinable
                                                 lhs-expression-or-nil
                                                 rhs-expression-or-nil)))

(defn ^:export join-condition-operators
  "Returns a JS array of valid filter clause operators that can be used to build a join condition.

  In the Query Builder UI, this can be chosen at any point before or after choosing the LHS and RHS columns. Invalid
  operators are not currently filtered out based on values of the LHS or RHS, but in the future we can add this.
  See #31174.

  > **Code health:** Healthy"
  [a-query stage-number lhs-expression-or-nil rhs-expression-or-nil]
  (to-array (map name (lib.core/join-condition-operators a-query
                                                         stage-number
                                                         lhs-expression-or-nil
                                                         rhs-expression-or-nil))))

;; TODO: Move the join and expressions functions to be contiguous instead of interleaved.

(defn ^:export expression
  "Adds a `an-expression-clause` to `query` with the user-defined `expression-name`.

  > **Code health:** Healthy"
  [a-query stage-number expression-name an-expression-clause]
  (lib.core/expression a-query stage-number expression-name an-expression-clause))

(defn ^:export with-expression-name
  "Return a new expression clause like `an-expression-clause` but with name `new-name`.

  > **Code health:** Healthy"
  [an-expression-clause new-name]
  ;; For normal expressions on a query stage, this sets the `:lib/expression-name` option.
  ;; For custom aggregation expressions this sets the `:display-name` option instead.
  (lib.core/with-expression-name an-expression-clause new-name))

(defn ^:export expressions
  "Returns a JS array of expressions on the given stage of `a-query`."
  [a-query stage-number]
  (to-array (lib.core/expressions a-query stage-number)))

(defn ^:export expressionable-columns
  "Returns a JS array of those columns that can be used in an expression in the given stage of `a-query`.

  `expression-position` (a 0-based index) containing the position of the expression in the list. It could be
  significant when editing an existing expression, but it's not currently used.

  When creating a new expression, `expression-position` should be `nil` (JS `null` or `undefined`).

  Cached on the query and stage.

  > **Code health:** Healthy"
  [a-query stage-number expression-position]
  (lib.cache/side-channel-cache
    ;; Caching is based on both the stage and expression position, since they can return different sets.
    ;; TODO: Since these caches are mainly here to avoid expensively recomputing things in rapid succession, it would
    ;; probably suffice to cache only the last position, and evict if it's different. But the lib.cache system doesn't
    ;; support that currently.
   (keyword "expressionable-columns" (str "stage-" stage-number "-" expression-position)) a-query
   (fn [_]
     (to-array (lib.core/expressionable-columns a-query stage-number expression-position)))))

(defn ^:export aggregable-columns
  "Returns a JS array of those columns that can be used in an aggregation expression in the given stage of `a-query`.

  `expression-position` (a 0-based index) containing the position of the expression in the list. It could be
  significant when editing an existing expression, but it's not currently used.

  When creating a new expression, `expression-position` should be `nil` (JS `null` or `undefined`).

  Cached on the query and stage.

  > **Code health:** Healthy"
  [a-query stage-number expression-position]
  (lib.cache/side-channel-cache
    ;; Caching is based on both the stage and expression position, since they can return different sets.
    ;; TODO: Since these caches are mainly here to avoid expensively recomputing things in rapid succession, it would
    ;; probably suffice to cache only the last position, and evict if it's different. But the lib.cache system doesn't
    ;; support that currently.
   (keyword "aggregable-columns" (str "stage-" stage-number "-" expression-position)) a-query
   (fn [_]
     (to-array (lib.core/aggregable-columns a-query stage-number expression-position)))))

(defn ^:export column-extractions
  "Column extractions are a set of transformations possible on a given `column`, based on its type.

  For example, we might extract the day of the week from a temporal column, or the domain name from an email or URL.

  Returns a (possibly empty) JS array of possible column extractions for the given column.

  > **Code health:** Healthy"
  [a-query column]
  (to-array (lib.core/column-extractions a-query column)))

(defn ^:export extract
  "Given `a-query` and an `extraction` from [[column-extractions]], apply that extraction to the query.

  Generally this means adding a new expression. Returns an updated query.

  > **Code health:** Healthy"
  [a-query stage-number extraction]
  (lib.core/extract a-query stage-number extraction))

(defn ^:export extraction-expression
  "Given `a-query` and an `extraction`, returns the expression it represents, as an opaque form similarly to
  [[expression-clause]]. It can be passed to [[expression]] to add it to the query. (Though if that's all you need, use
  [[extract]] instead.)

  > **Code health:** Healthy"
  [_a-query _stage-number extraction]
  (lib.core/extraction-expression extraction))

(defn ^:export suggested-join-conditions
  "Returns a JS array of possible default join conditions when joining against `joinable`, e.g. a Table, Saved
  Question, or another query. Suggested conditions will be returned if the existing query has a foreign key to the
  primary key of the `joinable`. (See #31175 for more info.)

  When editing a join, the `position` (0-based index) of the join should be provided. Any columns introduced by that
  join or later joins are treated as not available for join conditions.

  Returns `[]` if we cannot determine any \"obvious\" join conditions.

  > **Code health:** Healthy"
  ([a-query stage-number joinable]
   (to-array (lib.core/suggested-join-conditions a-query stage-number joinable)))
  ([a-query stage-number joinable position]
   (to-array (lib.core/suggested-join-conditions a-query stage-number joinable position))))

(defn ^:export join-fields
  "Get the fields list associated with `a-join`. That is, the set of fields from the *joinable* which are being joined
  into the query.

  This is either a JS array of columns, or one of the keywords `:all` or `:none`.

  > **Code health:** Healthy. This returns refs, but they're treated as opaque."
  [a-join]
  (let [joined-fields (lib.core/join-fields a-join)]
    (if (keyword? joined-fields)
      (u/qualified-name joined-fields)
      (to-array joined-fields))))

(defn ^:export with-join-fields
  "Set the `:fields` for `a-join`, returning a new join clause.

  This can either be a list of fields, or a string or keyword `:all` or `:none`.

  > **Code health:** Healthy. This consumes field refs, but they're treated as opaque."
  [a-join new-fields]
  (lib.core/with-join-fields a-join (cond-> new-fields
                                      (string? new-fields) keyword)))

(defn ^:export join-clause
  "Create a join clause (an `:mbql/join` map) against something `joinable` (Table metadata, a Saved Question, another
  query, etc.) with 1 or more `conditions`, which should be an array of filter clauses, and a join strategy. You can
  then adjust this join clause with functions like [[with-join-fields]], or add it to a query with [[join]].

  > **Code health:** Healthy"
  [joinable conditions strategy]
  (lib.core/join-clause joinable conditions strategy))

(defn ^:export join
  "Add `a-join`, a join clause as created by [[join-clause]], to the specified stage of `a-query`.

  > **Code health:** Healthy"
  [a-query stage-number a-join]
  (lib.core/join a-query stage-number a-join))

(defn ^:export join-conditions
  "Get the conditions associated with `a-join`, as a JS array of filter clauses.

  > **Code health:** Healthy"
  [a-join]
  (to-array (lib.core/join-conditions a-join)))

(defn ^:export with-join-conditions
  "Set the conditions for `a-join`, returning a new join clause.

  `conditions` should be a list of filter clauses; see [[filter-clause]].

  > **Code health:** Healthy"
  [a-join conditions]
  (lib.core/with-join-conditions a-join (js->clj conditions :keywordize-keys true)))

(defn ^:export joins
  "Return a JS array of all joins on the given stage of `a-query`.

  Returns `[]` if there are no joins on this stage.

  > **Code health:** Healthy"
  [a-query stage-number]
  (to-array (lib.core/joins a-query stage-number)))

(defn ^:export rename-join
  "Rename the join specified by `join-spec` on the given stage of `a-query` to `new-name`.

  `join-spec` can be any of:

  - The join clause itself (as returned by [[joins]])
  - Its join alias (a string)
  - Its index in the list of joins as returned by [[joins]]

  If the specified join cannot be found, then `a-query` is returned with no changes.

  If renaming the join to `new-name` would clash with an existing join, a suffix is appended to `new-name` to make it
  unique.

  > **Code health:** Healthy"
  [a-query stage-number join-spec new-name]
  (lib.core/rename-join a-query stage-number join-spec new-name))

(defn ^:export remove-join
  "Remove the join specified by `join-spec` from the given stage of `a-query` at `stage-number`.

  `join-spec` can be any of:

  - The join clause itself (as returned by [[joins]])
  - Its join alias (a string)
  - Its index in the list of joins as returned by [[joins]]

  If the specified join cannot be found, then `a-query` is returned with no changes.

  Other clauses which reference the removed join (eg. filters, breakouts or aggregations which reference joined columns)
  are also removed, and so on recursively.

  > **Code health:** Healthy"
  [a-query stage-number join-spec]
  (lib.core/remove-join a-query stage-number join-spec))

(defn ^:export joined-thing
  "Return metadata about the origin of `a-join`, typically a table, card or model.

  > **Code health:** Healthy"
  [a-query a-join]
  (lib.join/joined-thing a-query a-join))

(defn ^:export picker-info
  "Temporary solution providing access to internal IDs for the FE to pass on to MLv1 functions.

  > **Code health:** Single-use, Legacy, Deprecated! This exists only to support some legacy UI in the join picker. No
  new calls should be added, and the UI should be refactored to remove the need for this function."
  [a-query metadata]
  (case (:lib/type metadata)
    :metadata/table #js {:databaseId (:database a-query)
                         :tableId (:id metadata)}
    :metadata/card  #js {:databaseId (:database a-query)
                         :tableId (str "card__" (:id metadata))
                         :cardId (:id metadata)
                         :isModel (= (keyword (:type metadata)) :model)}
    (do
      (log/warn "Cannot provide picker-info for" (:lib/type metadata))
      nil)))

(defn ^:export external-op
  "Convert an expression or filter `clause` to the AST format used by [[expression-parts]].

  > **Code health:** Smelly. How is this different from [[expression-parts]]? These two should likely be unified."
  [clause]
  (let [{:keys [operator options args]} (lib.core/external-op clause)]
    #js {:operator operator
         :options (clj->js options)
         :args (to-array args)}))

(defn ^:export native-query
  "Create a new native query.

  *Native* in this sense means a pMBQL query where the first stage is `:mbql.stage/native`.

  > **Code health:** Healthy"
  [database-id metadata inner-query]
  (lib.core/native-query (metadataProvider database-id metadata) inner-query))

(defn ^:export with-native-query
  "Update the raw native query. The first stage of `a-query` must already be a native stage.

  Replaces templates tags.

  > **Code health:** Healthy."
  [a-query inner-query]
  (lib.core/with-native-query a-query inner-query))

(defn- remove-undefined-properties
  [obj]
  (cond-> obj
    (object? obj) (gobject/filter (fn [e _ _] (not (undefined? e))))))

(defn- template-tags-js->cljs
  [tags]
  (-> tags
      (gobject/map (fn [e _ _]
                     (remove-undefined-properties e)))
      js->clj
      (update-vals (fn [tag]
                     (-> tag
                         (update-keys keyword)
                         (update :type keyword)
                         (m/update-existing :widget-type #(some-> % keyword))
                         (m/update-existing :dimension #(some-> % legacy-ref->pMBQL)))))))

(defn- template-tags-cljs->js
  [tags]
  (-> tags
      (update-vals (fn [tag]
                     (-> tag
                         (update :type name)
                         (m/update-existing :widget-type #(some-> % u/qualified-name))
                         (m/update-existing :dimension #(some-> % ref->legacy-ref)))))
      (clj->js :keyword-fn u/qualified-name)))

(defn ^:export with-template-tags
  "Updates the native first stage of `a-query`'s template tags to the provided `tags`.

  > **Code health:** Healthy"
  [a-query tags]
  (lib.core/with-template-tags a-query (template-tags-js->cljs tags)))

(defn ^:export raw-native-query
  "Returns the native query string for the native first stage of `a-query`.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/raw-native-query a-query))

(defn ^:export template-tags
  "Returns the template tags for the native first stage of `a-query`, as a JS object mapping tag names to tag info.

  > **Code health:** Healthy"
  [a-query]
  (template-tags-cljs->js (lib.core/template-tags a-query)))

(defn ^:export required-native-extras
  "Returns a JS array of the extra keys that are required for this database's native queries.

  For example `:collection` name is needed for MongoDB queries.

  > **Code health:** Single use. This is only intended to be called from the native query editor."
  [database-id metadata]
  (to-array
   (map u/qualified-name
        (lib.core/required-native-extras (metadataProvider database-id metadata)))))

(defn ^:export has-write-permission
  "Returns whether the database targeted by `a-query` has native write permissions.

  > **Code health:** Single use. This is only intended to be called from the native query editor."
  [a-query]
  (lib.core/has-write-permission a-query))

(defn ^:export with-different-database
  "Changes the database for `a-query`. The first stage of `a-query` must be a native type.

  `native-extras` must be provided if the database needs any extras (eg. MongoDB collection name), as a map from extra
  name to value.

  Returns the updated query.

  > **Code health:** Healthy"
  [a-query database-id metadata]
  (lib.core/with-different-database a-query (metadataProvider database-id metadata)))

(defn ^:export with-native-extras
  "Updates the values of the extras required for the DB to run `a-query`. The first stage must be a native type.

  `native-extras` is a JS map of extra names (as returned by [[required-native-extras]]) to their values.

  Will ignore extras not in [[required-native-extras]].

  > **Code health:** Healthy"
  [a-query native-extras]
  (lib.core/with-native-extras a-query (js->clj native-extras :keywordize-keys true)))

(defn ^:export native-extras
  "Returns the native extras (eg. MongoDB collection name) associated with `a-query`'s native first stage, as a JS map
  of extra names to values.

  > **Code health:** Healthy"
  [a-query]
  (clj->js (lib.core/native-extras a-query)))

(defn ^:export engine
  "Returns the database engine of the database targeted by `a-query`, which must have a native first stage.

  > **Code health:** Healthy."
  [a-query]
  (some-> (lib.core/engine a-query) name))

;; # Legacy Segments
;; Segments are a deprecated kind of reusable query fragments, roughly equivalent to a set of filter clauses.
;;
;; These functions still work, but they're **Legacy** and **Single Use**, and will be removed when legacy Segments are
;; removed from the product in 2024.
(defn ^:export segment-metadata
  "Get metadata for the legacy Segment with `segment-id`, if it can be found.

  `metadata-providerable` is anything that can provide metadata - it can be JS `Metadata` itself, but more commonly it
  will be a query.

  > **Code health:** Legacy, Single use, Deprecated. No new calls; this is only for legacy Segments and will be removed
  when they are."
  [metadata-providerable segment-id]
  (lib.metadata/segment metadata-providerable segment-id))

(defn ^:export available-segments
  "Returns a JS array of opaque legacy Segments metadata objects, that could be used as filters for `a-query`.

  > **Code health:** Legacy, Single use, Deprecated. No new calls; this is only for legacy Segments and will be removed
  when they are."
  [a-query stage-number]
  (to-array (lib.core/available-segments a-query stage-number)))

(defn ^:export available-metrics
  "Returns a JS array of opaque metadata values for those Metrics that could be used as aggregations on
  `a-query`.

  > **Code health:** Healthy."
  [a-query stage-number]
  (to-array (lib.core/available-metrics a-query stage-number)))

;; TODO: Move all the join logic into one block - it's scattered all through the lower half of this namespace.

(defn ^:export joinable-columns
  "Returns a JS array of columns that are available when joining `join-or-joinable` into `a-query`.

  `join-or-joinable` can be a join clause, or something joinable (a table, card, model, etc.).

  If `join-or-joinable` is a join clause already added to `a-query`, the currently selected columns will be marked
  `:selected true` for highlighting in the UI.

  The returned columns can be passed to [[with-join-fields]] to configure which list of columns are joined.

  Note that this is *not* cached like most of the other `___able-columns` functions, since the `join-or-joinable` is
  part of the key and difficult to cache.

  > **Code health:** Healthy"
  [a-query stage-number join-or-joinable]
  ;; TODO: It's not practical to cache this currently. We need to be able to key off the query and the joinable, which
  ;; is not supported by the lib.cache system.
  (to-array (lib.core/joinable-columns a-query stage-number join-or-joinable)))

;; TODO: table-or-card-metadata is too specific and leaks details of how sources are stored. We need a higher-level API
;; for the sources of queries, especially with Metrics v2.

(defn ^:export table-or-card-metadata
  "Given an integer `table-id`, returns the table's metadata. Given a legacy `\"card__123\"` string, returns the card's
  metadata.

  Returns `nil` (JS `null`) if no matching metadata is found.

  > **Code health:** Legacy. Avoid new calls - this leaks too much of how sources are stored, and with Metrics v2 the
  way sources are stored will be evolving. A more general API for checking the sources of a query (or join) should be
  added, and then this function deprecated and removed."
  [query-or-metadata-provider table-id]
  (lib.metadata/table-or-card query-or-metadata-provider table-id))

;; TODO: "LHS" is a confusing name here. This is really the display name for the joined thing, usually a table.
;; It's an internal detail that this is often based on the LHS of the first join condition, ie. the FK's name.

(defn ^:export join-lhs-display-name
  "Get the display name for the joined table, card, model, etc.

  For an existing join, `join-or-joinable` should be the join clause as returned by [[joins]].

  For a new join under construction, `join-or-joinable` should be the target entity, eg. table or card metadata.

  If the join has a condition set, its LHS column should be passed as `condition-lhs-expression-or-nil`. If not defined
  yet, pass `nil` (JS `null` or `undefined`).

  > **Code health:** Smelly. Name should be updated, and docs expanded to explain how the name is calculated; see the
  docs on [[metabase.lib.join/join-lhs-display-name]]."
  [a-query stage-number join-or-joinable condition-lhs-expression-or-nil]
  (lib.core/join-lhs-display-name a-query stage-number join-or-joinable condition-lhs-expression-or-nil))

(defn ^:export database-id
  "Get the Database ID (`:database`) associated with `a-query`.

  Typically this is straightforward: queries generally specify the database ID they are querying.

  However, in some cases where the source is a saved question, a magic value is used,
  [[metabase.legacy-mbql.schema/saved-questions-virtual-database-id]]:

      {:database -1337}

  We attempt to resolve the correct Database ID by getting the metadata for any source card and checking its
  database ID. If that is not available, this function will return `nil` (JS `null`).

  > **Code health:** Healthy."
  [a-query]
  (lib.core/database-id a-query))

(defn ^:export join-condition-update-temporal-bucketing
  "Updates the provided `join-condition` so both the LHS and RHS columns have the provied temporal bucketing option.

  `join-condition` must be a *standard join condition*, meaning it's in the form constructed by the query builder UI,
  where the LHS is a column in the outer query and RHS is a column from the joinable.

  Returns a new `join-condition`, where both the LHS and RHS of the comparison are updated with `bucketing-option`.
  If temporal bucketing is not supported by these columns, they are returned unchanged.

  > **Code health:** Single use. Avoid new calls; this is only intended to be called from the query builder UI."
  [a-query stage-number join-condition bucketing-option]
  (lib.core/join-condition-update-temporal-bucketing a-query stage-number join-condition bucketing-option))

(defn- fix-column-with-ref [a-ref column]
  (cond-> column
    ;; Sometimes the FE has result metadata from the QP, without the required :lib/source-uuid on it.
    ;; We have the UUID for the aggregation in its ref, so use that here.
    (some-> a-ref first (= :aggregation)) (assoc :lib/source-uuid (last a-ref))))

(defn ^:export legacy-column->metadata
  "Given a JS `DatasetColumn`, return a CLJS `:metadata/column` for the same column.

  This properly handles fields, expressions and aggregations.

  > **Code health:** Legacy. Avoid new calls. We should refactor the existing callers so they receive MLv2 columns in
  the first place, and don't need to convert via to MLv2 via this function."
  [a-query stage-number ^js js-column]
  (lib.convert/with-aggregation-list (lib.core/aggregations a-query stage-number)
    (let [column-ref (when-let [a-ref (.-field_ref js-column)]
                       (legacy-ref->pMBQL a-ref))]
      (fix-column-with-ref column-ref (js.metadata/parse-column js-column)))))

(defn ^:export legacy-column->type-info
  "Parses a `legacy-column` into an object compatible with type checking functions. Unlike [[legacy-column->metadata]],
  does not require a `query`. MLv2 columns remain unchanged.

  > **Code health:** Legacy."
  [column]
  (cond-> column
    (object? column) js.metadata/parse-column))

(defn- js-cells-by
  "Given a `col-fn`, returns a function that will extract a JS object like
  `{col: {name: \"ID\", ...}, value: 12}` into a CLJS map like
  ```
  {:column     {:lib/type :metadata/column ...}
   :column-ref [:field ...]
   :value 12}
  ```

  The spelling of the column key differs between multiple JS objects of this same general shape
  (`col` on data rows, `column` on dimensions), etc., hence the abstraction."
  [col-fn]
  (fn [^js cell]
    (let [column     (js.metadata/parse-column (col-fn cell))
          column-ref (when-let [a-ref (:field-ref column)]
                       (legacy-ref->pMBQL a-ref))]
      {:column     (fix-column-with-ref column-ref column)
       :column-ref column-ref
       :value      (.-value cell)})))

(def ^:private row-cell       (js-cells-by #(.-col ^js %)))
(def ^:private dimension-cell (js-cells-by #(.-column ^js %)))

;; # Drill Thru
;; **drill-thru** is the somewhat opaque name given to the system which shows context menus when clicking on different
;; parts of visualizations.
;;
;; For example, if looking at the table view for a simple query of the Orders table, clicking a column header will show
;; a certain set of actions you can take (eg. filtering on that column, sorting by it, summarizing it in a few different
;; ways, etc.). Clicking a cell in the table will offer a different set of actions.
;;
;; All of these actions are implemented in this library through two calls:
;;
;; - [[available-drill-thrus]] takes the details of what was clicked on and returns a list of valid drill-thrus in that
;;   context.
;; - [[drill-thru]] takes the selected drill and optional extra arguments, and enacts the drill by returning an updated
;;   query.
;;     - Note that a few drills have FE-level changes as well, such as changing the visualization. Those are handled
;;       in the FE.
;;
;; A few of the more complex drills have nontrivial UIs, for example "Break out by" and "Filter by this column", which
;; have specific helper functions defined here to inform the UI.
;;
;; ## Code health
;; Overall the drill-thru logic might have been better as FE code written on top of this library, rather than as part of
;; the library.
;;
;; All of this code is **Single use** and should not be called by any code other than the drill-thru context menus.
;;
;; In the long term, it should be factored out of `metabase.lib.*` and into a separate library of CLJC code shared with
;; the frontend.
(defn ^:export available-drill-thrus
  "Return an array (possibly empty) of drill-thrus given:

  - Nullable `column`
  - Nullable `value`
  - Nullable data `row` - an array of `{col, value}` maps (`clicked.data` in the FE)
  - Nullable `dimensions` - an array of `{column, value}` maps (`clicked.dimensions` in the FE)

  Note that `value` makes a distinction between JS `undefined` and JS `null`, even though both values are normally
  turned into `nil` in CLJS. The difference is important here: if `value` is unset (`undefined`) then the click was in a
  context with no value, such as a column header. If `value` is `null`, we have clicked a value of `NULL` in the SQL
  sense. This distinction is important for several drills.

  `column` is `nil` when clicking on a \"chart legend\", eg. when viewing multiple time series broken out by category,
  and then clicking one of the categories in the legend.

  `dimensions` correspond to the breakouts on the query, eg. the `x` axis of a chart. They are vital context for certain
  clicks, eg. clicking a point in a time series. In that context, `column` is the aggregation being visualized as the
  `y` axis, `value` is the value of the aggregation at that point, and `dimensions` contains the temporal column and its
  value for that point. If there are multiple time series, such as different product categories, that column and the
  clicked value are also in the `dimensions` list.

  > **Code health:** Single use. This is only here to support the context menu UI and should not be reused."
  [a-query stage-number card-id column value row dimensions]
  (lib.convert/with-aggregation-list (lib.core/aggregations a-query stage-number)
    (let [column-ref (when-let [a-ref (and column (.-field_ref ^js column))]
                       (legacy-ref->pMBQL a-ref))]
      (->> (merge {:column     (when column
                                 (fix-column-with-ref column-ref (js.metadata/parse-column column)))
                   :column-ref column-ref
                   :value      (cond
                                 (undefined? value) nil   ; Missing a value, ie. a column click
                                 (nil? value)       :null ; Provided value is null, ie. database NULL
                                 :else              value)
                   :card-id    card-id}
                  (when row                    {:row        (mapv row-cell       row)})
                  (when (not-empty dimensions) {:dimensions (mapv dimension-cell dimensions)}))
           (lib.core/available-drill-thrus a-query stage-number)
           to-array))))

(defn ^:export drill-thru
  "Applies the given `a-drill-thru` to the specified stage of `a-query`. Returns the updated query.

  Any number of additional `args` can be included when calling this variadic function. The specific drill-thru will
  specify the `args` it expects, if any.

  The exact effect on the query depends on the specific drill-thru and the `args`.

  > **Code health:** Single use. This is only here to support the context menu UI and should not be reused."
  [a-query stage-number card-id a-drill-thru & args]
  (apply lib.core/drill-thru a-query stage-number card-id a-drill-thru args))

(defn ^:export filter-drill-details
  "Returns a JS object with the details needed to render the complex UI for `column-filter` and some `quick-filter`
  drills. The argument is the opaque `a-drill-thru` value returned by [[available-drill-thrus]].

  Since `a-query` might need an extra stage added (if filtering on aggregation columns) this includes a possible-updated
  `query` and `stageIndex`.

  The return value has the form:

      column:     column as returned by [[filterable-columns]] (with the valid filter operators included)
      query:      possibly updated query
      stageIndex: possibly updated stage
      value:      the clicked value (JS `null` for a SQL `NULL` value)

  > **Code health:** Single use. This is only here to support the context menu UI and should not be reused."
  [{a-query :query
    :keys [column stage-number value]
    :as _filter-drill}]
  #js {"column"     column
       "query"      a-query
       "stageIndex" stage-number
       "value"      (lib.drill-thru.common/drill-value->js value)})

(defn ^:export combine-column-drill-details
  "Returns a JS object with the details needed to render the complex UI for `combine-column` drills."
  [{a-query :query
    :keys [column stage-number]}]
  #js {"query"      a-query
       "stageIndex" stage-number
       "column"     column})

(defn ^:export column-extract-drill-extractions
  "Returns a JS array of the possible column *extractions* offered by `column-extract-drill`.

  The extractions are opaque values of the same type as are returned by [[column-extractions]].

  > **Code health:** Single use. This is only here to support UI for column extract drills, and should not be reused."
  [column-extract-drill]
  (to-array (lib.core/extractions-for-drill column-extract-drill)))

(defn ^:export pivot-drill-details
  "Returns a JS object with the details needed to render the complex UI for `pivot` drills.

  > **Code health:** Single use. This is only here to support the context menu UI and should not be reused."
  [{:keys [stage-number] :as a-drill-thru}]
  #js {"stageIndex" stage-number
       "pivotTypes" (->> (lib.core/pivot-types a-drill-thru)
                         (map name)
                         to-array)})

(defn ^:export pivot-columns-for-type
  "Returns a JS array of pivotable columns for `a-drill-thru`, given the selected `pivot-type`.

  `a-drill-thru` must be a `:drill-thru/pivot` drill, and `pivot-type` one of the strings from the list returned by
  [[pivot-types]].

  > **Code health:** Single use. This is only here to support the context menu UI and should not be reused."
  [a-drill-thru pivot-type]
  (to-array (lib.core/pivot-columns-for-type a-drill-thru (keyword pivot-type))))

(defn ^:export with-different-table
  "Changes an existing `a-query` to use a different source table or card.

  Can be passed an integer table id or a legacy `\"card__<id>\"` string.

  > **Code health:** Smelly. This leaks the `card__<id>` format and how sources work. Should be refactored into a new
  system for handling data sources."
  [a-query table-id]
  (lib.core/with-different-table a-query table-id))

(defn ^:export format-relative-date-range
  "Given a `n` `unit` time interval and the current date, return a string representing the date-time range.
   Provide an `offset-n` and `offset-unit` time interval to change the date used relative to the current date.
   `options` is a map and supports `:include-current` to include the current given unit of time in the range.

  > **Code health:** Deprecated. This is a direct call to a shared date/time formatting library elsewhere in the CLJC
  code. It does not need to be wrapped or included here. Just merge these extra keyword conversions into that code and
  remove this."
  [n unit offset-n offset-unit options]
  (u.time/format-relative-date-range
   n
   (keyword unit)
   offset-n
   (some-> offset-unit keyword)
   (js->clj options :keywordize-keys true)))

(defn ^:export find-matching-column
  "Given `a-ref-or-column` and a list of `columns`, finds the column that best matches this ref or column.

   Matching is based on finding the basically plausible matches first. There is often zero or one plausible matches, and
   this can return quickly.

   If there are multiple plausible matches, they are disambiguated by the most important extra included in the `ref`.
   (`:join-alias` first, then `:temporal-unit`, etc.)

   - Integer IDs in the `ref` are matched by ID; this usually is unambiguous.
   - If there are multiple joins on one table (including possible implicit joins), check `:join-alias` next.
   - If `a-ref` has a `:join-alias`, only a column which matches it can be the match, and it should be unique.
   - If `a-ref` doesn't have a `:join-alias`, prefer the column with no `:join-alias`, and prefer already selected
   columns over implicitly joinable ones.
   - There may be broken cases where the ref has an ID but the column does not. Therefore the ID must be resolved to a
   name or `:lib/desired-column-alias` and matched that way.
   - `query` and `stage-number` are required for this case, since they're needed to resolve the correct name.
   - Columns with `:id` set are dropped to prevent them matching. (If they didn't match by `:id` above they shouldn't
   match by name due to a coincidence of column names in different tables.)
   - String IDs are checked against `:lib/desired-column-alias` first.
   - If that doesn't match any columns, `:name` is compared next.
   - The same disambiguation (by `:join-alias` etc.) is applied if there are multiple plausible matches.

   Returns the matching column, or nil if no match is found.

  > **Code health:** Legacy, borderline Deprecated. Refs are a leak in the API that needs closing. This is called with a
  legacy column for ordering a table, which passes through [[legacy-column->metadata]] and then is used to match up the
  orderable-columns. (That should be replaced with `:selected true` or equivalent on [[orderable-columns]].) The other
  use maps a breakout column against [[filterable-columns]]."
  [a-query stage-number a-ref columns]
  (lib.core/find-matching-column a-query stage-number a-ref columns))

(defn ^:export has-clauses
  "Return `true` if the given stage of `a-query` contains any clauses.

  This returns `false` in the same conditions which [[drop-empty-stages]] considers \"empty\".

  > **Code health:** Healthy"
  [a-query stage-number]
  (lib.core/has-clauses? a-query stage-number))

(defn ^:export stage-count
  "Returns the number of stages in `a-query`.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/stage-count a-query))

(defn ^:export filter-args-display-name
  "Provides a reasonable display name for `a-filter-clause`, excluding the column name.

  Can be expanded as needed but only currently defined for a narrow set of date filters.

  Falls back to the full filter display-name.

  > **Code health:** Smelly, Single use. This feels like over-fitting to a particular use case. It should probably
  become parts of the display info for the filter clause, rather than a separate specific function."
  [a-query stage-number a-filter-clause]
  (lib.core/filter-args-display-name a-query stage-number a-filter-clause))

(defn ^:export diagnose-expression
  "Checks `legacy-expression` for type errors and possibly for cyclic references to other expressions.

  - `expression-mode` specifies what type of thing `expr` is: an \"expression\" (custom column),
    an \"aggregation\" expression, or a \"filter\" condition.
  - `expression` is an expression created using the custom column editor in the FE.
  - `expression-position` is provided when editing an existing custom column, and `nil` otherwise.

  Cyclic references are checked only when `expression-mode` is `\"expression\"` and `expression-position` is non-`nil`.
  In that case it is an error for an expression at position `i` to reference an expression at position `j >= i`.

  Returns an i18n error message describing the problem, or `nil` (JS `null`) if there are no issues.

  > **Code health:** Single use."
  [a-query stage-number expression-mode an-expression expression-position]
  (let [expr (-> an-expression
                 (js->clj :keywordize-keys true)
                 lib.normalize/normalize)]
    (-> (lib.expression/diagnose-expression a-query stage-number
                                            (keyword expression-mode)
                                            expr
                                            expression-position)
        clj->js)))

;; TODO: [[field-values-search-info]] seems over-specific - I feel like we can do a better job of extracting search info
;; from arbitrary entities, akin to [[display-info]].

(defn ^:export field-values-search-info
  "Info about whether the column in question has FieldValues associated with it for purposes of powering a search
  widget in the QB filter modals.

  > **Code health:** Single use. Only supports the search info."
  [metadata-providerable column]
  (let [{:keys [field-id search-field search-field-id has-field-values]} (lib.field/field-values-search-info metadata-providerable column)]
    #js {:fieldId        field-id
         :searchField    search-field
         :searchFieldId  search-field-id
         :hasFieldValues (name has-field-values)}))

;; # Specialized Filtering
;; These specialized filter updates support the drag-and-drop "brush" filtering in the UI. Eg. dragging a box on a map
;; visualization, or dragging between two points in a time series.
;;
;; This is a very FE-specific use case, but the logic is sufficiently complex and well-delimited that I think there's
;; room for them in the library.
;;
;; TODO: All of these are consuming legacy columns and converting them; that should be happening on the calling side,
;; or refactored away.
(defn ^:export update-lat-lon-filter
  "Add or update a filter against a `latitude-column` and `longitude-column`, based on a bounding rectangle drawn on a
  map. **Removes** any existing filters for either column.

  `bounds` is a JS object `{north: number, south: number, west: number, east: number}` giving the bounding rectangle.

  This function expects that longitudes (west and east bounds) have been canonicalized into the range [-180, 180]. If
  west > east, this indicates that the bounds cross the antimerdian, and so we must add two filter clauses, which are
  ORed together. In such cases, the first clause covers the range [west, 180.0] and the second covers [-180.0, east].

  > **Code health:** Single use. This is highly specialized in the UI, but should probably continue to exist."
  [a-query stage-number latitude-column longitude-column card-id  bounds]
  ;; (.log js/console "update-lat-lon-filter")
  (let [bounds           (js->clj bounds :keywordize-keys true)]
    (lib.core/with-wrapped-native-query a-query stage-number card-id
      lib.core/update-lat-lon-filter latitude-column longitude-column bounds)))

(defn ^:export update-numeric-filter
  "Add or update a filter against `numeric-column`, based on the provided start and end values. **Removes** any existing
  filters for `numeric-column`.

  > **Code health:** Single use. This is highly specialized in the UI, but should probably continue to exist."
  [a-query stage-number numeric-column card-id start end]
  (lib.core/with-wrapped-native-query a-query stage-number card-id
    lib.core/update-numeric-filter numeric-column start end))

(defn ^:export update-temporal-filter
  "Add or update a filter against `temporal-column`, based on the provided start and end values.
  **Removes** any existing filters for `numeric-column`.

  Modifies the temporal unit for any breakouts to on `temporal-column` to still be useful: If there are fewer than 4
  points (see [[metabase.lib.filter.update/temporal-filter-min-num-points]]), move to the next-smaller unit.

  > **Code health:** Single use. This is highly specialized in the UI, but should probably continue to exist."
  [a-query stage-number temporal-column card-id start end]
  (lib.core/with-wrapped-native-query a-query stage-number card-id
    lib.core/update-temporal-filter temporal-column start end))

(defn ^:export valid-filter-for?
  "Given two columns, returns true if `src-column` is a valid source to use for filtering `dst-column`.

  > **Code health:** Healthy."
  [src-column dst-column]
  (lib.types.isa/valid-filter-for? src-column dst-column))

(defn ^:export dependent-metadata
  "Return a JS array of entities which `a-query` requires to be loaded. `card-id` is provided
  when editing the card with that ID and in this case `a-query` is its definition (i.e., the
  dataset-query). `card-type` specifies the type of the card being created or edited.

  Required entities are all tables and cards which are used as sources or joined in, etc.

  Each entity is returned as a JS map `{type: \"database\"|\"schema\"|\"table\"|\"field\", id: number}`.

  > **Code health:** Healthy"
  [a-query card-id card-type]
  (to-array (map clj->js (lib.core/dependent-metadata a-query card-id (keyword card-type)))))

(defn ^:export table-or-card-dependent-metadata
  "Return a JS array of entities which are needed upfront to create a new query based on a table/card.

  Each entity is returned as a JS map `{type: \"database\"|\"schema\"|\"table\"|\"field\", id: number}`.

  > **Code health:** Healthy"
  [metadata-providerable table-id]
  (to-array (map clj->js (lib.core/table-or-card-dependent-metadata metadata-providerable table-id))))

(defn ^:export can-run
  "Returns true if the query is runnable.
  `card-type` is optional and defaults to \"question\".

  MBQL queries are always runnable. Native queries can run when:

  - Every *extra* from [[native-extras]] has a value, and
  - The native query is non-empty.

  > **Code health:** Healthy"
  ([a-query]
   (can-run a-query "question"))
  ([a-query card-type]
   (lib.cache/side-channel-cache
    (keyword "can-run" card-type) a-query
    (fn [_]
      (lib.core/can-run a-query (keyword card-type))))))

(defn ^:export preview-query
  "*Truncates* a query for use in the Notebook editor's \"preview\" system.

  Takes `a-query` and `stage-index` as usual.

  - Stages later than `stage-index` are dropped.
  - `clause-type` is an enum (see below); all clauses of *later* types are dropped.
  - `clause-index` is optional: if not provided then all clauses are kept; if it's a number than clauses
    `[0, clause-index]` are kept. (To keep no clauses, specify the earlier `clause-type`.)

  The `clause-type` enum represents the steps of the notebook editor, in the order they appear in the notebook:

  - `:data` - just the source data for the stage
  - `:joins`
  - `:expressions`
  - `:filters`
  - `:aggregation`
  - `:breakout`
  - `:order-by`
  - `:limit`

  If the resulting query fails [[can-preview]], returns nil.

  > **Code health:** Healthy, Single use."
  [a-query stage-number clause-type clause-index]
  (let [truncated-query (lib.core/preview-query a-query stage-number (keyword clause-type) clause-index)]
    (when (lib.core/can-preview truncated-query)
      truncated-query)))

(defn ^:export can-save
  "Returns true if the query can be saved.
  `card-type` is optional and defaults to \"question\".

  A query can be saved when:

  - It is runnable, according to [[can-run]], and:
  - For a native query, all its template tags either have a value provided, or a default.

  > **Code health:** Healthy"
  ([a-query]
   (can-save a-query "question"))
  ([a-query card-type]
   (lib.cache/side-channel-cache
    (keyword "can-save" card-type) a-query
    (fn [_]
      (lib.core/can-save a-query (keyword card-type))))))

(defn ^:export ensure-filter-stage
  "Adds an empty stage to `query` if its last stage contains both breakouts and aggregations.

  This is so that parameters can address both the stage before and after the aggregation.
  Adding filters to the result at stage -1 will filter after the summary, filters added at
  stage -2 filter before the summary.

  > **Code health:** Healthy"
  [a-query]
  (lib.core/ensure-filter-stage a-query))
