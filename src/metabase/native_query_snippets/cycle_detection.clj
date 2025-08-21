(ns metabase.native-query-snippets.cycle-detection
  "Cycle detection for native query snippets.
   Handles pure snippet→snippet cycles directly, delegates to lib/query for card-involved cycles."
  (:require
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.queries.core :as queries]
   [toucan2.core :as t2]))

(defn- ->snippet-dependencies
  "Returns sequence of [:card card-id] and [:snippet snippet-name]."
  [template-tags]
  (for [[_ tag] template-tags
        :let [tag-type (:type tag)]
        :when (#{:card :snippet} tag-type)]
    (case tag-type
      :card [tag-type (:card-id tag)]
      :snippet [tag-type (:snippet-name tag)])))

(defn- names->ids-and-tags
  "Accepts a sequence of snippet-names. Returns a sequence of [snippet-id snippe-template-tags]."
  [snippet-names]
  (when (seq snippet-names)
    (for [snippet (t2/select :model/NativeQuerySnippet :name [:in snippet-names])]
      [(:id snippet) (:template_tags snippet)])))

(defn- check-for-cycles*
  [snippet-id template-tags throw-circular!]
  (loop [[[id tags] & queue] [[snippet-id template-tags]]
         snippets-seen #{}]
    (when id
      (if (contains? snippets-seen id)
        (throw-circular! nil)
        (let [;; [[:card card-id] [:snippet snippet-name] ...]:
              tag-infos (->snippet-dependencies tags)]
          (if-let [[_ card-id] (first (filter #(= :card (first %)) tag-infos))]
            ;; We found a card!
            [::fallback card-id]
            ;; No cards found, only snippets (if anything). second = snippet-name
            (recur (into queue (names->ids-and-tags (map second tag-infos)))
                   (conj snippets-seen id))))))))

(defn- dataset-query->query ; TODO: shamelessly ripped out of queries.api.card
  "Convert the `dataset_query` column of a Card to a MLv2 pMBQL query."
  ([dataset-query]
   (some-> (:database dataset-query)
           lib.metadata.jvm/application-database-metadata-provider
           (dataset-query->query dataset-query)))
  ([metadata-provider dataset-query]
   ;; TODO: in order to rip it out of queries.api.card I exposed queries/normalize-dataset-query
   (some->> dataset-query queries/normalize-dataset-query (lib/query metadata-provider))))

(defn check-for-cycles
  "Takes:
   - snippet-id
   - changes to be saved to the model
   - a function to call if a cycle is found"
  [id changes throw-circular!]
  (let [template-tags (lib/recognize-template-tags (:content changes))
        [outcome card-id] (check-for-cycles* id template-tags throw-circular!)]
    (when (= outcome ::fallback)
      (try
        (let [dataset-query (t2/select-one-fn :dataset_query :model/Card :id card-id)
              query (dataset-query->query dataset-query)]
          (lib/check-snippet-overwrite id template-tags query)
          true)
        (catch Exception e
          (throw-circular! e))))))
