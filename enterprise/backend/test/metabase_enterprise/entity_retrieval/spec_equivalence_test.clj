(ns metabase-enterprise.entity-retrieval.spec-equivalence-test
  "Regression comparison between the pre-refactor membership/document derivation and
  [[metabase.entity-retrieval.spec]].

  The `old-*` functions are a frozen copy of the implementation from
  `metabase-enterprise.entity-retrieval.reconcile` at 428c6be0707, with names and internal references
  adjusted. Do not update them when the new spec changes: a mismatch represents a behavior change that
  must be reviewed.

  These tests use only the application database and do not need a pgvector container.
  Both implementations scan the same database, so the fixture corpus needs to cover relevant branches but
  does not need exclusive ownership of library data."
  (:require
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase-enterprise.entity-retrieval.reconcile :as reconcile]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.spec :as spec]
   [metabase.measures.test-util :as measures.tu]
   [metabase.osi.models.osi-ai-context :as osi-ai-context]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; raw t2/collections.tu access below runs before any auto-initializing mt helper, so the app db must be
;; set up explicitly — on the appdb-mode CI job this namespace can be the first db touch in the JVM
(use-fixtures :once (fixtures/initialize :db :test-users))

;;; ---------------------- Frozen golden oracle (reconcile.clj @ 428c6be0707) — do not edit ----------------------

(defn- old-doc-id [entity-type entity-local-id doc-type doc-text]
  (u/encode-base64-bytes
   (buddy-hash/sha1 (str entity-type "|" entity-local-id "|" doc-type "|" doc-text))))

(def ^:private old-max-doc-chars 8000)

(def ^:private old-max-values-per-kind 50)

(defn- old-make-doc [entity-type entity-local-id doc-type doc-text]
  (let [doc-text (cond-> doc-text
                   (and (string? doc-text) (> (count doc-text) old-max-doc-chars)) (subs 0 old-max-doc-chars))]
    {:doc_id          (old-doc-id entity-type entity-local-id doc-type doc-text)
     :entity_type     entity-type
     :entity_local_id entity-local-id
     :doc_type        doc-type
     :doc_text        doc-text}))

