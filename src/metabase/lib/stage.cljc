(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
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
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(lib.hierarchy/derive :mbql.stage/mbql   ::stage)
(lib.hierarchy/derive :mbql.stage/native ::stage)

(defmethod lib.normalize/normalize :mbql.stage/mbql
  [stage]
  (lib.normalize/normalize-map
   stage
   keyword
   {:aggregation (partial mapv lib.normalize/normalize)
    :filters     (partial mapv lib.normalize/normalize)}))

(defmethod lib.metadata.calculation/metadata-method ::stage
  [_query _stage-number _stage]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a stage! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(mu/defn ensure-previous-stages-have-metadata :- ::lib.schema/query
  "Recursively calculate the metadata for the previous stages and add it to them, we'll need it for metadata
  calculations for [[lib.metadata.calculation/returned-columns]] and [[lib.metadata.calculation/visible-columns]], and
  we don't want to have to calculate it more than once..."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (reduce
   (fn [query stage-number]
     (lib.util/update-query-stage query
                                  stage-number
                                  assoc ::cached-metadata
                                  (lib.metadata.calculation/returned-columns query
                                                                             stage-number
                                                                             (lib.util/query-stage query stage-number))))
   query
   (range 0 (lib.util/canonical-stage-index query stage-number))))

(mu/defn ^:private existing-stage-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Return existing stage metadata attached to a stage if is already present: return it as-is, but only if this is a
  native stage or a source-Card stage. if it's any other sort of stage then ignore the metadata, it's probably wrong;
  we can recalculate the correct metadata anyway."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{stage-type :lib/type, :keys [source-card] :as stage} (lib.util/query-stage query stage-number)]
    (or (::cached-metadata stage)
        (when-let [metadata (:lib/stage-metadata stage)]
          (when (or (= stage-type :mbql.stage/native)
                    source-card)
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
            :lib/source-column-alias  ((some-fn :lib/source-column-alias :name) breakout)
            :lib/desired-column-alias (unique-name-fn (lib.field/desired-alias query breakout))))))

(mu/defn ^:private aggregations-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (not-empty
   (for [ag (lib.aggregation/aggregations-metadata query stage-number)]
     (assoc ag
            :lib/source               :source/aggregations
            :lib/source-column-alias  (:name ag)
            :lib/desired-column-alias (unique-name-fn (:name ag))))))

;;; TODO -- maybe the bulk of this logic should be moved into [[metabase.lib.field]], like we did for breakouts and
;;; aggregations above.
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
     (for [col  (lib.metadata.calculation/returned-columns query
                                                           previous-stage-number
                                                           (lib.util/query-stage query previous-stage-number))
           :let [source-alias (or ((some-fn :lib/desired-column-alias :lib/source-column-alias) col)
                                  (lib.metadata.calculation/column-name query stage-number col))]]
       (-> (merge
            col
            {:lib/source               :source/previous-stage
             :lib/source-column-alias  source-alias
             :lib/desired-column-alias (unique-name-fn source-alias)}
            (when (:metabase.lib.card/force-broken-id-refs col)
              (select-keys col [:metabase.lib.card/force-broken-id-refs])))
           ;; do not retain `:temporal-unit`; it's not like we're doing a extract(month from <x>) twice, in both
           ;; stages of a query. It's a little hacky that we're manipulating `::lib.field` keys directly here since
           ;; they're presumably supposed to be private-ish, but I don't have a more elegant way of solving this sort
           ;; of problem at this point in time.
           (dissoc ::lib.field/temporal-unit))))))

