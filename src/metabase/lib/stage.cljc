(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(declare stage-metadata)

(mu/defn ^:private breakout-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{breakouts :breakout} (lib.util/query-stage query stage-number)]
    (mapv (fn [field-ref]
            (assoc (lib.metadata.calculation/metadata query stage-number field-ref) :source :breakout))
          breakouts)))

(mu/defn ^:private aggregation-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{aggregations :aggregation} (lib.util/query-stage query stage-number)]
    (map-indexed (fn [i aggregation]
                   (let [metadata (lib.metadata.calculation/metadata query stage-number aggregation)
                         ag-ref   [:aggregation {:lib/uuid (str (random-uuid))} i]]
                     (assoc metadata :field_ref ag-ref)))
                 aggregations)))

(mu/defn ^:private fields-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{fields :fields} (lib.util/query-stage query stage-number)]
    (mapv (fn [ref-clause]
            (assoc (lib.metadata.calculation/metadata query stage-number ref-clause) :source :fields))
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
  (lib.metadata.calculation/display-name query stage-number join))

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

(mu/defn ^:private default-columns-added-by-join :- [:sequential lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  (lib.metadata.calculation/metadata query stage-number join))

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

(mu/defn ^:private stage-metadata :- [:and
                                      [:sequential {:min 1} lib.metadata/ColumnMetadata]
                                      [:fn
                                       ;; should be dev-facing only, so don't need to i18n
                                       {:error/message "Column :names must be distinct!"}
                                       (fn [columns]
                                         (apply distinct? (map :name columns)))]]
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts/fields, then return THOSE. Otherwise return the defaults based on the source Table or
  previous stage + joins."
  [query        :- ::lib.schema/query
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
                   (lib.util/update-query-stage previous-stage-number
                                                assoc
                                                :lib/stage-metadata
                                                {:lib/type :metadata/results
                                                 :columns  (stage-metadata query previous-stage-number)})))]
     ;; ... then calculate metadata for this stage
     (or
      (not-empty (into []
                       cat
                       [(breakout-columns query stage-number)
                        (aggregation-columns query stage-number)
                        (fields-columns query stage-number)]))
      (default-columns query stage-number)))))

(doseq [stage-type [:mbql.stage/mbql
                    :mbql.stage/native]]
  (defmethod lib.metadata.calculation/metadata stage-type
    [query stage-number _stage]
    (stage-metadata query stage-number)))

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/native
  [_query _stage-number _stage]
  (i18n/tru "Native query"))

(def ^:private display-name-parts
  [:source-table
   :aggregation
   :breakout
   :filter
   :order-by
   :limit])

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/mbql
  [query stage-number _stage]
  (let [parts        display-name-parts
        descriptions (for [k parts]
                       (lib.metadata.calculation/describe-top-level-key query stage-number k))]
    (str/join ", " (remove str/blank? descriptions))))
