(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
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

(defmethod lib.normalize/normalize :mbql.stage/mbql
  [stage]
  (lib.normalize/normalize-map
   stage
   keyword
   {:aggregation (partial mapv lib.normalize/normalize)
    :filter      lib.normalize/normalize}))

(mu/defn ^:private ensure-previous-stages-have-metadata :- ::lib.schema/query
  "Recursively calculate the metadata for the previous stages and add it to them, we'll need it for metadata
  calculations for `stage-number` and we don't want to have to calculate it more than once..."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    (cond-> query
      previous-stage-number
      (lib.util/update-query-stage previous-stage-number
                                   assoc
                                   ::cached-metadata
                                   {:lib/type :metadata/results
                                    :columns  (stage-metadata query previous-stage-number)}))))

(def ^:private StageMetadataColumns
  [:sequential {:min 1} lib.metadata.calculation/ColumnMetadataWithSource])

(def ^:private DistinctStageMetadataColumns
  [:and
   StageMetadataColumns
   [:fn
    ;; should be dev-facing only, so don't need to i18n
    {:error/message "Column :names must be distinct!"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Column :names must be distinct, got: " (pr-str (mapv :name value))))}
    (fn [columns]
      (apply distinct? (map :name columns)))]])

(mu/defn ^:private existing-stage-metadata :- [:maybe StageMetadataColumns]
  "Return existing stage metadata attached to a stage if is already present: return it as-is, but only if this is a
  native stage or a source-Card stage. if it's any other sort of stage then ignore the metadata, it's probably wrong;
  we can recalculate the correct metadata anyway."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{stage-type :lib/type, :keys [source-table] :as stage} (lib.util/query-stage query stage-number)]
    (or (::cached-metadata stage)
        (when-let [metadata (:lib/stage-metadata stage)]
          (when (or (= stage-type :mbql.stage/native)
                    (and (string? source-table)
                         (str/starts-with? source-table "card__")))
            (let [source-type (case stage-type
                                :mbql.stage/native :source/native
                                :mbql.stage/mbql   :source/card)]
              (for [col (:columns metadata)]
                (assoc col :lib/source source-type))))))))

(mu/defn ^:private breakouts-columns :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (not-empty
   (for [breakout (lib.breakout/breakouts query stage-number)]
     (assoc breakout :lib/source :source/breakouts))))

(mu/defn ^:private aggregations-columns :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (not-empty
   (for [ag (lib.aggregation/aggregations query stage-number)]
     (assoc ag :lib/source :source/aggregations))))

(mu/defn ^:private fields-columns :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [{fields :fields} (lib.util/query-stage query stage-number)]
    (not-empty
     (for [field-ref fields]
       (assoc (lib.metadata.calculation/metadata query stage-number field-ref) :lib/source :source/fields)))))

(mu/defn ^:private breakout-ags-fields-columns :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (not-empty
   (into []
         cat
         [(breakouts-columns query stage-number)
          (aggregations-columns query stage-number)
          (fields-columns query stage-number)])))

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

(mu/defn ^:private source-table-default-fields :- [:maybe StageMetadataColumns]
  "Determine the Fields we'd normally return for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/add-implicit-fields]]."
  [query    :- ::lib.schema/query
   table-id :- ::lib.schema.id/table]
  (when-let [field-metadatas (lib.metadata/fields query table-id)]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields
         (map (fn [col]
                (assoc col :lib/source :source/table-defaults))))))

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

(mu/defn ^:private default-columns-added-by-join :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  (for [col (lib.metadata.calculation/metadata query stage-number join)]
    (assoc col :lib/source :source/joins)))