(mu/defn ^:private saved-question-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Metadata associated with a Saved Question, e.g. if we have a `:source-card`"
  [query          :- ::lib.schema/query
   stage-number   :- :int
   card-id        :- [:maybe ::lib.schema.id/card]
   unique-name-fn :- fn?]
  (when card-id
    (when-let [card (lib.metadata/card query card-id)]
      (->> (lib.metadata.calculation/visible-columns
            query stage-number card {:unique-name-fn               unique-name-fn
                                     :include-implicitly-joinable? false})
           ;; Questions should not have implicitly joinable columns (#30950).
           ;; :include-implicitly-joinable? false in the call above makes sure
           ;; no implicitly joinable columns show up in the list, but this is
           ;; not enough. If the returned columns contain :fk-target-field-id
           ;; fields, then [[metabase.lib.metadata.calculation/visible-columns-method]]
           ;; for :metabase.lib.stage/stage would add the implicitly joinable
           ;; columns. Dissocing these fields prevents that.
           (mapv #(dissoc % :fk-target-field-id))
           not-empty))))

(mu/defn ^:private expressions-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query           :- ::lib.schema/query
   stage-number    :- :int
   unique-name-fn  :- fn?]
  (not-empty
   (for [expression (lib.expression/expressions-metadata query stage-number)]
     (let [base-type (:base-type expression)]
       (-> (assoc expression
                  :lib/source               :source/expressions
                  :lib/source-column-alias  (:name expression)
                  :lib/desired-column-alias (unique-name-fn (:name expression)))
           (u/assoc-default :effective-type (or base-type :type/*)))))))

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
                          (let [table-metadata (lib.metadata/table query table-id)
                                options        {:unique-name-fn               unique-name-fn
                                                :include-implicitly-joinable? false}]
                            (for [field (lib.metadata.calculation/visible-columns-method query stage-number table-metadata options)
                                  :let  [field (assoc field
                                                      :fk-field-id              source-field-id
                                                      :lib/source               :source/implicitly-joinable
                                                      :lib/source-column-alias  (:name field))]]
                              (assoc field :lib/desired-column-alias (unique-name-fn
                                                                      (lib.field/desired-alias query field))))))))
          column-metadatas)))

;;; Calculate the columns to return if `:aggregations`/`:breakout`/`:fields` are unspecified.
;;;
;;; Formula for the so-called 'default' columns is
;;;
;;; 1a. Columns returned by the previous stage of the query (if there is one), OR
;;;
;;; 1b. Default 'visible' Fields for our `:source-table`, OR
;;;
;;; 1c. Metadata associated with a Saved Question, if we have `:source-card` (`:source-table` is a `card__<id>` string
;;;     in legacy MBQL), OR
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
(mu/defn ^:private previous-stage-or-source-visible-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Return columns from the previous query stage or source Table/Card."
  [query                                 :- ::lib.schema/query
   stage-number                          :- :int
   {:keys [unique-name-fn], :as options} :- lib.metadata.calculation/VisibleColumnsOptions]
  {:pre [(fn? unique-name-fn)]}
  (mapv
   #(dissoc % ::lib.join/join-alias ::lib.field/temporal-unit ::lib.field/binning :fk-field-id)
   (or
    ;; 1a. columns returned by previous stage
    (previous-stage-metadata query stage-number unique-name-fn)
    ;; 1b or 1c
    (let [{:keys [source-table source-card], :as this-stage} (lib.util/query-stage query stage-number)]
      (or
       ;; 1b: default visible Fields for the source Table
       (when source-table
         (assert (integer? source-table))
         (let [table-metadata (lib.metadata/table query source-table)]
           (lib.metadata.calculation/visible-columns query stage-number table-metadata options)))
       ;; 1c. Metadata associated with a saved Question
       (when source-card
         (saved-question-metadata query stage-number source-card unique-name-fn))
       ;; 1d: `:lib/stage-metadata` for the (presumably native) query
       (for [col (:columns (:lib/stage-metadata this-stage))]
         (assoc col
                :lib/source :source/native
                :lib/source-column-alias  (:name col)
                ;; these should already be unique, but run them thru `unique-name-fn` anyway to make sure anything
                ;; that gets added later gets deduplicated from these.
                :lib/desired-column-alias (unique-name-fn (:name col)))))))))

(mu/defn ^:private existing-visible-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  [query        :- ::lib.schema/query
   stage-number :- :int
   {:keys [unique-name-fn include-joined? include-expressions?], :as options} :- lib.metadata.calculation/VisibleColumnsOptions]
  (concat
   ;; 1: columns from the previous stage, source table or query
   (previous-stage-or-source-visible-columns query stage-number options)
   ;; 2: expressions (aka calculated columns) added in this stage
   (when include-expressions?
     (expressions-metadata query stage-number unique-name-fn))
   ;; 3: columns added by joins at this stage
   (when include-joined?
     (lib.join/all-joins-visible-columns query stage-number unique-name-fn))))

(defn- ref-to? [[tag _opts pointer :as clause] column]
  (case tag
    :field (if (or (number? pointer) (string? pointer))
             (= pointer (:id column))
             (throw (ex-info "unknown type of :field ref in lib.stage/ref-to?"
                             {:clause clause
                              :column column})))
    :expression (= pointer (:name column))
    (throw (ex-info "unknown clause in lib.stage/ref-to?"
                    {:clause clause
                     :column column}))))

(defn- mark-selected-breakouts [query stage-number columns]
  (if-let [breakouts (:breakout (lib.util/query-stage query stage-number))]
    (for [column columns]
      (if-let [match (m/find-first #(ref-to? % column) breakouts)]
        (let [binning        (lib.binning/binning match)
              {:keys [unit]} (lib.temporal-bucket/temporal-bucket match)]
          (cond-> column
            binning (lib.binning/with-binning binning)
            unit    (lib.temporal-bucket/with-temporal-bucket unit)))
        column))
    columns))

(defmethod lib.metadata.calculation/visible-columns-method ::stage
  [query stage-number _stage {:keys [unique-name-fn include-implicitly-joinable?], :as options}]
  (let [query            (ensure-previous-stages-have-metadata query stage-number)
        existing-columns (existing-visible-columns query stage-number options)]
    (->> (concat
           existing-columns
           ;; add implicitly joinable columns if desired
           (when include-implicitly-joinable?
             (implicitly-joinable-columns query stage-number existing-columns unique-name-fn)))
         (mark-selected-breakouts query stage-number))))

;;; Return results metadata about the expected columns in an MBQL query stage. If the query has
;;; aggregations/breakouts, then return those and the fields columns. Otherwise if there are fields columns return
;;; those and the joined columns. Otherwise return the defaults based on the source Table or previous stage + joins.
(defmethod lib.metadata.calculation/returned-columns-method ::stage
  [query stage-number _stage {:keys [unique-name-fn], :as options}]
  (or
   (existing-stage-metadata query stage-number)
   (let [query        (ensure-previous-stages-have-metadata query stage-number)
         summary-cols (summary-columns query stage-number unique-name-fn)
         field-cols   (fields-columns query stage-number unique-name-fn)]
     ;; ... then calculate metadata for this stage
     (cond
       summary-cols
       (into summary-cols field-cols)

       field-cols
       (do (doall field-cols)           ; force generation of unique names before join columns
           (into []
                 (m/distinct-by #(dissoc % :source-alias :lib/source :lib/source-uuid :lib/desired-column-alias))
                 (concat field-cols
                         (lib.join/all-joins-expected-columns query stage-number options))))

       :else
       ;; there is no `:fields` or summary columns (aggregtions or breakouts) which means we return all the visible
       ;; columns from the source or previous stage plus all the expressions. We return only the `:fields` from any
       ;; joins
       (concat
        ;; we don't want to include all visible joined columns, so calculate that separately
        (previous-stage-or-source-visible-columns query stage-number {:include-implicitly-joinable? false
                                                                      :unique-name-fn               unique-name-fn})
        (expressions-metadata query stage-number unique-name-fn)
        (lib.join/all-joins-expected-columns query stage-number options))))))

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/native
  [_query _stage-number _stage _style]
  (i18n/tru "Native query"))

(def ^:private display-name-source-parts
  [:source-table
   :source-card
   :joins])

(def ^:private display-name-other-parts
  [:aggregation
   :breakout
   :filters
   :order-by
   :limit])

(defmethod lib.metadata.calculation/display-name-method :mbql.stage/mbql
  [query stage-number _stage style]
  (let [query (ensure-previous-stages-have-metadata query stage-number)]
    (or
     (not-empty
      (let [part->description  (into {}
                                     (comp cat
                                           (map (fn [k]
                                                  [k (lib.metadata.calculation/describe-top-level-key query stage-number k)])))
                                     [display-name-source-parts display-name-other-parts])
            source-description (str/join " + " (remove str/blank? (map part->description display-name-source-parts)))
            other-descriptions (map part->description display-name-other-parts)]
        (str/join ", " (remove str/blank? (cons source-description other-descriptions)))))
     (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
       (lib.metadata.calculation/display-name query
                                              previous-stage-number
                                              (lib.util/query-stage query previous-stage-number)
                                              style)))))

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
