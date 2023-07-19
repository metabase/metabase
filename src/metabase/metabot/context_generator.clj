(ns metabase.metabot.context-generator
  (:require
    [clojure.core.async :as a]
    [clojure.data.json :as json]
    [clojure.java.io :as io]
    [clojure.string :as str]
    [clojure.walk :as walk]
    [metabase.lib.convert :as convert]
    [metabase.lib.metadata.calculation :as calc]
    [metabase.lib.metadata.jvm :as metadata.jvm]
    [metabase.lib.metadata.protocols :as metadata.p]
    [metabase.lib.query :as lib.query]
    [metabase.models :as models]
    [toucan2.core :as t2])
  (:import (java.io BufferedWriter)))

(set! *warn-on-reflection* true)

(defn extract-referenced-ids
  "Walk a query and return the set of tables and fields referenced in the query."
  [query]
  (let [references (atom {:referenced-tables #{} :referenced-fields #{}})]
    (walk/prewalk
      (fn [v]
        (when (vector? v)
          (let [[kw id] v]
            (case kw
              (:source-table "source-table")
              (if (string? id)
                (let [[_ card-id] (re-matches #"card__(\d+)" id)]
                  (swap! references update :referenced-tables conj (parse-long card-id)))
                (swap! references update :referenced-tables conj id))
              (:field-id "field-id" :field "field")
              (when (integer? id)
                (swap! references update :referenced-fields conj id))
              nil)))
        v)
      query)
    @references))

(def md-provider (metadata.jvm/application-database-metadata-provider))

(defn prune-empty
  "for some reason we aren't pruning empty strings into nulls so we
  end up with empty strings where metabase does not and (keyword \"\")
  on fields that have their (non-nil) values keyworded."
  [m]
  (let [nil-keyword (keyword "")
        bad?        (some-fn (every-pred string? str/blank?) #{nil-keyword})]
    (into {} (map (fn [[k v]]
                    (when-not (bad? v) [k v])))
          m)))

(defn fields
  "Get all fields for a given table."
  [table-id]
  (->> (t2/select models/Field :table_id table-id)
       (mapv (comp #(#'metadata.jvm/instance->metadata % :metadata/field) prune-empty))))

(defn make-context
  "Make a full context for any mbql query. This includes every field from every
   table involved in the query since specifying only the used fields will bias
   training. The inferencer must be given all potential fields to choose from
   and then select the right ones based on the user prompt."
  [mbql]
  (let [{:keys [referenced-tables referenced-fields]} (extract-referenced-ids mbql)
        all-fields (into #{}
                         (concat (mapcat (partial metadata.p/fields md-provider) referenced-tables)
                                 (map (partial metadata.p/field md-provider)
                                      referenced-fields)))
        all-tables (->> (into #{} (concat (keep :table-id all-fields)
                                          referenced-tables))
                        (map (partial metadata.p/table md-provider)))]
    (for [table all-tables]
      {:table_id          (:id table)
       :table_name        (:name table)
       :table_description (:description table)
       :fields            (map (fn [field]
                                 {:field_id          (:id field)
                                  :field_name        (:name field)
                                  :field_description (:description field)
                                  :field_type        (:effective-type field)})
                               (fields (:id table)))})))

(defn model-description
  "Given a model (or any object with a dataset_query), return the machine
  generated description of that model. This serves as a proxy for user prompts
  in the absence of a good set of hand-curated prompts."
  [{:keys [dataset_query]}]
  (try (let [converted (convert/->pMBQL dataset_query)
             mbqlv2    (lib.query/query md-provider converted)]
         {:description (calc/describe-query mbqlv2)})
       (catch Exception e
         {:success?  false
          :error-msg (ex-message e)})))

(defn model-training-data
  "Given a db-id, returns a lazy sequence of context maps for all models in the db.

  This is generally used for downstream training."
  [db-id]
  (for [{:keys [dataset_query] :as card} (t2/select models/Card :database_id db-id :dataset true)
        :let [{:keys [query]} dataset_query
              {:keys [description]} (model-description card)]]
    (cond->
      {:context (make-context query) :query query}
      description
      (assoc :description description))))

(defn model-training-data->jsonl
  "Write the training data to a jsonl file"
  [db-id success-filename fail-filename]
  (letfn [(write-training [^BufferedWriter w record]
            (io/copy (json/write-str (update record :query json/write-str)) w)
            (.newLine w))
          (write-failure [^BufferedWriter w record]
            (io/copy (json/write-str (update record :query json/write-str)) w)
            (.newLine w))]
    (let [c (a/to-chan! (model-training-data db-id))]
      (a/thread
        (with-open [success-writer (io/writer success-filename)
                    failure-writer (io/writer fail-filename)]
          (loop [{:keys [description] :as record} (a/<!! c)
                 records-processed 0]
            (if record
              (do
                (if description
                  (write-training success-writer record)
                  (write-failure failure-writer record))
                (recur (a/<!! c) (inc records-processed)))
              (println records-processed))))))))

(comment
  (model-training-data 1)

  (model-training-data->jsonl
    1
    "local/local_models.jsonl"
    "local/failed_local_models.jsonl")

  (require '[clj-http.client :as http])
  (let [request {:method       :post
                 :url          "http://localhost:3000/metabot/database/training/models/1"
                 ;:body         (json/write-str {:input input-string})
                 :as           :json
                 :content-type :json}
        {:keys [body status]} (http/request request)]
    (when (= 200 status)
      body))
  )

