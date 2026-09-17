(ns metabase.mcp.v2.tools.glossary
  "The v2 MCP `glossary` tool: the business definitions an instance's data analysts have written down.

   The term names ride the tool's own description rather than waiting behind a call. A model only
   looks a word up when something tells it the word is worth looking up, and the words that most
   need a company definition are the ones that read as ordinary English — \"account\", \"active
   user\", \"churn\" — which a model believes it already understands. Seeing the list is the
   trigger. The definitions stay behind the call, where they cost nothing until wanted and where a
   long one can't crowd out the rest of a description clients may truncate.

   Metabot solves the same problem by pasting the whole glossary into every message it sends, which
   it can do because it owns the prompt. Here the description is the only channel that reaches the
   model unprompted, and a client may cache it for the life of its session, so a term added
   mid-session appears when that client next connects."
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

(def ^:private max-listed-terms
  "How many term names the description carries. Nothing bounds a glossary — no cap on entries, and `term` is a
   varchar(255) — so a big one would otherwise push the rest of the description past the length some clients
   truncate at. Past this the list says how many it left out and points at the call for the rest."
  100)

(defn- entries
  "Every glossary entry, in term order."
  []
  (glossary.db/glossary-entries nil))

(defn- terms-message
  "The sentence naming the terms of `entries`, capped at [[max-listed-terms]]."
  [entries]
  (let [terms (map :term entries)
        shown (take max-listed-terms terms)
        extra (- (count terms) (count shown))]
    (cond
      (empty? terms) no-terms-message
      (pos? extra)   (message/msg ["Terms defined here, %d of %d — call glossary() for the rest: %s."]
                                  (count shown) (count terms) (common/list-message shown))
      :else          (message/msg ["Terms defined here: %s."] (common/list-message shown)))))

(defn- terms-suffix
  "The sentence naming the defined terms, appended to the tool description on every `tools/list`."
  []
  (str "\n\n" (message/render (terms-message (entries)))))

(defn- entry-message
  [{:keys [term definition]}]
  (message/msg ["%s: %s"] term definition))

(defn- find-entry
  "The entry of `entries` whose term matches `term`, compared case-insensitively: a model echoes a term as it read it
   in a question or a column name, not as it happens to be stored."
  [entries term]
  (let [wanted (u/lower-case-en term)]
    (first (filter #(= wanted (u/lower-case-en (:term %))) entries))))

(registry/deftool glossary
  "Look up a business term as this Metabase instance defines it. glossary() returns every term with its definition; glossary(term) returns one. These definitions are written by the instance's own data analysts and take precedence over your reading of the word, so look a term up before answering a question that uses one — especially a term that looks like ordinary English, where your own meaning and the company's are most likely to differ."
  {:name               "glossary"
   :scope              metabot.scope/agent-content-read
   :description-suffix terms-suffix
   :annotations        {:readOnlyHint true :idempotentHint true}
   :args               [:map {:closed true}
                        [:term {:optional true}
                         [:maybe [:string {:min 1
                                           :description (str "A term named at the end of this tool's description, "
                                                             "matched case-insensitively. Omit to get every term "
                                                             "with its definition.")}]]]]}
  [{:keys [term]} _context]
  (let [entries (entries)]
    (common/success-content
     (cond
       term         (if-let [entry (find-entry entries term)]
                      (entry-message entry)
                      (common/throw-teaching-error
                       (message/msg ["No glossary entry for %s. %s"] term (terms-message entries))))
       (seq entries) (common/lines-message (map entry-message entries))
       :else         no-terms-message))))
