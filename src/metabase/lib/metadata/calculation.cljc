(ns metabase.lib.metadata.calculation
  (:refer-clojure :exclude [select-keys mapv empty? #?(:clj for)])
  (:require
   #?(:clj  [metabase.config.core :as config]
      :cljs [metabase.lib.cache :as lib.cache])
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.cache :as lib.metadata.cache]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [select-keys mapv empty? #?(:clj for)]]))

(mr/def ::display-name-style
  "Schema for valid values of `display-name-style` as passed to [[display-name-method]].

  * `:default`: normal style used for 99% of FE stuff. For example a column that comes from a joined table might return
    \"Price\".

  * `:long`: Slightly longer style that includes a little bit of extra context, used for stuff like query suggested
    name generation. For a joined column, this might look like \"Venues → Price\"."
  [:enum :default :long])

(def ^:dynamic *display-name-style*
  "Display name style to use when not explicitly passed in to [[display-name]]."
  :default)

(defmulti display-name-method
  "Calculate a nice human-friendly display name for something."
  {:arglists '([query stage-number x display-name-style])}
  (fn [_query _stage-number x _display-name-style]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmulti column-name-method
  "Calculate a database-friendly name to use for something."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defn ^:export display-name :- :string
  "Calculate a nice human-friendly display name for something. See [[::display-name-style]] for a the difference between
  different `style`s."
  ([query]
   (display-name query query))

  ([query x]
   (display-name query -1 x))

  ([query stage-number x]
   (display-name query stage-number x *display-name-style*))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x
    style        :- ::display-name-style]
   (or
    ;; if this is an MBQL clause with `:display-name` in the options map, then use that rather than calculating a name.
    ((some-fn :display-name :lib/expression-name) (lib.options/options x))
    (try
      (display-name-method query stage-number x style)
      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info (i18n/tru "Error calculating display name for {0}: {1}" (pr-str x) (ex-message e))
                        {:query query, :x x}
                        e)))))))

