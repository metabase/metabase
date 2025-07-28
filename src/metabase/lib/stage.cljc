(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:require
   [clojure.string :as str]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [medley.core :as m]
   [metabase.lib.ref :as lib.ref]
   [clojure.set :as set]))

(lib.hierarchy/derive :mbql.stage/mbql   ::stage)
(lib.hierarchy/derive :mbql.stage/native ::stage)

(defmethod lib.metadata.calculation/metadata-method ::stage
  [_query _stage-number _stage]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a stage! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(mu/defn- existing-stage-metadata :- [:maybe ::lib.metadata.calculation/returned-columns]
  "Return existing stage metadata attached to a stage if is already present: return it as-is, but only if this is a
  native stage or a source-Card or a metric stage. If it's any other sort of stage then ignore the metadata, it's
  probably wrong; we can recalculate the correct metadata anyway."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{stage-type :lib/type, :keys [source-card] :as stage} (lib.util/query-stage query stage-number)]
    (when (or (= stage-type :mbql.stage/native)
              source-card)
      (when-let [metadata (or
                           ;; if this stage has a source card and does not change the fields in any way (basically
                           ;; an empty stage) then we can use the metadata returned by the Card (e.g. model metadata)
                           (when (and source-card
                                      (not ((some-fn :fields :breakout :aggregation :joins :expression)
                                            (lib.util/query-stage query stage-number))))
                             (lib.metadata.calculation/returned-columns query (lib.metadata/card query source-card)))
                           (get-in stage [:lib/stage-metadata :columns]))]
        (let [source-type (case stage-type
                            :mbql.stage/native :source/native
                            :mbql.stage/mbql   :source/card)]
          (not-empty
           (into []
                 (comp (map #(assoc % :lib/source source-type))
                       (lib.field.util/add-source-and-desired-aliases-xform query))
                 metadata)))))))

(mu/defn- breakouts-columns :- [:maybe [:sequential ::lib.metadata.calculation/column-metadata-with-source]]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (let [cols (lib.breakout/breakouts-metadata query stage-number)]
    (not-empty
     (concat
      cols
      (lib.metadata.calculation/remapped-columns query stage-number cols options)))))

(mu/defn- aggregations-columns :- [:maybe [:sequential ::lib.metadata.calculation/column-metadata-with-source]]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (not-empty
   (for [ag (lib.aggregation/aggregations-metadata query stage-number)]
     (assoc ag :lib/source :source/aggregations))))

;;; TODO -- maybe the bulk of this logic should be moved into [[metabase.lib.field]], like we did for breakouts and
;;; aggregations above.
(mu/defn- fields-columns :- [:maybe [:sequential ::lib.metadata.calculation/column-metadata-with-source]]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (when-let [{fields :fields} (lib.util/query-stage query stage-number)]
    (-> (for [[tag :as ref-clause] fields
              :let                 [col (lib.metadata.calculation/metadata query stage-number ref-clause)]]
          (cond-> col
            (= tag :expression) (assoc :lib/source :source/expressions)))
        (as-> $cols (concat $cols (lib.metadata.calculation/remapped-columns query stage-number $cols options)))
        not-empty)))

(mu/defn- summary-columns :- [:maybe [:sequential ::lib.metadata.calculation/column-metadata-with-source]]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (not-empty
   (concat
    (breakouts-columns query stage-number options)
    (aggregations-columns query stage-number))))

(mu/defn- previous-stage-metadata :- [:maybe ::lib.metadata.calculation/returned-columns]
  "Metadata for the previous stage, if there is one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    (not-empty
     (into []
           (comp (map lib.field.util/update-keys-for-col-from-previous-stage)
                 (map #(assoc % :lib/source :source/previous-stage))
                 (lib.field.util/add-source-and-desired-aliases-xform query))
           (lib.metadata.calculation/returned-columns query
                                                      previous-stage-number
                                                      (lib.util/query-stage query previous-stage-number)
                                                      options)))))

