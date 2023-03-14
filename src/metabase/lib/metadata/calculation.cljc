(ns metabase.lib.metadata.calculation
  (:require
   [clojure.string :as str]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expresssion]
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

(mu/defn display-name :- ::lib.schema.common/non-blank-string
  "Calculate a nice human-friendly display name for something."
  [query                                    :- ::lib.schema/query
   stage-number                             :- :int
   x]
  (or
   ;; if this is an MBQL clause with `:display-name` in the options map, then use that rather than calculating a name.
   (:display-name (lib.options/options x))
   (try
     (display-name-method query stage-number x)
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info (i18n/tru "Error calculating display name for {0}: {1}" (pr-str x) (ex-message e))
                       {:x            x
                        :query        query
                        :stage-number stage-number}
                       e))))))

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
             `display-name*
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

(defmulti describe-top-level-key
  "'top-level' here means the top level of an individual stage. Describe part of a stage of a query, e.g. the `:filter`
  part or the `:aggregation` part."
  {:arglists '([query stage-number top-level-key])}
  (fn [_query _stage-number top-level-key]
    top-level-key))

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

(defn describe-query
  "Convenience for calling [[display-name]] on a query to describe the results of its final stage."
  [query]
  (display-name query -1 query))
