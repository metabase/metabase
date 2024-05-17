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
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(lib.hierarchy/derive :mbql.stage/mbql   ::stage)
(lib.hierarchy/derive :mbql.stage/native ::stage)

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
   unique-name-fn :- ::lib.metadata.calculation/unique-name-fn]
  (not-empty
   (for [breakout (lib.breakout/breakouts-metadata query stage-number)]
     (assoc breakout
            :lib/source               :source/breakouts
            :lib/source-column-alias  ((some-fn :lib/source-column-alias :name) breakout)
            :lib/desired-column-alias (unique-name-fn (lib.join.util/desired-alias query breakout))))))

(mu/defn ^:private aggregations-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- ::lib.metadata.calculation/unique-name-fn]
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
   unique-name-fn :- ::lib.metadata.calculation/unique-name-fn]
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
              :lib/desired-column-alias (unique-name-fn (lib.join.util/desired-alias query metadata)))))))

(mu/defn ^:private summary-columns :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- ::lib.metadata.calculation/unique-name-fn]
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
   unique-name-fn :- ::lib.metadata.calculation/unique-name-fn]
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
           ;;
           ;; also don't retain `:lib/expression-name`, the fact that this column came from an expression in the
           ;; previous stage should be totally irrelevant and we don't want it confusing our code that decides whether
           ;; to generate `:expression` or `:field` refs.
           (dissoc ::lib.field/temporal-unit :lib/expression-name))))))

(mu/defn ^:private saved-question-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  "Metadata associated with a Saved Question, e.g. if we have a `:source-card`"
  [query          :- ::lib.schema/query
   stage-number   :- :int
   card-id        :- [:maybe ::lib.schema.id/card]
   options        :- lib.metadata.calculation/VisibleColumnsOptions]
  (when card-id
    (when-let [card (lib.metadata/card query card-id)]
      (not-empty (lib.metadata.calculation/visible-columns query stage-number card options)))))

(mu/defn ^:private expressions-metadata :- [:maybe lib.metadata.calculation/ColumnsWithUniqueAliases]
  [query                         :- ::lib.schema/query
   stage-number                  :- :int
   unique-name-fn                :- ::lib.metadata.calculation/unique-name-fn
   {:keys [include-late-exprs?]} :- [:map [:include-late-exprs? {:optional true} :boolean]]]
  (not-empty
    (for [[clause metadata] (map vector
                                 (:expressions (lib.util/query-stage query stage-number))
                                 (lib.expression/expressions-metadata query stage-number))
          ;; Only include "late" expressions when required.
          ;; "Late" expressions those like :offset which can't be used within the same query stage, like aggregations.
          :when (or include-late-exprs?
                    (not (lib.util.match/match-one clause :offset)))]
     (let [base-type (:base-type metadata)]
       (-> (assoc metadata
                  :lib/source               :source/expressions
                  :lib/source-column-alias  (:name metadata)
                  :lib/desired-column-alias (unique-name-fn (:name metadata)))
           (u/assoc-default :effective-type (or base-type :type/*)))))))

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
         (saved-question-metadata query stage-number source-card (assoc options :include-implicitly-joinable? false)))
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
     (expressions-metadata query stage-number unique-name-fn {}))
   ;; 3: columns added by joins at this stage
   (when include-joined?
     (lib.join/all-joins-visible-columns query stage-number unique-name-fn))))

(defmethod lib.metadata.calculation/visible-columns-method ::stage
  [query stage-number _stage {:keys [unique-name-fn include-implicitly-joinable?], :as options}]
  (let [query            (ensure-previous-stages-have-metadata query stage-number)
        existing-columns (existing-visible-columns query stage-number options)]
    (->> (concat
           existing-columns
           ;; add implicitly joinable columns if desired
           (when include-implicitly-joinable?
             (lib.metadata.calculation/implicitly-joinable-columns query stage-number existing-columns unique-name-fn)))
         vec)))

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
        (expressions-metadata query stage-number unique-name-fn {:include-late-exprs? true})
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

(mu/defn has-clauses? :- :boolean
  "Does given query stage have any clauses?"
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (boolean (seq (dissoc (lib.util/query-stage query stage-number) :lib/type :source-table :source-card))))

(mu/defn append-stage :- ::lib.schema/query
  "Adds a new blank stage to the end of the pipeline."
  [query]
  (update query :stages conj {:lib/type :mbql.stage/mbql}))

(mu/defn drop-stage :- ::lib.schema/query
  "Drops the final stage in the pipeline, will no-op if it is the only stage"
  [query]
  (if (= 1 (count (:stages query)))
    query
    (update query :stages pop)))

(mu/defn drop-empty-stages :- ::lib.schema/query
  "Drops all empty stages in the pipeline."
  [query :- ::lib.schema/query]
  (update query :stages (fn [stages]
                          (into []
                                (keep-indexed (fn [stage-number stage]
                                                (when (or (zero? stage-number)
                                                          (has-clauses? query stage-number))
                                                  stage)))
                                stages))))

(mu/defn ensure-extra-stage :- [:tuple ::lib.schema/query :int]
  "Given a query and current stage, returns a tuple of `[query next-stage-number]`.

  If that stage already exists, the query is unchanged. If it does not, a new (MBQL) stage is appended and its index
  is returned."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage-number (lib.util/canonical-stage-index query stage-number)]
    (if-let [next-number (lib.util/next-stage-number query stage-number)]
      ;; There is already a next stage, so just return it.
      [query next-number]
      ;; Otherwise append a stage and return the new query and updated stage number.
      (let [query (append-stage query)]
        [query (lib.util/next-stage-number query stage-number)]))))
