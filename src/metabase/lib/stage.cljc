(ns metabase.lib.stage
  "Method implementations for a stage of a query."
  (:refer-clojure :exclude [mapv some not-empty get-in #?(:clj for)])
  (:require
   [clojure.string :as str]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.computed :as lib.computed]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.stage.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.namespaces :as shared.ns]
   [metabase.util.performance :refer [mapv some not-empty get-in #?(:clj for)]]))

(comment metabase.lib.stage.util/keep-me)

(shared.ns/import-fns
 [metabase.lib.stage.util
  append-stage
  drop-empty-stages
  drop-stage
  has-clauses?])

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
    (when-let [metadata (:lib/stage-metadata stage)]
      (when (or (= stage-type :mbql.stage/native)
                source-card)
        (let [source-type (case stage-type
                            :mbql.stage/native :source/native
                            :mbql.stage/mbql   :source/card)]
          (not-empty
           (into []
                 (comp (map #(assoc % :lib/source source-type))
                       ;; do not truncate the desired column aliases coming back from a native query, because if a
                       ;; native query returns a 'crazy long' column name then we need to use that in the next stage.
                       ;; See [[metabase.lib.stage-test/propagate-crazy-long-native-identifiers-test]]
                       (lib.field.util/add-source-and-desired-aliases-xform query (lib.util.unique-name-generator/non-truncating-unique-name-generator)))
                 (:columns metadata))))))))

(mu/defn- breakouts-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (let [cols (lib.breakout/breakouts-metadata query stage-number)]
    (not-empty
     (concat
      cols
      (lib.metadata.calculation/remapped-columns query stage-number cols options)))))

(mu/defn- aggregations-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (not-empty
   (for [ag (lib.aggregation/aggregations-metadata query stage-number)]
     ;; TODO (Cam 8/1/25) -- why don't we just do this in [[lib.aggregation/aggregations-metadata]] instead of here?
     (assoc ag :lib/source-column-alias ((some-fn :lib/source-column-alias :name) ag)))))

;;; TODO -- maybe the bulk of this logic should be moved into [[metabase.lib.field]], like we did for breakouts and
;;; aggregations above.
(mu/defn- fields-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (let [stage             (lib.util/query-stage query stage-number)
        ;; this key is added by [[metabase.query-processor.middleware.add-implicit-clauses/add-implicit-fields]]; we
        ;; forward it as `:qp/implicit-field?`
        ;; so [[metabase.lib.metadata.result-metadata/super-broken-legacy-field-ref]] will know to force Field ID
        ;; `:field_ref`s in the QP results metadata to preserve historic behavior
        added-implicitly? (:qp/added-implicit-fields? stage)]
    (when-let [{fields :fields} stage]
      (-> (for [[tag :as ref-clause] fields
                :let                 [col (lib.metadata.calculation/metadata query stage-number ref-clause)]]
            (cond-> col
              (= tag :expression) (assoc :lib/source              :source/expressions
                                         :lib/source-column-alias (:lib/expression-name col))
              added-implicitly?   (assoc :qp/implicit-field? true)))
          (as-> $cols (concat $cols (lib.metadata.calculation/remapped-columns query stage-number $cols options)))
          not-empty))))

(mu/defn- summary-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (not-empty
   (concat
    (breakouts-columns query stage-number options)
    (aggregations-columns query stage-number))))

(mu/defn- visible-columns-from-previous-stage-returned-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  "Columns that are visible in the current stage because they were returned by the previous stage, if there is one.
  These are updated to use correct aliases and other info for the current stage
  with [[lib.field.util/update-keys-for-col-from-previous-stage]]."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
    (not-empty
     (into []
           (map lib.field.util/update-keys-for-col-from-previous-stage)
           (lib.metadata.calculation/returned-columns query
                                                      previous-stage-number
                                                      (lib.util/query-stage query previous-stage-number)
                                                      options)))))

(mu/defn- saved-question-returned-columns :- [:maybe ::lib.metadata.calculation/returned-columns]
  "Metadata associated with a Saved Question, e.g. if we have a `:source-card`"
  [query          :- ::lib.schema/query
   stage-number   :- :int
   card-id        :- [:maybe ::lib.schema.id/card]
   options        :- ::lib.metadata.calculation/returned-columns.options]
  (when card-id
    (when-let [card (lib.metadata/card query card-id)]
      (not-empty (lib.metadata.calculation/returned-columns query stage-number card options)))))

;;; TODO (Cam 8/6/25) -- this should probably live in [[metabase.lib.metric]]
(mu/defn- metric-visible-columns :- [:maybe ::lib.metadata.calculation/visible-columns]
  [query         :- ::lib.schema/query
   _stage-number :- :int
   card          :- ::lib.schema.metadata/card
   options       :- ::lib.metadata.calculation/visible-columns.options]
  (let [metric-query (-> (lib.query/query (lib.metadata/->metadata-provider query) (:dataset-query card))
                         (lib.util/update-query-stage -1 dissoc :aggregation :breakout))]
    (not-empty (lib.metadata.calculation/visible-columns
                (assoc metric-query :lib/metadata (:lib/metadata query))
                -1
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
                   (not (lib.util.match/match-lite clause :offset clause)))]
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
    (vec
     (or
      ;; 1a. columns returned by previous stage
      (visible-columns-from-previous-stage-returned-columns query stage-number options)
      ;; 1b: default visible Fields for the source Table
      (when source-table
        (assert (integer? source-table))
        (let [table (lib.metadata/table query source-table)]
          (lib.metadata.calculation/returned-columns query stage-number table options)))
      ;; 1e. Metadata associated with a Metric
      (when metric-based?
        (metric-visible-columns query stage-number card options))
      ;; 1c. Metadata associated with a saved Question
      (when source-card
        (when-let [cols (not-empty (saved-question-returned-columns query stage-number source-card
                                                                    (assoc options :include-implicitly-joinable? false)))]
          (into []
                (comp (map lib.field.util/update-keys-for-col-from-previous-stage)
                      (map (fn [col]
                             (assoc col :lib/source :source/card))))
                cols)))
      ;; 1d: `:lib/stage-metadata` for the (presumably native) query
      (mapv (fn [col]
              (let [source-column-alias ((some-fn :lib/source-column-alias :name) col)]
                (assoc col
                       :lib/source               :source/native
                       :lib/source-column-alias  source-column-alias)))
            (get-in this-stage [:lib/stage-metadata :columns]))))))

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
       (lib.join/all-joins-visible-columns-relative-to-parent-stage query stage-number options)))))

