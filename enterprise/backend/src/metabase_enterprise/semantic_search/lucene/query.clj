(ns metabase-enterprise.semantic-search.lucene.query
  "Read path for the Lucene semantic search backend.

  Two arms answer every query: kNN over this node's Lucene index, and the OSS appdb keyword engine. Their
  rankings are fused with reciprocal rank fusion — the same constants the pgvector arm applies in SQL — so a
  document that only one arm finds still places well, and one both arms like places best."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.appdb-scoring :as appdb-scoring]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.scoring :as semantic.scoring]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.scoring :as search.scoring]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (org.apache.lucene.index StoredFields Term)
   (org.apache.lucene.search BooleanClause$Occur BooleanQuery$Builder IndexSearcher KnnFloatVectorQuery
                             MatchAllDocsQuery MatchNoDocsQuery Query ScoreDoc TermInSetQuery TermQuery TopDocs)
   (org.apache.lucene.util BytesRef)))

(set! *warn-on-reflection* true)

(def ^:private score-floor
  "Lucene cosine score below which a hit does not count as a match.

  Lucene scores cosine similarity as `(1 + cos) / 2`; the pgvector arm cuts at cosine distance `1 - cos <= 0.7`,
  which is the same line.
  https://lucene.apache.org/core/10_5_1/core/org/apache/lucene/index/VectorSimilarityFunction.html"
  0.65)

(def ^:private rrf-k
  "Reciprocal-rank-fusion smoothing constant, matching [[metabase-enterprise.semantic-search.scoring]]."
  60)

(def ^:private keyword-weight 0.51)
(def ^:private semantic-weight 0.49)

;;;; Filters
;;;;
;;;; These mirror the pgvector arm's `filter-conditions`, key for key, so the search debug endpoint reports the
;;;; same filter names whichever backend answered.

(defn- term-query ^Query [^String field value]
  (TermQuery. (Term. field (str value))))

