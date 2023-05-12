(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(declare stage-metadata)

(lib.hierarchy/derive :mbql.stage/mbql   ::stage)
(lib.hierarchy/derive :mbql.stage/native ::stage)

(defmethod lib.normalize/normalize :mbql.stage/mbql
  [stage]
  (lib.normalize/normalize-map
   stage
   keyword
   {:aggregation (partial mapv lib.normalize/normalize)
    :filters     (partial mapv lib.normalize/normalize)}))

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

(mu/defn ^:private existing-stage-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
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
              (not-empty
               (for [col (:columns metadata)]
                 (merge
                  {:lib/source-column-alias  (:name col)
                   :lib/desired-column-alias (:name col)}
                  col
                  {:lib/source source-type})))))))))

(mu/defn ^:private breakouts-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (for [breakout (lib.breakout/breakouts-metadata query stage-number)]
     (assoc breakout
            :lib/source               :source/breakouts
            :lib/source-column-alias  (:name breakout)
            :lib/desired-column-alias (unique-name-fn (:name breakout))))))

(mu/defn ^:private aggregations-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (for [ag (lib.aggregation/aggregations-meta query stage-number)]
     (assoc ag
            :lib/source               :source/aggregations
            :lib/source-column-alias  (:name ag)
            :lib/desired-column-alias (unique-name-fn (:name ag))))))

(mu/defn ^:private fields-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
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
              :lib/desired-column-alias (unique-name-fn (lib.field/desired-alias query metadata)))))))

(mu/defn ^:private summary-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (into []
         (mapcat (fn [f]
                   (f query stage-number unique-name-fn)))
         [breakouts-columns
          aggregations-columns])))

(mu/defn ^:private previous-stage-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Metadata for the previous stage, if there is one."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    (not-empty
     (for [col  (stage-metadata query previous-stage-number)
           :let [source-alias (or ((some-fn :lib/desired-column-alias :lib/source-column-alias) col)
                                  (lib.metadata.calculation/column-name query stage-number col))]]
       (-> col
           (assoc :lib/source               :source/previous-stage
                  :lib/source-column-alias  source-alias
                  :lib/desired-column-alias (unique-name-fn source-alias))
           ;; do not retain `:temporal-unit`; it's not like we're doing a extract(month from <x>) twice, in both
           ;; stages of a query. It's a little hacky that we're manipulating `::lib.field` keys directly here since
           ;; they're presumably supposed to be private-ish, but I don't have a more elegant way of solving this sort
           ;; of problem at this point in time.
           (dissoc ::lib.field/temporal-unit))))))

(mu/defn ^:private saved-question-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   source-table-id :- [:or ::lib.schema.id/table ::lib.schema.id/table-card-id-string]
   unique-name-fn  :- fn?]
  (when-let [card-id (lib.util/string-table-id->card-id source-table-id)]
    (when-let [card (lib.metadata/card query card-id)]
      (lib.metadata.calculation/default-columns query stage-number card unique-name-fn))))

(mu/defn ^:private expressions-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   unique-name-fn  :- fn?]
  (not-empty
   (for [expression (lib.expression/expressions-meta query stage-number)]
     (assoc expression
            :lib/source               :source/expressions
            :lib/source-column-alias  (:name expression)
            :lib/desired-column-alias (unique-name-fn (:name expression))))))

;;; Calculate the columns to return if `:aggregations`/`:breakout`/`:fields` are unspecified.
;;;
;;; Formula for the so-called 'default' columns is
;;;
;;; 1a. Columns returned by the previous stage of the query (if there is one), OR
;;;
;;; 1b. Default 'visible' Fields for our `:source-table`, OR
;;;
;;; 1c. Metadata associated with a Saved Question, if `:source-table` is a `card__<id>` string, OR
;;;
;;; 1d. `:lib/stage-metadata` if this is a `:mbql.stage/native` stage
;;;
;;; PLUS
;;;
;;; 2. Expressions (aka calculated columns) added in this stage
;;;
;;; PLUS
;;;
;;; 3. Columns added by joins at this stage
(defmethod lib.metadata.calculation/default-columns-method ::stage
  [query stage-number _stage unique-name-fn]
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
         (let [table-metadata (lib.metadata/table query source-table)]
           (lib.metadata.calculation/default-columns query stage-number table-metadata unique-name-fn)))
       ;; 1c. Metadata associated with a saved Question
       (when (string? source-table)
         (saved-question-metadata query stage-number source-table unique-name-fn))
       ;; 1d: `:lib/stage-metadata` for the (presumably native) query
       (for [col (:columns (:lib/stage-metadata this-stage))]
         (assoc col
                :lib/source :source/native
                :lib/source-column-alias  (:name col)
                ;; these should already be unique, but run them thru `unique-name-fn` anyway to make sure anything
                ;; that gets added later gets deduplicated from these.
                :lib/desired-column-alias (unique-name-fn (:name col)))))))
   ;; 2: expressions (aka calculated columns) added in this stage
   (expressions-metadata query stage-number unique-name-fn)
   ;; 3: columns added by joins at this stage
   (lib.join/all-joins-default-columns query stage-number unique-name-fn)))

