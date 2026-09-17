(ns metabase.mcp.v2.tools.glossary
  "The v2 MCP `glossary` tool: the business definitions an instance's data analysts have written down.

   The tool's own description ends with an unconditional instruction to call it. The words that most
   need a company definition are the ones that read as ordinary English — \"account\", \"active
   user\", \"churn\" — which a model believes it already understands, so an instruction it has to
   qualify by first noticing the jargon is one it never acts on. Naming the terms up there instead
   would beg that same question and cost more: clients truncate long descriptions, and a list cut
   short reads as the whole glossary, which is worse than no list at all.

   Metabot solves the same problem by pasting the whole glossary into every message it sends, which
   it can do because it owns the prompt. Here the description is the only channel that reaches the
   model unprompted, so it carries the instruction to call and nothing else."
  (:require
   [metabase.glossary.db :as glossary.db]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.message :as message]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private no-terms-message
  (message/msg ["No terms are defined in this instance's glossary yet."]))

(def ^:private default-limit
  "How many entries a `glossary()` listing returns when the caller names no limit. `definition` is a TEXT column
   with no length limit at any layer, so an unpaged listing has no size of its own; 50 matches what the instance's
   other plain app-db listings page at."
  50)

(def ^:private max-limit
  "The largest page a caller may ask for, matching the other v2 listings' ceiling."
  500)

(defn- entries
  "Every glossary entry, in term order."
  []
  (glossary.db/glossary-entries nil))

(defn- terms-message
  "The sentence naming the terms of `entries`, cut to [[default-limit]] names. A caller who named a term that
   isn't there is owed the ones that are, but a glossary has no bound of its own to hand back."
  [entries]
  (let [terms (map :term entries)
        shown (take default-limit terms)
        extra (- (count terms) (count shown))]
    (cond
      (empty? terms) no-terms-message
      (pos? extra)   (message/msg ["Terms defined here, %d of %d — call glossary() for the rest: %s."]
                                  (count shown) (count terms) (common/list-message shown))
      :else          (message/msg ["Terms defined here: %s."] (common/list-message shown)))))

(defn- entry-message
  [{:keys [term definition]}]
  (message/msg ["%s: %s"] term definition))

(defn- find-entries
  "Every entry of `entries` whose term matches `term` compared case-insensitively, in term order: a model echoes a
   term as it read it in a question or a column name, not as it happens to be stored."
  [entries term]
  ;; Several can match: `term` is unique case-sensitively, so "ARR" and "arr" are two entries with two meanings.
  (let [wanted (u/lower-case-en term)]
    (filter #(= wanted (u/lower-case-en (:term %))) entries)))

(registry/deftool glossary
  "Look up a business term as this Metabase instance defines it, as its own data analysts wrote it down. glossary() lists terms with their definitions, paged with limit (default 50, max 500) and offset; glossary(term) returns just that term, matched without regard to case — which can be more than one entry, since terms differing only in case are stored separately. Call glossary() before answering any question about this instance's data: these definitions override your own reading of a word, and the question itself will not tell you which words are defined here."
  {:name        "glossary"
   :scope       metabot.scope/agent-content-read
   :annotations {:readOnlyHint true :idempotentHint true}
   :args        [:map {:closed true}
                 [:term {:optional true}
                  [:maybe [:string {:min 1
                                    :description (str "The term to define, matched case-insensitively. "
                                                      "Omit to list terms with their definitions.")}]]]
                 [:limit {:optional true}
                  [:maybe [:int {:min 1 :max max-limit
                                 :description (str "Maximum entries to return (default 50, max 500). "
                                                   "Ignored with \"term\", which is a lookup, not a "
                                                   "page.")}]]]
                 [:offset {:optional true}
                  [:maybe [:int {:min 0
                                 :description (str "Number of entries to skip, for paging (default 0). "
                                                   "Ignored with \"term\".")}]]]]}
  [{:keys [term limit offset]} _context]
  (let [entries (entries)]
    (if term
      (common/success-content
       (if-let [matches (seq (find-entries entries term))]
         (common/lines-message (map entry-message matches))
         (common/throw-teaching-error
          (message/msg ["No glossary entry for %s. %s"] term (terms-message entries)))))
      ;; The page is cut in memory because the module reads the table whole. That bounds the response, which is
      ;; what a client pays for and what the definitions can make arbitrarily large, not the query.
      (let [limit  (or limit default-limit)
            offset (or offset 0)
            page   (into [] (comp (drop offset) (take limit)) entries)]
        (common/list-content (mapv #(select-keys % [:term :definition]) page)
                             (count entries)
                             {:param      :term
                              :offset     offset
                              :limit      limit
                              :empty-hint no-terms-message})))))
