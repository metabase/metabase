(ns metabase.lib.join
  (:require
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmulti with-join-alias-method
  "Implementation for [[with-join-alias]]."
  {:arglists '([x join-alias])}
  (fn [x _join-alias]
    (lib.dispatch/dispatch-value x)))

(defmethod with-join-alias-method :dispatch-type/fn
  [f join-alias]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (with-join-alias-method x join-alias))))

(defmethod with-join-alias-method :mbql/join
  [join join-alias]
  (assoc join :alias join-alias))

(mu/defn with-join-alias
  "Add a specific `join-alias` to something `x`, either a `:field` or join map. Does not recursively update other
  references (yet; we can add this in the future)."
  [x join-alias :- ::lib.schema.common/non-blank-string]
  (with-join-alias-method x join-alias))

(defmulti current-join-alias-method
  "Impl for [[current-join-alias]]."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod current-join-alias-method :default
  [_x]
  nil)

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [x]
  (current-join-alias-method x))

(mu/defn resolve-join :- ::lib.schema.join/join
  "Resolve a join with a specific `join-alias`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (or (m/find-first #(= (:alias %) join-alias)
                    (:joins (lib.util/query-stage query stage-number)))
      (throw (ex-info (i18n/tru "No join named {0}" (pr-str join-alias))
                      {:join-alias   join-alias
                       :query        query
                       :stage-number stage-number}))))

(defmethod lib.metadata.calculation/display-name-method :mbql/join
  [query _stage-number {[first-stage] :stages, :as _join}]
  (if-let [source-table (:source-table first-stage)]
    (if (integer? source-table)
      (:display_name (lib.metadata/table query source-table))
      ;; handle card__<id> source tables.
      (let [[_ card-id-str] (re-matches #"^card__(\d+)$" source-table)]
        (i18n/tru "Saved Question #{0}" card-id-str)))
    (i18n/tru "Native Query")))

(mu/defn ^:private column-from-join-fields :- lib.metadata.calculation/ColumnMetadataWithSource
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  (let [column-metadata (assoc column-metadata :source_alias join-alias)
        col             (-> (assoc column-metadata
                                   :display_name (lib.metadata.calculation/display-name query stage-number column-metadata)
                                   :lib/source :source/fields)
                            (with-join-alias join-alias))]
    (assert (= (current-join-alias col) join-alias))
    col))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [query stage-number {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join}]
  (when-not (= fields :none)
    (let [field-metadatas (if (= fields :all)
                            (lib.metadata.calculation/metadata (assoc query :stages stages) -1 (last stages))
                            (for [field-ref fields]
                              ;; resolve the field ref in the context of the join. Not sure if this is right.
                              (lib.metadata.calculation/metadata query stage-number field-ref)))]
      (mapv (fn [field-metadata]
              (column-from-join-fields query stage-number field-metadata join-alias))
            field-metadatas))))

(defmulti join-clause-method
  "Convert something to a join clause."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

;; TODO -- should the default implementation call [[metabase.lib.query/query]]? That way if we implement a method to
;; create an MBQL query from a `Table`, then we'd also get [[join]] support for free?

(defmethod join-clause-method :mbql/join
  [_query _stage-number a-join-clause]
  a-join-clause)

;;; TODO -- this probably ought to live in [[metabase.lib.query]]
(defmethod join-clause-method :mbql/query
  [_query _stage-number another-query]
  (-> {:lib/type :mbql/join
       :stages   (:stages (lib.util/pipeline another-query))}
      lib.options/ensure-uuid))

;;; TODO -- this probably ought to live in [[metabase.lib.stage]]
(defmethod join-clause-method :mbql.stage/mbql
  [_query _stage-number mbql-stage]
  (-> {:lib/type :mbql/join
       :stages   [mbql-stage]}
      lib.options/ensure-uuid))

(defmethod join-clause-method :dispatch-type/fn
  [query stage-number f]
  (join-clause-method query
                      stage-number
                      (or (f query stage-number)
                          (throw (ex-info "Error creating join clause: (f query stage-number) returned nil"
                                          {:query        query
                                           :stage-number stage-number
                                           :f            f})))))

;; TODO this is basically the same as lib.common/->op-args,
;; but requiring lib.common leads to crircular dependencies:
;; join -> common -> field -> join.
(defmulti ^:private ->join-condition
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x)))

(defmethod ->join-condition :default
  [_query _stage-number x]
  x)

(defmethod ->join-condition :lib/external-op
  [query stage-number {:keys [operator options args] :or {options {}}}]
  (->join-condition query stage-number
                    (lib.options/ensure-uuid (into [operator options] args))))

(defmethod ->join-condition :dispatch-type/fn
  [query stage-number f]
  (->join-condition query stage-number (f query stage-number)))

(mu/defn join-condition :- [:or
                            fn?
                            ::lib.schema.expression/boolean]
  "Create a MBQL condition expression to include as the `:condition` in a join map.

  - One arity: return a function that will be resolved later once we have `query` and `stage-number.`
  - Three arity: return the join condition expression immediately."
  ([x]
   (fn [query stage-number]
     (join-condition query stage-number x)))
  ([query stage-number x]
   (->join-condition query stage-number x)))

(defn join-clause
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([x]
   (fn [query stage-number]
     (join-clause query stage-number x)))

  ([x condition]
   (fn [query stage-number]
     (join-clause query stage-number x condition)))

  ([query stage-number x]
   (join-clause-method query stage-number x))

  ([query stage-number x condition]
   (cond-> (join-clause query stage-number x)
     condition (assoc :condition (join-condition query stage-number condition)))))


(mu/defn with-join-fields
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [x fields :- ::lib.schema.join/fields]
  (if (fn? x)
    (fn [query stage-number]
      (with-join-fields (x query stage-number) fields))
    (assoc x :fields fields)))

(mu/defn join :- ::lib.schema/query
  "Create a join map as if by [[join-clause]] and add it to a `query`.

  `condition` is currently required, but in the future I think we should make this smarter and try to infer a sensible
  default condition for things, e.g. when joining a Table B from Table A, if there is an FK relationship between A and
  B, join via that relationship. Not yet implemented!"
  ([query a-join-clause]
   (join query -1 a-join-clause (:condition a-join-clause)))

  ([query x condition]
   (join query -1 x condition))

  ([query stage-number x condition]
   (let [stage-number (or stage-number -1)
         new-join     (if (some? condition) ; I guess technically `false` could be a valid join condition?
                        (join-clause query stage-number x condition)
                        (join-clause query stage-number x))]
     (lib.util/update-query-stage query stage-number update :joins (fn [joins]
                                                                     (conj (vec joins) new-join))))))

(mu/defn joins :- ::lib.schema.join/joins
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query        :- ::lib.schema/query
    stage-number :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
   (not-empty (get (lib.util/query-stage query stage-number) :joins))))
