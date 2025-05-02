(ns metabase.lib-be.task.backfill-card-metadata-analysis
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.lib.core :as lib]
   [metabase.models.card :as card]
   [metabase.models.card.metadata :as card.metadata]
   [metabase.models.setting :refer [defsetting]]
   [metabase.models.task-history :as task-history]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.lib-be.task.backfill-card-metadata-analysis.job")
(def ^:private trigger-key "metabase.lib-be.task.backfill-card-metadata-analysis.trigger")

(def ^:dynamic *batch-size*
  "The number of cards the backfill job will process at once."
  20)

(def ^:private min-repeat-ms
  "The minimum acceptable repeat rate for this job."
  1000)

(defsetting backfill-card-metadata-analysis-repeat-ms
  (deferred-tru "Period between runs of backfill job for metadata analysis on cards, in ms. Minimum is 1000, a lower setting will disable the job.")
  :type       :integer
  :visibility :internal
  :audit      :never
  :export?    true
  :default    20000)

;; ## Analysis internals
(defn- has-valid-ident?
  "Checks that this column both has an `:ident` and that it's valid.

  For a native card, the ident must be based on this card's `entity_id`.

  For a model, the ident must likewise be for this card, **and** `:model/inner_ident` must also be set to the
  corresponding unwrapped, inner ident."
  [{:keys [ident model/inner_ident] :as _column} {:keys [entity_id] :as card}]
  (if (= (:type card) :model)
    (and ident
         (lib/valid-model-ident? ident entity_id)
         inner_ident
         (= ident (lib/model-ident inner_ident entity_id)))
    (and ident (lib/valid-basic-ident? ident entity_id))))

(defn- infer-idents-for-result-metadata
  "Computes `:ident`s for a card which does not current have them defined.

  For native queries, the `:ident`s are always based directly on the column names. In particular, the legacy
  `:field_ref`'s name for the column is preferred, since it is disambiguated and matches the query results, while
  `:name` does not. If the input query has no `:result_metadata`, then we can do nothing.

  For MBQL queries, we run metadata inference on the card. If the card depends on a

  "
  [result-metadata {query :dataset_query, eid :entity_id, :as card}]
  (case (:type query)
    ;; For native queries, the `:ident`s are always based directly on the column names.
    ;; NOTE: Deliberately prefer the field_ref name over :name here! :name is sometimes not unique, if the
    ;; SQL contains duplicate names. Instead, using the string name from the `:field_ref`, which is
    ;; disambiguated properly. Fall back to the :name if the :field_ref isn't provided.
    :native (mapv (fn [{column-name :name, [_field ref-name] :field_ref, :as col}]
                    (cond-> (assoc col :ident (lib/native-ident (or ref-name column-name)
                                                                eid))
                      (= (:type card) :model) (lib/add-model-ident eid)))
                  result-metadata)

    ;; For MBQL queries, re-run the inference, which will include correct idents.
    :query  (let [inferred (card.metadata/infer-metadata-with-model-overrides query card) ; These already have [[lib/model-ident]] applied.
                  by-ref   (group-by :field_ref inferred)
                  by-name  (group-by :name inferred)]
              (mapv (fn [original]
                      (let [matches (or (get by-ref (:field_ref original))
                                        (get by-name (:name original)))]
                        (when (empty? matches)
                          (log/warn "No match of saved result_metadata with inferred metadata."
                                    {:column original}))
                        (when (next matches)
                          (log/warn "Ambiguous match of saved result_metadata with inferred metadata."
                                    {:column original
                                     :candidates matches}))
                        (or (first matches)
                            original)))
                    result-metadata))
    ;; Fallback: Do nothing.
    result-metadata))

