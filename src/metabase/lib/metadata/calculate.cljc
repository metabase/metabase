(ns metabase.lib.metadata.calculate
  (:refer-clojure :exclude [ref])
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculate.names :as calculate.names]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.metadata.calculate.type :as calculate.type]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(declare stage-metadata)

(mu/defn ^:private add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [query    :- ::lib.schema/query
   metadata :- lib.metadata/ColumnMetadata]
  (let [parent-metadata     (lib.metadata/field query (:parent_id metadata))
        {parent-name :name} (cond->> parent-metadata
                              (:parent_id parent-metadata) (add-parent-column-metadata query))]
    (update metadata :name (fn [field-name]
                             (str parent-name \. field-name)))))

(mu/defn ^:private metadata-for-field-ref :- lib.metadata/ColumnMetadata
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-ref    :- ::lib.schema.ref/field]
  (let [metadata (merge
                  {:lib/type  :metadata/field
                   :field_ref field-ref}
                  (calculate.resolve/field-metadata query stage-number field-ref)
                  {:display_name (calculate.names/display-name query stage-number field-ref)})]
    (cond->> metadata
      (:parent_id metadata) (add-parent-column-metadata query))))

(mu/defn ^:private metadata-for-expression-ref :- lib.metadata/ColumnMetadata
  [query                                                   :- ::lib.schema/query
   stage-number                                            :- :int
   [_expression _opts expression-name, :as expression-ref] :- ::lib.schema.ref/expression]
  (let [expression (calculate.resolve/expression query stage-number expression-name)]
    {:lib/type     :metadata/field
     :field_ref    expression-ref
     :name         expression-name
     :display_name (calculate.names/display-name query stage-number expression-ref)
     :base_type    (calculate.type/base-type query stage-number expression)}))

(mu/defn ^:private metadata-for-aggregation :- lib.metadata/ColumnMetadata
  [query        :- ::lib.schema/query
   stage-number :- :int
   aggregation  :- ::lib.schema.aggregation/aggregation
   index        :- ::lib.schema.common/int-greater-than-or-equal-to-zero]
  (let [display-name (calculate.names/display-name query stage-number aggregation)]
    {:lib/type     :metadata/field
     :source       :aggregation
     :base_type    (calculate.type/base-type query stage-number aggregation)
     :field_ref    [:aggregation {:lib/uuid (str (random-uuid))} index]
     :name         (calculate.names/column-name query stage-number aggregation)
     :display_name display-name}))

(mu/defn ^:private metadata-for-aggregation-ref :- lib.metadata/ColumnMetadata
  [query                                  :- ::lib.schema/query
   stage-number                           :- :int
   [_ag _opts index, :as aggregation-ref] :- ::lib.schema.ref/aggregation]
  (let [aggregation (calculate.resolve/aggregation query stage-number index)]
    (assoc (metadata-for-aggregation query stage-number aggregation index)
           :field_ref aggregation-ref)))

(mu/defn ^:private metadata-for-ref :- lib.metadata/ColumnMetadata
  [query        :- ::lib.schema/query
   stage-number :- :int
   ref          :- ::lib.schema.ref/ref]
  (case (first ref)
    :field       (metadata-for-field-ref query stage-number ref)
    :expression  (metadata-for-expression-ref query stage-number ref)
    :aggregation (metadata-for-aggregation-ref query stage-number ref)))

(mu/defn ^:private breakout-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{breakouts :breakout} (lib.util/query-stage query stage-number)]
    (mapv (fn [ref]
            (assoc (metadata-for-ref query stage-number ref) :source :breakout))
          breakouts)))

(mu/defn ^:private aggregation-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{aggregations :aggregation} (lib.util/query-stage query stage-number)]
    (map-indexed (fn [i aggregation]
                   (metadata-for-aggregation query stage-number aggregation i))
                 aggregations)))

(mu/defn ^:private fields-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{fields :fields} (lib.util/query-stage query stage-number)]
    (mapv (fn [ref]
            (assoc (metadata-for-ref query stage-number ref) :source :fields))
          fields)))

