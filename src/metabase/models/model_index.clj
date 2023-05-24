(ns metabase.models.model-index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
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
                                :breakout     [(:pk_ref model-index) (:value_ref model-index)]
                                :order-by     [[:desc (:value_ref model-index)]]
                                :limit        (inc max-indexed-values)}})
                   :data :rows (filter valid-tuples?))]
         (catch Exception e
           (log/warn (trs "Error fetching indexed values for model {0}" (:id model)) e)
           [(ex-message e) []]))))

(defn find-changes
  "Find additions and deletions in indexed values. `source-values` are from the db, `indexed-values` are what we
  currently have indexed.

  We have to identity values no longer in the set, values that must be added to the index, and primary keys which now
  have a different value. Updates will come out as a deletion and an addition. In the future we could make these an
  update if desired."
  [{:keys [current-index source-values]}]
  (let [current (set current-index)
        ;; into {} to ensure that each id appears only once. Later values "win".
        source  (set (into {} source-values))]
    {:additions (set/difference source current)
     :deletions (set/difference current source)}))

(defn add-values!
  "Add indexed values to the model_index_value table."
  [model-index]
  (let [[error-message values-to-index] (fetch-values model-index)
        current-index-values               (into #{}
                                                 (map (juxt :model_pk :name))
                                                 (t2/select ModelIndexValue
                                                            :model_index_id (:id model-index)))]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:state           "error"
                                                :error           error-message
                                                :indexed_at :%now})
      (try
        (t2/with-transaction [_conn]
          (let [{:keys [additions deletions]} (find-changes {:current-index current-index-values
                                                             :source-values values-to-index})]
            (when (seq deletions)
              (t2/delete! ModelIndexValue
                          :model_index_id (:id model-index)
                          :pk_ref [:in (->> deletions (map first))]))
            (when (seq additions)
              (t2/insert! ModelIndexValue
                          (map (fn [[id v]]
                                 {:name           v
                                  :model_pk       id
                                  :model_index_id (:id model-index)})
                               additions))))
          (t2/update! ModelIndex (:id model-index)
                      {:indexed_at :%now
                       :state           (if (> (count values-to-index) max-indexed-values)
                                          "overflow"
                                          "indexed")}))
        (catch Exception e
          (t2/update! ModelIndex (:id model-index)
                      {:state           "error"
                       :error           (ex-message e)
                       :indexed_at :%now}))))))


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
                                           :schedule   (default-schedule)
                                           :state      "initial"
                                           :creator_id creator-id}])))