(defn- backfill-idents-for-card!
  "Given a card, attempt to backfill `:ident`s into its `:result_metadata`.

  Any partial or preexisting `:ident`s on this card are ignored! Always runs the analysis process first, and considers
  its results:
  - Successfully assigned a valid `:ident` to all columns: mark this card as `:analyzed`.
  - Some idents are missing: randomly choose a card from the dynamic list of referenced cards to be `:blocked` on.
  - All idents are present but some fail validation: mark as `:failed`.

  Returns the new state of the card."
  [card]
  (binding [card/*upstream-cards-without-idents* (atom #{})]
    (let [idented (infer-idents-for-result-metadata (:result_metadata card) card)
          updates (cond
                    (every? #(has-valid-ident? % card) idented) ; All idents valid!
                    {:result_metadata           idented
                     :metadata_analysis_state   :analyzed
                     :metadata_analysis_blocker nil}
                    (seq (remove :ident idented))               ; Some idents are missing: blocked
                    {:metadata_analysis_state   :blocked
                     :metadata_analysis_blocker (first @card/*upstream-cards-without-idents*)}
                    :else                                       ; Some idents failed validation: failed
                    {:metadata_analysis_state   :failed
                     :metadata_analysis_blocker nil})]
      (t2/update! :model/Card (:id card) updates)
      (:metadata_analysis_state updates))))

;; ## Entry point for analysis
(defn- analyze-card!
  "Reads a single card and analyzes its `:result_metadata`.

  Rules:
  - `:executed` or `:analyzed` cards should have `:ident`s for all columns in their `:result_metadata`
    - If they don't, mark them `:failed`, since only an erroneous code path could have done that!
  - `:failed` and `:blocked` cards should be skipped.
  - If the `:result_metadata` has (valid) idents for all columns already, mark it `:analyzed`.
  - Otherwise run the analysis:
    - If some idents are present but malformed: mark it `:failed`.
    - If we can compute a valid ident for all columns: write out that metadata and mark it `:analyzed`.
    - If some idents are missing, and the set of referenced unanalyzed cards is not empty:
      - Choose a card arbitrarily, mark the card being analyzed as `:blocked` on that referenced card.
    - If some idents are missing, but the set of referenced unanalyzed cards is not empty:
      - Mark the card as `:failed` - we can't compute its idents and we're not sure why.

  Returns either the new state of the card, or `:skipped` if it's already `:failed` or `:blocked`."
  [{state :metadata_analysis_state
    cols  :result_metadata
    :keys [id] :as card}]
  (case state
    ;; If the card has meanwhile been marked `:executed` or `:analyzed`, mark it as :failed since something went wrong.
    (:executed :analyzed)    (when-not (every? #(has-valid-ident? % card) cols)
                               (t2/update! :model/Card id {:metadata_analysis_state :failed})
                               :failed)

    ;; If the card has been concurrently marked `:failed` or `:blocked`, just skip it.
    (:failed :blocked)       (do (log/debugf "Card %d is marked as %s; skipping analysis" id state)
                                 :skipped)

    ;; Run the analysis and consider the results.
    (:not-started :priority) (backfill-idents-for-card! card)))

(defn- batched-metadata-analysis!
  "Runs a batch of metadata analysis, one card at a time."
  []
  ;; First, drain the on-demand set of cards!
  (when-let [needed (seq @card/cards-for-priority-analysis)]
    (u/prog1 (t2/update! :model/Card
                         :id [:in needed]
                         :metadata_analysis_state :not-started ; Don't set priority if they were analyzed in the meantime.
                         {:metadata_analysis_state :priority})
      (log/debugf "Marked %d cards as :priority for analysis" (or <> 0))))
  (let [prioritized (t2/select :model/Card :metadata_analysis_state :priority {:limit *batch-size*})
        headroom    (- *batch-size* (count prioritized))
        extras      (when (pos? headroom)
                      (t2/select :model/Card :metadata_analysis_state :not-started {:limit headroom}))
        the-cards   (concat prioritized extras)]
    (task-history/with-task-history {:task            "card_metadata_analysis"
                                     :on-success-info (fn [update-map result]
                                                        (update update-map :task_details
                                                                merge (select-keys result [:card_results :state_counts])))
                                     :task_details    {:card_ids (mapv :id the-cards)}}
      (let [id->state (into {} (map (juxt :id analyze-card!)) the-cards)]
        {:card_results id->state
         :state_counts (frequencies (vals id->state))}))))

(task/defjob ^{:doc "Examines batches of cards to analyze their `:result_metadata` and backfill their idents."}
  BackfillCardMetadataAnalysis [_ctx]
  (batched-metadata-analysis!))

(defn- get-repeat-ms
  "Gets the desired repeat ms for the backfill job. Returns nil if the job should be disabled."
  []
  (let [repeat-ms (backfill-card-metadata-analysis-repeat-ms)]
    (cond
      (<= repeat-ms 0) nil
      (< repeat-ms min-repeat-ms) (do (log/warnf "backfill-card-metadata-analysis-repeat-ms of %dms is too low, using %dms"
                                                 repeat-ms
                                                 min-repeat-ms)
                                      min-repeat-ms)
      :else repeat-ms)))

(defmethod task/init! ::BackfillCardMetadataAnalysis [_]
  (let [repeat-ms (get-repeat-ms)]
    (if-not repeat-ms
      (log/infof "Not starting backfill-card-metadata-analysis task: backfill-card-metadata-analysis-repeat-ms is %d"
                 (backfill-card-metadata-analysis-repeat-ms))
      (do (log/info "Starting to analyze missing card metadata")
          (let [job (jobs/build
                     (jobs/of-type BackfillCardMetadataAnalysis)
                     (jobs/with-identity (jobs/key job-key)))
                trigger (triggers/build
                         (triggers/with-identity (triggers/key trigger-key))
                         (triggers/start-now)
                         (triggers/with-schedule
                          (simple/schedule
                           (simple/with-interval-in-milliseconds repeat-ms)
                           (simple/repeat-forever))))]
            (task/schedule-task! job trigger))))))
