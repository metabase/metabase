(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.card :as lib.card]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.join :as lib.join]
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

(defn- unique-name-generator []
  (comp (mbql.u/unique-name-generator
         ;; unique by lower-case name, e.g. `NAME` and `name` => `NAME` and `name_2`
         :name-key-fn     u/lower-case-en
         ;; truncate alias to 60 characters (actually 51 characters plus a hash).
         :unique-alias-fn (fn [original suffix]
                            (lib.util/truncate-alias (str original \_ suffix))))))

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
                                   (stage-metadata query previous-stage-number)))))

(def ^:private StageMetadataColumns
  [:and
   [:sequential {:min 1}
    [:merge
     lib.metadata.calculation/ColumnMetadataWithSource
     [:map
      [:lib/source-column-alias  ::lib.schema.common/non-blank-string]
      [:lib/desired-column-alias [:string {:min 1, :max 60}]]]]]
   [:fn
    ;; should be dev-facing only, so don't need to i18n
    {:error/message "Column :lib/desired-column-alias values must be distinct, regardless of case, for each stage!"
     :error/fn      (fn [{:keys [value]} _]
                      (str "Column :lib/desired-column-alias values must be distinct, got: "
                           (pr-str (mapv :lib/desired-column-alias value))))}
    (fn [columns]
      (apply distinct? (map (comp u/lower-case-en :lib/desired-column-alias) columns)))]])

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
                    (lib.util/string-table-id->card-id source-table))
            (let [source-type (case stage-type
                                :mbql.stage/native :source/native
                                :mbql.stage/mbql   :source/card)]
              (for [col (:columns metadata)]
                (assoc col :lib/source source-type))))))))

(mu/defn ^:private breakouts-columns :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (for [breakout (lib.breakout/breakouts query stage-number)]
     (assoc breakout
            :lib/source               :source/breakouts
            :lib/source-column-alias  (:name breakout)
            :lib/desired-column-alias (unique-name-fn (:name breakout))))))

(mu/defn ^:private aggregations-columns :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (for [ag (lib.aggregation/aggregations query stage-number)]
     (assoc ag
            :lib/source               :source/aggregations
            :lib/source-column-alias  (:name ag)
            :lib/desired-column-alias (unique-name-fn (:name ag))))))

(mu/defn ^:private fields-columns :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (when-let [{fields :fields} (lib.util/query-stage query stage-number)]
    (not-empty
     (for [[tag :as ref-clause] fields
           :let                 [source (case tag
                                          ;; you can't have an `:aggregation` reference in `:fields`; anything in
                                          ;; `:aggregations` is returned automatically anyway
                                          ;; by [[aggregations-columns]] above.
                                          :field      :source/fields
                                          :expression :source/expressions)
                                 metadata (lib.metadata.calculation/metadata query stage-number ref-clause)]]
       (assoc metadata
              :lib/source               source
              :lib/source-column-alias  (lib.metadata.calculation/column-name query stage-number metadata)
              :lib/desired-column-alias (unique-name-fn (lib.field/desired-alias metadata)))))))

(mu/defn ^:private breakout-ags-fields-columns :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (into []
         (mapcat (fn [f]
                   (f query stage-number unique-name-fn)))
         [breakouts-columns
          aggregations-columns
          fields-columns])))

(mu/defn ^:private previous-stage-metadata :- [:maybe StageMetadataColumns]
  "Metadata for the previous stage, if there is one."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    (for [col  (stage-metadata query previous-stage-number)
          :let [source-alias (or ((some-fn :lib/desired-column-alias :lib/source-column-alias) col)
                                 (lib.metadata.calculation/column-name query stage-number col))]]
      (assoc col
             :lib/source               :source/previous-stage
             :lib/source-column-alias  source-alias
             :lib/desired-column-alias (unique-name-fn source-alias)))))

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
  [query          :- ::lib.schema/query
   table-id       :- ::lib.schema.id/table
   unique-name-fn :- fn?]
  (when-let [field-metadatas (lib.metadata/fields query table-id)]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields
         (map (fn [col]
                (assoc col
                       :lib/source               :source/table-defaults
                       :lib/source-column-alias  (:name col)
                       :lib/desired-column-alias (unique-name-fn (:name col))))))))

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
  (let [unique-name-fn (unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (not (:alias join)) (assoc :alias (unique-name-fn (default-join-alias query stage-number join)))))
          joins)))

(mu/defn ^:private default-columns-added-by-join :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?
   join           :- ::lib.schema.join/join]
  (assert (:alias join) "Join must have :alias")
  (not-empty
   (for [col (lib.metadata.calculation/metadata query stage-number join)]
     (assoc col
            :lib/source-column-alias  (lib.metadata.calculation/column-name query stage-number col)
            :lib/desired-column-alias (unique-name-fn (lib.field/desired-alias col))))))

(mu/defn ^:private default-columns-added-by-joins :- [:maybe StageMetadataColumns]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (when-let [joins (not-empty (:joins (lib.util/query-stage query stage-number)))]
    (not-empty
     (into []
           (mapcat (partial default-columns-added-by-join query stage-number unique-name-fn))
           (ensure-all-joins-have-aliases query stage-number joins)))))

