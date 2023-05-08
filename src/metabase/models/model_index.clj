(ns metabase.models.model-index
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [toucan.models :as models]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; model lifecycle ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(models/defmodel ModelIndex :model_index)
(models/defmodel ModelIndexValue :model_index_value)

(derive ModelIndex :hook/created-at-timestamped?)

(def normalize-field-ref
  "Normalize the field ref. Ensure it's well-formed mbql, not just json."
  (comp #'mbql.normalize/canonicalize-mbql-clauses
        #'mbql.normalize/normalize-tokens))

(t2/deftransforms ModelIndex
  {:pk_ref    {:in  json/generate-string
               :out (comp normalize-field-ref #(json/parse-string % true))}
   :value_ref {:in  json/generate-string
               :out (comp normalize-field-ref #(json/parse-string % true))}})

(t2/define-before-delete ModelIndex
  [model-index]
  (let [remove-refresh-job (requiring-resolve 'metabase.task.index-values/remove-indexing-job)]
    (remove-refresh-job model-index)))

;;;; indexing functions

(defn- fetch-values
  [model-index]
  (let [model (t2/select-one Card :id (:model_id model-index))]
    (try [nil (->> (qp/process-query
                    {:database (:database_id model)
                     :type     :query
                     :query    {:source-table (format "card__%d" (:id model))
                                :fields       [(:pk_ref model-index) (:value_ref model-index)]
                                :order-by     [[:desc (:value_ref model-index)]]
                                :limit        5001
                                :breakout   [(:pk_ref model-index) (:value_ref model-index)]}})
                   :data :rows)]
         (catch Exception e
           (log/warn (trs "Error fetching indexed values for model {0}" (:id model)) e)
           [(ex-message e) []]))))

(defmulti add-values* "Index values in a model."
  (fn [_model-index _values] (mdb.connection/db-type)))

(defmethod add-values* :h2
  [model-index values]
  ;; h2 just deletes and recreates
  (t2/delete! ModelIndexValue :model_index_id (:id model-index))
  (t2/insert! ModelIndexValue (map (fn [[id v]]
                                     {:name           v
                                      :model_pk       id
                                      :model_index_id (:id model-index)
                                      :generation     (inc (:generation model-index))})
                                   values)))

(defmethod add-values* :postgres
  [model-index values]
  (let [new-generation (inc (:generation model-index))]
    ;; use upserts and delete ones with old generations
    (t2/query {:insert-into   [:model_index_value]
               :values        (into []
                                    (comp (filter (fn [[id v]] (and id v)))
                                          (map (fn [[id v]]
                                                 {:name           v
                                                  :model_pk       id
                                                  :model_index_id (:id model-index)
                                                  :generation     new-generation})))
                                    values)
               :on-conflict   [:model_index_id :model_pk]
               :do-update-set {:generation new-generation}})
   (t2/delete! ModelIndexValue
               :model_index_id (:id model-index)
               :generation     [:< new-generation])))

(defmethod add-values* :mysql
  [model-index values]
  (let [new-generation (inc (:generation model-index))]
    ;; use upserts and delete ones with old generations
    (t2/query {:insert-into             [:model_index_value]
               :values                  (into []
                                    (comp (filter (fn [[id v]] (and id v)))
                                          (map (fn [[id v]]
                                                 {:name           v
                                                  :model_pk       id
                                                  :model_index_id (:id model-index)
                                                  :generation     new-generation})))
                                    values)
               :on-duplicate-key-update {:generation new-generation}})
    (t2/delete! ModelIndexValue
                :model_index_id (:id model-index)
                :generation     [:< new-generation])))

(defn add-values!
  "Add indexed values to the model_index_value table."
  [model-index]
  (let [[error-message index-values] (fetch-values model-index)
        generation'                  (inc (:generation model-index))]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:state           "error"
                                                :error           error-message
                                                :state_change_at :%now})
      (do (add-values* model-index (filter (fn [[_id value]] (some? value)) index-values))
          (t2/update! ModelIndex (:id model-index)
                      {:generation      generation'
                       :state_change_at :%now
                       :state           (if (> (count index-values) 5000) "overflow" "indexed")})))))


;;;; creation

(defn default-schedule
  "Default sync schedule for indexed values. Defaults to randomly once a day."
  []
  (u.cron/schedule-map->cron-string (sync.schedules/randomly-once-a-day)))

(defn create
  "Create a model index"
  [{:keys [model-id pk-ref value-ref creator-id]}]
  (first (t2/insert-returning-instances! ModelIndex
                                         [{:model_id   model-id
                                           ;; todo: sanitize these?
                                           :pk_ref     pk-ref
                                           :value_ref  value-ref
                                           :generation 0
                                           :schedule   (default-schedule)
                                           :state      "initial"
                                           :creator_id creator-id}])))
