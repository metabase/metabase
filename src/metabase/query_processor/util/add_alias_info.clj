(ns metabase.query-processor.util.add-alias-info
  (:require [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase.driver :as driver]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.store :as qp.store]
            [metabase.util.i18n :refer [tru]]))

;; these methods were moved from [[metabase.driver.sql.query-processor]] in 0.42.0

(defmulti prefix-field-alias
  "Create a Field alias by combining a `prefix` string with `field-alias` string. The default implementation just joins
  the two strings with `__` -- override this if you need to do something different."
  {:arglists '([driver prefix field-alias]), :added "0.38.1"}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defmethod prefix-field-alias :default
  [_driver prefix field-alias]
  (str prefix "__" field-alias))

(defmulti ^String escape-alias
  "Return the String that should be emitted in the query for the generated `alias-name`, which will follow the
  equivalent of a SQL `AS` clause. This is to allow for escaping names that particular databases may not allow as
  aliases for custom expressions or fields (even when quoted).

  Defaults to identity (i.e. returns `alias-name` unchanged)."
  {:added "0.41.0" :arglists '([driver alias-name])}
  driver/dispatch-on-initialized-driver
  :hierarchy #'driver/hierarchy)

(defn- unique-alias-fn
  "Creates a function with the signature

    (unique-alias position original-alias)

  To return a uniquified version of `original-alias`. Memoized by `position`, so duplicate calls will result in the
  same unique alias."
  []
  (let [unique-name-fn (mbql.u/unique-name-generator
                        :name-key-fn     str/lower-case
                        ;; TODO -- we should probably limit the length somehow like we do in
                        ;; [[metabase.query-processor.middleware.add-implicit-joins/join-alias]], and also update this
                        ;; function and that one to append a short suffix if we are limited by length. See also
                        ;; [[escape-alias]] above
                        :unique-alias-fn (fn [original suffix]
                                           (escape-alias driver/*driver* (str original \_ suffix))))]
    (fn unique-alias-fn* [position original-alias]
      (unique-name-fn position (escape-alias driver/*driver* original-alias)))))

;; TODO -- this should probably limit the resulting alias, and suffix a short hash as well if it gets too long. See also
;; [[unique-alias-fn]] below.
(defmethod escape-alias :default
  [_driver alias-name]
  alias-name)

(defn- remove-namespaced-options [options]
  (when options
    (not-empty (into {}
                     (remove (fn [[k _]]
                               (when (keyword? k)
                                 (namespace k))))
                     options))))

(defn normalize-clause
  "Normalize a `:field`/`:expression`/`:aggregation` clause by removing extra info so it can serve as a key for
  `:qp/refs`."
  [clause]
  (mbql.u/match-one clause
    ;; optimization: don't need to rewrite a `:field` clause without any options
    [:field _ nil]
    &match

    [:field id-or-name opts]
    ;; this doesn't use [[mbql.u/update-field-options]] because this gets called a lot and the overhead actually adds up
    ;; a bit
    [:field id-or-name (remove-namespaced-options (dissoc opts :source-fields))]

    ;; for `:expression` and `:aggregation` references, remove the options map if they are empty.
    [:expression expression-name opts]
    (if-let [opts (remove-namespaced-options opts)]
      [:expression expression-name opts]
      [:expression expression-name])

    [:aggregation index opts]
    (if-let [opts (remove-namespaced-options opts)]
      [:aggregation index opts]
      [:aggregation index])

    _
    &match))

(defn- selected-clauses
  "Get all the clauses that are returned by this level of the query as a map of normalized-clause -> index of that
  column in the results."
  [{:keys [fields breakout aggregation], :as query}]
  ;; this is cached for the duration of the QP run because it's a little expensive to calculate and caching this speeds
  ;; up this namespace A LOT
  (qp.store/cached (select-keys query [:fields :breakout :aggregation])
    (into
     {}
     (comp cat
           (map-indexed
            (fn [i clause]
              [(normalize-clause clause) i])))
     [breakout
      (map-indexed
       (fn [i ag]
         (mbql.u/replace ag
           [:aggregation-options wrapped opts]
           [:aggregation i]

           ;; aggregation clause should be preprocessed into an `:aggregation-options` clause by now.
           _
           (throw (ex-info (tru "Expected :aggregation-options clause, got {0}" (pr-str ag))
                           {:type qp.error-type/qp, :clause ag}))))
       aggregation)
      fields])))

(defn- clause->position
  "Get the position (i.e., column index) `clause` is returned as, if it is returned (i.e. if it is in `:breakout`,
  `:aggregation`, or `:fields`). Not all clauses are returned."
  [inner-query clause]
  ((selected-clauses inner-query) (normalize-clause clause)))

(defn- this-level-join-aliases [{:keys [joins]}]
  (into #{} (map :alias) joins))

(defn- field-is-from-join-in-this-level? [inner-query [_ _ {:keys [join-alias]}]]
  (when join-alias
    ((this-level-join-aliases inner-query) join-alias)))

(defn- field-instance
  {:arglists '([field-clause])}
  [[_ id-or-name]]
  (when (integer? id-or-name)
    (qp.store/field id-or-name)))

(defn- field-table-id [field-clause]
  (:table_id (field-instance field-clause)))

(defn- field-source-table-alias
  "Determine the appropriate `::source-table` alias for a `field-clause`."
  {:arglists '([inner-query field-clause])}
  [{:keys [source-table], :as inner-query} [_ _id-or-name {:keys [join-alias]}, :as field-clause]]
  (let [table-id            (field-table-id field-clause)
        join-is-this-level? (field-is-from-join-in-this-level? inner-query field-clause)]
    (cond
      join-is-this-level?                      join-alias
      (and table-id (= table-id source-table)) table-id
      :else                                    ::source)))

(defn- exports [query]
  (into #{} (mbql.u/match (dissoc query :source-query :source-metadata :joins)
              [(_ :guard #{:field :expression :aggregation}) _ (_ :guard (every-pred map? ::position))])))

(defn- join-with-alias [{:keys [joins]} join-alias]
  (some (fn [join]
          (when (= (:alias join) join-alias)
            join))
        joins))

(defn- matching-field-in-join-at-this-level
  "If `field-clause` is the result of a join *at this level* with a `:source-query`, return the 'source' `:field` clause
  from that source query."
  [inner-query [_ _ {:keys [join-alias]} :as field-clause]]
  (when join-alias
    (when-let [matching-join-source-query (:source-query (join-with-alias inner-query join-alias))]
      (let [normalized (mbql.u/update-field-options (normalize-clause field-clause) dissoc :join-alias)]
        (some (fn [a-clause]
                (when (and (mbql.u/is-clause? :field a-clause)
                           (= (mbql.u/update-field-options (normalize-clause a-clause) dissoc :join-alias)
                              normalized))
                  a-clause))
              (exports matching-join-source-query))))))

(defn- field-alias-in-join-at-this-level
  "If `field-clause` is the result of a join at this level, return the `::desired-alias` from that join (where the Field is
  introduced). This is the appropriate `::source-alias` for such a Field."
  [inner-query field-clause]
  (when-let [[_ _ {::keys [desired-alias]}] (matching-field-in-join-at-this-level inner-query field-clause)]
    desired-alias))

(defn- matching-field-in-source-query
  [{:keys [source-query], :as inner-query} [_ _ {:keys [join-alias]}, :as field-clause]]
  (when (= (field-source-table-alias inner-query field-clause) ::source)
    (let [normalized (normalize-clause field-clause)]
      (some (fn [a-clause]
              (when (and (mbql.u/is-clause? :field a-clause)
                         (= (normalize-clause a-clause)
                            normalized))
                a-clause))
            (exports source-query)))))

(defn- field-alias-in-source-query
  [inner-query field-clause]
  (when-let [[_ _ {::keys [desired-alias]}] (matching-field-in-source-query inner-query field-clause)]
    desired-alias))

(defn- field-name
  "*Actual* name of a `:field` from the database or source query (for Field literals)."
  [_inner-query [_ id-or-name :as field-clause]]
  (or (:name (field-instance field-clause))
      (when (string? id-or-name)
        id-or-name)))

(def call-count (atom {}))

(defn- expensive-field-info
  "Calculate extra stuff about `field-clause` that's a little expensive to calculate. This is done once so we can pass
  it around instead of recalculating it a bunch of times."
  [inner-query field-clause]
  (swap! call-count update field-clause (fnil inc 0))
  {:field-name              (field-name inner-query field-clause)
   :join-is-this-level?     (field-is-from-join-in-this-level? inner-query field-clause)
   :alias-from-join         (field-alias-in-join-at-this-level inner-query field-clause)
   :alias-from-source-query (field-alias-in-source-query inner-query field-clause)})

(defn- field-source-alias
  "Determine the appropriate `::source-alias` for a `field-clause`."
  {:arglists '([inner-query field-clause expensive-field-info])}
  [{:keys [source-table], :as inner-query}
   [_ _id-or-name {:keys [join-alias]}, :as field-clause]
   {:keys [field-name join-is-this-level? alias-from-join alias-from-source-query]}]
  (cond
    (and join-alias (not join-is-this-level?)) (prefix-field-alias driver/*driver* join-alias field-name)
    (and join-is-this-level? alias-from-join)  alias-from-join
    alias-from-source-query                    alias-from-source-query
    :else                                      field-name))

(defn- field-desired-alias
  "Determine the appropriate `::desired-alias` for a `field-clause`."
  {:arglists '([inner-query field-clause expensive-field-info])}
  [inner-query
   [_ _id-or-name {:keys [join-alias]} :as field-clause]
   {:keys [field-name alias-from-join alias-from-source-query]}]
  (cond
    join-alias              (prefix-field-alias driver/*driver* join-alias (or alias-from-join field-name))
    alias-from-source-query alias-from-source-query
    :else                   field-name))

(defmulti ^:private clause-alias-info
  {:arglists '([inner-query unique-alias-fn clause])}
  (fn [_ _ [clause-type]]
    clause-type))

(defmethod clause-alias-info :field
  [inner-query unique-alias-fn field-clause]
  (let [expensive-info (expensive-field-info inner-query field-clause)]
    (merge {::source-table (field-source-table-alias inner-query field-clause)
            ::source-alias (field-source-alias inner-query field-clause expensive-info)}
           (when-let [position (clause->position inner-query field-clause)]
             {::desired-alias (unique-alias-fn position (field-desired-alias inner-query field-clause expensive-info))
              ::position      position}))))

(defmethod clause-alias-info :aggregation
  [{aggregations :aggregation, :as inner-query} unique-alias-fn [_ index opts :as ag-ref-clause]]
  (let [position (clause->position inner-query ag-ref-clause)]
    ;; an aggregation is ALWAYS returned, so it HAS to have a `position`. If it does not, the aggregation reference
    ;; is busted.
    (when-not position
      (throw (ex-info (tru "Aggregation does not exist at index {0}" index)
                      {:type   qp.error-type/invalid-query
                       :clause ag-ref-clause
                       :query  inner-query})))
    (let [[_ ag-name _ :as matching-ag] (nth aggregations index)]
      ;; make sure we have an `:aggregation-options` clause like we expect. This is mostly a precondition check
      ;; since we should never be running this code on not-preprocessed queries, so it's not i18n'ed
      (when-not (mbql.u/is-clause? :aggregation-options matching-ag)
        (throw (ex-info (format "Expected :aggregation-options, got %s. (Query must be fully preprocessed.)"
                                (pr-str matching-ag))
                        {:clause ag-ref-clause, :query inner-query})))
      {::desired-alias (unique-alias-fn position ag-name)
       ::position      position})))

(defmethod clause-alias-info :expression
  [inner-query unique-alias-fn [_ expression-name :as expression-ref-clause]]
  (when-let [position (clause->position inner-query expression-ref-clause)]
    {::desired-alias (unique-alias-fn position expression-name)
     ::position      position}))

(defn- add-alias-info* [inner-query]
  (assert (not (:strategy inner-query)) "add-alias-info* should not be called on a join") ; not user-facing
  (let [unique-alias-fn (unique-alias-fn)]
    (mbql.u/replace inner-query
      ;; don't rewrite anything inside any source queries or source metadata.
      (_ :guard (constantly (some (partial contains? (set &parents))
                                  [:source-query :source-metadata])))
      &match

      #{:field :aggregation :expression}
      (mbql.u/update-field-options &match merge (clause-alias-info inner-query unique-alias-fn &match)))))

(defn add-alias-info
  "Add extra info to `:field` clauses, `:expression` references, and `:aggregation` references in `query`. `query` must
  be fully preprocessed.

  Adds some or all of the following keys:

  ### `::source-table`

  String name, integer Table ID, or the keyword `::source`. Use this alias to qualify the clause during compilation.
  String names are aliases for joins. `::source` means this clause comes from the `:source-query`; the alias to use is
  theoretically driver-specific but in practice is
  `source` (see [[metabase.driver.sql.query-processor/source-query-alias]]). An integer Table ID means this comes from
  the `:source-table` (either directly or indirectly via one or more `:source-query`s; use the Table's schema and name
  to qualify the clause.

  ### `::source-alias`

  String name to use to refer to this clause during compilation.

  ### `::desired-alias`

  If this clause is 'selected' (i.e., appears in `:fields`, `:aggregation`, or `:breakout`), select the clause `AS`
  this alias. This alias is guaranteed to be unique.

  ### `::position`

  If this clause is 'selected', this is the position the clause will appear in the results (i.e. the corresponding
  column index)."
  [query-or-inner-query]
  (walk/postwalk
   (fn [form]
     (if (and (map? form)
              ((some-fn :source-query :source-table) form)
              (not (:strategy form)))
       (vary-meta (add-alias-info* form) assoc ::transformed true)
       form))
   query-or-inner-query))
