(ns metabase.models.model-index
  (:require
   [clojure.string :as str]
   [metabase.db.connection :as mdb.connection]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;; model lifecycle ;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(def ModelIndex
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all the ModelIndex symbol in our codebase."
  :model/ModelIndex)

(def ModelIndexValue
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all the ModelIndexValue symbol in our codebase."
  :model/ModelIndexValue)

(methodical/defmethod t2/table-name :model/ModelIndex [_model] :model_index)
(methodical/defmethod t2/table-name :model/ModelIndexValue [_model] :model_index_value)
(derive :model/ModelIndex :metabase/model)
(derive :model/ModelIndexValue :metabase/model)

(derive :model/ModelIndex :hook/created-at-timestamped?)

(t2/deftransforms ModelIndex
  {:pk_ref    mi/transform-field-ref
   :value_ref mi/transform-field-ref})

(t2/define-before-delete ModelIndex
  [model-index]
  (let [remove-refresh-job (requiring-resolve 'metabase.task.index-values/remove-indexing-job)]
    (remove-refresh-job model-index)))

(def max-indexed-values
  "Maximum number of values we will index. Actually take one more than this to test if there are more than the
  threshold."
  5000)

;;;; indexing functions

(defn valid-tuples?
  "Filter function for valid tuples for indexing: an id and a value."
  [[id v]] (and id v))

(defn- fetch-values
  [model-index]
  (let [model (t2/select-one Card :id (:model_id model-index))]
    (try [nil (->> (qp/process-query
                    {:database (:database_id model)
                     :type     :query
                     :query    {:source-table (format "card__%d" (:id model))
                                :fields       [(:pk_ref model-index) (:value_ref model-index)]
                                :order-by     [[:desc (:value_ref model-index)]]
                                :limit        (inc max-indexed-values)
                                :breakout     [(:pk_ref model-index) (:value_ref model-index)]}})
                   :data :rows (filter valid-tuples?))]
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
                                    (comp (filter valid-tuples?)
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
  (let [[error-message index-values] (fetch-values model-index)]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:state           "error"
                                                :error           error-message
                                                :state_change_at :%now})
      (try
        (t2/with-transaction [_conn]
          (add-values* model-index (filter (fn [[_id value]] (some? value)) index-values))
          (t2/update! ModelIndex (:id model-index)
                      {:generation      (inc (:generation model-index))
                       :state_change_at :%now
                       :state           (if (> (count index-values) max-indexed-values)
                                          "overflow"
                                          "indexed")}))
        (catch Exception e
          (t2/update! ModelIndex (:id model-index)
                      {:state           "error"
                       :error           (ex-message e)
                       :state_change_at :%now}))))))


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