(mu/defn ^:private default-columns-added-by-joins :- [:maybe StageMetadataColumns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (when-let [joins (not-empty (:joins (lib.util/query-stage query stage-number)))]
    (not-empty
     (into []
           (mapcat (partial default-columns-added-by-join query stage-number))
           (ensure-all-joins-have-aliases query stage-number joins)))))

(mu/defn ^:private saved-question-metadata :- [:maybe StageMetadataColumns]
  "Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string."
  [query :- ::lib.schema/query
   source-table-id]
  (when (string? source-table-id)
    (when-let [[_match card-id-str] (re-find #"^card__(\d+)$" source-table-id)]
      (when-let [card-id (parse-long card-id-str)]
        (when-let [result-metadata (:result_metadata (lib.metadata/card query card-id))]
          (when-let [cols (not-empty (:columns result-metadata))]
            (for [col cols]
              (assoc col :lib/source :source/card))))))))

(mu/defn ^:private default-columns :- StageMetadataColumns
  "Calculate the columns to return if `:aggregations`/`:breakout`/`:fields` are unspecified.

  Formula for the so-called 'default' columns is

  1a. Columns returned by the previous stage of the query (if there is one), OR

  1b. Default 'visible' Fields for our `:source-table`, OR

  1c. Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string, OR

  1d. `:lib/stage-metadata` if this is a `:mbql.stage/native` stage

  PLUS

  2. Columns added by joins at this stage"
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (concat
   ;; 1: columns from the previous stage, source table or query
   (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
     ;; 1a. columns returned by previous stage
     (for [col (stage-metadata query previous-stage-number)]
       (assoc col :lib/source :source/previous-stage))
     ;; 1b or 1c
     (let [{:keys [source-table], :as this-stage} (lib.util/query-stage query stage-number)]
       (or
        ;; 1b: default visible Fields for the source Table
        (when (integer? source-table)
          (source-table-default-fields query source-table))
        ;; 1c. Metadata associated with a saved Question
        (saved-question-metadata query source-table)
        ;; 1d: `:lib/stage-metadata` for the (presumably native) query
        (for [col (:columns (:lib/stage-metadata this-stage))]
          (assoc col :lib/source :source/native)))))
   ;; 2: columns added by joins at this stage
   (default-columns-added-by-joins query stage-number)))

(defn- ensure-distinct-names [metadatas]
  (when (seq metadatas)
    (let [f (mbql.u/unique-name-generator)]
      (for [metadata metadatas]
        (update metadata :name f)))))

(mu/defn ^:private stage-metadata :- DistinctStageMetadataColumns
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts/fields, then return THOSE. Otherwise return the defaults based on the source Table or
  previous stage + joins."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (ensure-distinct-names
   (or
    (existing-stage-metadata query stage-number)
    (let [query (ensure-previous-stages-have-metadata query stage-number)]
      ;; ... then calculate metadata for this stage
      (or
       (breakout-ags-fields-columns query stage-number)
       (default-columns query stage-number))))))

(doseq [stage-type [:mbql.stage/mbql
                    :mbql.stage/native]]
  (defmethod lib.metadata.calculation/metadata-method stage-type
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
  (let [descriptions (for [k display-name-parts]
                       (lib.metadata.calculation/describe-top-level-key query stage-number k))]
    (str/join ", " (remove str/blank? descriptions))))

(defn- implicitly-joinable-columns
  "Columns that are implicitly joinable from some other columns in `column-metadatas`. To be joinable, the column has to
  have appropriate FK metadata, i.e. have an `:fk_target_field_id` pointing to another Field. (I think we only include
  this information for Databases that support FKs and joins, so I don't think we need to do an additional DB feature
  check here.)

  This does not include columns from any Tables that are already explicitly joined, and does not include multiple
  versions of a column when there are multiple pathways to it (i.e. if there is more than one FK to a Table). This
  behavior matches how things currently work in MLv1, at least for order by; we can adjust as needed in the future if
  it turns out we do need that stuff.

  Does not include columns that would be implicitly joinable via multiple hops."
  [query column-metadatas]
  (let [existing-table-ids (into #{} (map :table_id) column-metadatas)]
    (into []
          (comp (filter :fk_target_field_id)
                (m/distinct-by :fk_target_field_id)
                (map (fn [{source-field-id :id, target-field-id :fk_target_field_id}]
                       (-> (lib.metadata/field query target-field-id)
                           (assoc ::source-field-id source-field-id))))
                (remove #(contains? existing-table-ids (:table_id %)))
                (m/distinct-by :table_id)
                (mapcat (fn [{table-id :table_id, ::keys [source-field-id]}]
                          (for [field (source-table-default-fields query table-id)]
                            (assoc field :fk_field_id source-field-id)))))
          column-metadatas)))

(mu/defn visible-columns :- StageMetadataColumns
  "Columns that are visible inside a given stage of a query. Ignores `:fields`, `:breakout`, and `:aggregation`.
  Includes columns that are implicitly joinable from other Tables."
  [query stage-number]
  (let [query   (lib.util/update-query-stage query stage-number dissoc :fields :breakout :aggregation)
        columns (default-columns query stage-number)]
    (concat
     (lib.expression/expressions query stage-number)
     columns
     (implicitly-joinable-columns query columns))))

(mu/defn append-stage :- ::lib.schema/query
  "Adds a new blank stage to the end of the pipeline"
  [query]
  (update query :stages conj (lib.options/ensure-uuid {:lib/type :mbql.stage/mbql})))

(mu/defn drop-stage :- ::lib.schema/query
  "Drops the final stage in the pipeline"
  [query]
  (when (= 1 (count (:stages query)))
    (throw (ex-info (i18n/tru "Cannot drop the only stage") {:stages (:stages query)})))
  (update query :stages (comp vec butlast)))
