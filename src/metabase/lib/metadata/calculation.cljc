(ns metabase.lib.metadata.calculation
  (:require
   [clojure.string :as str]
   [metabase.lib.cache :as lib.cache]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expresssion]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(def DisplayNameStyle
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
  "Calculate a nice human-friendly display name for something. See [[DisplayNameStyle]] for a the difference between
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
    style        :- DisplayNameStyle]
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
  (log/warnf "Don't know how to calculate display name for %s. Add an impl for %s for %s"
             (pr-str x)
             `display-name-method
             (lib.dispatch/dispatch-value x))
  (if (and (vector? x)
           (keyword? (first x)))
    ;; MBQL clause: just use the name of the clause.
    (name (first x))
    ;; anything else: use `pr-str` representation.
    (pr-str x)))

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
  complete, unambigous type information. Default implementation calls [[metabase.lib.schema.expression/type-of]]."
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
      (let [calculated-type (type-of-method query stage-number x)]
        ;; if calculated type is not a true type but a placeholder like `:metabase.lib.schema.expression/type.unknown`
        ;; or a union of types then fall back to `:type/*`, an actual type.
        (if (isa? calculated-type :type/*)
          calculated-type
          :type/*))))))

(defmethod type-of-method :default
  [_query _stage-number expr]
  (lib.schema.expresssion/type-of expr))

;;; for MBQL clauses whose type is the same as the type of the first arg. Also used
;;; for [[metabase.lib.schema.expression/type-of]].
(defmethod type-of-method :lib.type-of/type-is-type-of-first-arg
  [query stage-number [_tag _opts expr]]
  (type-of query stage-number expr))

(defmethod type-of-method :lib.type-of/type-is-temporal-type-of-first-arg
  [query stage-number [_tag _opts expr :as clause]]
  (if (string? expr)
    ;; If a string, get the type filtered by this expression (eg. `:datetime-add`).
    (lib.schema.expresssion/type-of clause)
    ;; Otherwise, just get the type of this first arg.
    (type-of query stage-number expr)))

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

(mu/defn metadata :- [:map [:lib/type [:and
                                       :keyword
                                       [:fn
                                        {:error/message ":lib/type should be a :metadata/ keyword"}
                                        #(= (namespace %) "metadata")]]]]
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
   (metadata-method query stage-number x)))

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
        (log/error e (i18n/tru "Error calculating display name for query: {0}" (ex-message e)))
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
   ;; For the `:table` field of a Column, is this the source table, or a joined table?
   [:is-source-table {:optional true} [:maybe :boolean]]
   ;; does this column occur in the breakout clause?
   [:is-breakout-column {:optional true} [:maybe :boolean]]
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
   (lib.cache/side-channel-cache
     ;; TODO: Caching by stage here is probably unnecessary - it's already a mistake to have an `x` from a different
     ;; stage than `stage-number`. But it also doesn't hurt much, since a given `x` will only ever have `display-info`
     ;; called with one `stage-number` anyway.
     (keyword "display-info" (str "stage-" stage-number)) x
     (fn [x]
       (try
         (display-info-method query stage-number x)
         (catch #?(:clj Throwable :cljs js/Error) e
           (throw (ex-info (i18n/tru "Error calculating display info for {0}: {1}"
                                     (lib.dispatch/dispatch-value x)
                                     (ex-message e))
                           {:query query, :stage-number stage-number, :x x}
                           e))))))))

(defmulti custom-name-method
  "Implementation for [[custom-name]]."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn custom-name
  "Return the user supplied name of `x`, if any."
  [x]
  (custom-name-method x))

(defmethod custom-name-method :default
  [x]
  ;; We assume that clauses only get a :display-name option if the user explicitly specifies it.
  ;; Expressions from the :expressions clause of pMBQL queries have custom names by default.
  (when (lib.util/clause? x)
    ((some-fn :display-name :lib/expression-name) (lib.options/options x))))

(defn default-display-info
  "Default implementation of [[display-info-method]], available in case you want to use this in a different
  implementation and add additional information to it."
  [query stage-number x]
  (let [x-metadata (metadata query stage-number x)]
    (merge
     ;; TODO -- not 100% convinced the FE should actually have access to `:name`, can't it use `:display-name`
     ;; everywhere? Determine whether or not this is the case.
     (select-keys x-metadata [:name :display-name :semantic-type])
     (when-let [custom (custom-name x)]
       {:display-name custom
        :named? true})
     (when-let [long-display-name (display-name query stage-number x :long)]
       {:long-display-name long-display-name})
     ;; don't return `:base-type`, FE should just use `:effective-type` everywhere and not even need to know
     ;; `:base-type` exists.
     (when-let [effective-type ((some-fn :effective-type :base-type) x-metadata)]
       {:effective-type effective-type})
     (when-let [table-id (:table-id x-metadata)]
       {:table (display-info
                query
                stage-number
                ;; TODO: only ColumnMetadatas should possibly have legacy `card__<id>` `:table-id`s... we should
                ;; probably move this special casing into [[metabase.lib.field]] instead of having it be part of the
                ;; `:default` method.
                (cond
                  (integer? table-id) (lib.metadata/table query table-id)
                  (string? table-id)  (lib.metadata/card query (lib.util/legacy-string-table-id->card-id table-id))))})
     (when-let [source (:lib/source x-metadata)]
       {:is-from-previous-stage (= source :source/previous-stage)
        :is-from-join           (= source :source/joins)
        :is-calculated          (= source :source/expressions)
        :is-implicitly-joinable (= source :source/implicitly-joinable)
        :is-aggregation         (= source :source/aggregations)
        :is-breakout            (= source :source/breakouts)})
     (when-some [selected (:selected? x-metadata)]
       {:selected selected})
     (select-keys x-metadata [:breakout-position :order-by-position :filter-positions]))))

(defmethod display-info-method :default
  [query stage-number x]
  (default-display-info query stage-number x))

(defmethod display-info-method :metadata/table
  [query stage-number table]
  (merge (default-display-info query stage-number table)
         {:is-source-table (= (lib.util/source-table-id query) (:id table))}))

(def ColumnMetadataWithSource
  "Schema for the column metadata that should be returned by [[metadata]]."
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:lib/source ::lib.schema.metadata/column-source]]])

(def ColumnsWithUniqueAliases
  "Schema for column metadata that should be returned by [[visible-columns]]. This is mostly used
  to power metadata calculation for stages (see [[metabase.lib.stage]]."
  [:and
   [:sequential
    [:merge
     ColumnMetadataWithSource
     [:map
      [:lib/source-column-alias  ::lib.schema.common/non-blank-string]
      [:lib/desired-column-alias [:string {:min 1, :max 60}]]]]]
   [:fn
    ;; should be dev-facing only, so don't need to i18n
    {:error/message "Column :lib/desired-column-alias values must be distinct, regardless of case, for each stage!"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Column :lib/desired-column-alias values must be distinct, got: "
                           (pr-str (mapv :lib/desired-column-alias value))))}
    (fn [columns]
      (or
       (empty? columns)
       (apply distinct? (map (comp u/lower-case-en :lib/desired-column-alias) columns))))]])

(def ^:private UniqueNameFn
  [:=>
   [:cat ::lib.schema.common/non-blank-string]
   ::lib.schema.common/non-blank-string])

(def ReturnedColumnsOptions
  "Schema for options passed to [[returned-columns]] and [[returned-columns-method]]."
  [:map
   ;; has the signature (f str) => str
   [:unique-name-fn {:optional true} UniqueNameFn]])

(mu/defn ^:private default-returned-columns-options :- ReturnedColumnsOptions
  []
  {:unique-name-fn (lib.util/unique-name-generator)})

(defmulti returned-columns-method
  "Impl for [[returned-columns]]."
  {:arglists '([query stage-number x options])}
  (fn [_query _stage-number x _options]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod returned-columns-method :dispatch-type/nil
  [_query _stage-number _x _options]
  [])

(mu/defn returned-columns :- [:maybe ColumnsWithUniqueAliases]
  "Return a sequence of metadata maps for all the columns expected to be 'returned' at a query, stage of the query, or
  join, and include the `:lib/source` of where they came from. This should only include columns that will be present
  in the results; DOES NOT include 'expected' columns that are not 'exported' to subsequent stages.

  See [[ReturnedColumnsOptions]] for allowed options and [[default-returned-columns-options]] for default values."
  ([query]
   (returned-columns query (lib.util/query-stage query -1)))

  ([query x]
   (returned-columns query -1 x))

  ([query stage-number x]
   (returned-columns query stage-number x nil))

  ([query          :- ::lib.schema/query
    stage-number   :- :int
    x
    options        :- [:maybe ReturnedColumnsOptions]]
   (let [options (merge (default-returned-columns-options) options)]
     (returned-columns-method query stage-number x options))))

(def VisibleColumnsOptions
  "Schema for options passed to [[visible-columns]] and [[visible-columns-method]]."
  [:merge
   ReturnedColumnsOptions
   [:map
    ;; these all default to true
    [:include-joined?                              {:optional true} :boolean]
    [:include-expressions?                         {:optional true} :boolean]
    [:include-implicitly-joinable?                 {:optional true} :boolean]
    [:include-implicitly-joinable-for-source-card? {:optional true} :boolean]]])

(mu/defn ^:private default-visible-columns-options :- VisibleColumnsOptions
  []
  (merge
   (default-returned-columns-options)
   {:include-joined?                              true
    :include-expressions?                         true
    :include-implicitly-joinable?                 true
    :include-implicitly-joinable-for-source-card? true}))

(defmulti visible-columns-method
  "Impl for [[visible-columns]].

  This should mostly be similar to the implementation for [[metadata-method]], but needs to include
  `:lib/source-column-alias` and `:lib/desired-column-alias`. `:lib/source-column-alias` should probably be the same
  as `:name`; use the supplied `:unique-name-fn` from `options` with the signature `(f str) => str` to ensure
  `:lib/desired-column-alias` is unique.

  Also, columns that aren't 'projected' should be returned as well -- in other words, ignore `:fields`,
  `:aggregations`, and `:breakouts`."
  {:arglists '([query stage-number x options])}
  (fn [_query _stage-number x _options]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod visible-columns-method :dispatch-type/nil
  [_query _stage-number _x _options]
  [])

;;; default impl is just the impl for [[returned-columns-method]]
(defmethod visible-columns-method :default
  [query stage-number x options]
  (returned-columns-method query stage-number x options))

(mu/defn visible-columns :- ColumnsWithUniqueAliases
  "Return a sequence of columns that should be visible *within* a given stage of something, e.g. a query stage or a
  join query. This includes not just the columns that get returned (ones present in [[metadata]], but other columns
  that are 'reachable' in this stage of the query. E.g. in a query like

    SELECT id, name
    FROM table
    ORDER BY position

  only `id` and `name` are 'returned' columns, but other columns such as `position` are visible in this stage as well
  and would thus be returned by this function.

  Columns from joins, expressions, and implicitly joinable columns are included automatically by default;
  see [[VisibleColumnsOptions]] for the options for disabling these columns."
  ([query]
   (visible-columns query (lib.util/query-stage query -1)))

  ([query x]
   (visible-columns query -1 x))

  ([query stage-number x]
   (visible-columns query stage-number x nil))

  ([query          :- ::lib.schema/query
    stage-number   :- :int
    x
    options        :- [:maybe VisibleColumnsOptions]]
   (let [options (merge (default-visible-columns-options) options)]
     (visible-columns-method query stage-number x options))))

(mu/defn primary-keys :- [:sequential ::lib.schema.metadata/column]
  "Returns a list of primary keys for the source table of this query."
  [query        :- ::lib.schema/query]
  (if-let [table-id (lib.util/source-table-id query)]
    (filter lib.types.isa/primary-key? (lib.metadata/fields query table-id))
    []))

(defn implicitly-joinable-columns
  "Columns that are implicitly joinable from some other columns in `column-metadatas`. To be joinable, the column has to
  have appropriate FK metadata, i.e. have an `:fk-target-field-id` pointing to another Field. (I think we only include
  this information for Databases that support FKs and joins, so I don't think we need to do an additional DB feature
  check here.)

  Does not include columns from any Tables that are already explicitly joined.

  Does not include columns that would be implicitly joinable via multiple hops."
  [query stage-number column-metadatas unique-name-fn]
  (let [existing-table-ids (into #{} (map :table-id) column-metadatas)]
    (into []
          (comp (filter :fk-target-field-id)
                (map (fn [{source-field-id :id, :keys [fk-target-field-id] :as source}]
                       (-> (lib.metadata/field query fk-target-field-id)
                           (assoc ::source-field-id source-field-id
                                  ::source-join-alias (:metabase.lib.join/join-alias source)))))
                (remove #(contains? existing-table-ids (:table-id %)))
                (mapcat (fn [{:keys [table-id], ::keys [source-field-id source-join-alias]}]
                          (let [table-metadata (lib.metadata/table query table-id)
                                options        {:unique-name-fn               unique-name-fn
                                                :include-implicitly-joinable? false}]
                            (for [field (visible-columns-method query stage-number table-metadata options)
                                  :let  [field (assoc field
                                                      :fk-field-id              source-field-id
                                                      :fk-join-alias            source-join-alias
                                                      :lib/source               :source/implicitly-joinable
                                                      :lib/source-column-alias  (:name field))]]
                              (assoc field :lib/desired-column-alias (unique-name-fn
                                                                      (lib.join.util/desired-alias query field))))))))
          column-metadatas)))