(defn- remove-hidden-default-fields
  "Remove Fields that shouldn't be visible from the default Fields for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/table->sorted-fields*]]."
  [field-metadatas]
  (remove (fn [{visibility-type :visibility_type, active? :active, :as _field-metadata}]
            (or (false? active?)
                (#{:sensitive :retired} (some-> visibility-type keyword))))
          field-metadatas))

(defn- sort-default-fields
  "Sort default Fields for a source Table. See [[metabase.models.table/field-order-rule]]."
  [field-metadatas]
  (sort-by (fn [{field-name :name, :keys [position], :as _field-metadata}]
             [(or position 0) (u/lower-case-en (or field-name ""))])
           field-metadatas))

(mu/defn ^:private source-table-default-fields :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Determine the Fields we'd normally return for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/add-implicit-fields]]."
  [query    :- ::lib.schema/query
   table-id :- ::lib.schema.id/table]
  (when-let [field-metadatas (lib.metadata/fields query table-id)]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields)))

(mu/defn ^:private default-join-alias :- ::lib.schema.common/non-blank-string
  "Generate an alias for a join that doesn't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  (calculate.names/display-name query stage-number join))

(def ^:private JoinsWithAliases
  "Schema for a sequence of joins that all have aliases."
  [:and
   ::lib.schema.join/joins
   [:sequential
    [:map
     [:alias ::lib.schema.common/non-blank-string]]]])

(mu/defn ^:private ensure-all-joins-have-aliases :- JoinsWithAliases
  "Make sure all the joins in a query have an `:alias` if they don't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- ::lib.schema.join/joins]
  (let [unique-name-generator (mbql.u/unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (not (:alias join)) (assoc :alias (unique-name-generator (default-join-alias query stage-number join)))))
          joins)))

(mu/defn ^:private column-from-join-fields :- lib.metadata/ColumnMetadata
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  (let [[ref-type options arg] (:field_ref column-metadata)
        ref-with-join-alias    [ref-type (assoc options :join-alias join-alias) arg]
        column-metadata        (assoc column-metadata :source_alias join-alias)]
    (assoc column-metadata
           :field_ref    ref-with-join-alias
           :display_name (calculate.names/display-name query stage-number column-metadata))))

(mu/defn ^:private default-columns-added-by-join :- [:sequential lib.metadata/ColumnMetadata]
  [query                                                                     :- ::lib.schema/query
   stage-number                                                              :- :int
   {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join} :- ::lib.schema.join/join]
  (when-not (= fields :not)
    (let [field-metadatas (if (= fields :all)
                            (stage-metadata (assoc query :stages stages))
                            (for [field-ref fields]
                              ;; resolve the field ref in the context of the join. Not sure if this is right.
                              (calculate.resolve/field-metadata query stage-number field-ref)))]
      (mapv (fn [field-metadata]
              (column-from-join-fields query stage-number field-metadata join-alias))
            field-metadatas))))

(mu/defn ^:private default-columns-added-by-joins :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [joins (not-empty (:joins (lib.util/query-stage query stage-number)))]
    (not-empty
     (into []
           (mapcat (partial default-columns-added-by-join query stage-number))
           (ensure-all-joins-have-aliases query stage-number joins)))))

(mu/defn ^:private default-columns :- [:sequential {:min 1} lib.metadata/ColumnMetadata]
  "Calculate the columns to return if `:aggregations`/`:breakout`/`:fields` are unspecified.

  Formula for the so-called 'default' columns is

  1a. Columns returned by the previous stage of the query (if there is one), OR

  1b. Default 'visible' Fields for our `:source-table`, OR

  1c. `:lib/stage-metadata` if this is a `:mbql.stage/native` stage

  PLUS

  2. Columns added by joins at this stage"
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (concat
   ;; 1: columns from the previous stage, source table or query
   (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
     ;; 1a. columns returned by previous stage
     (stage-metadata query previous-stage-number)
     ;; 1b or 1c
     (let [{:keys [source-table], :as this-stage} (lib.util/query-stage query stage-number)]
       (if (integer? source-table)
         ;; 1b: default visible Fields for the source Table
         (source-table-default-fields query source-table)
         ;; 1c: `:lib/stage-metadata` for the native query
         (:columns (:lib/stage-metadata this-stage)))))
   ;; 2: columns added by joins at this stage
   (default-columns-added-by-joins query stage-number)))

(mu/defn stage-metadata :- [:and
                            [:sequential {:min 1} lib.metadata/ColumnMetadata]
                            [:fn
                             ;; should be dev-facing only, so don't need to i18n
                             {:error/message "Column :names must be distinct!"}
                             (fn [columns]
                               (apply distinct? (map :name columns)))]]
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts/fields, then return THOSE. Otherwise return the defaults based on the source Table or
  previous stage + joins."
  ([query :- ::lib.schema/query]
   (stage-metadata query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (or
    ;; stage metadata is already present: return it as-is
    (when-let [metadata (:lib/stage-metadata (lib.util/query-stage query stage-number))]
      (:columns metadata))
    ;; otherwise recursively calculate the metadata for the previous stages and add it to them, we'll need it for
    ;; calculations for this stage and we don't have to calculate it more than once...
    (let [query (let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                  (cond-> query
                    previous-stage-number
                    (lib.util/update-query-stage previous-stage-number assoc :lib/stage-metadata {:lib/type :metadata/results
                                                                                                  :columns  (stage-metadata query previous-stage-number)})))]
      ;; ... then calculate metadata for this stage
      (or
       (not-empty (into []
                        cat
                        [(breakout-columns query stage-number)
                         (aggregation-columns query stage-number)
                         (fields-columns query stage-number)]))
       (default-columns query stage-number))))))
