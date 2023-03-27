(ns metabase.metabot
  (:require
   [cheshire.core :as json]
   [metabase.models :refer [Card Collection Database Field FieldValues Table]]
   [toucan2.core :as t2]))

;; TODO - Move to test/rcb then delete.
(comment
  ;; If you know your model id, try this
  (generate-dataset-from-prompt
   (den) (t2/select-one Card :id 1151)
   "show total sales per region, where regions are intermountain west, new england, and other states")

  ;; Show how we feed data into the model selector bot
  (prepare-model-finder-input
   (t2/select Card :database_id 1 :dataset true)
   "how many accounts have we had over time?")

  ;; Example of searching for the best model
  (find-best-model {:id 1} "how many accounts have we had over time?")


  (t2/select-one-fn :database_id Card :id 1151)

  (let [{:keys [engine id] :as db} (t2/select-one Database :id 1)
        models (t2/select Card :database_id id :dataset true)
        {:keys [result_metadata] :as model} (first models)]
    (denormalize-model model))

  (let [db (t2/select-one Database :id 1)]
    (denormalize-database db))

  (let [db (t2/select-one Database :id 1)]
    (println
     (json/generate-string
      (denormalize-database db)
      {:pretty true})))

  (let [db (t2/select-one Database :id 1)]
    (spit "sample.json"
          (json/generate-string
           (denormalize-database db)
           {:pretty true})))
  )
