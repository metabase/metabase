(ns metabase.native-query-snippets.cycle-detection
  "Cycle detection for native query snippets and cards that reference each other.
   Prevents circular dependencies that would cause infinite recursion during expansion."
  (:require
   [metabase.query-processor.util :as qp.util]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2]))

(defn- extract-snippet-references
  "Extract snippet IDs from a native query's template tags."
  [query]
  (when (= :native (:type query))
    (let [template-tags (get-in query [:native :template-tags])]
      (for [[_ tag] template-tags
            :when (= (:type tag) :snippet)]
        (:snippet-id tag)))))

(defn- snippet->references
  "Extract both card and snippet references from a snippet's template tags.
   Can either fetch from DB or use provided data."
  [snippet-id snippet-data]
  (let [template-tags (or (:template_tags snippet-data)
                          (:template_tags (t2/select-one :model/NativeQuerySnippet :id snippet-id)))]
    (for [[_ tag] template-tags
          :let [tag-type (:type tag)]
          :when (#{:card :snippet} tag-type)]
      (cond (= tag-type :card)
            [:card (:card-id tag)]

            (= tag-type :snippet)
            [:snippet (:snippet-id tag)]))))

(defn- fetch-card-query
  "Fetch a card's dataset_query from the database."
  [card-id]
  (or (t2/select-one-fn :dataset_query :model/Card :id card-id)
      (throw (ex-info (tru "Card {0} does not exist." card-id)
                      {:status-code 404}))))

(defn check-for-cycles
  "Check if starting from an entity would create a cycle through cards and snippets.

   entity-type: :card or :snippet
   entity-id: The ID of the card or snippet
   entity-data: For cards, the dataset_query; for snippets, can be nil or a map with :template_tags

   Throws an exception if a cycle is detected."
  [entity-type entity-id entity-data]
  (loop [entities-to-check [[entity-type entity-id entity-data]]
         ids-already-seen #{}]
    (if-let [[etype eid edata] (first entities-to-check)]
      (cond
        ;; Already seen this entity - cycle detected!
        (ids-already-seen [etype eid])
        (throw (ex-info (case entity-type
                          :card (tru "Cannot save Question: circular references detected.")
                          :snippet (tru "Cannot save Snippet: circular references detected."))
                        {:status-code 400
                         :cycle-entity [entity-type entity-id]}))

        ;; Process based on entity type
        :else
        (let [new-seen (conj ids-already-seen [etype eid])
              new-entities (case etype
                             :card (concat
                                    ;; Check for source cards
                                    (when-let [source-id (qp.util/query->source-card-id edata)]
                                      [[:card source-id (fetch-card-query source-id)]])
                                    ;; Check for snippet references
                                    (for [snippet-id (extract-snippet-references edata)]
                                      [:snippet snippet-id nil]))
                             :snippet (for [[ref-type ref-id] (snippet->references eid edata)]
                                        (case ref-type
                                          :card [ref-type ref-id (fetch-card-query ref-id)]
                                          :snippet [ref-type ref-id nil])))]
          (recur (concat (rest entities-to-check) new-entities)
                 new-seen)))
      ;; No more entities to check, no cycles found
      :ok)))

(defn check-card-would-create-cycle
  "Check if saving a card with the given dataset_query would create a cycle.
   This is a convenience function for checking cards."
  [card-id dataset-query]
  (check-for-cycles :card card-id dataset-query))

(defn check-snippet-would-create-cycle
  "Check if saving a snippet with the given template_tags would create a cycle.
   This is a convenience function for checking snippets.

   snippet-id: The ID of the snippet being updated
   template-tags: Optional - the new template tags. If not provided, fetches from DB."
  ([snippet-id]
   (check-for-cycles :snippet snippet-id nil))
  ([snippet-id template-tags]
   (check-for-cycles :snippet snippet-id {:template_tags template-tags})))
