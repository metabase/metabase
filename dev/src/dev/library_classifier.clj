(ns dev.library-classifier
  "PoC deterministic classifier for automatic library generation.

   Computes a composite score over multiple signals to rank entities (cards, tables)
   as candidates for library inclusion. Designed to be run from the REPL against
   a live instance (e.g. Stats) and compared against the hand-curated library.

   ## Signals
   - Dependency centrality (upstream/downstream fan-in/fan-out via FK remapping)
   - Reference frequency (dashboardcard count for cards, FK references for tables)
   - View/usage frequency (view_count)
   - Metabot selection frequency (metabot_used_table count)
   - Schema tier (data_layer, data_authority)
   - Existing curation signals (verified, official collection, published)

   ## Usage
   ```clj
   (require '[dev.library-classifier :as lc])

   ;; Run the full classifier and get scored candidates
   (def results (lc/classify-all))

   ;; Compare against the current library
   (lc/evaluate results)

   ;; Print a summary report
   (lc/report results)
   ```"
  (:require
   [clojure.set :as set]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Configuration --------------------------------------------------

(def ^:dynamic *weights*
  "Weights for each signal in the composite score. Tunable for experimentation."
  {:dependency-centrality   0.20
   :reference-frequency     0.20
   :view-frequency          0.25
   :metabot-selection       0.15
   :schema-tier             0.10
   :curation-signals        0.10})

(def ^:dynamic *inclusion-threshold*
  "Minimum normalized score (0-1) for an entity to be considered a library candidate.
   Entities scoring above this threshold are included in the candidate library."
  0.25)

(def ^:dynamic *top-k*
  "Maximum number of entities to include in the candidate library, as a fallback
   when the threshold produces too many results."
  100)

;;; ------------------------------------------------ Signal Queries --------------------------------------------------

(defn- fetch-tables
  "Fetch all active, non-hidden tables with their metadata."
  []
  (t2/select [:model/Table :id :name :display_name :db_id :schema
              :is_published :data_layer :data_authority :view_count :active]
             :active true
             {:where [:or
                      [:= :data_layer nil]
                      [:!= :data_layer "hidden"]]}))

(defn- fetch-cards
  "Fetch all non-archived cards (models and metrics) with their metadata."
  []
  (t2/select [:model/Card :id :name :description :type :collection_id :view_count :archived]
             :archived false
             :type [:in ["model" "metric"]]))

(defn- fetch-dashboard-card-counts
  "Get the number of dashboards each card appears on.
   Returns {card-id count}."
  []
  (->> (t2/query {:select   [[:card_id :card-id] [[:count [:distinct :dashboard_id]] :cnt]]
                  :from     [[:report_dashboardcard :dc]]
                  :where    [:!= :card_id nil]
                  :group-by [:card_id]})
       (reduce (fn [m {:keys [card-id cnt]}] (assoc m card-id cnt)) {})))

(defn- fetch-fk-reference-counts
  "Get how many FK relationships reference each table (fan-in via Dimensions).
   Returns {table-id count}."
  []
  (let [;; Count how many dimensions point TO each table (via human_readable_field -> table)
        results (t2/query {:select   [[:t.id :table-id] [[:count :d.id] :cnt]]
                           :from     [[:dimension :d]]
                           :join     [[:metabase_field :f] [:= :d.human_readable_field_id :f.id]
                                      [:metabase_table :t] [:= :f.table_id :t.id]]
                           :where    [:= :d.type "external"]
                           :group-by [:t.id]})]
    (reduce (fn [m {:keys [table-id cnt]}] (assoc m table-id cnt)) {} results)))

(defn- fetch-downstream-counts
  "Get how many tables depend on each table (downstream fan-out via FK remapping).
   Returns {table-id count}."
  []
  (let [results (t2/query {:select   [[:source_t.id :table-id] [[:count [:distinct :target_t.id]] :cnt]]
                           :from     [[:dimension :d]]
                           :join     [[:metabase_field :source_f] [:= :d.field_id :source_f.id]
                                      [:metabase_table :source_t] [:= :source_f.table_id :source_t.id]
                                      [:metabase_field :target_f] [:= :d.human_readable_field_id :target_f.id]
                                      [:metabase_table :target_t] [:= :target_f.table_id :target_t.id]]
                           :where    [:= :d.type "external"]
                           :group-by [:source_t.id]})]
    (reduce (fn [m {:keys [table-id cnt]}] (assoc m table-id cnt)) {} results)))

(defn- fetch-metabot-selection-counts
  "Get how many times Metabot has selected each table.
   Returns {table-id count}."
  []
  (let [results (t2/query {:select   [[:table_id :table-id] [[:count :id] :cnt]]
                           :from     [:metabot_used_table]
                           :group-by [:table_id]})]
    (reduce (fn [m {:keys [table-id cnt]}] (assoc m table-id cnt)) {} results)))

(defn- fetch-collection-info
  "Get collection authority levels and types for card scoring.
   Returns {collection-id {:authority_level ... :type ...}}."
  []
  (->> (t2/select [:model/Collection :id :authority_level :type])
       (reduce (fn [m c] (assoc m (:id c) (select-keys c [:authority_level :type]))) {})))

(defn- fetch-verification-status
  "Get verified status for cards and dashboards.
   Returns #{entity-id} of verified items."
  []
  (->> (t2/query {:select [:moderated_item_id]
                  :from   [:moderation_review]
                  :where  [:and
                           [:= :status "verified"]
                           [:= :most_recent true]]})
       (into #{} (map :moderated_item_id))))

;;; ---------------------------------------------- Signal Computation ------------------------------------------------

(defn- normalize-log
  "Log-normalize a value: log(1 + x) / log(1 + max).
   Returns 0.0 when max is 0."
  [x max-val]
  (if (or (nil? max-val) (zero? max-val))
    0.0
    (/ (Math/log (+ 1.0 (double (or x 0))))
       (Math/log (+ 1.0 (double max-val))))))

(defn- schema-tier-score
  "Score a table based on its data_layer and data_authority.
   - final + authoritative = 1.0
   - final + computed = 0.8
   - final + other = 0.6
   - internal + authoritative = 0.5
   - internal + computed = 0.3
   - other combinations = 0.0"
  [{:keys [data_layer data_authority]}]
  (let [layer (some-> data_layer name)
        auth  (some-> data_authority name)]
    (cond
      (and (= layer "final") (= auth "authoritative")) 1.0
      (and (= layer "final") (= auth "computed"))      0.8
      (= layer "final")                                0.6
      (and (= layer "internal") (= auth "authoritative")) 0.5
      (and (= layer "internal") (= auth "computed"))   0.3
      :else                                            0.0)))

(defn- curation-score
  "Score based on existing curation signals.
   Returns 0.0-1.0 based on verified, official collection, or published status."
  [{:keys [verified? official-collection? is-published? in-library-collection?]}]
  (cond
    in-library-collection? 1.0   ;; Already in library (useful for recall analysis)
    verified?              0.8
    official-collection?   0.6
    is-published?          0.4
    :else                  0.0))

;;; -------------------------------------------- Entity Score Computation -------------------------------------------

(defn- score-table
  "Compute the composite score for a single table."
  [table {:keys [fk-refs downstream metabot-selections max-view-count max-fk max-downstream max-metabot]}]
  (let [dep-centrality (let [fan-in  (normalize-log (get fk-refs (:id table) 0) max-fk)
                             fan-out (normalize-log (get downstream (:id table) 0) max-downstream)]
                         (* 0.5 (+ fan-in fan-out)))
        view-freq      (normalize-log (:view_count table) max-view-count)
        metabot-freq   (normalize-log (get metabot-selections (:id table) 0) max-metabot)
        schema-score   (schema-tier-score table)
        curation       (curation-score {:is-published? (:is_published table)})
        ;; Tables don't have dashboardcard-count directly, use FK refs as reference frequency
        ref-freq       (normalize-log (get fk-refs (:id table) 0) max-fk)]
    {:entity-type :table
     :entity-id   (:id table)
     :name        (or (:display_name table) (:name table))
     :schema      (:schema table)
     :db-id       (:db_id table)
     :score       (+ (* (:dependency-centrality *weights*) dep-centrality)
                     (* (:reference-frequency *weights*) ref-freq)
                     (* (:view-frequency *weights*) view-freq)
                     (* (:metabot-selection *weights*) metabot-freq)
                     (* (:schema-tier *weights*) schema-score)
                     (* (:curation-signals *weights*) curation))
     :signals     {:dependency-centrality dep-centrality
                   :reference-frequency   ref-freq
                   :view-frequency        view-freq
                   :metabot-selection     metabot-freq
                   :schema-tier           schema-score
                   :curation-signals      curation}}))

(defn- score-card
  "Compute the composite score for a single card (model or metric)."
  [card {:keys [dashboard-counts collections verified-ids max-view-count max-dashboard-count]}]
  (let [coll-info     (get collections (:collection_id card))
        verified?     (contains? verified-ids (:id card))
        official?     (= "official" (:authority_level coll-info))
        in-library?   (contains? collection/library-collection-types (:type coll-info))
        dashboard-cnt (get dashboard-counts (:id card) 0)
        view-freq     (normalize-log (:view_count card) max-view-count)
        ref-freq      (normalize-log dashboard-cnt max-dashboard-count)
        curation      (curation-score {:verified? verified?
                                       :official-collection? official?
                                       :in-library-collection? in-library?})]
    {:entity-type :card
     :entity-id   (:id card)
     :name        (:name card)
     :card-type   (:type card)
     :score       (+ (* (:dependency-centrality *weights*) 0.0)  ;; Cards don't have dep centrality yet
                     (* (:reference-frequency *weights*) ref-freq)
                     (* (:view-frequency *weights*) view-freq)
                     (* (:metabot-selection *weights*) 0.0)       ;; Metabot tracks tables, not cards
                     (* (:schema-tier *weights*) 0.0)             ;; No schema tier for cards
                     (* (:curation-signals *weights*) curation))
     :signals     {:dependency-centrality 0.0
                   :reference-frequency   ref-freq
                   :view-frequency        view-freq
                   :metabot-selection     0.0
                   :schema-tier           0.0
                   :curation-signals      curation}}))

;;; -------------------------------------------- Main Classification -------------------------------------------------

(defn classify-all
  "Run the full classifier over all eligible entities.
   Returns a sorted vector of scored entities (highest score first)."
  []
  (let [;; Fetch raw data
        tables              (fetch-tables)
        cards               (fetch-cards)
        dashboard-counts    (fetch-dashboard-card-counts)
        fk-refs             (fetch-fk-reference-counts)
        downstream          (fetch-downstream-counts)
        metabot-selections  (fetch-metabot-selection-counts)
        collections         (fetch-collection-info)
        verified-ids        (fetch-verification-status)

        ;; Compute max values for normalization
        max-table-views     (apply max 1 (map #(or (:view_count %) 0) tables))
        max-card-views      (apply max 1 (map #(or (:view_count %) 0) cards))
        max-fk              (apply max 1 (vals (merge {0 1} fk-refs)))
        max-downstream      (apply max 1 (vals (merge {0 1} downstream)))
        max-metabot         (apply max 1 (vals (merge {0 1} metabot-selections)))
        max-dashboard       (apply max 1 (vals (merge {0 1} dashboard-counts)))

        ;; Score tables
        table-ctx {:fk-refs fk-refs
                   :downstream downstream
                   :metabot-selections metabot-selections
                   :max-view-count max-table-views
                   :max-fk max-fk
                   :max-downstream max-downstream
                   :max-metabot max-metabot}
        scored-tables (mapv #(score-table % table-ctx) tables)

        ;; Score cards
        card-ctx {:dashboard-counts dashboard-counts
                  :collections collections
                  :verified-ids verified-ids
                  :max-view-count max-card-views
                  :max-dashboard-count max-dashboard}
        scored-cards (mapv #(score-card % card-ctx) cards)]

    (->> (concat scored-tables scored-cards)
         (sort-by :score >)
         vec)))

(defn candidate-library
  "Given scored entities, return the candidate library (entities above threshold, capped at top-k)."
  ([scored-entities]
   (candidate-library scored-entities *inclusion-threshold* *top-k*))
  ([scored-entities threshold top-k]
   (->> scored-entities
        (filter #(>= (:score %) threshold))
        (take top-k)
        vec)))

;;; -------------------------------------------- Benchmark Evaluation -----------------------------------------------

(defn- current-library-entities
  "Get the set of [entity-type entity-id] tuples currently in the library."
  []
  (when-let [lib (collection/library-collection)]
    (let [lib-ids (cons (:id lib)
                        (t2/select-pks-set :model/Collection
                                           :location [:like (str (t2/select-one-fn :location :model/Collection :id (:id lib))
                                                                 (:id lib) "/%")]))]
      (if (seq lib-ids)
        (let [cards  (t2/select-pks-set :model/Card
                                        :collection_id [:in lib-ids]
                                        :archived false
                                        :type [:in ["model" "metric"]])
              tables (t2/select-pks-set :model/Table
                                        :is_published true
                                        :active true)]
          (into #{}
                (concat (map (fn [id] [:card id]) cards)
                        (map (fn [id] [:table id]) tables))))
        #{}))))

(defn evaluate
  "Evaluate the candidate library against the current hand-curated library.
   Returns precision, recall, F1, and failure analysis."
  ([scored-entities]
   (evaluate scored-entities *inclusion-threshold* *top-k*))
  ([scored-entities threshold top-k]
   (let [candidates   (candidate-library scored-entities threshold top-k)
         candidate-set (into #{} (map (fn [{:keys [entity-type entity-id]}]
                                        [entity-type entity-id])
                                      candidates))
         benchmark    (current-library-entities)
         true-pos     (count (set/intersection candidate-set benchmark))
         false-pos    (count (set/difference candidate-set benchmark))
         false-neg    (count (set/difference benchmark candidate-set))
         precision    (if (pos? (+ true-pos false-pos))
                        (double (/ true-pos (+ true-pos false-pos)))
                        0.0)
         recall       (if (pos? (+ true-pos false-neg))
                        (double (/ true-pos (+ true-pos false-neg)))
                        0.0)
         f1           (if (pos? (+ precision recall))
                        (/ (* 2 precision recall) (+ precision recall))
                        0.0)]
     {:precision   precision
      :recall      recall
      :f1          f1
      :true-positives  true-pos
      :false-positives false-pos
      :false-negatives false-neg
      :candidate-count (count candidates)
      :benchmark-count (count benchmark)})))

(defn failure-analysis
  "Characterize failure modes: what the classifier missed (false negatives)
   and what it incorrectly included (false positives)."
  ([scored-entities]
   (failure-analysis scored-entities *inclusion-threshold* *top-k*))
  ([scored-entities threshold top-k]
   (let [candidates    (candidate-library scored-entities threshold top-k)
         candidate-set (into #{} (map (fn [{:keys [entity-type entity-id]}]
                                        [entity-type entity-id])
                                      candidates))
         scored-map    (into {} (map (fn [e] [[(:entity-type e) (:entity-id e)] e]) scored-entities))
         benchmark     (current-library-entities)
         false-negs    (->> (set/difference benchmark candidate-set)
                            (map (fn [k] (or (get scored-map k)
                                            {:entity-type (first k) :entity-id (second k)
                                             :score 0.0 :name "unknown" :signals {}})))
                            (sort-by :score >)
                            vec)
         false-pos     (->> (set/difference candidate-set benchmark)
                            (map #(get scored-map %))
                            (filter some?)
                            (sort-by :score >)
                            vec)]
     {:false-negatives {:count (count false-negs)
                        :top-10 (take 10 false-negs)
                        :signal-summary (when (seq false-negs)
                                          {:avg-score (/ (reduce + (map :score false-negs))
                                                        (count false-negs))})}
      :false-positives {:count (count false-pos)
                        :top-10 (take 10 false-pos)
                        :signal-summary (when (seq false-pos)
                                          {:avg-score (/ (reduce + (map :score false-pos))
                                                        (count false-pos))})}})))

;;; -------------------------------------------------- Reporting -----------------------------------------------------

(defn report
  "Print a human-readable report of classifier results."
  [scored-entities]
  (let [candidates (candidate-library scored-entities)
        eval-result (evaluate scored-entities)
        failures (failure-analysis scored-entities)]
    (println "=" (apply str (repeat 70 "=")))
    (println "  DETERMINISTIC LIBRARY CLASSIFIER — PoC REPORT")
    (println "=" (apply str (repeat 70 "=")))
    (println)
    (println "## Configuration")
    (printf "  Weights:   %s%n" (pr-str *weights*))
    (printf "  Threshold: %.2f%n" *inclusion-threshold*)
    (printf "  Top-K:     %d%n" *top-k*)
    (println)
    (println "## Results")
    (printf "  Total entities scored:    %d%n" (count scored-entities))
    (printf "  Candidates (above threshold): %d%n" (count candidates))
    (printf "  Benchmark library size:   %d%n" (:benchmark-count eval-result))
    (println)
    (println "## Evaluation Metrics")
    (printf "  Precision: %.3f%n" (:precision eval-result))
    (printf "  Recall:    %.3f%n" (:recall eval-result))
    (printf "  F1 Score:  %.3f%n" (:f1 eval-result))
    (printf "  True Positives:  %d%n" (:true-positives eval-result))
    (printf "  False Positives: %d%n" (:false-positives eval-result))
    (printf "  False Negatives: %d%n" (:false-negatives eval-result))
    (println)
    (println "## Top 20 Candidates")
    (doseq [{:keys [entity-type entity-id name score card-type schema]} (take 20 candidates)]
      (printf "  [%.3f] %-6s #%-5d %-40s %s%n"
              score (clojure.core/name entity-type) entity-id
              (str (subs (str name) 0 (min 40 (count (str name)))))
              (or card-type schema "")))
    (println)
    (println "## Failure Modes")
    (println)
    (println "### False Negatives (in library but classifier missed)")
    (printf "  Count: %d%n" (get-in failures [:false-negatives :count]))
    (when-let [avg (get-in failures [:false-negatives :signal-summary :avg-score])]
      (printf "  Avg score of missed items: %.3f%n" (double avg)))
    (println "  Top missed items:")
    (doseq [{:keys [entity-type entity-id name score]} (get-in failures [:false-negatives :top-10])]
      (printf "    [%.3f] %-6s #%-5d %s%n" (double score) (clojure.core/name entity-type) entity-id (str name)))
    (println)
    (println "### False Positives (classifier included but not in library)")
    (printf "  Count: %d%n" (get-in failures [:false-positives :count]))
    (when-let [avg (get-in failures [:false-positives :signal-summary :avg-score])]
      (printf "  Avg score of extra items: %.3f%n" (double avg)))
    (println "  Top extra items:")
    (doseq [{:keys [entity-type entity-id name score]} (get-in failures [:false-positives :top-10])]
      (printf "    [%.3f] %-6s #%-5d %s%n" (double score) (clojure.core/name entity-type) entity-id (str name)))
    (println)
    (println "=" (apply str (repeat 70 "=")))))

(defn sweep-thresholds
  "Run the classifier at multiple thresholds to find the optimal operating point.
   Returns a vector of {threshold, precision, recall, f1, candidate-count}."
  [scored-entities]
  (let [thresholds (range 0.05 0.95 0.05)]
    (mapv (fn [t]
            (let [eval-result (evaluate scored-entities t *top-k*)]
              (assoc eval-result :threshold t)))
          thresholds)))

(defn print-threshold-sweep
  "Print a table of threshold sweep results."
  [scored-entities]
  (let [results (sweep-thresholds scored-entities)]
    (println "Threshold | Precision | Recall | F1     | Candidates | Benchmark")
    (println "----------|-----------|--------|--------|------------|----------")
    (doseq [{:keys [threshold precision recall f1 candidate-count benchmark-count]} results]
      (printf "  %.2f    |   %.3f   | %.3f  | %.3f  |    %4d    |   %4d%n"
              threshold precision recall f1 candidate-count benchmark-count))))
