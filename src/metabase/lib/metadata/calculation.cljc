(ns metabase.lib.metadata.calculation
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expresssion]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defmulti display-name-method
  "Calculate a nice human-friendly display name for something."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmulti column-name-method
  "Calculate a database-friendly name to use for something."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mu/defn ^:export display-name :- ::lib.schema.common/non-blank-string
  "Calculate a nice human-friendly display name for something."
  ([query x]
   (display-name query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (or
    ;; if this is an MBQL clause with `:display-name` in the options map, then use that rather than calculating a name.
    (:display-name (lib.options/options x))
    (try
      (display-name-method query stage-number x)
      ;; if this errors, just catch the error and return something like `Unknown :field`. We shouldn't blow up the
      ;; whole Query Builder if there's a bug
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
  [_query _stage-number x]
  ;; hopefully this is dev-facing only, so not i18n'ed.
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
  "Implementation for [[describe-top-level-key]]. Describe part of a stage of a query, e.g. the `:filter` part or the
  `:aggregation` part. Return `nil` if there is nothing to describe."
  {:arglists '([query stage-number top-level-key])}
  (fn [_query _stage-number top-level-key]
    top-level-key)
  :hierarchy lib.hierarchy/hierarchy)

(def ^:private TopLevelKey
  "In the interest of making this easy to use in JS-land we'll accept either strings or keywords."
  [:enum :aggregation :breakout :filter :limit :order-by :source-table])

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
   (or ((some-fn :effective-type :base-type) (lib.options/options x))
       (type-of-method query stage-number x))))

(defmethod type-of-method :default
  [_query _stage-number expr]
  (lib.schema.expresssion/type-of expr))

(defmethod type-of-method :dispatch-type/fn
  [query stage-number f]
  (type-of query stage-number (f query stage-number)))

;;; for MBQL clauses whose type is the same as the type of the first arg. Also used
;;; for [[metabase.lib.schema.expression/type-of]].
(defmethod type-of-method :lib.type-of/type-is-type-of-first-arg
  [query stage-number [_tag _opts expr]]
  (type-of query stage-number expr))

;;; Ugh
(defmethod type-of-method :lib/external-op
  [query stage-number {:keys [operator options args]}]
  (type-of query stage-number (into [(keyword operator) options] args)))

(defmulti metadata-method
  "Impl for [[metadata]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod metadata-method :default
  [query stage-number x]
  {:lib/type     :metadata/field
   ;; TODO -- effective-type
   :base_type    (type-of query stage-number x)
   :name         (column-name query stage-number x)
   :display_name (display-name query stage-number x)})

(def ColumnMetadataWithSource
  "Schema for the column metadata that should be returned by [[metadata]]."
  [:merge
   lib.metadata/ColumnMetadata
   [:map
    [:lib/source ::lib.metadata/column-source]]])

(mu/defn metadata
  "Calculate appropriate metadata for something. What this looks like depends on what we're calculating metadata for.
  If it's a reference or expression of some sort, this should return a single `:metadata/field` map (i.e., something
  satisfying the [[metabase.lib.metadata/ColumnMetadata]] schema. If it's something like a stage of a query or a join
  definition, it should return a sequence of metadata maps for all the columns 'returned' at that stage of the query,
  and include the `:lib/source` of where they came from."
  ([query]
   (metadata query -1 query))
  ([query x]
   (metadata query -1 x))
  ([query stage-number x]
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
  "Implementation for [[display-info]]."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(mr/register! ::display-info
  [:map
   [:display_name ::lib.schema.common/non-blank-string]
   ;; For Columns. `base_type` not included here, FE doesn't need to know about that.
   [:effective_type {:optional true} [:maybe [:ref ::lib.schema.common/base-type]]]
   [:semantic_type  {:optional true} [:maybe [:ref ::lib.schema.common/semantic-type]]]
   ;; for things that have a Table, e.g. a Field
   [:table {:optional true} [:maybe [:ref ::display-info]]]
   ;; these are derived from the `:lib/source`/`:metabase.lib.metadata/column-source`, but instead of using that value
   ;; directly we're returning a different property so the FE doesn't break if we change those keys in the future,
   ;; e.g. if we consolidate or split some of those keys. This is all the FE really needs to know.
   ;;
   ;; if this is a Column, does it come from a previous stage?
   [:is_from_previous_stage {:optional true} [:maybe :boolean]]
   ;; if this is a Column, does it come from a join in this stage?
   [:is_from_join {:optional true} [:maybe :boolean]]
   ;; if this is a Column, is it 'calculated', i.e. does it come from an expression in this stage?
   [:is_calculated {:optional true} [:maybe :boolean]]
   ;; if this is a Column, is it an implicitly joinable one? I.e. is it from a different table that we have not
   ;; already joined, but could implicitly join against?
   [:is_implicitly_joinable {:optional true} [:maybe :boolean]]])

(mu/defn display-info :- ::display-info
  "Given some sort of Cljs object, return a map with the info you'd need to implement UI for it. This is mostly meant to
  power the Frontend JavaScript UI; in JS, results will be converted to plain JavaScript objects, so avoid returning
  things that should remain opaque."
  ([query x]
   (display-info query -1 x))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    x]
   (display-info-method query stage-number x)))

(defn default-display-info
  "Default implementation of [[display-info-method]], available in case you want to use this in a different
  implementation and add additional information to it."
  [query stage-number x]
  (let [x-metadata (metadata query stage-number x)]
    (merge
     ;; TODO -- not 100% convinced the FE should actually have access to `:name`, can't it use `:display_name`
     ;; everywhere? Determine whether or not this is the case.
     (select-keys x-metadata [:name :display_name :semantic_type])
     ;; don't return `:base_type`, FE should just use `:effective_type` everywhere and not even need to know
     ;; `:base_type` exists.
     (when-let [effective-type ((some-fn :effective_type :base_type) x-metadata)]
       {:effective_type effective-type})
     (when-let [table-id (:table_id x-metadata)]
       {:table (display-info query stage-number (lib.metadata/table query table-id))})
     (when-let [source (:lib/source x-metadata)]
       {:is_from_previous_stage (= source :source/previous-stage)
        :is_from_join           (= source :source/joins)
        :is_calculated          (= source :source/expressions)
        :is_implicitly_joinable (= source :source/implicitly-joinable)}))))

(defmethod display-info-method :default
  [query stage-number x]
  (default-display-info query stage-number x))
