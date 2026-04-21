(ns metabase.usage-metadata.extract
  "Extract usage facts (dimensions, segments, metrics) from a normalized MBQL query.

  Every fact is keyed on `(source-type, source-id, ownership-mode)`, where the source
  is whatever the user was actually querying — a Card or a Table. We don't drill
  through a card to its underlying table; if you query `card_42` (backed by
  `table_7`), aggregations over card columns are attributed to the card, not to
  `table_7`. The only table-lookup done here is `lookup-field-table-id` for
  fields that arrive via a `:join-alias`.

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
   [clojure.walk :as walk]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *field->table-id*
  "Optional atom holding a `field-id → table-id` cache for the current batch scope. When bound,
  `owner-for-field-ref` populates it lazily instead of firing a per-ref `Field` select."
  nil)

(defn- lookup-field-table-id [field-id]
  (when (pos-int? field-id)
    (if-let [cache *field->table-id*]
      (let [cached (get @cache field-id ::miss)]
        (if (= cached ::miss)
          (let [table-id (t2/select-one-fn :table_id :model/Field :id field-id)]
            (swap! cache assoc field-id table-id)
            table-id)
          cached))
      (t2/select-one-fn :table_id :model/Field :id field-id))))

(defn- canonicalize-for-storage
  [x]
  (-> x
      lib.schema.util/remove-lib-uuids
      (lib.schema.util/sorted-maps lib.schema.common/unfussy-sorted-map)
      json/encode))

(defn select-root-owner
  "Return the stage-0 source owner for a normalized MBQL query, or nil if it should be skipped."
  [query]
  (let [stage-0 (first (:stages query))]
    (cond
      (or (nil? query)
          (lib/any-native-stage? query))
      nil

      (pos-int? (:source-table stage-0))
      {:source-type :table
       :source-id   (:source-table stage-0)}

      (pos-int? (:source-card stage-0))
      {:source-type :card
       :source-id   (:source-card stage-0)}

      :else
      nil)))

(defn- stage-default-owner
  [query _stage-number]
  (select-root-owner query))

(defn- field-ref?
  [x]
  (and (vector? x)
       (contains? #{"field" :field} (first x))))

(defn- field-ref-info
  [field-ref]
  (let [[_ a b] field-ref]
    (cond
      (and (map? a) (integer? b))
      {:field-id b, :options a}

      (and (integer? a) (map? b))
      {:field-id a, :options b}

      (integer? a)
      {:field-id a, :options nil}

      (integer? b)
      {:field-id b, :options nil}

      :else
      nil)))

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

(defn- owner-for-field-ref
  [query stage-number field-ref {:keys [field-id options]}]
  (let [root-owner       (stage-default-owner query stage-number)
        visible-columns  (try
                           (lib/visible-columns query stage-number)
                           (catch Throwable e
                             (log/debugf e "usage-metadata: visible-columns failed (stage %s)" stage-number)
                             nil))]
    (or (some->> (try
                   (when (seq visible-columns)
                     (lib/find-matching-column field-ref visible-columns))
                   (catch Throwable e
                     (log/debugf e "usage-metadata: find-matching-column failed for %s (stage %s)"
                                 (pr-str field-ref) stage-number)
                     nil))
                 (owner-from-metadata root-owner))
        (cond
          (nil? field-id)
          nil

          (:join-alias options)
          (when-let [table-id (lookup-field-table-id field-id)]
            {:source-type :table
             :source-id   table-id})

          :else
          root-owner))))

(defn- clause-field-refs
  [query stage-number clause]
  (let [refs (volatile! [])]
    (walk/postwalk
     (fn [form]
       (when-let [{:keys [field-id] :as info} (and (field-ref? form)
                                                   (field-ref-info form))]
         (when-let [owner (owner-for-field-ref query stage-number form info)]
           (vswap! refs conj {:field-id field-id
                              :owner    owner})))
       form)
     clause)
    (vec (distinct @refs))))

(defn- atomic-filter-clauses
  [clause]
  (let [op (some-> (first clause) name)]
    (if (= op "and")
      (mapcat atomic-filter-clauses (rest clause))
      [clause])))

(defn- segment-facts-for-clause
  [query stage-number clause]
  (let [field-refs (clause-field-refs query stage-number clause)
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
  (into [] (comp (mapcat atomic-filter-clauses)
                 (mapcat (partial segment-facts-for-clause query stage-number)))
        (or (lib/filters query stage-number) [])))

(defn- temporal-breakout
  [breakout]
  (when-let [temporal-unit (lib/raw-temporal-bucket breakout)]
    (when-let [field-id (some-> breakout lib/all-field-ids not-empty first)]
      {:temporal-field-id field-id
       :temporal-unit     temporal-unit})))

(defn- metric-bases
  [query stage-number aggregation]
  (let [field-refs  (clause-field-refs query stage-number aggregation)
        owners      (set (map :owner field-refs))
        root-owner  (select-root-owner query)
        agg-type    (first aggregation)]
    (cond
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

(defn- metric-facts-for-stage
  [query stage-number]
  (let [temporal-breakouts (into [] (keep temporal-breakout) (or (lib/breakouts query stage-number) []))]
    (into []
          (mapcat (fn [aggregation]
                    (for [base     (metric-bases query stage-number aggregation)
                          temporal (if (seq temporal-breakouts)
                                     temporal-breakouts
                                     [{:temporal-field-id nil
                                       :temporal-unit     nil}])]
                      (merge base temporal))))
          (or (lib/aggregations query stage-number) []))))

(defn- breakout-owner
  [query stage-number breakout]
  (or (when-let [info (field-ref-info breakout)]
        (owner-for-field-ref query stage-number breakout info))
      (some-> breakout
              (clause-field-refs query stage-number)
              first
              :owner)))

(defn- dimension-facts-for-stage
  [query stage-number]
  (into []
        (keep (fn [breakout]
                (when-let [field-id (or (:field-id (field-ref-info breakout))
                                        (some-> breakout lib/all-field-ids not-empty first))]
                  (when-let [owner (breakout-owner query stage-number breakout)]
                    (let [binning (lib/binning breakout)
                          serialized-binning (when binning
                                               (canonicalize-for-storage
                                                (cond-> {:strategy (:strategy binning)}
                                                  (:num-bins binning) (assoc :num-bins (:num-bins binning))
                                                  (:bin-width binning) (assoc :bin-width (:bin-width binning)))))]
                      (assoc owner
                             :ownership-mode :direct
                             :field-id       field-id
                             :temporal-unit  (lib/raw-temporal-bucket breakout)
                             :binning        serialized-binning))))))
        (or (lib/breakouts query stage-number) [])))

(defn extract-usage-facts
  "Extract fact-level usage tuples from a normalized MBQL query."
  [query]
  (reduce
   (fn [{:keys [segments metrics dimensions]} stage-number]
     {:segments   (into segments (segment-facts-for-stage query stage-number))
      :metrics    (into metrics (metric-facts-for-stage query stage-number))
      :dimensions (into dimensions (dimension-facts-for-stage query stage-number))})
   {:segments []
    :metrics []
    :dimensions []}
   (range (count (:stages query)))))
