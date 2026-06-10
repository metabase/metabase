(ns metabase.usage-metadata.extract
  "Extract usage facts (dimensions, segments, metrics) from a normalized MBQL query.

  Every fact is keyed on `(source-type, source-id, ownership-mode)`, where the source
  is whatever the user was actually querying — a Card or a Table. We don't drill
  through a card to its underlying table; if you query `card_42` (backed by
  `table_7`), aggregations over card columns are attributed to the card, not to
  `table_7`.

  `ownership-mode` is one of:

  - `:direct`   — all field-refs in the clause share one owner; one row per
                  field, attributed to that owner.
  - `:mixed`    — field-refs span multiple owners (joins, cross-source
                  expressions). One synthetic row with `source-type`/`source-id`
                  both nil, capturing the whole-clause count.
  - `:projected` — the per-participant shadow of a `:mixed` row: for each
                  distinct owner involved, emit a row attributing the
                  multi-source clause to that owner. Not a card→table
                  back-projection."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- canonicalize-for-storage
  [x]
  (-> x
      lib.schema.util/remove-lib-uuids
      (lib.schema.util/sorted-maps lib.schema.common/unfussy-sorted-map)
      json/encode))

(defn query-source-table-or-card
  "Returns the source of a query (table or card ID), or `nil` if none."
  [query]
  (when (and query (not (lib/any-native-stage? query)))
    (or (when-let [table-id (lib/primary-source-table-id query)]
          {:source-type :table
           :source-id   table-id})
        (when-let [card-id (lib/primary-source-card-id query)]
          {:source-type :card
           :source-id   card-id}))))

(defn- owner-from-metadata
  [root-owner metadata]
  (cond
    (and (= :card (:source-type root-owner))
         (contains? #{:source/card :source/previous-stage :source/aggregations}
                    (:lib/source metadata)))
    root-owner

    (pos-int? (:lib/card-id metadata))
    {:source-type :card
     :source-id   (:lib/card-id metadata)}

    (pos-int? (:table-id metadata))
    {:source-type :table
     :source-id   (:table-id metadata)}

    :else
    nil))

(defn- referenced-columns-safe
  [query stage-number clause]
  (try
    (lib/referenced-columns query stage-number clause)
    (catch Throwable e
      (log/debugf e "usage-metadata: referenced-columns failed (stage %s)" stage-number)
      nil)))

(defn- field-participants-of-clause
  "For one MBQL clause, returns distinct `{:field-id ... :owner ...}` maps for each referenced
  column whose `:id` resolves to a real Field and has a derivable owner."
  [query stage-number root-owner clause]
  (into []
        (comp (keep (fn [col]
                      (when-let [field-id (:id col)]
                        (when (pos-int? field-id)
                          (when-let [owner (owner-from-metadata root-owner col)]
                            {:field-id field-id :owner owner})))))
              (distinct))
        (referenced-columns-safe query stage-number clause)))

(defn- aggregation-operator-safe
  [query stage-number aggregation]
  (try
    (:operator (lib/expression-parts query stage-number aggregation))
    (catch Throwable e
      (log/debugf e "usage-metadata: aggregation operator extraction failed (stage %s)" stage-number)
      nil)))

(defn- breakout-column-safe
  [query stage-number breakout]
  (try
    (lib/breakout-column query stage-number breakout)
    (catch Throwable e
      (log/debugf e "usage-metadata: breakout-column failed (stage %s)" stage-number)
      nil)))

(defn- segment-facts-for-clause
  [query stage-number clause]
  (let [root-owner (query-source-table-or-card query)
        field-refs (field-participants-of-clause query stage-number root-owner clause)
        owners     (set (map :owner field-refs))
        predicate  (canonicalize-for-storage clause)]
    (cond
      (empty? field-refs)
      []

      (= 1 (count owners))
      (let [owner (first owners)]
        (mapv (fn [{:keys [field-id]}]
                (assoc owner
                       :ownership-mode :direct
                       :field-id       field-id
                       :predicate      predicate))
              field-refs))

      :else
      (vec
       (concat
        [{:source-type     nil
          :source-id       nil
          :ownership-mode  :mixed
          :field-id        nil
          :predicate       predicate}]
        (map (fn [{:keys [field-id owner]}]
               (assoc owner
                      :ownership-mode :projected
                      :field-id       field-id
                      :predicate      predicate))
             field-refs))))))

(defn- segment-facts-for-stage
  [query stage-number]
  (into []
        (mapcat (partial segment-facts-for-clause query stage-number))
        (or (lib/filters query stage-number) [])))

;; Allowlist of primitive aggregation operators we will record. Sourced from
;; `metabase.lib.schema.aggregation` (see `::aggregation-clause-tag`).
;; Composite aggregations (`:-`, `:+`, `:case`, etc.) and references to
;; saved Metrics (`:metric`, `:measure`, `:aggregation`) are intentionally
;; excluded — for the implicit-metric discovery use case those are either
;; already explicit-by-construction or out of scope.
(def ^:private primitive-aggregation-operators
  #{:avg
    :count
    :cum-count
    :count-where
    :distinct
    :distinct-where
    :max
    :median
    :min
    :offset
    :percentile
    :share
    :stddev
    :sum
    :cum-sum
    :sum-where
    :var})

