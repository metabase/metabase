(ns metabase.metabot.agent.autoload
  "Autoloading search results: after a search, a System One model judges each result against the user's request and
  the likely matches are read with `read_resource` in the same tool call, saving the agent an LLM round trip."
  (:require
   [metabase.ai-tracing.core :as ait]
   [metabase.metabot.agent.timing :as timing]
   [metabase.metabot.self.system-one :as s1]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def search-tool-names
  "Tools whose results are candidates for autoloading."
  #{"search" "retrieve_library_entities"})

(def ^:private max-candidates 10)

(def ^:private max-autoloaded 3)

(def ^:private threshold 0.5)

(def ^:private field-bearing-uri-types
  "URI types whose `/fields` read carries the columns a query needs; the bare URI only summarizes them."
  #{"table" "model" "question"})

(defn- candidate-uri [{:keys [id type]}]
  (when id
    (when-let [uri-type (llm-shape/search-result-uri-type type)]
      (if (field-bearing-uri-types uri-type)
        (llm-shape/metabase-uri uri-type id "fields")
        (llm-shape/metabase-uri uri-type id)))))

(defn- candidate-summary [result]
  (-> (select-keys result [:type :name :display_name :description :database_name :verified
                           :matched_text :usage_instructions])
      (assoc :collection (get-in result [:collection :name]))
      (update-vals #(if (keyword? %) (name %) %))))

(defn- candidate-question [i]
  (s1/noul (str "`candidates[" i "]` contains the data or content the agent needs to answer `user_prompt`, which "
                "the agent searched for with `search_queries`.")
           {:true  (str "Its name, type, and description match what `user_prompt` asks about. Several candidates can "
                        "qualify, such as copies of the same table in different databases. Example: an orders table "
                        "for \"show me orders over time\", or the dashboard the user named.")
            :false "It is only loosely related, or about a different subject than `user_prompt`."}))

(defn- search-queries
  "The search strings the agent passed to a search tool."
  [{:keys [semantic_queries keyword_queries user_search_prompt]}]
  (vec (concat semantic_queries keyword_queries (some-> user_search_prompt vector))))

(defn- likely-uris
  "URIs of the `results` a System One model judges likely to be needed for `prompt`, most likely first."
  [prompt search-args results tracking-opts]
  (let [candidates (->> results
                        (keep #(when-let [uri (candidate-uri %)] (assoc % ::uri uri)))
                        (take max-candidates)
                        vec)]
    (when (seq candidates)
      (let [answers (:answers (s1/ask {:user_prompt    prompt
                                       :search_queries (search-queries search-args)
                                       :candidates     (mapv candidate-summary candidates)}
                                      (into {} (map-indexed (fn [i _] [(keyword (str "candidate-" i)) (candidate-question i)]))
                                            candidates)
                                      {:tracking-opts (assoc tracking-opts :tag "autoload")}))]
        (->> candidates
             (map-indexed (fn [i c] [(get-in answers [(keyword (str "candidate-" i)) :noul] 0) (::uri c)]))
             (filter #(>= (first %) threshold))
             (sort-by first >)
             (take max-autoloaded)
             (mapv second))))))

(defn- autoload [result prompt search-args read-resource-fn tracking-opts]
  (let [results (get-in result [:structured-output :data])]
    (if (and (= :search (get-in result [:structured-output :result-type])) (seq results))
      (with-span :info {:name :metabot.agent/autoload}
        (ait/eval-span "agent.autoload" {}
                       (try
                         (if-let [uris (not-empty (likely-uris prompt search-args results tracking-opts))]
                           (let [{:keys [output]} (timing/timed {:kind :autoload-read}
                                                                (read-resource-fn {:uris uris}))]
                             (log/info "Autoloaded search results" {:uris uris})
                             (update result :output str
                                     "\n<autoloaded_resources>\n"
                                     "These results looked like likely matches, so they were read for you with read_resource:\n"
                                     output
                                     "\n</autoloaded_resources>"))
                           result)
                         (catch Exception e
                           (log/warn e "Autoloading search results failed; returning the search results alone")
                           result))))
      result)))

(defn enabled?
  "Whether `profile` autoloads search results given its `tools` (a map keyed by tool name)."
  [profile tools]
  (boolean (and (:autoload-resources? profile)
                (contains? tools "read_resource")
                (some search-tool-names (keys tools))
                (s1/available?))))

(defn wrap-search-tools
  "Wrap the search tools in `tools` (tool name -> tool definition map) so their likely matches for `prompt` are read
  with the `read_resource` tool in `tools` and appended to the search output. `tools` is returned unchanged unless
  autoloading is [[enabled?]] for `profile` and there is a prompt. `tracking-opts` attribute the System One calls
  in usage analytics, as for [[s1/ask]]."
  [tools profile prompt tracking-opts]
  (if-let [read-resource-fn (and prompt (enabled? profile tools) (get-in tools ["read_resource" :fn]))]
    (reduce (fn [tools tool-name]
              (if (contains? tools tool-name)
                (update-in tools [tool-name :fn]
                           (fn [search-fn]
                             (fn [args]
                               (autoload (timing/timed {:kind :autoload-search :tool tool-name}
                                                       (search-fn args))
                                         prompt args read-resource-fn tracking-opts))))
                tools))
            tools
            search-tool-names)
    tools))
