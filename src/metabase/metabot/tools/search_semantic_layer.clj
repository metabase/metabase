(ns metabase.metabot.tools.search-semantic-layer
  "Metabot `search` tool for the nlq profile, backed by the curated semantic layer.

  Instead of ranking the whole instance, it matches the user's request by vector similarity against a
  hand-curated library of saved search prompts, each mapped to the entities that answer it — a canonical
  entity that directly answers the request, or a set of source entities to build a query from. Each match
  also carries `usage_instructions`: curator guidance on how to use those entities.

  The index has several prompts per entity, so raw vector hits are **deduped to distinct entities** and a
  small number returned. The matched entity refs are hydrated into the same enriched search-result shape
  the general `search` tool returns (`portable_entity_id`, fully-qualified names, database names, metric
  base tables), so the agent can build a query inline without an extra `read_resource` round-trip.

  Because the nlq profile has no general-search fallback, the tool also surfaces the raw cosine
  `similarity` of each match and flags low-confidence results, so a miss reads as a miss rather than a
  confident-but-wrong curated hit.
  The similarity search runs in the enterprise pgvector store via [[metabase.metabot.prompt-entities]]."
  (:require
   [clojure.string :as str]
   [metabase.metabot.prompt-entities :as prompt-entities]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-limit
  "Distinct curated matches returned by default. The index has ~3 prompts per entity and embeddings cluster
  tightly by domain; 5 was too aggressive (benchmark 15: ~12 expected entities sat at rank 6–10 and were
  cut off), so 10 to recover that recall while still deduping siblings."
  10)
(def ^:private max-limit 20)

(def ^:private over-fetch-factor
  "Raw per-prompt hits to pull before deduping to distinct entities (several prompts map to one entity)."
  4)
(def ^:private over-fetch-cap 60)

(def ^:private weak-similarity-threshold
  "Raw cosine similarity below which a match is flagged low-confidence. Calibrated on this index:
  in-domain top-1 similarities run ~0.52–0.81, clearly out-of-domain ~0.15–0.22."
  0.45)

(def ^:private user-search-prompt-desc
  (str "A natural-language description of the data the user wants. Matched by vector similarity "
       "against curated saved prompts; phrase it like the saved prompt you'd expect to find, "
       "not as keywords."))

(def ^:private limit-desc
  (str "Maximum number of distinct curated matches (default " default-limit ", max " max-limit ")."))

(def ^:private search-semantic-layer-schema
  [:map {:closed true}
   [:user_search_prompt [:string {:description user-search-prompt-desc}]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-limit :description limit-desc}]]]])

(def ^:private instructions
  (str "Each <match> is a curated entry: a saved prompt, its usage_instructions, and the entity/entities "
       "to use (already hydrated with the ids, names and portable references you need). A canonical match "
       "is a single entity that directly answers the request — prefer it. A sources match is a set of "
       "entities to combine yourself. `similarity` is the raw cosine match strength; a match flagged "
       "confidence=\"weak\" (or a leading <note>) means nothing in the curated layer clearly matches — "
       "don't build on it blindly; prefer asking the user to clarify or narrow the request."))

(defn- similarity
  "Raw cosine similarity (1 − distance) for a match, from its score breakdown."
  ^double [score]
  (or (some (fn [s] (when (= :similarity (:name s)) (double (:score s)))) (:scores score)) 0.0))

(defn- canonical-match?
  "True when the match's canonical score factor fired (a single directly-answering entity)."
  [score]
  (boolean (some (fn [s] (and (= :canonical (:name s)) (pos? (double (:score s)))))
                 (:scores score))))

(defn- entity-set-key [entities]
  (->> entities (map (juxt :model :id)) sort vec))

