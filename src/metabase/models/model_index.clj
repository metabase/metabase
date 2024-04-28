(ns metabase.models.model-index
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.query-processor :as qp]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util.cron :as u.cron]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
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
  25000)

;;;; indexing functions

(defn valid-tuples?
  "Filter function for valid tuples for indexing: an id and a value."
  [[id v]] (and id v))

(mu/defn ^:private fix-expression-refs :- mbql.s/Field
  "Convert expression ref into a field ref.

Expression refs (`[:expression \"full-name\"]`) are how the _query_ refers to a custom column. But nested queries
don't, (and shouldn't) care that those are expressions. They are just another field. The field type is always
`:type/Text` enforced by the endpoint to create model indexes."
  [field-ref :- mbql.s/Field base-type]
  (case (first field-ref)
    :field field-ref
    :expression (let [[_ expression-name] field-ref]
                  ;; api validated that this is a text field when the model-index was created. When selecting the
                  ;; expression we treat it as a field.
                  [:field expression-name {:base-type base-type}])
    (throw (ex-info (format "Invalid field ref for indexing: %s" field-ref)
                    {:field-ref field-ref
                     :valid-clauses [:field :expression]}))))

(defn- fetch-values
  [model-index]
  (let [model     (t2/select-one Card :id (:model_id model-index))
        fix       (fn [field-ref base-type] (-> field-ref mbql.normalize/normalize-field-ref (fix-expression-refs base-type)))
        ;; :type/Text and :type/Integer are ensured at creation time on the api.
        value-ref (-> model-index :value_ref (fix :type/Text))
        pk-ref    (-> model-index :pk_ref (fix :type/Integer))]
    (try
      [nil (->> (qp/process-query
                 {:database (:database_id model)
                  :type     :query
                  :query    {:source-table (format "card__%d" (:id model))
                             :breakout     [pk-ref value-ref]
                             :limit        (inc max-indexed-values)}})
                :data :rows (filter valid-tuples?))]
      (catch Exception e
        (log/warnf e "Error fetching indexed values for model %s" (:id model))
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
        current-index-values            (into #{}
                                              (map (juxt :model_pk :name))
                                              (t2/select ModelIndexValue
                                                         :model_index_id (:id model-index)))]
    (if-not (str/blank? error-message)
      (t2/update! ModelIndex (:id model-index) {:state      "error"
                                                :error      error-message
                                                :indexed_at :%now})
      (try
        (t2/with-transaction [_conn]
          (let [{:keys [additions deletions]} (find-changes {:current-index current-index-values
                                                             :source-values values-to-index})]
            (when (seq deletions)
              (doseq [deletions-part (partition-all 10000 deletions)]
                (t2/delete! ModelIndexValue
                            :model_index_id (:id model-index)
                            :model_pk [:in (->> deletions-part (map first))])))
            (when (seq additions)
              (doseq [additions-part (partition-all 10000 additions)]
                (t2/insert! ModelIndexValue
                            (map (fn [[id v]]
                                   {:name           v
                                    :model_pk       id
                                    :model_index_id (:id model-index)})
                                 additions-part)))))
          (t2/update! ModelIndex (:id model-index)
                      {:indexed_at :%now
                       :error      nil
                       :state      (if (> (count values-to-index) max-indexed-values)
                                     "overflow"
                                     "indexed")}))
        (catch Exception e
          (log/error e (format "Error saving model-index values for model-index: %d, model: %d"
                               (:id model-index) (:model-id model-index)))
          (t2/update! ModelIndex (:id model-index)
                      {:state      "error"
                       :error      (ex-message e)
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
