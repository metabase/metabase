(ns dev.library-generation
  "PoC: LLM agent for automatic library generation (BOT-1787).

   An offline proof-of-concept that:
   1. Assembles structured context about every candidate entity in a database
      (same underlying signals as a deterministic classifier, plus agent-only
      inputs: descriptions, semantic similarity, natural-language comments).
   2. Sends batched context to an LLM with a task-framing prompt.
   3. Collects the agent's curation decisions into a candidate library.
   4. Evaluates precision/recall against a hand-curated benchmark.

   Designed to be driven from the REPL against a running instance (e.g. Stats).
   No UI, no background job, no production paths.

   ## Quick start (REPL)

       (require '[dev.library-generation :as libgen])

       ;; 1. Gather candidate entities for a database
       (def candidates (libgen/gather-candidates {:database-id 1}))

       ;; 2. Run the agent to produce a candidate library
       (def result (libgen/generate-library! {:candidates candidates}))

       ;; 3. Evaluate against the existing hand-curated library
       (libgen/evaluate result {:database-id 1})
  "
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.curation :as curation]
   [metabase.metabot.self :as self]
   [metabase.models.interface :as mi]
   [metabase.request.core :as request]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Configuration -------------------------------------------------

(def ^:dynamic *model*
  "LLM model to use for library generation. Override for cost/quality tradeoffs."
  "claude-sonnet-4-20250514")

(def ^:dynamic *batch-size*
  "Number of entities to present to the LLM per prompt call.
   Larger batches give more context for relative comparison but risk token limits."
  30)

(def ^:dynamic *temperature*
  "LLM temperature. Lower = more conservative selections."
  0.2)

;;; -------------------------------------------- Signal Gathering --------------------------------------------------

(defn- table-signals
  "Fetch signal data for all visible tables in a database."
  [database-id]
  (t2/select :model/Table
             {:select [:t.id :t.name :t.schema :t.description
                       :t.view_count :t.is_published :t.data_layer
                       :t.data_authority :t.initial_sync_status]
              :from   [[:metabase_table :t]]
              :where  [:and
                       [:= :t.db_id database-id]
                       [:= :t.active true]
                       [:!= :t.visibility_type "hidden"]
                       [:= :t.initial_sync_status "complete"]]}))

(defn- card-signals
  "Fetch signal data for all cards (questions, models, metrics) backed by a database."
  [database-id]
  (t2/select :model/Card
             {:select [:c.id :c.name :c.description :c.type
                       :c.view_count :c.collection_id
                       [:coll.name :collection_name]
                       [:coll.authority_level :collection_authority]
                       [:coll.type :collection_type]
                       [:mr.status :verification_status]]
              :from   [[:report_card :c]]
              :left-join [[:collection :coll] [:= :c.collection_id :coll.id]
                          [:moderation_review :mr] [:and
                                                    [:= :mr.moderated_item_id :c.id]
                                                    [:= :mr.moderated_item_type "card"]
                                                    [:= :mr.most_recent true]]]
              :where  [:and
                       [:= :c.database_id database-id]
                       [:= :c.archived false]
                       [:not= :c.type "question"]]}))

(defn- dashboard-signals
  "Fetch signal data for dashboards that reference entities in a database."
  [database-id]
  (t2/select :model/Dashboard
             {:select-distinct [:d.id :d.name :d.description
                                :d.view_count :d.collection_id
                                [:coll.name :collection_name]
                                [:coll.authority_level :collection_authority]
                                [:coll.type :collection_type]
                                [:mr.status :verification_status]]
              :from   [[:report_dashboard :d]]
              :join   [[:report_dashboardcard :dc] [:= :dc.dashboard_id :d.id]
                       [:report_card :c] [:= :dc.card_id :c.id]]
              :left-join [[:collection :coll] [:= :d.collection_id :coll.id]
                          [:moderation_review :mr] [:and
                                                    [:= :mr.moderated_item_id :d.id]
                                                    [:= :mr.moderated_item_type "dashboard"]
                                                    [:= :mr.most_recent true]]]
              :where  [:and
                       [:= :c.database_id database-id]
                       [:= :d.archived false]]}))

(defn- table-column-comments
  "Fetch human-readable column descriptions/comments for tables."
  [table-ids]
  (when (seq table-ids)
    (->> (t2/select :model/Field
                    {:select [:f.table_id :f.name :f.description :f.semantic_type]
                     :from   [[:metabase_field :f]]
                     :where  [:and
                              [:in :f.table_id table-ids]
                              [:= :f.active true]
                              [:not= :f.description nil]]})
         (group-by :table_id))))

(defn- reference-counts
  "Count how many cards reference each table (fan-in as a proxy for importance)."
  [database-id]
  (->> (t2/query {:select   [[:c.table_id :table_id]
                              [[:count :c.id] :ref_count]]
                  :from     [[:report_card :c]]
                  :where    [:and
                             [:= :c.database_id database-id]
                             [:= :c.archived false]
                             [:not= :c.table_id nil]]
                  :group-by [:c.table_id]})
       (into {} (map (juxt :table_id :ref_count)))))

(defn- dashboard-card-counts
  "Count how many dashboards each card appears on."
  [card-ids]
  (when (seq card-ids)
    (->> (t2/query {:select   [[:dc.card_id :card_id]
                                [[:count-distinct :dc.dashboard_id] :dash_count]]
                    :from     [[:report_dashboardcard :dc]]
                    :where    [:in :dc.card_id card-ids]
                    :group-by [:dc.card_id]})
         (into {} (map (juxt :card_id :dash_count))))))

;;; ------------------------------------------ Context Assembly ----------------------------------------------------

(defn- schema-tier
  "Classify a schema name into a quality tier based on naming conventions."
  [schema-name]
  (let [s (some-> schema-name str/lower-case)]
    (cond
      (nil? s)                                    :unknown
      (re-find #"(?i)(mart|reporting|analytics|final|public)" s)  :reporting
      (re-find #"(?i)(staging|stg|intermediate|int)" s)          :staging
      (re-find #"(?i)(raw|source|landing|ingestion)" s)          :raw
      :else                                       :other)))

(defn- entity->context
  "Build a structured context map for a single entity, combining all signals."
  [entity {:keys [column-comments ref-counts dash-counts]}]
  (let [entity-type (cond
                      (:schema entity)        :table
                      (:type entity)          :card
                      (:collection_id entity) :dashboard
                      :else                   :unknown)]
    (merge
     {:id          (:id entity)
      :entity_type entity-type
      :name        (:name entity)
      :description (:description entity)}
     (case entity-type
       :table
       {:schema           (:schema entity)
        :schema_tier      (schema-tier (:schema entity))
        :view_count       (:view_count entity)
        :is_published     (:is_published entity)
        :data_layer       (:data_layer entity)
        :data_authority   (:data_authority entity)
        :reference_count  (get ref-counts (:id entity) 0)
        :column_comments  (when-let [cols (get column-comments (:id entity))]
                            (mapv #(select-keys % [:name :description :semantic_type]) cols))}

       :card
       {:card_type              (:type entity)
        :view_count             (:view_count entity)
        :collection_name        (:collection_name entity)
        :collection_authority   (:collection_authority entity)
        :collection_type        (:collection_type entity)
        :verified               (= "verified" (:verification_status entity))
        :dashboard_appearances  (get dash-counts (:id entity) 0)}

       :dashboard
       {:view_count             (:view_count entity)
        :collection_name        (:collection_name entity)
        :collection_authority   (:collection_authority entity)
        :collection_type        (:collection_type entity)
        :verified               (= "verified" (:verification_status entity))}

       {}))))

;;; ----------------------------------------- Public: Gather Candidates -------------------------------------------

(defn gather-candidates
  "Assemble structured context for all candidate entities in a database.

   Options:
     :database-id  — required, the database to scan
     :include-questions? — if true, also include saved questions (default: false, only models/metrics)

   Returns a seq of context maps ready to be passed to the LLM."
  [{:keys [database-id include-questions?]}]
  {:pre [(pos-int? database-id)]}
  (log/infof "Gathering candidates for database %d..." database-id)
  (let [tables     (table-signals database-id)
        cards      (card-signals database-id)
        dashboards (dashboard-signals database-id)
        ;; Enrichment lookups
        table-ids  (mapv :id tables)
        card-ids   (mapv :id cards)
        col-comments (table-column-comments table-ids)
        ref-counts   (reference-counts database-id)
        dash-counts  (dashboard-card-counts card-ids)
        enrichment   {:column-comments col-comments
                      :ref-counts      ref-counts
                      :dash-counts     dash-counts}]
    (log/infof "Found %d tables, %d cards, %d dashboards"
               (count tables) (count cards) (count dashboards))
    (let [all-entities (concat tables
                               (if include-questions?
                                 cards
                                 (filter #(#{"model" "metric"} (:type %)) cards))
                               dashboards)]
      (mapv #(entity->context % enrichment) all-entities))))

;;; ------------------------------------------------ Prompt --------------------------------------------------------

(def ^:private system-prompt
  "You are a data curation expert. Your task is to evaluate a batch of data entities
from an analytics platform and decide which ones should be included in the curated
\"Library\" — a hand-picked collection of the most important, reliable, and useful
entities that data consumers should discover and use.

## What makes a good Library entity

A Library entity is one that:
- Represents a well-defined, commonly-needed business concept (revenue, users, orders, etc.)
- Is actively used (high view counts, referenced by many other entities)
- Lives in a reporting/mart layer rather than raw/staging
- Has clear naming and descriptions that communicate its purpose
- Is a model or metric (these are purpose-built for reuse), or a carefully curated table
- Has been verified or lives in an official/curated collection (existing trust signals)

## What should NOT be in the Library

Exclude entities that are:
- Raw/staging tables (unless they are the only source for an important concept)
- One-off analyses or ad-hoc questions
- Duplicates or near-duplicates of better alternatives
- Poorly named or undescribed entities with unclear purpose
- Unused or rarely-viewed entities with no references
- Internal/system tables (migrations, logs, schema metadata)

## Your task

For each entity in the batch below, decide: INCLUDE or EXCLUDE.

Return your decisions as a JSON array of objects, one per entity, with exactly these fields:
- \"id\": the entity's id (integer)
- \"entity_type\": the entity's type (\"table\", \"card\", or \"dashboard\")
- \"decision\": \"include\" or \"exclude\"
- \"confidence\": a number 0-100 indicating how confident you are
- \"reason\": a brief (1 sentence) explanation

Return ONLY the JSON array, no other text.")

(defn- format-entity-for-prompt
  "Format a single entity context map into a human-readable block for the prompt."
  [entity]
  (let [lines (cond-> [(format "### %s (id=%d, type=%s)"
                               (:name entity) (:id entity) (name (:entity_type entity)))]
                (:description entity)
                (conj (format "  Description: %s" (:description entity)))

                (:schema entity)
                (conj (format "  Schema: %s (tier: %s)" (:schema entity) (name (:schema_tier entity))))

                (:card_type entity)
                (conj (format "  Card type: %s" (:card_type entity)))

                (:view_count entity)
                (conj (format "  View count: %d" (:view_count entity)))

                (:reference_count entity)
                (conj (format "  Referenced by %d cards" (:reference_count entity)))

                (:dashboard_appearances entity)
                (conj (format "  Appears on %d dashboards" (:dashboard_appearances entity)))

                (:is_published entity)
                (conj "  Published: yes")

                (:data_layer entity)
                (conj (format "  Data layer: %s" (:data_layer entity)))

                (:data_authority entity)
                (conj (format "  Data authority: %s" (:data_authority entity)))

                (:verified entity)
                (conj "  Verified: yes")

                (:collection_name entity)
                (conj (format "  Collection: %s%s"
                              (:collection_name entity)
                              (if (:collection_authority entity)
                                (str " [" (:collection_authority entity) "]")
                                "")))

                (seq (:column_comments entity))
                (conj (format "  Documented columns (%d): %s"
                              (count (:column_comments entity))
                              (str/join ", " (map :name (:column_comments entity))))))]
    (str/join "\n" lines)))

(defn- build-user-message
  "Build the user message containing the batch of entities to evaluate."
  [batch]
  (str "## Entities to evaluate\n\n"
       (str/join "\n\n" (map format-entity-for-prompt batch))
       "\n\n---\nReturn your JSON decisions array now."))

;;; ------------------------------------------ LLM Interaction -----------------------------------------------------

(defn- call-llm-for-batch
  "Call the LLM for a single batch of entities and parse the response."
  [batch]
  (let [messages [{:role "user" :content (build-user-message batch)}]
        ;; Use the self/call-llm infrastructure
        response (self/call-llm {:model    *model*
                                 :input    [{:role    "system"
                                             :content system-prompt}
                                            {:role    "user"
                                             :content (build-user-message batch)}]
                                 :tools    []})
        ;; Extract text from the streaming response
        text     (->> response
                      (into [])
                      (keep (fn [part]
                              (when (= :text (:type part))
                                (:text part))))
                      (str/join ""))]
    (try
      (let [;; Strip any markdown fencing the LLM might add
            cleaned (-> text
                        (str/replace #"^```json\s*" "")
                        (str/replace #"\s*```$" "")
                        str/trim)]
        (json/decode cleaned keyword))
      (catch Exception e
        (log/warnf "Failed to parse LLM response for batch: %s" (.getMessage e))
        (log/debugf "Raw response: %s" text)
        ;; Return empty decisions so we can continue
        []))))

;;; ----------------------------------------- Public: Generate Library --------------------------------------------

(defn generate-library!
  "Run the LLM agent over candidates to produce a candidate library.

   Options:
     :candidates  — seq of context maps (from gather-candidates)
     :batch-size  — override *batch-size*
     :model       — override *model*

   Returns:
     {:decisions   [...]   ;; all individual decisions
      :included    [...]   ;; entities the agent selected for the library
      :excluded    [...]   ;; entities the agent excluded
      :stats       {...}   ;; summary statistics
      :errors      [...]}  ;; any batches that failed to parse"
  [{:keys [candidates batch-size model]
    :or   {batch-size *batch-size*
           model      *model*}}]
  {:pre [(seq candidates)]}
  (log/infof "Generating library from %d candidates (batch-size=%d, model=%s)"
             (count candidates) batch-size model)
  (binding [*model* model
            *batch-size* batch-size]
    (let [batches    (partition-all batch-size candidates)
          n-batches  (count batches)
          results    (atom {:decisions [] :errors []})
          start-time (System/currentTimeMillis)]
      (doseq [[i batch] (map-indexed vector batches)]
        (log/infof "Processing batch %d/%d (%d entities)..."
                   (inc i) n-batches (count batch))
        (let [decisions (call-llm-for-batch batch)]
          (if (seq decisions)
            (swap! results update :decisions into decisions)
            (swap! results update :errors conj {:batch-index i
                                                :entity-ids  (mapv :id batch)}))))
      (let [{:keys [decisions errors]} @results
            included (filterv #(= "include" (:decision %)) decisions)
            excluded (filterv #(= "exclude" (:decision %)) decisions)
            elapsed  (- (System/currentTimeMillis) start-time)]
        (log/infof "Done in %.1fs. Included: %d, Excluded: %d, Errors: %d batches"
                   (/ elapsed 1000.0) (count included) (count excluded) (count errors))
        {:decisions decisions
         :included  included
         :excluded  excluded
         :stats     {:total-candidates  (count candidates)
                     :included-count    (count included)
                     :excluded-count    (count excluded)
                     :inclusion-rate    (when (pos? (count decisions))
                                          (double (/ (count included) (count decisions))))
                     :avg-confidence    (when (seq decisions)
                                          (double (/ (reduce + (map :confidence decisions))
                                                     (count decisions))))
                     :elapsed-ms        elapsed
                     :batches-processed n-batches
                     :error-batches     (count errors)}
         :errors    errors}))))

;;; ----------------------------------------- Public: Evaluate -----------------------------------------------------

(defn- current-library-entity-ids
  "Get the set of currently-curated entity [type id] pairs for a database.
   Uses the same curation predicate as the production system."
  [database-id]
  (let [tables     (table-signals database-id)
        cards      (card-signals database-id)
        dashboards (dashboard-signals database-id)
        curated-tables (->> tables
                            (filter (fn [t]
                                      (curation/curated?
                                       {:is_published       (:is_published t)
                                        :data_layer         (:data_layer t)
                                        :data_authority     (:data_authority t)
                                        :model              "table"})))
                            (map (fn [t] [:table (:id t)])))
        curated-cards (->> cards
                           (filter (fn [c]
                                     (curation/curated?
                                      {:verified            (= "verified" (:verification_status c))
                                       :official_collection (= "official" (:collection_authority c))
                                       :root_collection_type (:collection_type c)
                                       :model              (:type c)})))
                           (map (fn [c] [:card (:id c)])))
        curated-dashboards (->> dashboards
                                (filter (fn [d]
                                          (curation/curated?
                                           {:verified            (= "verified" (:verification_status d))
                                            :official_collection (= "official" (:collection_authority d))
                                            :root_collection_type (:collection_type d)
                                            :model              "dashboard"})))
                                (map (fn [d] [:dashboard (:id d)])))]
    (set (concat curated-tables curated-cards curated-dashboards))))

(defn evaluate
  "Evaluate a generate-library! result against the current hand-curated library.

   Returns precision, recall, F1, and characterizes failure modes.

   Arguments:
     result       — the map returned by generate-library!
     opts         — {:database-id N} to identify the benchmark library"
  [result {:keys [database-id]}]
  {:pre [(pos-int? database-id) (map? result)]}
  (let [benchmark     (current-library-entity-ids database-id)
        agent-set     (->> (:included result)
                           (map (fn [d] [(keyword (:entity_type d)) (:id d)]))
                           set)
        true-pos      (count (filter agent-set benchmark))
        false-pos     (count (remove benchmark agent-set))
        false-neg     (count (remove agent-set benchmark))
        precision     (if (pos? (+ true-pos false-pos))
                        (double (/ true-pos (+ true-pos false-pos)))
                        0.0)
        recall        (if (pos? (+ true-pos false-neg))
                        (double (/ true-pos (+ true-pos false-neg)))
                        0.0)
        f1            (if (pos? (+ precision recall))
                        (/ (* 2 precision recall) (+ precision recall))
                        0.0)
        ;; Characterize failure modes
        false-pos-details (->> (:included result)
                               (remove (fn [d] (benchmark [(keyword (:entity_type d)) (:id d)])))
                               (mapv #(select-keys % [:id :entity_type :reason :confidence])))
        false-neg-details (->> benchmark
                               (remove agent-set)
                               (mapv (fn [[etype id]]
                                       {:id id :entity_type (name etype) :missed true})))]
    {:precision         precision
     :recall            recall
     :f1                f1
     :benchmark-size    (count benchmark)
     :agent-included    (count agent-set)
     :true-positives    true-pos
     :false-positives   false-pos
     :false-negatives   false-neg
     :false-positive-examples (take 10 false-pos-details)
     :false-negative-examples (take 10 false-neg-details)
     :failure-modes
     {:hallucinated-inclusions
      {:count false-pos
       :description "Entities the agent included that are NOT in the benchmark library"}
      :missed-entities
      {:count false-neg
       :description "Benchmark library entities the agent failed to include"}}}))

(defn print-evaluation
  "Pretty-print an evaluation result."
  [eval-result]
  (println "\n=== Library Generation PoC Evaluation ===\n")
  (printf "Benchmark library size: %d\n" (:benchmark-size eval-result))
  (printf "Agent included:         %d\n" (:agent-included eval-result))
  (println)
  (printf "Precision: %.1f%% (%d/%d correct inclusions)\n"
          (* 100 (:precision eval-result))
          (:true-positives eval-result)
          (:agent-included eval-result))
  (printf "Recall:    %.1f%% (%d/%d benchmark entities found)\n"
          (* 100 (:recall eval-result))
          (:true-positives eval-result)
          (:benchmark-size eval-result))
  (printf "F1:        %.1f%%\n" (* 100 (:f1 eval-result)))
  (println)
  (println "--- Failure Modes ---")
  (let [{:keys [hallucinated-inclusions missed-entities]} (:failure-modes eval-result)]
    (printf "Hallucinated inclusions: %d\n" (:count hallucinated-inclusions))
    (printf "Missed entities:         %d\n" (:count missed-entities)))
  (when (seq (:false-positive-examples eval-result))
    (println "\nTop false positives (hallucinated):")
    (pprint/print-table [:id :entity_type :confidence :reason]
                        (:false-positive-examples eval-result)))
  (when (seq (:false-negative-examples eval-result))
    (println "\nTop false negatives (missed):")
    (pprint/print-table [:id :entity_type]
                        (take 5 (:false-negative-examples eval-result))))
  (println))

;;; ----------------------------------------- Convenience ----------------------------------------------------------

(defn run!
  "End-to-end: gather candidates, generate library, evaluate, print results.

   Options:
     :database-id — required
     :user-id     — superuser id to bind for permission checks (default: 1)
     :model       — LLM model override
     :batch-size  — batch size override

   Returns the full result map (decisions + evaluation)."
  [{:keys [database-id user-id model batch-size]
    :or   {user-id 1}}]
  {:pre [(pos-int? database-id)]}
  (request/with-current-user user-id
    (let [candidates (gather-candidates {:database-id database-id})
          result     (generate-library! (cond-> {:candidates candidates}
                                          model      (assoc :model model)
                                          batch-size (assoc :batch-size batch-size)))
          evaluation (evaluate result {:database-id database-id})]
      (print-evaluation evaluation)
      (assoc result :evaluation evaluation))))
