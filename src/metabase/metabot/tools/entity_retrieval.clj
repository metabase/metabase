(ns metabase.metabot.tools.entity-retrieval
  "Metabot `retrieve_library_entities` tool, backed by the library entity index.

  Matches the user's request by vector similarity against the per-value documents of every library entity
  — each entity's name, description, and any OSI `ai_context` synonyms/examples — then dedupes the
  many-per-entity hits to distinct entities and returns a handful, best-first.

  Each match carries the `matched_on` document and the entity's `usage_instructions`, and is hydrated into
  the same enriched shape the general `search` tool returns (`portable_entity_id`, fully-qualified names,
  base tables), so the agent can build a query inline without a `read_resource` round-trip.
  Each match's raw cosine `similarity` is surfaced and low-confidence ones flagged, so a library miss
  reads as a miss rather than a confident-but-wrong hit.

  The var/namespace name (`entity-retrieval`) is retained deliberately — the module is a home for
  information retrieval generally, not 1:1 with this index or tool.
  Runs in the enterprise pgvector store via [[metabase.entity-retrieval.core]]."
  (:require
   [clojure.string :as str]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.search :as tools.search]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private default-limit
  "Distinct library entities returned by default. Each entity has several documents (name, description,
  synonyms, examples) that dedupe to one entity; 10 balances recall against deduped siblings."
  10)
(def ^:private max-limit 20)

(def ^:private over-fetch-factor
  "Raw per-document hits to pull before deduping to distinct entities (one entity has many documents:
  name, description, and each synonym/example)."
  8)
(def ^:private over-fetch-cap 120)

(def ^:private weak-similarity-threshold
  "Raw cosine similarity below which a match is flagged low-confidence. Calibrated on this index:
  in-domain top-1 similarities run ~0.52–0.81, clearly out-of-domain ~0.15–0.22."
  0.45)

(def ^:private user-search-prompt-desc
  (str "A natural-language description of the data the user wants. Matched by vector similarity against "
       "library entities' names, descriptions, and curated synonyms/example questions; phrase it the way "
       "the user would describe the data, not as keywords."))

(def ^:private limit-desc
  (str "Maximum number of distinct library entities (default " default-limit ", max " max-limit ")."))

(def ^:private entity-retrieval-schema
  [:map {:closed true}
   [:user_search_prompt [:string {:description user-search-prompt-desc}]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-limit :description limit-desc}]]]])

(def ^:private instructions
  ;; refers to the match/note elements by name only — literal angle-bracket tags here would make the
  ;; surrounding <instructions> element malformed
  (str "Each match element is a library entity (already hydrated with the ids, names and portable "
       "references you need), the matched_on text that triggered it, and any usage_instructions for that "
       "entity. similarity is the raw cosine match strength; a match flagged confidence=\"weak\" (or a "
       "leading note element) means nothing in the library clearly matches — don't build on it blindly; "
       "prefer asking the user to clarify or narrow the request."))

(defn- similarity
  "Raw cosine similarity (1 - distance) for a match, from its score breakdown."
  ^double [score]
  (or (some (fn [s] (when (= :similarity (:name s)) (double (:score s)))) (:scores score)) 0.0))

