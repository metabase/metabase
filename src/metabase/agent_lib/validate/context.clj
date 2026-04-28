(ns metabase.agent-lib.validate.context
  "Context-derived validation helpers for structured programs."
  (:require
   [metabase.agent-lib.common.errors :refer [invalid-program!]]))

(set! *warn-on-reflection* true)

(defn context-allowed-ids
  "Derive the ids that are valid for the current evaluation context."
  [{:keys [source-entity referenced-entities surrounding-tables measure-ids]}]
  (let [entity-summaries  (concat [source-entity] referenced-entities surrounding-tables)
        summary-field-ids (fn [entity-summary]
                            (->> (concat
                                  (:columns entity-summary)
                                  (get-in entity-summary [:query_summary :returned_columns])
                                  (get-in entity-summary [:query_summary :filterable_columns])
                                  (:queryable_dimensions entity-summary))
                                 (keep :id)
                                 (filter pos-int?)))
        source-model      (:model source-entity)]
    {:table-ids   (->> (concat
                        (when (= source-model "table") [(:id source-entity)])
                        (keep #(when (= "table" (:model %)) (:id %)) referenced-entities)
                        (map :id surrounding-tables))
                       (filter pos-int?)
                       set)
     :card-ids    (->> (concat
                        (when (#{"card" "dataset"} source-model) [(:id source-entity)])
                        (keep #(when (#{"card" "dataset"} (:model %)) (:id %)) referenced-entities))
                       (filter pos-int?)
                       set)
     :metric-ids  (->> (concat
                        (when (= source-model "metric") [(:id source-entity)])
                        (keep #(when (= "metric" (:model %)) (:id %)) referenced-entities))
                       (filter pos-int?)
                       set)
     :measure-ids (set (filter pos-int? measure-ids))
     :field-ids   (->> entity-summaries
                       (mapcat summary-field-ids)
                       set)}))

(defn validate-source!
  "Validate a structured source against the context-derived allowed ids."
  [validate-nested-program allowed-ids path source depth state]
  (case (:type source)
    "context"
    (do
      (when-not (= "source" (:ref source))
        (invalid-program! (conj path :ref) "context source ref must be `source`"))
      state)

    "table"
    (do
      (when-not (pos-int? (:id source))
        (invalid-program! (conj path :id) "source table id must be a numeric id"))
      (when-not ((:table-ids allowed-ids) (:id source))
        (invalid-program! (conj path :id) "source table id is not available in the provided context"))
      state)

    ("card" "dataset")
    (do
      (when-not ((:card-ids allowed-ids) (:id source))
        (invalid-program! (conj path :id) "source card id is not available in the provided context"))
      state)

    "metric"
    (do
      (when-not ((:metric-ids allowed-ids) (:id source))
        (invalid-program! (conj path :id) "source metric id is not available in the provided context"))
      state)

    "program"
    (validate-nested-program (conj path :program) (:program source) (inc depth)
                             (update state :program-nesting (fnil inc 0)))

    (invalid-program! (conj path :type) "unsupported source type")))