(mu/defn ^:private stage-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts, then return those and the fields columns.
  Otherwise if there are fields columns return those and the joined columns.
  Otherwise return the defaults based on the source Table or previous stage + joins."
  ([query stage-number]
   (stage-metadata query stage-number (lib.util/unique-name-generator)))

  ([query          :- ::lib.schema/query
    stage-number   :- :int
    unique-name-fn :- fn?]
   (or
    (existing-stage-metadata query stage-number)
    (let [query (ensure-previous-stages-have-metadata query stage-number)
          summary-cols (summary-columns query stage-number unique-name-fn)
          field-cols (fields-columns query stage-number unique-name-fn)]
      ;; ... then calculate metadata for this stage
      (cond
        summary-cols
        (into summary-cols field-cols)

        field-cols
        (do (doall field-cols)          ; force generation of unique names before join columns
            (into []
                  (m/distinct-by #(dissoc % :source_alias :lib/source :lib/desired-column-alias))
                  (concat field-cols
                          (lib.join/all-joins-default-columns query stage-number unique-name-fn))))

        :else
        (lib.metadata.calculation/default-columns query stage-number (lib.util/query-stage query stage-number) unique-name-fn))))))

(defmethod lib.metadata.calculation/metadata-method ::stage
  [query stage-number _stage]
  (stage-metadata query stage-number))

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/native
  [_query _stage-number _stage _style]
  (i18n/tru "Native query"))

(def ^:private display-name-parts
  [:source-table
   :aggregation
   :breakout
   :filters
   :order-by
   :limit])

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/mbql
  [query stage-number _stage style]
  (or
   (not-empty
    (let [descriptions (for [k display-name-parts]
                         (lib.metadata.calculation/describe-top-level-key query stage-number k))]
      (str/join ", " (remove str/blank? descriptions))))
   (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
     (lib.metadata.calculation/display-name query
                                            previous-stage-number
                                            (lib.util/query-stage query previous-stage-number)
                                            style))))

(defn- implicitly-joinable-columns
  "Columns that are implicitly joinable from some other columns in `column-metadatas`. To be joinable, the column has to
  have appropriate FK metadata, i.e. have an `:fk-target-field-id` pointing to another Field. (I think we only include
  this information for Databases that support FKs and joins, so I don't think we need to do an additional DB feature
  check here.)

  This does not include columns from any Tables that are already explicitly joined, and does not include multiple
  versions of a column when there are multiple pathways to it (i.e. if there is more than one FK to a Table). This
  behavior matches how things currently work in MLv1, at least for order by; we can adjust as needed in the future if
  it turns out we do need that stuff.

  Does not include columns that would be implicitly joinable via multiple hops."
  [query stage-number column-metadatas unique-name-fn]
  (let [existing-table-ids (into #{} (map :table-id) column-metadatas)]
    (into []
          (comp (filter :fk-target-field-id)
                (m/distinct-by :fk-target-field-id)
                (map (fn [{source-field-id :id, :keys [fk-target-field-id]}]
                       (-> (lib.metadata/field query fk-target-field-id)
                           (assoc ::source-field-id source-field-id))))
                (remove #(contains? existing-table-ids (:table-id %)))
                (m/distinct-by :table-id)
                (mapcat (fn [{:keys [table-id], ::keys [source-field-id]}]
                          (let [table-metadata (lib.metadata/table query table-id)]
                            (for [field (lib.metadata.calculation/default-columns query stage-number table-metadata unique-name-fn)
                                  :let  [field (assoc field
                                                      :fk-field-id              source-field-id
                                                      :lib/source               :source/implicitly-joinable
                                                      :lib/source-column-alias  (:name field))]]
                              (assoc field :lib/desired-column-alias (unique-name-fn
                                                                      (lib.field/desired-alias query field))))))))
          column-metadatas)))

(defmethod lib.metadata.calculation/visible-columns-method ::stage
  [query stage-number stage unique-name-fn]
  (let [query   (lib.util/update-query-stage query stage-number dissoc :fields :breakout :aggregation)
        columns (lib.metadata.calculation/default-columns query stage-number stage unique-name-fn)]
    (concat
     columns
     (implicitly-joinable-columns query stage-number columns unique-name-fn))))

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