;;; TODO (Cam 8/7/25) -- we should probably just move all of `visible-columns` to here since this is the only
;;; implementation, then we could avoid the indirection. A problem for another day tho. See TODO notes
;;; on [[metabase.lib.metadata.calculation/visible-columns]]

#_{:clj-kondo/ignore [:unused-private-var]} ; this is actually used
(mu/defn- -visible-columns :- ::lib.metadata.calculation/visible-columns
  "Implementation of [[metabase.lib.calculation/visible-columns]], which as of 8/7/25 only works on stages. Use that
   instead of using this function directly, since it includes caching, merges default options, and does other nice
   things for us."
  [query                                               :- ::lib.schema/query
   stage-number                                        :- :int
   {:keys [include-implicitly-joinable?], :as options} :- ::lib.metadata.calculation/visible-columns.options]
  (let [existing-columns (existing-visible-columns query stage-number options)]
    (into (vec existing-columns)
          ;; add implicitly joinable columns if desired
          (when include-implicitly-joinable?
            (lib.metadata.calculation/implicitly-joinable-columns query stage-number existing-columns)))))

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
                                 (lib.equality/= join-col existing-col))
                               existing-cols))]
    (into (vec field-cols)
          (remove duplicate-col?)
          join-cols)))

;;; Return results metadata about the expected columns in an MBQL query stage. If the query has
;;; aggregations/breakouts, then return those and the fields columns. Otherwise if there are fields columns return
;;; those and the joined columns. Otherwise return the defaults based on the source Table or previous stage + joins.
(mu/defmethod lib.metadata.calculation/returned-columns-method ::stage :- ::lib.metadata.calculation/returned-columns
  [query                                  :- ::lib.schema/query
   stage-number                           :- :int
   _stage                                 :- ::lib.schema/stage
   {:keys [include-remaps?], :as options} :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  ;; Not including the stage itself in the cache key, since it's not used(!)
  (lib.computed/with-cache-ephemeral* query [::returned-columns stage-number (lib.metadata.calculation/cacheable-options options)]
    (fn []
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
                               (lib.join/all-joins-fields-to-add-to-parent-stage query stage-number options))))]
         (into []
               (comp (lib.field.util/add-source-and-desired-aliases-xform query)
                     ;; we need to update `:name` to be the deduplicated name here, otherwise viz settings will break
                     ;; (see longer explanation in [[metabase.lib.stage-test/returned-columns-deduplicate-names-test]]).
                     ;; Only do this if this is the last stage of the query, just like the QP does! Otherwise we might
                     ;; accidentally break something else that incorrectly relies on the notoriously unreliable `:name`
                     ;; key.
                     (if (lib.util/last-stage? query stage-number)
                       (map #(assoc % :name (:lib/deduplicated-name %)))
                       identity))
               cols))))))

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