(mu/defn ^:private saved-question-metadata :- [:maybe StageMetadataColumns]
  "Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string."
  [query           :- ::lib.schema/query
   source-table-id :- [:or ::lib.schema.id/table ::lib.schema.id/table-card-id-string]
   unique-name-fn  :- fn?]
  (when-let [card-id (lib.util/string-table-id->card-id source-table-id)]
    (when-let [cols (not-empty (lib.card/saved-question-metadata query card-id))]
      (mapv (fn [col]
              (assoc col :lib/desired-column-alias (unique-name-fn (:name col))))
            cols))))

(mu/defn ^:private expressions-metadata :- [:maybe StageMetadataColumns]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   unique-name-fn  :- fn?]
  (not-empty
   (for [expression (lib.expression/expressions query stage-number)]
     (assoc expression
            :lib/source               :source/expressions
            :lib/source-column-alias  (:name expression)
            :lib/desired-column-alias (unique-name-fn (:name expression))))))

(mu/defn ^:private default-columns :- StageMetadataColumns
  "Calculate the columns to return if `:aggregations`/`:breakout`/`:fields` are unspecified.

  Formula for the so-called 'default' columns is

  1a. Columns returned by the previous stage of the query (if there is one), OR

  1b. Default 'visible' Fields for our `:source-table`, OR

  1c. Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string, OR

  1d. `:lib/stage-metadata` if this is a `:mbql.stage/native` stage

  PLUS

  2. Expressions (aka calculated columns) added in this stage

  PLUS

  3. Columns added by joins at this stage"
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (concat
   ;; 1: columns from the previous stage, source table or query
   (or
     ;; 1a. columns returned by previous stage
    (previous-stage-metadata query stage-number unique-name-fn)
     ;; 1b or 1c
     (let [{:keys [source-table], :as this-stage} (lib.util/query-stage query stage-number)]
       (or
        ;; 1b: default visible Fields for the source Table
        (when (integer? source-table)
          (source-table-default-fields query source-table unique-name-fn))
        ;; 1c. Metadata associated with a saved Question
        (saved-question-metadata query source-table unique-name-fn)
        ;; 1d: `:lib/stage-metadata` for the (presumably native) query
        (for [col (:columns (:lib/stage-metadata this-stage))]
          (assoc col :lib/source :source/native)))))
   ;; 2: expressions (aka calculated columns) added in this stage
   (expressions-metadata query stage-number unique-name-fn)
   ;; 3: columns added by joins at this stage
   (default-columns-added-by-joins query stage-number unique-name-fn)))

(mu/defn ^:private stage-metadata :- StageMetadataColumns
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts/fields, then return THOSE. Otherwise return the defaults based on the source Table or
  previous stage + joins."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (or
   (existing-stage-metadata query stage-number)
   (let [query (ensure-previous-stages-have-metadata query stage-number)]
     ;; ... then calculate metadata for this stage
     (or
      (breakout-ags-fields-columns query stage-number (unique-name-generator))
      (default-columns query stage-number (unique-name-generator))))))

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
  [query column-metadatas unique-name-fn]
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
                          (let [table-name           (:name (lib.metadata/table query table-id))
                                source-field-id-name (:name (lib.metadata/field query source-field-id))
                                ;; make sure the implicit join name is unique.
                                source-alias         (unique-name-fn
                                                      (lib.join/implicit-join-name table-name source-field-id-name))]
                            (for [field (source-table-default-fields query table-id unique-name-fn)
                                  :let  [field (assoc field
                                                      :fk_field_id              source-field-id
                                                      :lib/source               :source/implicitly-joinable
                                                      :lib/source-column-alias  (:name field))
                                         field (lib.join/with-join-alias field source-alias)]]
                              (assoc field :lib/desired-column-alias (unique-name-fn
                                                                      (lib.field/desired-alias field))))))))
          column-metadatas)))

(mu/defn visible-columns :- StageMetadataColumns
  "Columns that are visible inside a given stage of a query. Ignores `:fields`, `:breakout`, and `:aggregation`.
  Includes columns that are implicitly joinable from other Tables."
  [query stage-number]
  (let [query          (lib.util/update-query-stage query stage-number dissoc :fields :breakout :aggregation)
        unique-name-fn (unique-name-generator)
        columns        (default-columns query stage-number unique-name-fn)]
    (concat
     columns
     (implicitly-joinable-columns query columns unique-name-fn))))

(mu/defn append-stage :- ::lib.schema/query
  "Adds a new blank stage to the end of the pipeline"
  [query]
  (update query :stages conj {:lib/type :mbql.stage/mbql}))

(mu/defn drop-stage :- ::lib.schema/query
  "Drops the final stage in the pipeline"
  [query]
  (when (= 1 (count (:stages query)))
    (throw (ex-info (i18n/tru "Cannot drop the only stage") {:stages (:stages query)})))
  (update query :stages (comp vec butlast)))