(defn- dedupe-by-entity
  "Collapse raw per-prompt results (sorted best-first) to distinct entity sets, keeping the best-scoring
  prompt for each."
  [results]
  (->> results
       (reduce (fn [[seen acc] r]
                 (let [k (entity-set-key (:entities r))]
                   (if (seen k) [seen acc] [(conj seen k) (conj acc r)])))
               [#{} []])
       second))

(defn- build-matches
  "Fetch, dedupe to distinct entities, take `n`, and hydrate each match's entity refs into full search
  records. Each match: {:saved_search_prompt :usage_instructions :canonical :score :similarity :weak?
  :entities [hydrated-hits]}."
  [user-search-prompt n]
  (let [raw     (prompt-entities/search-prompt-entities
                 user-search-prompt (min over-fetch-cap (* over-fetch-factor n)))
        top     (take n (dedupe-by-entity raw))
        by-key  (into {} (map (juxt (juxt :type :id) identity))
                      (tools.search/entity-refs->search-results (distinct (mapcat :entities top))))]
    (for [{:keys [saved_search_prompt usage_instructions entities score]} top
          :let [resolved (keep (fn [{:keys [model id]}] (get by-key [model id])) entities)
                sim      (similarity score)]
          :when (seq resolved)]
      {:saved_search_prompt saved_search_prompt
       :usage_instructions  usage_instructions
       :canonical           (canonical-match? score)
       :score               score
       :similarity          sim
       :weak?               (< sim weak-similarity-threshold)
       :entities            (vec resolved)})))

(defn- match->xml [{:keys [saved_search_prompt usage_instructions canonical score similarity weak? entities]}]
  (str (format "<match score=\"%.3f\" similarity=\"%.3f\" kind=\"%s\" confidence=\"%s\">\n"
               (double (:total_score score)) (double similarity)
               (if canonical "canonical" "sources") (if weak? "weak" "strong"))
       "<saved_search_prompt>" saved_search_prompt "</saved_search_prompt>\n"
       (when-not (str/blank? usage_instructions)
         (str "<usage_instructions>" usage_instructions "</usage_instructions>\n"))
       (str/join "\n" (map llm-shape/search-result->xml entities))
       "\n</match>"))

(defn- format-output [matches]
  (if (empty? matches)
    "<search_results>No matching curated entities.</search_results>"
    (str (when (:weak? (first matches))
           (str "<note>No strong curated match for this request — treat the results below as weak "
                "guesses; consider asking the user to clarify or narrow the request.</note>\n"))
         "<search_results>\n"
         (str/join "\n" (map match->xml matches))
         "\n</search_results>\n"
         "<instructions>" instructions "</instructions>")))

(defn- flatten-data
  "Flatten matches to a deduped, per-entity list (the `:result-type :search` shape), each entity record
  annotated with its match's prompt, usage_instructions, canonical flag, similarity, confidence, and a
  `:match_group` linking entities that came from the same sources match."
  [matches]
  (->> (for [[gi {:keys [saved_search_prompt usage_instructions canonical score similarity weak? entities]}]
             (map-indexed vector matches)
             hit entities]
         (assoc hit
                :saved_search_prompt saved_search_prompt
                :usage_instructions  usage_instructions
                :canonical           canonical
                :score               score
                :similarity          similarity
                :confidence          (if weak? "weak" "strong")
                :match_group         gi))
       (reduce (fn [[seen acc] r]
                 (let [k [(:type r) (:id r)]]
                   (if (seen k) [seen acc] [(conj seen k) (conj acc r)])))
               [#{} []])
       second))

(mu/defn ^{:tool-name "search"
           :scope     scope/agent-search}
  search-semantic-layer-tool
  "Find the best data to answer the user's request from the curated semantic layer — a vetted library of
  saved prompts, each mapped to the entities that answer it. Phrase `user_search_prompt` as a full
  natural-language description of the data wanted (it is matched on meaning, not keywords).

  Returns a handful of distinct curated matches, best-first. Each match has `saved_search_prompt`, curator
  `usage_instructions`, a raw `similarity`, and `entities` — full search records (name, type, database,
  `portable_entity_id`, fully-qualified name) you can use directly. A `canonical` match has one entity
  that DIRECTLY answers the request — prefer these. A `sources` match is one or more entities you combine
  yourself. If the top match is flagged low-confidence (a leading <note> / confidence=\"weak\"), nothing in
  the curated layer clearly matches — prefer asking the user to clarify rather than building on it."
  [{:keys [user_search_prompt limit]} :- search-semantic-layer-schema]
  (try
    (let [n       (min max-limit (or limit default-limit))
          matches (build-matches user_search_prompt n)]
      {:output            (format-output matches)
       :structured-output {:result-type :search
                           :data        (flatten-data matches)
                           :total_count (count matches)
                           :weak_match  (boolean (:weak? (first matches)))}})
    (catch Exception e
      (log/error e "Error in search semantic layer")
      {:output (str "search failed: " (or (ex-message e) "Unknown error"))})))