(defn- dedupe-by-entity
  "Collapse raw per-document results (sorted best-first) to distinct entities, keeping the best-scoring
  document for each."
  [results]
  (->> results
       (reduce (fn [[seen acc] r]
                 ;; collapse every card flavor (question/metric/model) to one class so aliases of the same
                 ;; Card dedupe together — they all hydrate to one record, so distinct keys would return it
                 ;; twice. Same equivalence the membership/instructions lookups use below.
                 (let [{:keys [model id]} (:entity r)
                       k                   (entity-retrieval/entity-class model id)]
                   (if (seen k) [seen acc] [(conj seen k) (conj acc r)])))
               [#{} []])
       second))

(defn- build-matches
  "Fetch, dedupe to distinct entities, hydrate each match's entity ref into a full search record, and
  return the top `n` the current user can read.
  Each match: `{:doc_type :matched_text :usage_instructions :score :similarity :weak? :entity hydrated-hit}`."
  [user-search-prompt n]
  (let [raw      (entity-retrieval/search
                  user-search-prompt (min over-fetch-cap (* over-fetch-factor n)))
        deduped  (dedupe-by-entity raw)
        refs     (distinct (map :entity deduped))
        ;; Hydration permission-filters (entity-refs->search-results drops entities the user can't read),
        ;; so hydrate the whole deduped candidate set and take `n` from the readable survivors — taking
        ;; `n` first would let unreadable top hits shrink the result below `n` while readable matches sit
        ;; just past the cut.
        ;; Key by entity *class*, not raw [type id]: hydration emits a card's current type, so a stale index
        ;; ref (an old metric/model label) still resolves to its hydrated record once both collapse to "card".
        by-key   (u/index-by (fn [r] (entity-retrieval/entity-class (:type r) (:id r)))
                             (tools.search/entity-refs->search-results refs))
        ;; instructions aren't stored in the index — read the current text from osi_ai_context per request.
        instrs   (entity-retrieval/ai-context-instructions refs)
        ;; The index is eventually consistent, so a hit may point at an entity that has since left the
        ;; library; post-filter to current members (like the permission filter above) so a stale index
        ;; never surfaces a now-unpublished/archived entity. nil only in OSS, where there are no hits.
        ;; Compare by entity *class*: between a Card metric<->model relabel and the next reconcile the index
        ;; carries the old type while membership carries the new one, so a raw [type id] compare would drop a
        ;; valid library card. Collapsing both to one class (as the rest of the pipeline does) keeps it.
        lib-classes (some->> (entity-retrieval/library-entity-keys)
                             (into #{} (map (fn [[t id]] (entity-retrieval/entity-class t id)))))]
    (->> (for [{:keys [doc_type doc_text entity score]} deduped
               :let [resolved (get by-key (entity-retrieval/entity-class (:model entity) (:id entity)))
                     sim      (similarity score)]
               :when (and resolved
                          (or (nil? lib-classes)
                              (contains? lib-classes (entity-retrieval/entity-class (:model entity) (:id entity)))))]
           {:doc_type           doc_type
            :matched_text       doc_text
            :usage_instructions (get instrs [(:model entity) (:id entity)])
            :score              score
            :similarity         sim
            :weak?              (< sim weak-similarity-threshold)
            :entity             resolved})
         (take n))))

(defn- match->xml [{:keys [doc_type matched_text usage_instructions score similarity weak? entity]}]
  ;; String/format with Locale/ROOT so %.3f uses a '.' decimal separator regardless of the instance's
  ;; site locale (clojure.core/format always uses the default locale).
  (str (String/format java.util.Locale/ROOT "<match score=\"%.3f\" similarity=\"%.3f\" confidence=\"%s\">\n"
                      (object-array [(double (:total_score score)) (double similarity)
                                     (if weak? "weak" "strong")]))
       "<matched_on type=\"" (llm-shape/escape-xml doc_type) "\">"
       (llm-shape/escape-xml matched_text) "</matched_on>\n"
       (when-not (str/blank? usage_instructions)
         (str "<usage_instructions>" (llm-shape/escape-xml usage_instructions) "</usage_instructions>\n"))
       (llm-shape/search-result->xml entity)
       "\n</match>"))

(defn- format-output [matches]
  (if (empty? matches)
    "<search_results>No matching library entities.</search_results>"
    (str (when (:weak? (first matches))
           (str "<note>No strong library match for this request — treat the results below as weak "
                "guesses; consider asking the user to clarify or narrow the request.</note>\n"))
         "<search_results>\n"
         (str/join "\n" (map match->xml matches))
         "\n</search_results>\n"
         "<instructions>" instructions "</instructions>")))

(defn- flatten-data
  "Flatten matches to a per-entity list (the `:result-type :search` shape), each entity record annotated
  with the matched document, usage_instructions, similarity and confidence."
  [matches]
  (mapv (fn [{:keys [doc_type matched_text usage_instructions score similarity weak? entity]}]
          (assoc entity
                 :matched_doc_type   doc_type
                 :matched_text       matched_text
                 :usage_instructions usage_instructions
                 :score              score
                 :similarity         similarity
                 :confidence         (if weak? "weak" "strong")))
        matches))

;; No capability gate: this tool lives only in the :nlq profile, which [[metabase.metabot.agent.profiles/
;; get-profile]] serves (the library variant, with this tool) only when entity-retrieval-available? — otherwise it
;; redirects to :nlq-fallback (general search). That single probe is the sole gate, so prompt and tools can't
;; disagree about index availability.
(mu/defn ^{:tool-name "retrieve_library_entities"
           :scope     scope/agent-search}
  retrieve-library-entities-tool
  "Find the best data to answer the user's request from the library — the set of entities published to it
  (published tables, library metrics/models, and their measures/segments). Phrase
  `user_search_prompt` as a full natural-language description of the data wanted (it is matched on
  meaning, not keywords).

  Returns a handful of distinct library entities, best-first. Each match has the `matched_on` text that
  triggered it, any curator `usage_instructions`, a raw `similarity`, and the `entity` — a full search
  record (name, type, database, `portable_entity_id`, fully-qualified name). Use it to pick the right
  entity, then `read_resource` that entity to confirm its fields and sample values before building. If the
  top match is flagged low-confidence (a leading <note> / confidence=\"weak\"), nothing in the library
  clearly matches — prefer asking the user to clarify or narrow the request."
  [{:keys [user_search_prompt limit]} :- entity-retrieval-schema]
  (try
    (let [n       (min max-limit (or limit default-limit))
          matches (build-matches user_search_prompt n)]
      {:output            (format-output matches)
       :structured-output {:result-type :search
                           :data        (flatten-data matches)
                           :total_count (count matches)
                           :weak_match  (boolean (:weak? (first matches)))}})
    (catch Exception e
      ;; A failure here is the search subsystem being down (typically the embedding service), not "the
      ;; library is empty" — say so in :output (the only channel the agent reads) so it doesn't confidently
      ;; tell the user nothing matches. No :structured-output: that feeds the FE a result payload, and there's
      ;; no successful search to render.
      (log/error e "Error in retrieve_library_entities")
      {:output (str "The library search is temporarily unavailable (" (or (ex-message e) "unknown error")
                    "). This does not mean the library is empty; the search could not be run.")})))
