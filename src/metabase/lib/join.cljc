(ns metabase.lib.join
  (:require
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
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
  (let [{:keys [joins]} (lib.util/query-stage query stage-number)]
    (or (m/find-first #(= (:alias %) join-alias)
                      joins)
        (throw (ex-info (i18n/tru "No join named {0}, found: {1}"
                                  (pr-str join-alias)
                                  (pr-str (mapv :alias joins)))
                        {:join-alias   join-alias
                         :query        query
                         :stage-number stage-number})))))

(defmethod lib.metadata.calculation/display-name-method :mbql/join
  [query _stage-number {[first-stage] :stages, :as _join} _style]
  (if-let [source-table (:source-table first-stage)]
    (if (integer? source-table)
      (:display-name (lib.metadata/table query source-table))
      ;; handle card__<id> source tables.
      (let [card-id (lib.util/string-table-id->card-id source-table)]
        (i18n/tru "Saved Question #{0}" card-id)))
    (i18n/tru "Native Query")))

(defmethod lib.metadata.calculation/display-info-method :mbql/join
  [query stage-number join]
  (let [display-name (lib.metadata.calculation/display-name query stage-number join)]
    {:name (or (:alias join) display-name), :display-name display-name}))

(mu/defn ^:private column-from-join-fields :- lib.metadata.calculation/ColumnMetadataWithSource
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  (let [column-metadata (assoc column-metadata :source_alias join-alias)
        col             (-> (assoc column-metadata
                                   :display-name (lib.metadata.calculation/display-name query stage-number column-metadata)
                                   :lib/source   :source/joins)
                            (with-join-alias join-alias))]
    (assert (= (current-join-alias col) join-alias))
    col))

(mu/defn ^:private default-join-alias :- ::lib.schema.common/non-blank-string
  "Generate an alias for a join that doesn't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  ;; TODO -- this logic is a little goofy, we should update it to match what MLv1 does. See
  ;; https://github.com/metabase/metabase/issues/30048
  (lib.metadata.calculation/display-name query stage-number join))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [query stage-number {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join}]
  (when-not (= fields :none)
    (let [join-query (assoc query :stages stages)
          field-metadatas (if (= fields :all)
                            (lib.metadata.calculation/metadata join-query -1 (peek stages))
                            (for [field-ref fields
                                  :let [join-field (lib.options/update-options field-ref dissoc :join-alias)]]
                              (lib.metadata.calculation/metadata join-query -1 join-field)))]
      (mapv (fn [field-metadata]
              (column-from-join-fields query stage-number field-metadata join-alias))
            field-metadatas))))

(mu/defn joined-field-desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

(defmethod lib.metadata.calculation/visible-columns-method :mbql/join
  [query stage-number join {:keys [unique-name-fn], :as _options}]
  ;; should be dev-facing-only so don't need to i18n
  (assert (:alias join) "Join must have an alias to determine column aliases!")
  (mapv (fn [col]
          (assoc col
                 :lib/source-column-alias  (:name col)
                 :lib/desired-column-alias (unique-name-fn (joined-field-desired-alias (:alias join) (:name col)))))
        (lib.metadata.calculation/metadata query stage-number (dissoc join :fields))))

(def ^:private JoinsWithAliases
  "Schema for a sequence of joins that all have aliases."
  [:and
   ::lib.schema.join/joins
   [:sequential
    [:map
     [:alias ::lib.schema.common/non-blank-string]]]])

(mu/defn ^:private  ensure-all-joins-have-aliases :- JoinsWithAliases
  "Make sure all the joins in a query have an `:alias` if they don't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- ::lib.schema.join/joins]
  (let [unique-name-fn (lib.util/unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (not (:alias join)) (assoc :alias (unique-name-fn (default-join-alias query stage-number join)))))
          joins)))

(mu/defn all-joins-default-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/visible-columns]] on all of the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/visible-columns query stage-number join {:unique-name-fn unique-name-fn})))
        (when-let [joins (:joins (lib.util/query-stage query stage-number))]
          (ensure-all-joins-have-aliases query stage-number joins))))

(defmulti join-clause-method
  "Convert something to a join clause."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

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

(defn join-clause
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([x]
   (fn [query stage-number]
     (join-clause query stage-number x)))

  ([x conditions]
   (fn [query stage-number]
     (join-clause query stage-number x conditions)))

  ([query stage-number x]
   (join-clause-method query stage-number x))

  ([query stage-number x conditions]
   (cond-> (join-clause query stage-number x)
     conditions (assoc :conditions (mapv #(lib.common/->op-arg query stage-number %) conditions)))))

(defmulti with-join-fields-method
  "Impl for [[with-join-fields]]."
  {:arglists '([x fields])}
  (fn [x _fields]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod with-join-fields-method :dispatch-type/fn
  [f fields]
  (fn [query stage-number]
    (with-join-fields-method (f query stage-number) (if (keyword? fields)
                                                      fields
                                                      (mapv #(lib.common/->op-arg query stage-number %) fields)))))

(defmethod with-join-fields-method :mbql/join
  [join fields]
  (assoc join :fields fields))

(mu/defn with-join-fields
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [x fields]
  (with-join-fields-method x fields))

(mu/defn join :- ::lib.schema/query
  "Create a join map as if by [[join-clause]] and add it to a `query`.

  `conditions` is currently required, but in the future I think we should make this smarter and try to infer sensible
  default conditions for things, e.g. when joining a Table B from Table A, if there is an FK relationship between A and
  B, join via that relationship. Not yet implemented!"
  ([query a-join-clause]
   (join query -1 a-join-clause (:conditions a-join-clause)))

  ([query x conditions]
   (join query -1 x conditions))

  ([query stage-number x conditions]
   (let [stage-number (or stage-number -1)
         new-join     (if (seq conditions)
                        (join-clause query stage-number x conditions)
                        (join-clause query stage-number x))]
     (lib.util/update-query-stage query stage-number update :joins (fn [joins]
                                                                     (conj (vec joins) new-join))))))

(mu/defn joins :- [:maybe ::lib.schema.join/joins]
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :joins))))

(mu/defn implicit-join-name :- ::lib.schema.common/non-blank-string
  "Name for an implicit join against `table-name` via an FK field, e.g.

    CATEGORIES__via__CATEGORY_ID

  You should make sure this gets ran thru a unique-name fn."
  [table-name           :- ::lib.schema.common/non-blank-string
   source-field-id-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__via__%s" table-name source-field-id-name))

(mu/defn join-conditions :- ::lib.schema.join/conditions
  "Get all join conditions for the given join"
  [j :- ::lib.schema.join/join]
  (:conditions j))

(mu/defn join-fields :- [:maybe ::lib.schema/fields]
  "Get all join conditions for the given join"
  [j :- ::lib.schema.join/join]
  (:fields j))
