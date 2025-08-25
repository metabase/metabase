(ns metabase.lib.cycles
  "Pure cycle detection logic for entities that reference each other.

   This namespace provides functions for detecting circular dependencies in
   snippets and other entities using a dependency graph approach."
  (:require
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.native :as lib.native]
   [metabase.util.i18n :as i18n]
   [weavejester.dependency :as dep]))

(defn- extract-snippet-references
  "Extract snippet names from template tags in content.
   Returns a sequence of snippet names found in {{snippet: name}} tags.
   Ignores other template tag types like {{#card}} or {{variable}}."
  [content]
  (when content
    (let [template-tags (lib.native/recognize-template-tags content)]
      (sequence (comp (filter #(= :snippet (:type %)))
                      (map :snippet-name))
                (vals template-tags)))))

(defn- try-add-dependency!
  "Add a dependency edge to the graph from from-id to to-id.
   Returns the updated graph if successful.
   Throws an internationalized exception if adding the edge would create a cycle."
  [graph from-id to-id]
  (try
    (dep/depend graph from-id to-id)
    (catch #?(:clj Exception :cljs js/Error) e
      (throw (ex-info (i18n/tru "Circular dependency between snippets") {} e)))))

(defn- queue-item
  "Create a work queue item for processing.
   from-snippet-id: The ID of the snippet containing the reference
   to-snippet-name: The name of the referenced snippet"
  [from-snippet-id to-snippet-name]
  {:from-id from-snippet-id
   :to-name to-snippet-name})

(defn- process-snippet-batch
  "Process a batch of snippet references, building the dependency graph.

   Parameters:
   - graph: Current dependency graph
   - name->snippet: Map of snippet names to snippet metadata
   - on-unknown-snippet: Function to call when a referenced snippet doesn't exist
   - current-batch: Collection of {:from-id :to-name} queue items to process

   Returns a map with:
   - :graph - Updated dependency graph with new edges
   - :next-batch - Collection of new queue items for snippets to process next"
  [graph name->snippet on-unknown-snippet current-batch]
  (reduce
   (fn [{:keys [graph next-batch]} {:keys [to-name from-id]}]
     (if-let [to-snippet (name->snippet to-name)]
       (let [to-snippet-id (:id to-snippet)
             graph'        (try-add-dependency! graph from-id to-snippet-id)
             to-names      (extract-snippet-references (:content to-snippet))]
         {:graph      graph'
          :next-batch (into next-batch (map #(queue-item to-snippet-id %)) to-names)})
       (do
         (on-unknown-snippet to-name)
         {:graph graph, :next-batch next-batch})))
   {:graph graph :next-batch []}
   current-batch))

(defn- check-cycles*
  [metadata-provider initial-queue on-unknown-snippet]
  (loop [graph            (dep/graph)
         snippets-visited 0
         name->snippet    {}
         process-queue    initial-queue]
    (cond
      (empty? process-queue)
      nil

      (> snippets-visited 1000)
      (throw (ex-info (i18n/tru "Too many snippets to process (>1000)")
                      {:snippets-visited snippets-visited}))

      :else
      (let [;; Extract all snippets for current batch in one swoop:
            all-names      (into #{} (comp (map :to-name) (remove name->snippet)) process-queue)
            new-snippets   (lib.metadata.protocols/metadatas-by-name
                            metadata-provider
                            :metadata/native-query-snippet
                            all-names)
            name->snippet' (into name->snippet (map (juxt :name identity)) new-snippets)
            result         (process-snippet-batch graph name->snippet' on-unknown-snippet process-queue)]
        (recur (:graph result)
               (+ snippets-visited (count new-snippets))
               name->snippet'
               (:next-batch result))))))

(defn check-snippet-cycles
  "Check for cycles in snippet→snippet references starting from a given snippet.

   Only checks for cycles between snippets. Card references and other template tag types are ignored.

   Parameters:
   - metadata-provider: Provider for fetching snippet metadata (can be snippets-only metadata provider)
   - snippet: The snippet object to start checking from (must have :id, :name, and :content)
   - on-unknown-snippet: (optional) Function called with snippet name when a referenced snippet doesn't exist

   Returns nil if no cycles are detected.
   Throws if a cycle is found or if processing exceeds safety limits."
  ([metadata-provider snippet]
   (check-snippet-cycles metadata-provider snippet (constantly nil)))
  ([metadata-provider snippet on-unknown-snippet]
   (let [snippet-id    (:id snippet)
         initial-queue (->> (extract-snippet-references (:content snippet))
                            (into [] (map #(queue-item snippet-id %))))]
     (when (seq initial-queue)
       (check-cycles* metadata-provider initial-queue on-unknown-snippet)))))
