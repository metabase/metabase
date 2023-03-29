(ns metabase.lib.metadata.calculation
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expresssion]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defmulti display-name-method
  "Calculate a nice human-friendly display name for something."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmulti column-name-method
  "Calculate a database-friendly name to use for something."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

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
  [query        :- ::lib.schema/query
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
                       e))))))

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

(defn- slugify [s]
  (-> s
      (str/replace #"\+" (i18n/tru "plus"))
      (str/replace #"\-" (i18n/tru "minus"))
      (str/replace #"[\(\)]" "")
      u/slugify))

;;; default impl just takes the display name and slugifies it.
(defmethod column-name-method :default
  [query stage-number x]
  (slugify (display-name query stage-number x)))

(defmulti describe-top-level-key-method
  "Implementation for [[describe-top-level-key]]. Describe part of a stage of a query, e.g. the `:filter` part or the
  `:aggregation` part. Return `nil` if there is nothing to describe."
  {:arglists '([query stage-number top-level-key])}
  (fn [_query _stage-number top-level-key]
    top-level-key))

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

(defmulti metadata
  "Calculate appropriate metadata for something. What this looks like depends on what we're calculating metadata for. If
  it's a reference or expression of some sort, this should return a single `:metadata/field` map (i.e., something
  satisfying the [[metabase.lib.metadata/ColumnMetadata]] schema. If it's something like a stage of a query or a join
  definition, it should return a sequence of metadata maps for all the columns 'returned' at that stage of the query."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod metadata :default
  [query stage-number x]
  {:lib/type     :metadata/field
   :base_type    (lib.schema.expresssion/type-of x)
   :name         (column-name query stage-number x)
   :display_name (display-name query stage-number x)})

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
