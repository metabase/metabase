(ns metabase.metabot.tools.semantic-layer-search
  "Metabot `semantic_layer_search` tool, backed by the curated semantic layer.

  Instead of ranking the whole instance, it matches the user's request by vector similarity against a
  hand-curated library of saved search prompts, each mapped to the single entity that answers it. Each
  match also carries `usage_instructions`: curator guidance on how to use that entity.

  The index has several prompts per entity, so raw vector hits are **deduped to distinct entities** and a
  small number returned. The matched entity refs are hydrated into the same enriched search-result shape
  the general `search` tool returns (`portable_entity_id`, fully-qualified names, database names, metric
  base tables), so the agent can build a query inline without an extra `read_resource` round-trip.

  Because profiles may use this tool without a general-search fallback, the tool also surfaces the raw
  cosine `similarity` of each match and flags low-confidence results, so a miss reads as a miss rather
  than a confident-but-wrong curated hit.
  The similarity search runs in the enterprise pgvector store via [[metabase.semantic-layer-search.core]]."
  (:require
   [clojure.string :as str]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.semantic-layer-search.core :as semantic-layer-search]
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

(def ^:private semantic-layer-search-schema
  [:map {:closed true}
   [:user_search_prompt [:string {:description user-search-prompt-desc}]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-limit :description limit-desc}]]]])

(def ^:private instructions
  (str "Each <match> is a curated entry: a saved prompt, its usage_instructions, and the entity to use "
       "(already hydrated with the ids, names and portable references you need). `similarity` is the raw "
       "cosine match strength; a match flagged confidence=\"weak\" (or a leading <note>) means nothing in "
       "the curated layer clearly matches — don't build on it blindly; prefer asking the user to clarify "
       "or narrow the request."))

(defn- similarity
  "Raw cosine similarity (1 − distance) for a match, from its score breakdown."
  ^double [score]
  (or (some (fn [s] (when (= :similarity (:name s)) (double (:score s)))) (:scores score)) 0.0))

(defn- dedupe-by-entity
  "Collapse raw per-prompt results (sorted best-first) to distinct entities, keeping the best-scoring
  prompt for each."
  [results]
  (->> results
       (reduce (fn [[seen acc] r]
                 (let [k ((juxt :model :id) (:entity r))]
                   (if (seen k) [seen acc] [(conj seen k) (conj acc r)])))
               [#{} []])
       second))

(defn- build-matches
  "Fetch, dedupe to distinct entities, take `n`, and hydrate each match's entity ref into a full search
  record. Each match: {:saved_search_prompt :usage_instructions :score :similarity :weak? :entity
  hydrated-hit}."
  [user-search-prompt n]
  (let [raw     (semantic-layer-search/search
                 user-search-prompt (min over-fetch-cap (* over-fetch-factor n)))
        top     (take n (dedupe-by-entity raw))
        by-key  (into {} (map (juxt (juxt :type :id) identity))
                      (tools.search/entity-refs->search-results (distinct (map :entity top))))]
    (for [{:keys [saved_search_prompt usage_instructions entity score]} top
          ;; hydrated records use the agent-facing entity type, so normalize the ref's model to match
          ;; (plain "card" refs hydrate as "question")
          :let [resolved (get by-key [(tools.search/ref-model->entity-type (:model entity)) (:id entity)])
                sim      (similarity score)]
          :when resolved]
      {:saved_search_prompt saved_search_prompt
       :usage_instructions  usage_instructions
       :score               score
       :similarity          sim
       :weak?               (< sim weak-similarity-threshold)
       :entity              resolved})))

(defn- escape-xml
  "Escape curator-entered text for the XML-ish tool output."
  [s]
  (-> s
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")))

(defn- match->xml [{:keys [saved_search_prompt usage_instructions score similarity weak? entity]}]
  (str (format "<match score=\"%.3f\" similarity=\"%.3f\" confidence=\"%s\">\n"
               (double (:total_score score)) (double similarity) (if weak? "weak" "strong"))
       "<saved_search_prompt>" (escape-xml saved_search_prompt) "</saved_search_prompt>\n"
       (when-not (str/blank? usage_instructions)
         (str "<usage_instructions>" (escape-xml usage_instructions) "</usage_instructions>\n"))
       (llm-shape/search-result->xml entity)
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
  "Flatten matches to a per-entity list (the `:result-type :search` shape), each entity record annotated
  with its match's prompt, usage_instructions, similarity and confidence."
  [matches]
  (mapv (fn [{:keys [saved_search_prompt usage_instructions score similarity weak? entity]}]
          (assoc entity
                 :saved_search_prompt saved_search_prompt
                 :usage_instructions  usage_instructions
                 :score               score
                 :similarity          similarity
                 :confidence          (if weak? "weak" "strong")))
        matches))

(mu/defn ^{:tool-name "semantic_layer_search"
           :scope     scope/agent-search}
  semantic-layer-search-tool
  "Find the best data to answer the user's request from the curated semantic layer — a vetted library of
  saved prompts, each mapped to the entity that answers it. Phrase `user_search_prompt` as a full
  natural-language description of the data wanted (it is matched on meaning, not keywords).

  Returns a handful of distinct curated matches, best-first. Each match has `saved_search_prompt`, curator
  `usage_instructions`, a raw `similarity`, and the `entity` — a full search record (name, type, database,
  `portable_entity_id`, fully-qualified name) you can use directly. If the top match is flagged
  low-confidence (a leading <note> / confidence=\"weak\"), nothing in the curated layer clearly matches —
  prefer asking the user to clarify rather than building on it."
  [{:keys [user_search_prompt limit]} :- semantic-layer-search-schema]
  (try
    (let [n       (min max-limit (or limit default-limit))
          matches (build-matches user_search_prompt n)]
      {:output            (format-output matches)
       :structured-output {:result-type :search
                           :data        (flatten-data matches)
                           :total_count (count matches)
                           :weak_match  (boolean (:weak? (first matches)))}})
    (catch Exception e
      (log/error e "Error in semantic layer search")
      {:output (str "semantic_layer_search failed: " (or (ex-message e) "Unknown error"))})))