(mu/defn column-name :- ::lib.schema.common/non-blank-string
  "Calculate a database-friendly name to use for an expression."
  ([query x]
   (column-name query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (or
    ;; if this is an MBQL clause with `:name` in the options map, then use that rather than calculating a name.
    (:name (lib.options/options x))
    (try
      (column-name-method query stage-number x)
      (catch #?(:clj Throwable :cljs js/Error) e
        (throw (ex-info (i18n/tru "Error calculating column name for {0}: {1}" (pr-str x) (ex-message e))
                        {:x            x
                         :query        query
                         :stage-number stage-number}
                        e)))))))

(defmethod display-name-method :default
  [_query _stage-number x _stage]
  ;; This was suspected as hurting performance, going to skip it in prod for now
  (when #?(:clj          (not config/is-prod?)
           :cljs         true ;; the linter complains when :cljs is not here(?)
           :cljs-dev     true
           :cljs-release false)
    (log/warnf "Don't know how to calculate display name for %s. Add an impl for %s for %s"
               ;; TODO: (Braden 11/04/2025) This logic would make sense in [[metabase.util]].
               (let [s (pr-str x)]
                 (if (> (count s) 2000)
                   (str (subs s 0 1500) " ... " (subs s (- (count s) 500)))
                   s))
               `display-name-method
               (lib.dispatch/dispatch-value x)))
  (if (and (vector? x)
           (keyword? (first x)))
    ;; MBQL clause: just use the name of the clause.
    (name (first x))
    ;; anything else: use `pr-str` representation.
    (pr-str x)))

(def ^:dynamic *propagate-binning-and-bucketing*
  "Enable propagation of ref's `:temporal-unit` into `:inherited-temporal-unit` of a column or setting of
  the `:lib/original-binning` option.

  Temporal unit should be conveyed into `:inherited-temporal-unit` only when _column is created from ref_ that contains
  that has temporal unit set and column's metadata is generated _under `returned-columns` call_.

  Point is, that `:inherited-temporal-unit` should be added only to column metadata that's generated for use on next
  stages.

  `:lib/original-binning` is used similarly as `:inherited-temporal-unit`. It helps to identify fields that were
  binned on previous stages. Thanks to that, it is possible to avoid presetting binning for previously binned fields
  when breakout column popover is opened in query builder.

  The value is used in [[metabase.lib.field.resolution/resolve-field-ref]]."
  false)

;;; TODO -- this logic is wack, we should probably be snake casing stuff and display names like
;;;
;;; "Sum of Products → Price"
;;;
;;; result in totally wacko column names like "sum_products_%E2%86%92_price", let's try to generate things that are
;;; actually going to be allowed here.
(defn- slugify [s]
  (-> s
      (str/replace #"[\(\)]" "")
      (u/slugify {:unicode? true})))

;;; default impl just takes the display name and slugifies it.
(defmethod column-name-method :default
  [query stage-number x]
  (slugify (display-name query stage-number x)))

(defmulti describe-top-level-key-method
  "Implementation for [[describe-top-level-key]]. Describe part of a stage of a query, e.g. the `:filters` part or the
  `:aggregation` part. Return `nil` if there is nothing to describe.

  Implementations that call [[display-name]] should specify the `:long` display name style."
  {:arglists '([query stage-number top-level-key])}
  (fn [_query _stage-number top-level-key]
    top-level-key)
  :hierarchy lib.hierarchy/hierarchy)

(def ^:private TopLevelKey
  "In the interest of making this easy to use in JS-land we'll accept either strings or keywords."
  [:enum :aggregation :breakout :filters :limit :order-by :source-table :source-card :joins])

(mu/defn describe-top-level-key :- [:maybe ::lib.schema.common/non-blank-string]
  "'top-level' here means the top level of an individual stage. Generate a human-friendly string describing a specific
  part of an MBQL stage, or `nil` if that part doesn't exist."
  ([query top-level-key]
   (describe-top-level-key query -1 top-level-key))
  ([query         :- ::lib.schema/query
    stage-number  :- :int
    top-level-key :- TopLevelKey]
   (describe-top-level-key-method query stage-number (keyword top-level-key))))

(defmulti type-of-method
  "Calculate the effective type of something. This differs from [[metabase.lib.schema.expression/type-of]] in that it is
  called with a query/MetadataProvider and a stage number, allowing us to fully resolve information and return
  complete, unambiguous type information. Default implementation calls [[metabase.lib.schema.expression/type-of]]."
  {:arglists '([query stage-number expr])}
  (fn [_query _stage-number expr]
    (lib.dispatch/dispatch-value expr))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defn type-of :- ::lib.schema.common/base-type
  "Get the effective type of an MBQL expression."
  ([query x]
   (type-of query -1 x))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   ;; this logic happens here so we don't need to code up every single individual method to handle these special
   ;; cases.
   (let [{:keys [temporal-unit], :as options} (lib.options/options x)]
     (or
      ;; If the options map includes `:effective-type` we can assume you know what you are doing and that it is
      ;; correct and just return it directly.
      (:effective-type options)
      ;; If `:temporal-unit` is specified (currently only supported by `:field` clauses), we should return
      ;; `:type/Integer` if its an extraction operation, e.g. `:month-of-year` always returns an integer; otherwise we
      ;; can return `:base-type`.
      (when (and temporal-unit
                 (contains? lib.schema.temporal-bucketing/datetime-extraction-units temporal-unit))
        :type/Integer)
      ;; otherwise if `:base-type` is specified, we can return that.
      (:base-type options)
      ;; if none of the special cases are true, fall back to [[type-of-method]].
      (lib.computed/with-cache-ephemeral* query [:expression-types/by-clause stage-number x]
        (fn []
          (let [calculated-type (type-of-method query stage-number x)]
            ;; if calculated type is not a true type but a placeholder like `:metabase.lib.schema.expression/type.unknown`
            ;; or a union of types then fall back to `:type/*`, an actual type.
            (if (isa? calculated-type :type/*)
              calculated-type
              :type/*))))))))

(defmethod type-of-method :default
  [_query _stage-number expr]
  (lib.schema.expression/type-of expr))

;;; for MBQL clauses whose type is the same as the type of the first arg. Also used
;;; for [[metabase.lib.schema.expression/type-of]].
(defmethod type-of-method :lib.type-of/type-is-type-of-first-arg
  [query stage-number [_tag _opts expr]]
  (type-of query stage-number expr))

(defmethod type-of-method :lib.type-of/type-is-temporal-type-of-first-arg
  [query stage-number [_tag _opts expr :as clause]]
  (if (string? expr)
    ;; If a string, get the type filtered by this expression (eg. `:datetime-add`).
    (lib.schema.expression/type-of clause)
    ;; Otherwise, just get the type of this first arg.
    (type-of query stage-number expr)))

(defn cacheable-options
  "Includes some dynamic variables etc. in the `options` so the `[[returned-columns]]` can be safely cached."
  [options]
  (assoc options
         ::display-name-style              *display-name-style*
         ::propagate-binning-and-bucketing (boolean *propagate-binning-and-bucketing*)
         ::ref-style                       lib.ref/*ref-style*))

(defn cache-key
  "Create a cache key to use with [[lib.metadata.cache]]. This includes a few extra keys for the three dynamic variables
  that can affect metadata calculation."
  [unique-key query stage-number x options]
  (lib.metadata.cache/cache-key
   unique-key query stage-number x (cacheable-options options)))

(defmulti metadata-method
  "Impl for [[metadata]]. Implementations that call [[display-name]] should use the `:default` display name style."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod metadata-method :default
  [query stage-number x]
  (try
    {:lib/type     :metadata/column
     ;; TODO -- effective-type
     :base-type    (type-of query stage-number x)
     :name         (column-name query stage-number x)
     :display-name (display-name query stage-number x)}
    ;; if you see this error it's usually because you're calling [[metadata]] on something that you shouldn't be, for
    ;; example a query
    (catch #?(:clj Throwable :cljs js/Error) e
      (throw (ex-info (i18n/tru "Error calculating metadata for {0}: {1}"
                                (pr-str (lib.dispatch/dispatch-value x))
                                (ex-message e))
                      {:query query, :stage-number stage-number, :x x}
                      e)))))

(mr/def ::metadata-map
  [:map [:lib/type [:and
                    qualified-keyword?
                    [:fn
                     {:error/message ":lib/type should be a :metadata/ keyword"}
                     #(= (namespace %) "metadata")]]]])

(mu/defn metadata :- ::metadata-map
  "Calculate an appropriate `:metadata/*` object for something. What this looks like depends on what we're calculating
  metadata for. If it's a reference or expression of some sort, this should return a single `:metadata/column`
  map (i.e., something satisfying the `::lib.schema.metadata/column` schema."
  ([query]
   (metadata query -1 query))
  ([query x]
   (metadata query -1 x))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (lib.metadata.cache/with-cached-value query (cache-key ::metadata query stage-number x {})
     (metadata-method query stage-number x))))

(mu/defn describe-query :- ::lib.schema.common/non-blank-string
  "Convenience for calling [[display-name]] on a query to describe the results of its final stage."
  [query]
  (display-name query query))

(mu/defn suggested-name :- [:maybe ::lib.schema.common/non-blank-string]
  "Name you might want to use for a query when saving an previously-unsaved query. This is the same
  as [[describe-query]] except for native queries, where we don't describe anything."
  [query]
  (when-not (= (:lib/type (lib.util/query-stage query -1)) :mbql.stage/native)
    (try
      (describe-query query)
      (catch #?(:clj Throwable :cljs js/Error) e
        (log/errorf e "Error calculating display name for query: %s" (ex-message e))
        nil))))

(defmulti display-info-method
  "Implementation for [[display-info]]. Implementations that call [[display-name]] should use the `:default` display
  name style.

  Do not call this recursively from its own `defmethod`s, aside from calling the `:default`. Prefer calling
  [[display-info]] directly, so that its caching can encourage reuse. (Eg. column-groups recursively call `display-info`
  on their columns.)"
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mr/def ::display-info
  [:map
   [:display-name {:optional true} :string]
   [:long-display-name {:optional true} :string]
   ;; for things with user specified names
   [:named? {:optional true} :boolean]
   ;; for things that have a Table, e.g. a Field
   [:table {:optional true} [:maybe [:ref ::display-info]]]
   ;; these are derived from the `:lib/source`/`:metabase.lib.schema.metadata/column-source`, but instead of using
   ;; that value directly we're returning a different property so the FE doesn't break if we change those keys in the
   ;; future, e.g. if we consolidate or split some of those keys. This is all the FE really needs to know.
   ;;
   ;; if this is a Column, does it come from a previous stage?
   [:is-from-previous-stage {:optional true} [:maybe :boolean]]
   ;; if this is a Column, does it come from a join in this stage?
   [:is-from-join {:optional true} [:maybe :boolean]]
   ;; if this is a Column, is it 'calculated', i.e. does it come from an expression in this stage?
   [:is-calculated {:optional true} [:maybe :boolean]]
   ;; if this is a Column, is it an implicitly joinable one? I.e. is it from a different table that we have not
   ;; already joined, but could implicitly join against?
   [:is-implicitly-joinable {:optional true} [:maybe :boolean]]
   ;; if this is a ColumnGroup, is it the main one?
   [:is-main-group {:optional true} [:maybe :boolean]]
   ;; if this is a Table, is it the source table of the query?
   [:is-source-table {:optional true} [:maybe :boolean]]
   ;; if this is a Card, is it the source card of the query?
   [:is-source-card {:optional true} [:maybe :boolean]]
   ;; does this column come from the `:aggregation`s in this stage of the query?
   [:is-aggregation {:optional true} [:maybe :boolean]]
   ;; does this column occur in the breakout clause?
   [:is-breakout {:optional true} [:maybe :boolean]]
   ;; does this column occur in the order-by clause?
   [:is-order-by-column {:optional true} [:maybe :boolean]]
   ;; for joins
   [:name {:optional true} :string]
   ;; for aggregation operators
   [:column-name {:optional true} :string]
   [:description {:optional true} :string]
   [:short-name {:optional true} :string]
   [:requires-column {:optional true} :boolean]
   [:selected {:optional true} :boolean]
   ;; for binning and bucketing
   [:default {:optional true} :boolean]
   ;; for order by
   [:direction {:optional true} [:enum :asc :desc]]])

(mu/defn display-info :- ::display-info
  "Given some sort of Cljs object, return a map with the info you'd need to implement UI for it. This is mostly meant to
  power the Frontend JavaScript UI; in JS, results will be converted to plain JavaScript objects, so avoid returning
  things that should remain opaque."
  ([query x]
   (display-info query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (letfn [(display-info* [x]
             (try
               (display-info-method query stage-number x)
               (catch #?(:clj Throwable :cljs js/Error) e
                 (throw (ex-info (i18n/tru "Error calculating display info for {0}: {1}"
                                           (lib.dispatch/dispatch-value x)
                                           (ex-message e))
                                 {:query query, :stage-number stage-number, :x x}
                                 e)))))]
     #?(:clj
        (display-info* x)
        :cljs
        (lib.cache/side-channel-cache
         ;; TODO: Caching by stage here is probably unnecessary - it's already a mistake to have an `x` from a different
         ;; stage than `stage-number`. But it also doesn't hurt much, since a given `x` will only ever have `display-info`
         ;; called with one `stage-number` anyway.
         (keyword "display-info" (str "stage-" stage-number)) x
         display-info*)))))

(mu/defn default-display-info :- ::display-info
  "Default implementation of [[display-info-method]], available in case you want to use this in a different
  implementation and add additional information to it."
  [query        :- ::lib.schema/query
   stage-number :- :int
   x]
  (let [x-metadata (metadata query stage-number x)]
    (merge
     ;; TODO -- not 100% convinced the FE should actually have access to `:name`, can't it use `:display-name`
     ;; everywhere? Determine whether or not this is the case.
     (select-keys x-metadata [:name :display-name :semantic-type])
     (when-let [custom (lib.util/custom-name x)]
       {:display-name custom
        :named? true})
     (when-let [long-display-name (display-name query stage-number x :long)]
       {:long-display-name long-display-name})
     ;; don't return `:base-type`, FE should just use `:effective-type` everywhere and not even need to know
     ;; `:base-type` exists.
     (when-let [effective-type ((some-fn :effective-type :base-type) x-metadata)]
       {:effective-type effective-type})
     (when-let [table-id (:table-id x-metadata)]
       ;; TODO: only ColumnMetadatas should possibly have legacy `card__<id>` `:table-id`s... we should
       ;; probably move this special casing into [[metabase.lib.field]] instead of having it be part of the
       ;; `:default` method.
       (when-let [inner-metadata (cond
                                   (integer? table-id) (lib.metadata/table query table-id)
                                   (string? table-id)  (lib.metadata/card
                                                        query (lib.util/legacy-string-table-id->card-id table-id)))]
         {:table (display-info query stage-number inner-metadata)}))
     (when-let [source (:lib/source x-metadata)]
       {:is-from-previous-stage (= source :source/previous-stage)
        :is-from-join           (= source :source/joins)
        :is-calculated          (= source :source/expressions)
        :is-implicitly-joinable (= source :source/implicitly-joinable)
        :is-aggregation         (= source :source/aggregations)
        :is-breakout            (boolean (:lib/breakout? x-metadata))})
     (when-some [selected (:selected? x-metadata)]
       {:selected selected})
     (when-let [temporal-unit ((some-fn :metabase.lib.field/temporal-unit :temporal-unit) x-metadata)]
       {:is-temporal-extraction
        (and (contains? lib.schema.temporal-bucketing/datetime-extraction-units temporal-unit)
             (not (contains? lib.schema.temporal-bucketing/datetime-truncation-units temporal-unit)))})
     (select-keys x-metadata [:breakout-positions :order-by-position :filter-positions]))))

(defmethod display-info-method :default
  [query stage-number x]
  (default-display-info query stage-number x))

(defmethod display-info-method :metadata/table
  [query stage-number table]
  (merge (default-display-info query stage-number table)
         {:is-source-table (= (lib.util/source-table-id query) (:id table))
          :schema (:schema table)
          :visibility-type (:visibility-type table)}))

(mr/def ::column-metadata-with-source
  "Schema for the column metadata that should be returned by [[metadata]]. A column metadata that is also required to
  have `:lib/source`."
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:lib/source ::lib.schema.metadata/column.source]]])

(mr/def ::returned-column
  "Schema for a returned column as returned by [[returned-columns]]; includes all the normal metadata but is also
  guaranteed to have `:lib/source`, `:lib/source-column-alias`, and `:lib/desired-column-alias`."
  [:merge
   [:ref ::visible-column]
   [:map
    [:lib/desired-column-alias ::lib.schema.metadata/desired-column-alias]]])

(mr/def ::returned-columns
  "Schema for column metadata that should be returned by [[returned-columns]] and implementations
  of [[returned-columns-method]]."
  [:and
   [:sequential ::returned-column]
   [:fn
    ;; should be dev-facing only, so don't need to i18n
    {:error/message "Column :lib/desired-column-alias values must be distinct for each stage!"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Column :lib/desired-column-alias values must be distinct, got: "
                           (pr-str (mapv :lib/desired-column-alias value))))}
    (fn [columns]
      (or
       (empty? columns)
       (apply distinct? (map :lib/desired-column-alias columns))))]])

(mr/def ::returned-columns.options
  "Schema for options passed to [[returned-columns]] and [[returned-columns-method]]."
  [:and
   [:map
    [:include-remaps?           {:optional true, :default false} :boolean]
    [:include-sensitive-fields? {:optional true, :default false} :boolean]]
   [:fn
    {:error/message "unique-name-fn is no longer allowed as an option."}
    (complement :unique-name-fn)]
   ;; historically the third arg to [[visible-columns]] was something like a stage; catch code that has not been
   ;; updated yet.
   [:fn
    {:error/message "Expected an options map, got something with :lib/type"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Expected an options map, got a " (pr-str (:lib/type value))))}
    (complement :lib/type)]])

(def ^:private returned-columns-options-keys
  (mu/map-schema-keys ::returned-columns.options))

(defmulti returned-columns-method
  "Impl for [[returned-columns]]."
  {:arglists '([query stage-number x options])}
  (fn [_query _stage-number x _options]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod returned-columns-method :dispatch-type/nil
  [_query _stage-number _x _options]
  [])

;;; if you pass in an integer assume it's a stage number; use the method for the query stage itself.
(defmethod returned-columns-method :dispatch-type/integer
  [query _stage-number stage-number options]
  (returned-columns-method query stage-number (lib.util/query-stage query stage-number) options))

(mu/defn returned-columns :- [:maybe ::returned-columns]
  "Return a sequence of metadata maps for all the columns expected to be 'returned' at a query, stage of the query, or
  join, and include the `:lib/source` of where they came from. This should only include columns that will be present
  in the results; DOES NOT include 'visible' columns that are not 'exported' to subsequent stages.

  See [[::returned-columns.options]] for allowed options.

  `returned-columns` always returns metadata relative to the source `x`, not subsequent stages or parent stages (for
  joins)!!!! Take a moment and make sure you understand this concept clearly, it's SUPER IMPORTANT <3

 Examples:

 * `returned-columns` for a join is the same as `returned-columns` for the last stage of the join -- the columns have
   source and desired aliases appropriate for the join's `:stages` if they were an entirely independent query, and do
   not include join aliases!

 * `returned-columns` for a stage have source and desired aliases relative to that stage!

 * `returned-columns` for a Card has the same source and desired aliases you'd see in that Card's `:result-metadata`!!"
  ([query]
   (returned-columns query (lib.util/query-stage query -1)))

  ([query x]
   (returned-columns query -1 x))

  ([query stage-number x]
   (returned-columns query stage-number x nil))

  ([query          :- ::lib.schema/query
    stage-number   :- :int
    x
    options        :- [:maybe ::returned-columns.options]]
   (binding [*propagate-binning-and-bucketing* true]
     ;; minor optimization for caching purposes: only keep the options keys that are actually relevant for
     ;; `returned-columns` purposes. As a bonus, this means undocumented options keys that aren't part of the schema
     ;; will effectively be ignored, which sorta forces people to actually go document them.
     (let [options (select-keys options returned-columns-options-keys)]
       (returned-columns-method query stage-number x options)))))

(mr/def ::visible-column
  "Schema for a column that should be returned by [[visible-columns]]. A visible column is a column metadata that is
  required to also have `:lib/source` and `:lib/source-column-alias`.

  `:lib/desired-column-alias` should not be returned by [[visible-columns]] since it needs to be calculated in the
  context of the columns RETURNED by the stage! Do not expect it to be present. You should probably be using
  `:lib/source-column-alias` for whatever purpose you think you need `:lib/desired-column-alias` for (field refs,
  etc.)"
  [:merge
   [:ref ::column-metadata-with-source]
   [:map
    [:lib/source-column-alias ::lib.schema.metadata/source-column-alias]]])

(mr/def ::visible-columns
  "Schema for column metadata that should be returned by [[visible-columns]]."
  [:sequential ::visible-column])

(mr/def ::visible-columns.options
  "Schema for options passed to [[visible-columns]]."
  [:merge
   [:ref ::returned-columns.options]
   [:map
    [:include-joined?                              {:optional true, :default true} :boolean]
    [:include-expressions?                         {:optional true, :default true} :boolean]
    [:include-implicitly-joinable?                 {:optional true, :default true} :boolean]
    [:include-implicitly-joinable-for-source-card? {:optional true, :default true} :boolean]]])

(def ^:private visible-columns-options-keys
  (mu/map-schema-keys ::visible-columns.options))

(mu/defn- default-visible-columns-options :- ::visible-columns.options
  []
  {:include-joined?                              true
   :include-expressions?                         true
   :include-implicitly-joinable?                 true
   :include-implicitly-joinable-for-source-card? true
   :include-sensitive-fields?                    false})

;;; TODO (Cam 8/7/25) -- historically `visible-columns` worked on a bunch of stuff besides just a stage, but Braden
;;; pointed out that it really only makes any sense at all for a stage here
;;; https://metaboat.slack.com/archives/C0645JP1W81/p1754587431585559 . For historic reasons the main entrypoint to
;;; the function still lives here, but it's now just a shim that calls [[metabase.lib.stage/-visible-columns]] -- we
;;; should combine these so there's no more indirection. It should probably live in [[metabase.lib.stage]] going
;;; forward, but we'd need to update a lot of code that calls this version of [[visible-columns]].
(mu/defn visible-columns :- ::visible-columns
  "Return a sequence of columns that should be visible *within* a given stage of something, e.g. a query stage or a
  join query. This includes not just the columns that get returned (ones present in [[metadata]], but other columns
  that are 'reachable' in this stage of the query. E.g. in a query like

    SELECT id, name
    FROM table
    ORDER BY position

  only `id` and `name` are 'returned' columns, but other columns such as `position` are visible in this stage as well
  and would thus be returned by this function.

  Columns from joins, expressions, and implicitly joinable columns are included automatically by default;
  see `::visible-columns.options` for the options for disabling these columns."
  ([query]
   (visible-columns query -1))

  ([query stage-number]
   ;; apparently the FE sometimes accidentally calls this with a `nil` stage number -- see #31366 -- in that case just
   ;; return an empty vector. The FE only has access to this arity, so we don't need to do the check below.
   ;; See [[metabase.lib.metadata.calculation-test/visible-columns-test-2]]
   (if (and query stage-number)
     (visible-columns query stage-number nil)
     []))

  ([query          :- [:maybe ::lib.schema/query]
    stage-number   :- :int
    options        :- [:maybe ::visible-columns.options]]
   (let [options (-> (merge (default-visible-columns-options) options)
                     ;; minor caching optimization: only keep the keys that are relevant to `visible-columns` --
                     ;; ignore any other ones. As a bonus, this means undocumented options keys that aren't part of
                     ;; the schema will effectively be ignored.
                     (select-keys visible-columns-options-keys))]
     (lib.metadata.cache/with-cached-value query (cache-key ::visible-columns query stage-number nil options)
       ((#?(:clj requiring-resolve :cljs resolve) 'metabase.lib.stage/-visible-columns)
        query
        stage-number
        options)))))

(mu/defn remapped-columns :- [:maybe ::visible-columns]
  "Given a seq of columns, return metadata for any remapped columns, if the `:include-remaps?` option is set."
  [query                                  :- ::lib.schema/query
   stage-number                           :- :int
   source-cols                            :- [:maybe [:sequential ::lib.schema.metadata/column]]
   {:keys [include-remaps?] :as _options} :- [:maybe ::returned-columns.options]]
  (when (and include-remaps?
             (lib.util/first-stage? query stage-number))
    (let [existing-ids (into #{} (keep :id) source-cols)]
      (for [column source-cols
            :let   [fk-id (:fk-target-field-id column)]
            :when  fk-id
            :let   [fk-field (lib.metadata/field query fk-id)]
            :when  (not (contains? #{:sensitive :retired} (:visibility-type fk-field)))
            :let   [remapped (lib.metadata/remapped-field query column)]
            :when  (and remapped
                        (not (false? (:active remapped)))
                        (not (contains? #{:sensitive :retired} (:visibility-type remapped)))
                        (not (existing-ids (:id remapped))))]
        (merge
         remapped
         {:lib/source              (:lib/source column) ; TODO: What's the right source for a remap?
          :lib/source-column-alias ((some-fn :lib/source-column-alias :name) remapped)}
         ;; if a remap is of a joined column then we should do the remap in the join itself; columns with
         ;; `:lib/source` `:source/joins` need to have a join alias.
         (select-keys column [:metabase.lib.join/join-alias]))))))

(mu/defn primary-keys :- [:sequential ::lib.schema.metadata/column]
  "Returns a list of primary keys for the source table of this query."
  [query        :- ::lib.schema/query]
  (into [] (filter lib.types.isa/primary-key?)
        (if-let [table-id (lib.util/source-table-id query)]
          (lib.metadata/fields query table-id)
          (returned-columns query))))

(mu/defn implicitly-joinable-columns :- ::visible-columns
  "Columns that are implicitly joinable from some other columns in `column-metadatas`. To be joinable, the column has to
  have (1) appropriate FK metadata, i.e. have an `:fk-target-field-id` pointing to another Field, and (2) have a numeric
  `:id`, i.e. be a real database column that can be used in a JOIN condition. (I think we only include this information
  for Databases that support FKs and joins, so I don't think we need to do an additional DB feature check here.)

  Does not include columns from any Tables that are already explicitly joined.

  Does not include columns that would be implicitly joinable via multiple hops."
  [query        :- ::lib.schema/query
   stage-number :- :int
   cols         :- [:sequential ::lib.schema.metadata/column]]
  (let [remap-target-ids (into #{} (keep (comp :field-id :lib/external-remap)) cols)
        existing-table-ids (into #{} (comp (remove (comp remap-target-ids :id))
                                           (map :table-id))
                                 cols)
        fk-fields (into [] (filter (every-pred :fk-target-field-id (comp number? :id))) cols)
        id->target-fields (m/index-by :id (lib.metadata/bulk-metadata
                                           query :metadata/column (into #{} (map :fk-target-field-id) fk-fields)))
        target-fields (into []
                            (comp (map (fn [{source-field-id :id
                                             :keys [fk-target-field-id]
                                             :as   source}]
                                         (-> (id->target-fields fk-target-field-id)
                                             (assoc ::fk-field-id   source-field-id
                                                    ::fk-field-name (lib.field.util/inherited-column-name source)
                                                    ::fk-join-alias (:metabase.lib.join/join-alias source)))))
                                  (remove #(contains? existing-table-ids (:table-id %))))
                            fk-fields)
        id->table (m/index-by :id (lib.metadata/bulk-metadata
                                   query :metadata/table (into #{} (map :table-id) target-fields)))]
    (into []
          (mapcat (fn [{:keys [table-id], ::keys [fk-field-id fk-field-name fk-join-alias]}]
                    (let [table (id->table table-id)]
                      (for [field (returned-columns query stage-number table)]
                        (m/assoc-some field
                                      :fk-field-id              fk-field-id
                                      :fk-field-name            fk-field-name
                                      :fk-join-alias            fk-join-alias
                                      :lib/source               :source/implicitly-joinable
                                      :lib/source-column-alias  (:name field))))))
          target-fields)))

(mu/defn default-columns-for-stage :- ::returned-columns
  "Given a query and stage, returns the columns which would be selected by default.

  This is exactly [[lib.metadata.calculation/returned-columns]] filtered by the `:lib/source`.
  (Fields from explicit joins are listed on the join itself and should not be listed in `:fields`.)

  If there is already a `:fields` list on that stage, it is ignored for this calculation."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [no-fields (lib.util/update-query-stage query stage-number dissoc :fields)]
    (into [] (remove (comp #{:source/joins :source/implicitly-joinable}
                           :lib/source))
          (returned-columns no-fields stage-number))))
