(ns metabase.metabot.tools.search-prompt-entities
  "Metabot tool that matches a user's request against curated saved search prompts.

   Complements `search` and `read_resource`: instead of searching the whole instance, it looks up a
   small, hand-curated table of prompts that each map to either a canonical entity (a specific table
   or card that directly answers the request) or a set of source entities to build a query from.

   The similarity search runs in the enterprise pgvector store; this OSS tool resolves that code at
   call time so OSS keeps no static dependency on enterprise."
  (:require
   [clojure.string :as str]
   [metabase.metabot.prompt-entities :as prompt-entities]
   [metabase.metabot.scope :as scope]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-limit 50)
(def ^:private default-limit 10)

(def ^:private user-search-prompt-desc
  (str "A natural-language description of the data the user wants. Matched by vector similarity "
       "against curated saved prompts; phrase it like the saved prompt you'd expect to find."))

(def ^:private limit-desc
  (str "Maximum number of results (default " default-limit ", max " max-limit ")."))

(def ^:private search-prompt-entities-schema
  [:map {:closed true}
   [:user_search_prompt [:string {:description user-search-prompt-desc}]]
   [:limit {:optional true} [:maybe [:int {:min 1 :max max-limit :description limit-desc}]]]])

(defn- entity-summary
  "One-line description of a result's entity list for the text output."
  [entities]
  (let [n (count entities)]
    (if (= 1 n)
      (str "1 entity " (pr-str (first entities)))
      (str n " entities"))))

(defn- format-output [results]
  (if (empty? results)
    "<search_prompt_entities>No matching saved prompts.</search_prompt_entities>"
    (str "<search_prompt_entities>\n"
         (str/join "\n"
                   (for [{:keys [saved_search_prompt entities score]} results]
                     (format "<match score=\"%.3f\">%s — %s</match>"
                             (double (:total_score score))
                             saved_search_prompt
                             (entity-summary entities))))
         "\n</search_prompt_entities>")))

(mu/defn ^{:tool-name "search_prompt_entities"
           :scope     scope/agent-search}
  search-prompt-entities-tool
  "Match the user's request against curated saved search prompts that map to known entities. Use this
  for data selection before falling back to `search`: a hit returns either a canonical entity that
  directly answers the request, or a set of source entities to build a query over. Prefer canonical
  hits when their score is competitive."
  [{:keys [user_search_prompt limit]} :- search-prompt-entities-schema]
  (try
    (let [results (prompt-entities/search-prompt-entities
                   user_search_prompt (min max-limit (or limit default-limit)))]
      {:output            (format-output results)
       :structured-output {:result-type :search_prompt_entities
                           :data        results
                           :total_count (count results)}})
    (catch Exception e
      (log/error e "Error in search_prompt_entities")
      {:output (str "search_prompt_entities failed: " (or (ex-message e) "Unknown error"))})))