(defn- old-entity->docs
  [{:keys [entity_type entity_local_id name description]} ai_context]
  (let [doc #(old-make-doc entity_type entity_local_id %1 %2)]
    (concat
     [(doc "name" name)]
     (when-not (str/blank? description) [(doc "description" description)])
     (map #(doc "synonym" %) (take old-max-values-per-kind (remove str/blank? (:synonyms ai_context))))
     (map #(doc "example" %) (take old-max-values-per-kind (remove str/blank? (:examples ai_context)))))))

(defn- old->library-entity [entity-type id nm description]
  {:entity_type     entity-type
   :entity_local_id id
   :name            nm
   :description     description})

(defn- old-library-ids [lib]
  (vec (distinct (cons (:id lib) (collections/descendant-ids lib)))))

(defn- old-library-cards [lib-ids id]
  (->> (apply t2/select [:model/Card :id :name :description :type :card_schema]
              (cond-> [:collection_id [:in lib-ids], :archived false, :type [:in ["metric" "model"]]]
                id (conj :id id)))
       (map (fn [c] (old->library-entity (name (:type c)) (:id c) (:name c) (:description c))))))

(defn- old-library-tables [lib-ids id]
  (->> (apply t2/select [:model/Table :id :name :display_name :description]
              (cond-> [:collection_id [:in lib-ids], :is_published true, :active true]
                id (conj :id id)))
       (map (fn [t] (old->library-entity "table" (:id t) (or (:display_name t) (:name t)) (:description t))))))

(defn- old-library-measures [table-ids id]
  (->> (apply t2/select [:model/Measure :id :name :description]
              (cond-> [:table_id [:in table-ids], :archived false]
                id (conj :id id)))
       (map (fn [mv] (old->library-entity "measure" (:id mv) (:name mv) (:description mv))))))

(defn- old-library-segments [table-ids id]
  (->> (apply t2/select [:model/Segment :id :name :description]
              (cond-> [:table_id [:in table-ids], :archived false]
                id (conj :id id)))
       (map (fn [s] (old->library-entity "segment" (:id s) (:name s) (:description s))))))

(defn- old-library-entities []
  (when-let [lib (collections/library-collection)]
    (let [lib-ids   (old-library-ids lib)
          cards     (old-library-cards lib-ids nil)
          tables    (old-library-tables lib-ids nil)
          table-ids (not-empty (mapv :entity_local_id tables))
          measures  (when table-ids (old-library-measures table-ids nil))
          segments  (when table-ids (old-library-segments table-ids nil))]
      (concat cards tables measures segments))))

(defn- old-library-entity [entity-type entity-local-id]
  (when-let [lib (collections/library-collection)]
    (let [lib-ids (old-library-ids lib)]
      (cond
        (entity-retrieval/card-entity-type? entity-type)
        (first (old-library-cards lib-ids entity-local-id))

        (= "table" entity-type)
        (first (old-library-tables lib-ids entity-local-id))

        (#{"measure" "segment"} entity-type)
        (when-let [table-id (t2/select-one-fn :table_id
                                              (if (= entity-type "measure") :model/Measure :model/Segment)
                                              :id entity-local-id)]
          (when (seq (old-library-tables lib-ids table-id))
            (first (if (= entity-type "measure")
                     (old-library-measures [table-id] entity-local-id)
                     (old-library-segments [table-id] entity-local-id)))))

        :else nil))))

(defn- old-entity-class [{:keys [entity_type entity_local_id]}]
  (entity-retrieval/entity-class entity_type entity_local_id))

(defn- old-ai-context-by-entity []
  (u/index-by old-entity-class :ai_context
              (t2/select [:model/OsiAiContext :entity_type :entity_local_id :ai_context])))

(defn- old-dedup-by-doc-id [docs]
  (into [] (m/distinct-by :doc_id) docs))

(defn- old-desired-docs []
  (let [ac-by-entity (old-ai-context-by-entity)]
    (old-dedup-by-doc-id
     (mapcat (fn [ent] (old-entity->docs ent (get ac-by-entity (old-entity-class ent))))
             (old-library-entities)))))

(defn- old-entity-desired-docs [entity-type entity-local-id]
  (if-let [member (old-library-entity entity-type entity-local-id)]
    (let [ai-ctx (t2/select-one-fn :ai_context :model/OsiAiContext
                                   :entity_local_id entity-local-id
                                   :entity_type (entity-retrieval/normalize-entity-type entity-type))]
      (old-dedup-by-doc-id (old-entity->docs member ai-ctx)))
    []))

;;; ----------------------------------------------- Fixture corpus ------------------------------------------------

(defn- do-with-corpus!
  "Build the fixture corpus and call `f` with `{:members {entity-type [id ...]}, :non-members {...}}`.
  Every membership branch is exercised: each entity type has at least one member and one non-member, each
  exclusion reason (unpublished / inactive / outside the library / archived / question-typed / on a
  non-member table) appears, and the `osi_ai_context` rows cover the doc-derivation edges (caps, blanks,
  duplicates, a synonym equal to the name, instructions, a row for a non-member).
  `:library-retrieval` is deliberately not enabled, so a targeted reconcile nudge no-ops instead of racing
  this fixture in the background."
  [f]
  (mt/with-premium-features #{:library}
    ;; Some fixtures intentionally bypass placement and ai_context write validation to represent legacy,
    ;; SerDes, and direct-appdb rows. The corpus exercises read-side membership and projection behavior;
    ;; write validation itself is outside this test.
    (mt/with-dynamic-fn-redefs [collection/check-allowed-content   (constantly true)
                                osi-ai-context/validate-ai-context! identity]
      (collections.tu/with-library [{data :data, metrics :metrics}]
        (mt/with-temp [:model/Collection {outside-coll :id}   {}
                       :model/Database   {db-id :id}          {}
                       :model/Table      {pub-table :id}      {:db_id        db-id
                                                               :collection_id (:id data)
                                                               :is_published true
                                                               :active       true
                                                               :name         "corpus_orders"
                                                               :display_name "Corpus Orders"
                                                               :description  "All corpus orders"}
                       :model/Table      {unpub-table :id}    {:db_id        db-id
                                                               :collection_id (:id data)
                                                               :is_published false
                                                               :active       true
                                                               :name         "corpus_unpublished"}
                       :model/Table      {inactive-table :id} {:db_id        db-id
                                                               :collection_id (:id data)
                                                               :is_published true
                                                               :active       false
                                                               :name         "corpus_inactive"}
                       :model/Table      {outside-table :id}  {:db_id        db-id
                                                               :collection_id outside-coll
                                                               :is_published true
                                                               :active       true
                                                               :name         "corpus_outside"}
                       :model/Card       {metric-card :id}    {:type          "metric"
                                                               :collection_id (:id metrics)
                                                               :name          "Corpus Revenue"
                                                               :description   "corpus revenue"
                                                               :database_id   db-id}
                       :model/Card       {model-card :id}     {:type          "model"
                                                               :collection_id (:id metrics)
                                                               :name          "Corpus Model"
                                                               :database_id   db-id}
                       :model/Card       {question-card :id}  {:type          "question"
                                                               :collection_id (:id metrics)
                                                               :name          "Corpus Question"
                                                               :database_id   db-id}
                       :model/Card       {archived-card :id}  {:type          "metric"
                                                               :collection_id (:id metrics)
                                                               :archived      true
                                                               :name          "Corpus Archived"
                                                               :database_id   db-id}
                       :model/Card       {outside-card :id}   {:type          "metric"
                                                               :collection_id outside-coll
                                                               :name          "Corpus Outside Metric"
                                                               :database_id   db-id}]
          ;; Measures/segments ride real fixture tables: definitions need real fields, and table_id is
          ;; re-derived from the definition by before-insert. `orders` is published into the library for the
          ;; duration; `venues` stays out of it, so its measure/segment exercise the non-member-parent branch.
          (let [orders (mt/id :orders)
                total  (mt/id :orders :total)
                venues (mt/id :venues)
                price  (mt/id :venues :price)]
            (mt/with-temp-vals-in-db :model/Table orders {:collection_id (:id data), :is_published true}
              (mt/with-temp [:model/Measure {live-measure :id}      {:name        "Corpus Order Revenue"
                                                                     :description "sum of totals"
                                                                     :table_id    orders
                                                                     :creator_id  (mt/user->id :crowberto)
                                                                     :definition  (measures.tu/measure-definition orders total)}
                             :model/Measure {archived-measure :id}  {:name       "Corpus Archived Measure"
                                                                     :archived   true
                                                                     :table_id   orders
                                                                     :creator_id (mt/user->id :crowberto)
                                                                     :definition (measures.tu/measure-definition orders total)}
                             :model/Measure {nonmember-measure :id} {:name       "Corpus Nonmember Measure"
                                                                     :table_id   venues
                                                                     :creator_id (mt/user->id :crowberto)
                                                                     :definition (measures.tu/measure-definition venues price)}
                             :model/Segment {live-segment :id}      {:name        "Corpus Big Orders"
                                                                     :description "totals over 100"
                                                                     :table_id    orders
                                                                     :definition  (measures.tu/segment-definition orders total 100)}
                             :model/Segment {archived-segment :id}  {:name       "Corpus Archived Segment"
                                                                     :archived   true
                                                                     :table_id   orders
                                                                     :definition (measures.tu/segment-definition orders total 100)}
                             :model/Segment {nonmember-segment :id} {:name       "Corpus Nonmember Segment"
                                                                     :table_id   venues
                                                                     :definition (measures.tu/segment-definition venues price 10)}
                             ;; doc-derivation edges: over-cap lists, an over-length value, a duplicate, a
                             ;; synonym equal to the label, blanks, instructions.
                             :model/OsiAiContext _ {:entity_type     "table"
                                                    :entity_local_id pub-table
                                                    :ai_context      {:instructions "Group by month."
                                                                      :synonyms     (into ["sales" "sales" "Corpus Orders" "" "  "]
                                                                                          (map #(str "syn-" %))
                                                                                          (range 60))
                                                                      :examples     [(apply str (repeat 9000 \x))
                                                                                     "orders last month"
                                                                                     ""]}}
                             ;; curated while the card is live-typed `metric`; stored under canonical `card`.
                             :model/OsiAiContext _ {:entity_type     "metric"
                                                    :entity_local_id metric-card
                                                    :ai_context      {:synonyms ["turnover"], :examples ["total sales"]}}
                             ;; a row for a non-member entity: derives no docs in either implementation.
                             :model/OsiAiContext _ {:entity_type     "table"
                                                    :entity_local_id unpub-table
                                                    :ai_context      {:synonyms ["ghost"]}}]
                (f {:members     {"table"   [pub-table orders]
                                  "metric"  [metric-card]
                                  "model"   [model-card]
                                  "measure" [live-measure]
                                  "segment" [live-segment]}
                    :non-members {"table"    [unpub-table inactive-table outside-table]
                                  "metric"   [archived-card outside-card]
                                  "question" [question-card]
                                  "measure"  [archived-measure nonmember-measure]
                                  "segment"  [archived-segment nonmember-segment]}})))))))))

(defn- corpus-aliases
  "The entity-type strings a point lookup may be asked with for one corpus entry: every Card flavor plus
  the stored `card` bucket for card-typed entries, the type itself otherwise."
  [entity-type]
  (if (entity-retrieval/card-entity-type? entity-type)
    ["metric" "model" "question" "card"]
    [entity-type]))

;;; ------------------------------------------------- Equivalence -------------------------------------------------

(deftest ^:synchronized membership-equivalence-test
  (do-with-corpus!
   (fn [{:keys [members non-members]}]
     (let [old (set (old-library-entities))
           new (set (map spec/entity-summary (spec/member-entities :library-index)))]
       (testing "full-scan membership and summaries are identical"
         (is (= old new)))
       (testing "the corpus exercises every branch: members present, non-members absent"
         (let [classes (into #{} (map old-entity-class) new)]
           (doseq [[entity-type ids] members
                   id ids]
             (is (contains? classes (entity-retrieval/entity-class entity-type id))
                 (str entity-type " " id)))
           (doseq [[entity-type ids] non-members
                   id ids]
             (is (not (contains? classes (entity-retrieval/entity-class entity-type id)))
                 (str entity-type " " id)))))))))

(deftest ^:synchronized point-membership-equivalence-test
  (do-with-corpus!
   (fn [{:keys [members non-members]}]
     (doseq [[entity-type ids] (concat members non-members)
             id                ids
             alias'            (corpus-aliases entity-type)]
       (testing (str alias' " " id)
         (is (= (old-library-entity alias' id)
                (some-> (spec/member-entity :library-index alias' id) spec/entity-summary))))))))

(deftest ^:synchronized desired-docs-equivalence-test
  (do-with-corpus!
   (fn [_corpus]
     ;; End-to-end comparison of complete document maps, including `doc_id`, against the live refactored
     ;; `desired-docs`; covers membership, hydration, projection, and deduplication together.
     (is (= (set (old-desired-docs))
            (set (:docs (#'reconcile/desired-docs))))))))

(deftest ^:synchronized point-desired-docs-equivalence-test
  (do-with-corpus!
   (fn [{:keys [members non-members]}]
     (doseq [[entity-type ids] (concat members non-members)
             id                ids
             alias'            (corpus-aliases entity-type)]
       (testing (str alias' " " id)
         (is (= (set (old-entity-desired-docs alias' id))
                (set (#'reconcile/entity-desired-docs alias' id)))))))))

(deftest ^:synchronized osi-context-membership-matches-library-index-test
  ;; :osi-context membership is fixed to :library-index's for v1. Entity keys only — the two projections
  ;; hydrate and project differently by design.
  (do-with-corpus!
   (fn [_corpus]
     (is (= (set (map (juxt :entity_type :entity_local_id) (spec/member-entities :library-index)))
            (set (map (juxt :entity_type :entity_local_id) (spec/member-entities :osi-context))))))))