(defn- terms-query ^Query [^String field values]
  (TermInSetQuery. field (mapv #(BytesRef. (str %)) values)))

(defn- any-of ^Query [queries]
  (let [builder (BooleanQuery$Builder.)]
    (doseq [^Query q queries]
      (.add builder q BooleanClause$Occur/SHOULD))
    (.setMinimumNumberShouldMatch builder 1)
    (.build builder)))

(defn- none-of ^Query [^Query q]
  ;; Lucene needs a positive clause: a BooleanQuery of MUST_NOT alone matches nothing.
  (-> (BooleanQuery$Builder.)
      (.add (MatchAllDocsQuery.) BooleanClause$Occur/FILTER)
      (.add q BooleanClause$Occur/MUST_NOT)
      (.build)))

(defn- personal-collection-query
  "The `filter-items-in-personal-collection` clause. See the table in
  [[metabase-enterprise.semantic-search.index]] for what each mode admits."
  ^Query [{:keys [filter-items-in-personal-collection current-user-id]}]
  (let [no-owner (term-query "personal_owner_id" lucene.index/null-owner)]
    (case (or filter-items-in-personal-collection "all")
      "all"            nil
      "only-mine"      (term-query "personal_owner_id" current-user-id)
      "only"           (none-of no-owner)
      "exclude"        no-owner
      "exclude-others" (any-of [no-owner (term-query "personal_owner_id" current-user-id)]))))

(defn- filter-clauses
  "Ordered `[filter-key query]` pairs for the structural filters `search-context` implies."
  [{:keys [archived? verified curated? models created-by last-edited-by table-db-id ids display-type]
    :as search-context}]
  (keep (fn [[k q]] (when q [k q]))
        [[:personal-collection (personal-collection-query search-context)]
         [:archived?           (when (some? archived?) (term-query "archived" (boolean archived?)))]
         [:verified            (when (some? verified) (term-query "verified" verified))]
         [:curated             (when (some? curated?) (term-query "curated" curated?))]
         ;; An empty but present set of models means the other filters left no applicable model, so match
         ;; nothing rather than everything.
         [:models              (cond
                                 (seq models)   (terms-query "model" models)
                                 (some? models) (MatchNoDocsQuery.))]
         [:created-by          (when (seq created-by) (terms-query "creator_id" created-by))]
         [:last-edited-by      (when (seq last-edited-by) (terms-query "last_editor_id" last-edited-by))]
         [:table-db-id         (when table-db-id (term-query "database_id" table-db-id))]
         [:ids                 (when (seq ids) (terms-query "model_id" ids))]
         [:display-type        (when (seq display-type) (terms-query "display_type" display-type))]]))

(defn filter-query
  "The Lucene filter for `search-context`, or nil when it filters nothing."
  ^Query [search-context]
  (when-let [clauses (seq (filter-clauses search-context))]
    (let [builder (BooleanQuery$Builder.)]
      (doseq [[_ ^Query q] clauses]
        (.add builder q BooleanClause$Occur/FILTER))
      (.build builder))))

(defn- date-filtered?
  "Whether `search-context` carries a date filter, which the vector arm cannot express yet.

  The pgvector arm silently ignores these (it reads `:start` off a string), so neither backend narrows by date
  today; here the query falls back to the keyword arm alone, which does apply them."
  [{:keys [created-at last-edited-at]}]
  (boolean (or created-at last-edited-at)))

;;;; The two arms

(defn- hit->row
  "One kNN hit as `{:model :model_id :legacy_input :semantic-rank :semantic-score}`."
  [^StoredFields stored rank ^ScoreDoc hit]
  (let [doc (.document stored (.-doc hit))]
    {:model          (.get doc "model")
     :model_id       (.get doc "model_id")
     :legacy_input   (json/decode+kw (.get doc "legacy_input"))
     :semantic-rank  (inc rank)
     ;; Lucene's cosine score is already the [0 1] "how close is this" score the pgvector arm derives from
     ;; distance as `1 - d/2`.
     :semantic-score (.-score hit)}))

(defn- vector-hits
  "kNN hits for `embedding`, nearest first, cut off at [[score-floor]]."
  [embedding search-context limit]
  (lucene.index/with-searcher [^IndexSearcher searcher]
    (let [query         (KnnFloatVectorQuery. "embedding" embedding (int limit) (filter-query search-context))
          ^TopDocs hits (.search searcher query (int limit))
          stored        (.storedFields searcher)
          matching      (filter #(<= score-floor (.-score ^ScoreDoc %)) (.scoreDocs hits))]
      (vec (map-indexed (partial hit->row stored) matching)))))

(defn- keyword-hits
  "The appdb keyword engine's results for `search-context`, best first, or nil when that arm did not run.

  Degrades rather than failing the search: the vector arm can still answer. The nil is load-bearing -- an empty
  vector means the arm ran and matched nothing, while nil means the caller still owes the user a keyword search
  and should fall back to another engine."
  [search-context limit]
  (if-not (search.engine/supported-engine? :search.engine/appdb)
    (log/debug "Skipping the keyword arm of semantic search: this app DB cannot hold a search index")
    (try
      (into [] (take limit) (search.engine/results (assoc search-context :search-engine :search.engine/appdb)))
      (catch Throwable t
        (log/warnf "Keyword arm of semantic search failed, continuing with vector results only: %s" (ex-message t))
        nil))))

;;;; Fusion

(defn- rrf-score
  "Reciprocal rank fusion of one document's two ranks; a rank of nil contributes nothing."
  [semantic-rank keyword-rank]
  (+ (if semantic-rank (/ semantic-weight (+ rrf-k (double semantic-rank))) 0.0)
     (if keyword-rank (/ keyword-weight (+ rrf-k (double keyword-rank))) 0.0)))

(defn- result-key [row]
  [(:model row) (:id row)])

(defn- vector-entries [rows]
  (into {}
        (map (fn [{:keys [legacy_input semantic-rank semantic-score]}]
               ;; `:is_published` is an internal permission signal and never leaves the engine.
               (let [body (search/collapse-id (dissoc legacy_input :is_published))]
                 [(result-key body) {:body           body
                                     :semantic-rank  semantic-rank
                                     :semantic-score semantic-score}])))
        rows))

(defn- keyword-entries [rows]
  (into {}
        (map-indexed (fn [i row]
                       [(result-key row) {:body         (dissoc row :score :all-scores)
                                          :keyword-rank (inc i)}]))
        rows))

(defn- scored-result
  [weights {:keys [body semantic-rank semantic-score keyword-rank]}]
  (let [scores     {:rrf               (rrf-score semantic-rank keyword-rank)
                    ;; A keyword-only hit never went through vector search, so it scores 0 here -- the
                    ;; least-relevant end, not the perfect-match end a zero *distance* would mean.
                    :semantic-distance (or semantic-score 0.0)}
        all-scores (search.scoring/all-scores weights [:rrf :semantic-distance] scores)]
    (assoc body
           :score      (reduce + (map :contribution all-scores))
           :all-scores all-scores)))

(defn fuse
  "Fuse the two arms' rows into one ranked result list, best first.

  Deliberately does not fold the keyword arm's own total score in: reciprocal rank fusion spreads over about a
  point while the appdb base scorers spread over several, so adding it would rank every vector-only hit below
  every keyword hit and undo the point of the vector arm."
  [weights vector-rows keyword-rows]
  (->> (merge-with merge (vector-entries vector-rows) (keyword-entries keyword-rows))
       vals
       (map (partial scored-result weights))
       (sort-by :score >)
       vec))

;;;; Query

(defn- embed-query
  "The query embedding, prefixed the way the configured model expects."
  [search-string]
  (let [model (semantic.embedding/get-configured-model)]
    (float-array
     (semantic.embedding/get-embedding model
                                       (semantic.embedding/prefix-search-query model search-string)
                                       {:type :query :record-tokens? true}))))

(defn- vector-rows
  "The vector arm's rows, or `[]` when it cannot contribute to this query."
  [search-context limit]
  (cond
    (date-filtered? search-context)
    (do
      (log/debug "Skipping the vector arm of semantic search: date filters are keyword-only")
      [])

    (zero? (lucene.index/live-count))
    (do
      (log/debug "Semantic search Lucene index is empty, answering from the keyword arm alone")
      [])

    :else
    (vector-hits (embed-query (:search-string search-context)) search-context limit)))

(defn query
  "Answer `search-context` from the Lucene vector arm fused with the appdb keyword arm.

  Returns `{:results … :raw-count … :keyword-results …}`. `:raw-count` counts the fused set before permission
  filtering -- the signal [[metabase-enterprise.semantic-search.core/results]] uses to decide whether to
  supplement -- and `:keyword-results` are the appdb rows this query already paid for, so that supplement does not
  run the same query a second time. `:keyword-results` is nil when the keyword arm did not run at all, which
  leaves that caller to fall back to another engine as it would have without this backend.
  Throws when the query cannot be embedded, which that caller turns into a keyword-only fallback."
  [search-context]
  (let [search-string (:search-string search-context)]
    ;; A blank search string is the native-editor table picker, which semantic search does not serve.
    (if (str/blank? search-string)
      {:results [] :raw-count 0}
      (let [timer     (u/start-timer)
            limit     (semantic.settings/semantic-search-results-limit)
            weights   (search.config/weights search-context)
            _         (lucene.index/ensure-open!)
            keyword-rows (keyword-hits search-context limit)
            fused     (fuse weights (vector-rows search-context limit) keyword-rows)
            permitted (->> fused
                           semantic.index/filter-read-permitted
                           (semantic.index/apply-collection-id-filter search-context))
            results   (semantic.scoring/with-appdb-scores search-context
                        (appdb-scoring/appdb-scorers search-context)
                        weights
                        permitted)]
        (log/debug "Semantic search (Lucene)"
                   {:search-string-length (count search-string)
                    :fused-count          (count fused)
                    :final-count          (count results)
                    :total-time-ms        (u/since-ms timer)})
        {:results         results
         :raw-count       (count fused)
         :keyword-results keyword-rows}))))

;;;; Diagnostics

(defn- indexed-legacy-input
  "The decoded `legacy_input` this node has indexed for `document-id`, or nil when it has none."
  [^String document-id]
  (lucene.index/with-searcher [^IndexSearcher searcher]
    (let [^TopDocs hits (.search searcher (TermQuery. (Term. "id" document-id)) (int 1))]
      (when-let [^ScoreDoc hit (first (.scoreDocs hits))]
        (-> (.document (.storedFields searcher) (.-doc hit))
            (.get "legacy_input")
            json/decode+kw)))))

(defn- excluding-filter
  "The first filter key whose clause excludes `document-id`, or nil when every clause admits it."
  [search-context ^String document-id]
  (lucene.index/with-searcher [^IndexSearcher searcher]
    (let [id-query (TermQuery. (Term. "id" document-id))]
      (some (fn [[k ^Query clause]]
              (let [builder (doto (BooleanQuery$Builder.)
                              (.add id-query BooleanClause$Occur/FILTER)
                              (.add clause BooleanClause$Occur/FILTER))]
                (when (zero? (.count searcher (.build builder)))
                  k)))
            (filter-clauses search-context)))))

(defn diagnose
  "Explain why `expected-model`/`expected-id` does not turn up for `search-context`.

  Returns the first engine-owned stage that drops it (`:missing-from-index`, `:filtered`, `:not-matching`) or
  `:candidate` when it survives all of them. See [[metabase.search.debug/diagnose]]."
  [search-context expected-model expected-id]
  (lucene.index/ensure-open!)
  (let [document-id (lucene.index/document-id expected-model expected-id)
        legacy      (indexed-legacy-input document-id)]
    (cond
      (nil? legacy)
      {:type :missing-from-index :details {:document-id document-id}}

      ;; Access control before the structural filters, so a not-permitted row reads as such even when a query
      ;; filter would also drop it. Matches the pgvector arm and the appdb engine.
      (empty? (semantic.index/filter-read-permitted [legacy]))
      {:type :filtered :details {:excluded-by :permissions}}

      :else
      (if-let [excluded-by (excluding-filter search-context document-id)]
        {:type :filtered :details {:excluded-by excluded-by}}
        (if-let [hit (first (vector-hits (embed-query (:search-string search-context))
                                         (assoc search-context :ids [expected-id] :models #{expected-model})
                                         1))]
          {:type :candidate :details {:semantic-distance (- 2.0 (* 2.0 (:semantic-score hit)))}}
          {:type :not-matching :details {:score-floor score-floor}})))))