(mu/defn- saved-question-visible-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  "Metadata associated with a Saved Question, e.g. if we have a `:source-card`"
  [query          :- ::lib.schema/query
   stage-number   :- :int
   card-id        :- [:maybe ::lib.schema.id/card]
   options        :- ::lib.metadata.calculation/visible-columns.options]
  (when card-id
    (when-let [card (lib.metadata/card query card-id)]
      (not-empty (lib.metadata.calculation/visible-columns query stage-number card options)))))

(mu/defn- metric-metadata :- [:maybe ::lib.metadata.calculation/returned-columns]
  [query         :- ::lib.schema/query
   _stage-number :- :int
   card          :- ::lib.schema.metadata/card
   options       :- ::lib.metadata.calculation/visible-columns.options]
  (let [metric-query (-> card :dataset-query mbql.normalize/normalize lib.convert/->pMBQL
                         (lib.util/update-query-stage -1 dissoc :aggregation :breakout))]
    (not-empty (lib.metadata.calculation/visible-columns
                (assoc metric-query :lib/metadata (:lib/metadata query))
                -1
                (lib.util/query-stage metric-query -1)
                options))))

(mu/defn- expressions-metadata :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query                         :- ::lib.schema/query
   stage-number                  :- :int
   {:keys [include-late-exprs?]} :- [:map [:include-late-exprs? {:optional true} :boolean]]]
  (not-empty
   (for [[clause col] (map vector
                           (:expressions (lib.util/query-stage query stage-number))
                           (lib.expression/expressions-metadata query stage-number))
         ;; Only include "late" expressions when required.
         ;; "Late" expressions those like :offset which can't be used within the same query stage, like aggregations.
         :when (or include-late-exprs?
                   (not (lib.util.match/match-lite-recursive clause :offset clause)))]
     (-> col
         (assoc :lib/source :source/expressions, :lib/source-column-alias (:name col))
         (u/assoc-default :effective-type (or (:base-type col) :type/*))))))

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
;;; 1e. Metadata associated with a Metric, if we have `:sources`, OR
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
(mu/defn- previous-stage-or-source-visible-columns :- ::lib.metadata.calculation/visible-columns
  "Return columns from the previous query stage or source Table/Card."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- ::lib.metadata.calculation/visible-columns.options]
  (let [{:keys [source-table source-card], :as this-stage} (lib.util/query-stage query stage-number)
        card          (some->> source-card (lib.metadata/card query))
        metric-based? (= (:type card) :metric)]
    (into []
          (if metric-based?
            identity
            (map lib.field.util/update-keys-for-col-from-previous-stage))
          (or
           ;; 1a. columns returned by previous stage
           (previous-stage-metadata query stage-number options)
           ;; 1b: default visible Fields for the source Table
           (when source-table
             (assert (integer? source-table))
             (let [table-metadata (lib.metadata/table query source-table)]
               (lib.metadata.calculation/visible-columns query stage-number table-metadata options)))
           ;; 1e. Metadata associated with a Metric
           (when metric-based?
             (metric-metadata query stage-number card options))
           ;; 1c. Metadata associated with a saved Question
           (when source-card
             (saved-question-visible-columns query stage-number source-card (assoc options :include-implicitly-joinable? false)))
           ;; 1d: `:lib/stage-metadata` for the (presumably native) query
           (for [col  (get-in this-stage [:lib/stage-metadata :columns])
                 :let [source-column-alias ((some-fn :lib/source-column-alias :name) col)]]
             (assoc col
                    :lib/source               :source/native
                    :lib/source-column-alias  source-column-alias))))))

(mu/defn- existing-visible-columns :- ::lib.metadata.calculation/visible-columns
  [query                                                       :- ::lib.schema/query
   stage-number                                                :- :int
   {:keys [include-joined? include-expressions?], :as options} :- ::lib.metadata.calculation/visible-columns.options]
  (let [source-columns (previous-stage-or-source-visible-columns query stage-number options)]
    (concat
     ;; 1: columns from the previous stage, source table or query
     source-columns
     ;; 2: expressions (aka calculated columns) added in this stage
     (when include-expressions?
       (expressions-metadata query stage-number {}))
     ;; 3: remapped columns - which are only when requested with `:include-remaps?`, and only on the first stage.
     ;; (Otherwise they've already been added.)
     (lib.metadata.calculation/remapped-columns query stage-number source-columns options)
     ;; 4: columns added by joins at this stage
     (when include-joined?
       (lib.join/all-joins-visible-columns query stage-number options)))))

(mu/defmethod lib.metadata.calculation/visible-columns-method ::stage :- ::lib.metadata.calculation/visible-columns
  [query                                               :- ::lib.schema/query
   stage-number                                        :- :int
   _stage                                              :- ::lib.schema/stage
   {:keys [include-implicitly-joinable?], :as options} :- ::lib.metadata.calculation/visible-columns.options]
  (let [existing-columns (existing-visible-columns query stage-number options)]
    (->> (concat
          existing-columns
           ;; add implicitly joinable columns if desired
          (when include-implicitly-joinable?
            (lib.metadata.calculation/implicitly-joinable-columns query stage-number existing-columns)))
         vec)))

(defn- add-cols-from-join-duplicate?
  "Whether two columns are considered to be the same for purposes of [[add-cols-from-join]]."
  [col-1 col-2]
  ;; columns that don't have the same binning or temporal bucketing are never the same.
  (and
   ;; same binning
   (= (lib.binning/binning col-1)
      (lib.binning/binning col-2))
   ;; same bucketing
   (letfn [(bucket [col]
             (when-let [bucket (lib.temporal-bucket/raw-temporal-bucket col)]
               (when-not (= bucket :default)
                 bucket)))]
     (= (bucket col-1)
        (bucket col-2)))
   ;; compare by IDs if we have ID info for both.
   (if (every? :id [col-1 col-2])
     ;; same IDs
     (= (:id col-1) (:id col-2))
     ;; same names
     (some (fn [f]
             (= (f col-2)
                (f col-1)))
           [:lib/desired-column-alias :lib/source-column-alias :lib/deduplicated-name :name]))))

(defn- add-cols-from-join
  "The columns from `:fields` may contain columns from `:joins` -- so if the joins specify their own `:fields` we need
  to make sure not to include them twice! We de-duplicate them here.

  This matches the logic in [[metabase.query-processor.middleware.resolve-joins/append-join-fields]] -- important to
  have the exact same behavior in both places."
  [query stage-number options field-cols join]
  (let [join-cols      (lib.join/join-fields-to-add-to-parent-stage query stage-number join options)
        join-alias     (lib.join.util/current-join-alias join)
        existing-cols  (filter #(= (lib.join.util/current-join-alias %) join-alias)
                               field-cols)
        duplicate-col? (fn [join-col]
                         (some (fn [existing-col]
                                 (add-cols-from-join-duplicate? join-col existing-col))
                               existing-cols))]
    (into (vec field-cols)
          (remove duplicate-col?)
          join-cols)))

(defn- model-metadata [query stage]
  ;; this key is added by the [[metabase.query-processor.middleware.fetch-source-query]] middleware.
  (when-let [card-id (:qp/stage-is-from-source-card stage)]
    (when-let [card (lib.metadata/card query card-id)]
      (when (= (:type card) :model)
        (or
         ;; prefer using card metadata if we can get it from the metadata provider; otherwise fall
         ;; back to metadata attached to the stage.
         (not-empty (lib.metadata.calculation/returned-columns query card))
         (when-some [stage-cols (get-in stage [:lib/stage-metadata :columns])]
           ;; make sure `:lib/source` is set to SOMETHING or we will have a really bad time.
           (for [col stage-cols]
             (u/assoc-default col :lib/source (case (:lib/type stage)
                                                :mbql.stage/native :source/native
                                                :mbql.stage/mbql   :source/previous-stage)))))))))

(def ^:private model-propagated-keys
  #{:lib/card-id
    :lib/model-display-name
    :lib/original-display-name
    :lib/original-expression-name
    :lib/original-fk-field-id
    :lib/original-fk-field-name
    :lib/original-fk-join-alias
    :lib/original-join-alias
    :lib/original-name
    :lib/type
    :base-type
    :converted-timezone
    :description
    :display-name
    :fingerprint
    :id
    :semantic-type
    :table-id
    :visibility-type})

(defn- merge-model-metadata [query stage cols]
  (if-let [model-cols (not-empty (model-metadata query stage))]
    (mapv (fn [col]
            (let [model-col (lib.equality/find-matching-column (lib.ref/ref col) model-cols)]
              (println "(:display-name model-col):" (:display-name model-col)) ; NOCOMMIT
              (merge
               col
               (when model-col
                 (-> model-col
                     lib.field.util/update-keys-for-col-from-previous-stage
                     (assoc :lib/model-display-name (:display-name model-col))
                     (u/select-non-nil-keys model-propagated-keys))))))
          cols)
    cols))

;;; Return results metadata about the expected columns in an MBQL query stage. If the query has
;;; aggregations/breakouts, then return those and the fields columns. Otherwise if there are fields columns return
;;; those and the joined columns. Otherwise return the defaults based on the source Table or previous stage + joins.
(mu/defmethod lib.metadata.calculation/returned-columns-method ::stage :- ::lib.metadata.calculation/returned-columns
  [query                                  :- ::lib.schema/query
   stage-number                           :- :int
   stage                                  :- ::lib.schema/stage
   {:keys [include-remaps?], :as options} :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (or
   (existing-stage-metadata query stage-number)
   (let [summary-cols (summary-columns query stage-number options)
         field-cols   (fields-columns query stage-number options)
         ;; ... then calculate metadata for this stage
         cols         (cond
                        summary-cols
                        (concat summary-cols field-cols)

                        field-cols
                        (reduce
                         (fn [field-cols join]
                           (add-cols-from-join query stage-number options field-cols join))
                         field-cols
                         (lib.join/joins query stage-number))

                        :else
                        ;; there is no `:fields` or summary columns (aggregtions or breakouts) which means we return
                        ;; all the visible columns from the source or previous stage plus all the expressions. We
                        ;; return only the `:fields` from any joins
                        (let [;; we don't want to include all visible joined columns, so calculate that separately
                              source-cols (previous-stage-or-source-visible-columns
                                           query stage-number
                                           {:include-implicitly-joinable? false
                                            :include-remaps?              (boolean include-remaps?)})]
                          (concat
                           source-cols
                           (expressions-metadata query stage-number {:include-late-exprs? true})
                           (lib.metadata.calculation/remapped-columns query stage-number source-cols options)
                           (lib.join/all-joins-fields-to-add-to-parent-stage query stage-number options))))
         cols (merge-model-metadata query stage cols)]
     (into []
           (comp (map (fn [col]
                        ;; update the display names for the columns
                        (assoc col :display-name (lib.metadata.calculation/display-name query stage-number col))))
                 (lib.field.util/add-source-and-desired-aliases-xform query)
                 ;; we need to update `:name` to be the deduplicated name here, otherwise viz settings will break (see
                 ;; longer explanation in [[metabase.lib.stage-test/returned-columns-deduplicate-names-test]]). Only
                 ;; do this if this is the last stage of the query, just like the QP does! Otherwise we might
                 ;; accidentally break something else that incorrectly relies on the notoriously unreliable `:name`
                 ;; key.
                 (if (lib.util/last-stage? query stage-number)
                   (map #(assoc % :name (:lib/deduplicated-name %)))
                   identity))
           cols))))

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
                                            style))))

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

(defn- ensure-legacy-filter-stage
  [query]
  (let [inner-query (:query query)]
    (cond-> query
      (:breakout inner-query)
      (assoc :query {:source-query inner-query}))))

(defn ensure-filter-stage
  "Adds an empty stage to `query` if its last stage contains breakouts.

  This is so that parameters can address both the stage before and after the breakouts.
  Adding filters to the result at stage -1 will filter after the breakouts. Filters added at
  stage -2 filter before the breakouts."
  ([query] (ensure-filter-stage query -1))
  ([query stage-number]
   (if (= (dec (count (:stages query)))
          (lib.util/canonical-stage-index query stage-number))
     (if (#{:query :native} (lib.util/normalized-query-type query))
       (ensure-legacy-filter-stage query)
       (cond-> query
         (lib.breakout/breakouts query)
         append-stage))
     ;; Leave the query alone if we're targeting a stage other than the last one.
     query)))
