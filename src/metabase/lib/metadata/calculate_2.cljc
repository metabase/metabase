(ns metabase.lib.metadata.calculate-2
  (:refer-clojure :exclude [ref])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.util :as mut]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.models.humanization.impl :as humanization.impl]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.expression :as expression]))

(declare stage-metadata)

(mu/defn ^:private join-display-name :- ::lib.schema.common/non-blank-string
  "Calculate a nice human-friendly display name for a join."
  [query                              :- ::lib.schema/query
   {[first-stage] :stages, :as _join} :- ::lib.schema.join/join]
  (if-let [source-table (:source-table first-stage)]
    (if (integer? source-table)
      (:display_name (lib.metadata/table query source-table))
      ;; handle card__<id> source tables.
      (let [[_ card-id-str] (re-matches #"^card__(\d+)$" source-table)]
        (i18n/tru "Saved Question #{0}" card-id-str)))
    (i18n/tru "Native Query")))

(mu/defn ^:private add-joined-column-metadata :- lib.metadata/ColumnMetadata
  "Add metadata about the join a column comes from."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string
   metadata     :- lib.metadata/ColumnMetadata]
  (let [join (some (fn [join]
                     (when (= (:alias join) join-alias)
                       join))
                   (:joins (lib.util/query-stage query stage-number)))]
    (merge metadata
           {:source_alias join-alias}
           (when join
             {:display_name (str (join-display-name query join) " → " (:display_name metadata))}))))

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
  [query                                    :- ::lib.schema/query
   stage-number                             :- :int
   [_field opts id-or-name, :as field-ref]  :- ::lib.schema.ref/field]
  (let [metadata (merge
                  {:lib/type  :metadata/field
                   :field_ref field-ref}
                  (if (integer? id-or-name)
                    ;; integer Field ID: get metadata from the metadata provider. This is probably not 100% the
                    ;; correct thing to do if this isn't the first stage of the query, but we can fix that behavior in
                    ;; a follow-on
                    (let [field-id id-or-name]
                      (lib.metadata/field query field-id))
                    ;; string column name: get metadata from the previous stage, if it exists, otherwise if this is
                    ;; the first stage and we have a native query or a Saved Question source query or whatever get it
                    ;; from our results metadata
                    (let [column-name id-or-name]
                      (or (some (fn [column]
                                  (when (= (:name column) column-name)
                                    column))
                                (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                                  (stage-metadata query previous-stage-number)
                                  (get-in (lib.util/query-stage query stage-number) [:lib/stage-metadata :columns])))
                          (throw (ex-info (i18n/tru "Invalid :field clause: column {0} does not exist" (pr-str column-name))
                                          {:clause       field-ref
                                           :name         column-name
                                           :query        query
                                           :stage-number stage-number}))))))]
    (cond->> metadata
      (:join-alias opts)    (add-joined-column-metadata query stage-number (:join-alias opts))
      (:parent_id metadata) (add-parent-column-metadata query))))

;;; TODO -- this could be a little more sophisticated.
(mu/defn ^:private infer-expression-type :- ::lib.schema.ref/base-type
  [expression :- ::lib.schema.expression/expression]
  (or (some (fn [[expression-type-schema base-type]]
              (when (mc/validate expression-type-schema expression)
                base-type))
            [[::lib.schema.expression/boolean :type/Boolean]
             [::lib.schema.expression/string :type/Text]
             [::lib.schema.expression/integer :type/Integer]
             [::lib.schema.expression/decimal :type/Float]
             #_[::lib.schema.expression/number :type/Number]
             [::lib.schema.expression/date :type/Date]
             [::lib.schema.expression/time :type/Time]
             [::lib.schema.expression/date-time :type/DateTime]
             #_[::lib.schema.expression/temporal :type/Temporal]])
      :type/*))

(mu/defn ^:private infer-expression-ref-type :- ::lib.schema.ref/base-type
  [query                                                   :- ::lib.schema/query
   stage-number                                            :- :int
   [_expression _opts expression-name, :as expression-ref] :- ::lib.schema.ref/expression]
  (let [stage      (lib.util/query-stage query stage-number)
        expression (or (get-in stage [:expressions expression-name])
                       (throw (ex-info (i18n/tru "Expression {0} does not exist!" (pr-str expression-name))
                                       {:ref          expression-ref
                                        :query        query
                                        :stage-number stage-number})))]
    (infer-expression-type expression)))

(mu/defn ^:private metadata-for-expression-ref :- lib.metadata/ColumnMetadata
  [query                                                   :- ::lib.schema/query
   stage-number                                            :- :int
   [_expression _opts expression-name, :as expression-ref] :- ::lib.schema.ref/expression]
  {:lib/type     :metadata/field
   :field_ref    expression-ref
   :name         expression-name
   :display_name expression-name
   :base_type    (infer-expression-ref-type query stage-number expression-ref)})

(mu/defn ^:private metadata-for-aggregation-ref :- lib.metadata/ColumnMetadata
  [query           :- ::lib.schema/query
   stage-number    :- :int
   aggregation-ref :- ::lib.schema.ref/aggregation]
  {:lib/type  :metadata/field
   :field_ref aggregation-ref
   :name      "<aggregation>"})

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
    (map-indexed (fn [i _aggregation]
                   {:lib/type  :metadata/field
                    :source    :aggregation
                    :field_ref [:aggregation {:lib/uuid (str (random-uuid))} i]})
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
  [query :- ::lib.schema/query
   join  :- ::lib.schema.join/join]
  (join-display-name query join))

(mu/defn ^:private ensure-all-joins-have-aliases :- [:and
                                                     [:sequential {:min 1} [:and
                                                                            ::lib.schema.join/join
                                                                            [:map
                                                                             [:alias ::lib.schema.common/non-blank-string]]]]]
  "Make sure all the joins in a query have an `:alias` if they don't already have one."
  [query :- ::lib.schema/query
   joins :- [:sequential {:min 1} ::lib.schema.join/join]]
  (let [unique-name-generator (mbql.u/unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (not (:alias join)) (assoc :alias (unique-name-generator (default-join-alias query join)))))
          joins)))

(mu/defn ^:private column-from-join-fields :- lib.metadata/ColumnMetadata
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  ;; TODO
  #_(add-add-joined-column-metadata query stage-number (:field_ref column-metadata))
  column-metadata)

(mu/defn ^:private default-columns-added-by-join :- [:sequential lib.metadata/ColumnMetadata]
  [query                                                                     :- ::lib.schema/query
   {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join} :- ::lib.schema.join/join]
  (condp = fields
    :none
    nil

    :all
    (mapv #(column-from-join-fields % join-alias)
          (stage-metadata (assoc query :stages stages)))

    :else
    (mapv #(column-from-join-fields % join-alias)
          fields)))

(mu/defn ^:private default-columns-added-by-joins :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [joins (not-empty (:joins (lib.util/query-stage query stage-number)))]
    (not-empty
     (into []
           (mapcat (partial default-columns-added-by-join query))
           (ensure-all-joins-have-aliases query joins)))))

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