(defn- composite-facts-for-stage
  "Emit at most one composite fact per stage, treating the stage's top-level filter list as a single
  implicit-`:and` basket. `lib/atomic-filters` flattens any explicit `:and` children so the basket's
  atom membership matches the atom rollup's per-atom facts. Stages with fewer than two atoms are
  skipped (the atom rollup already captures single predicates)."
  [query stage-number]
  (let [atoms      (or (lib/atomic-filters query stage-number) [])
        atom-count (count atoms)]
    (when (>= atom-count 2)
      (let [root-owner       (query-source-table-or-card query)
            synthetic-and    (apply lib/and atoms)
            canonical-clause (canonicalize-for-storage synthetic-and)
            canonical-atoms  (vec (sort (map canonicalize-for-storage atoms)))
            field-refs       (into []
                                   (comp (mapcat (partial field-participants-of-clause query stage-number root-owner))
                                         (distinct))
                                   atoms)
            owners           (set (map :owner field-refs))
            base             {:clause            canonical-clause
                              :atom-fingerprints canonical-atoms
                              :atom-count        atom-count}]
        (cond
          (empty? field-refs)
          []

          (= 1 (count owners))
          [(merge (first owners) base {:ownership-mode :direct})]

          :else
          (into [(merge base {:source-type nil :source-id nil :ownership-mode :mixed})]
                (map (fn [owner] (merge owner base {:ownership-mode :projected})))
                owners))))))

(defn- metric-bases
  [query stage-number aggregation]
  (let [root-owner (query-source-table-or-card query)
        agg-type   (aggregation-operator-safe query stage-number aggregation)
        field-refs (field-participants-of-clause query stage-number root-owner aggregation)
        owners     (set (map :owner field-refs))]
    (cond
      ;; Skip composite aggregations and saved-metric references — only record
      ;; primitive aggregations like sum/count/avg/etc.
      (not (contains? primitive-aggregation-operators agg-type))
      []

      (empty? field-refs)
      [{:source-type     (:source-type root-owner)
        :source-id       (:source-id root-owner)
        :ownership-mode  :direct
        :agg             agg-type
        :agg-field-id    nil}]

      (= 1 (count owners))
      (mapv (fn [{:keys [field-id owner]}]
              (assoc owner
                     :ownership-mode :direct
                     :agg            agg-type
                     :agg-field-id   field-id))
            field-refs)

      :else
      (vec
       (concat
        [{:source-type     nil
          :source-id       nil
          :ownership-mode  :mixed
          :agg             agg-type
          :agg-field-id    nil}]
        (map (fn [{:keys [field-id owner]}]
               (assoc owner
                      :ownership-mode :projected
                      :agg            agg-type
                      :agg-field-id   field-id))
             field-refs))))))

(defn- temporal-breakout-from-column
  [breakout-col]
  (when-let [unit (lib/raw-temporal-bucket breakout-col)]
    (when-let [field-id (:id breakout-col)]
      (when (pos-int? field-id)
        {:temporal-field-id field-id
         :temporal-unit     unit}))))

(defn- metric-facts-for-stage
  [query stage-number]
  (let [breakout-cols      (mapv (partial breakout-column-safe query stage-number)
                                 (or (lib/breakouts query stage-number) []))
        temporal-breakouts (into [] (keep temporal-breakout-from-column) breakout-cols)]
    (into []
          (mapcat (fn [aggregation]
                    (for [base     (metric-bases query stage-number aggregation)
                          temporal (if (seq temporal-breakouts)
                                     temporal-breakouts
                                     [{:temporal-field-id nil
                                       :temporal-unit     nil}])]
                      (merge base temporal))))
          (or (lib/aggregations query stage-number) []))))

(defn- serialize-binning
  [binning]
  (canonicalize-for-storage
   (cond-> {:strategy (:strategy binning)}
     (:num-bins binning)  (assoc :num-bins (:num-bins binning))
     (:bin-width binning) (assoc :bin-width (:bin-width binning)))))

(defn- dimension-facts-for-stage
  [query stage-number]
  (let [root-owner (query-source-table-or-card query)]
    (into []
          (keep (fn [breakout]
                  (when-let [col (breakout-column-safe query stage-number breakout)]
                    (when-let [field-id (:id col)]
                      (when (pos-int? field-id)
                        (when-let [owner (owner-from-metadata root-owner col)]
                          (assoc owner
                                 :ownership-mode :direct
                                 :field-id       field-id
                                 :temporal-unit  (lib/raw-temporal-bucket col)
                                 :binning        (some-> (lib/binning col) serialize-binning))))))))
          (or (lib/breakouts query stage-number) []))))

(defn extract-usage-facts
  "Extract fact-level usage tuples from a normalized MBQL query."
  [query]
  (reduce
   (fn [{:keys [segments composites metrics dimensions]} stage-number]
     {:segments   (into segments (segment-facts-for-stage query stage-number))
      :composites (into composites (composite-facts-for-stage query stage-number))
      :metrics    (into metrics (metric-facts-for-stage query stage-number))
      :dimensions (into dimensions (dimension-facts-for-stage query stage-number))})
   {:segments   []
    :composites []
    :metrics    []
    :dimensions []}
   (range (lib/stage-count query))))
