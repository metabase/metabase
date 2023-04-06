(ns metabase.api.model-index
  (:require
   [clojure.set :as set]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.card :refer [Card]]
   [metabase.models.model-index :as model-index :refer [ModelIndex]]
   [metabase.sync.schedules :as sync.schedules]
   [metabase.util.cron :as u.cron]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn default-schedule
  "Default sync schedule for indexed values. Defaults to randomly once a day."
  []
  (u.cron/schedule-map->cron-string (sync.schedules/randomly-once-a-day)))

(api/defendpoint POST "/"
  [:as {{:keys [model_id pk_ref value_ref] :as _model-index} :body}]
  {model_id  ms/PositiveInt
   pk_ref    any?
   value_ref any?}
  (let [model      (api/read-check Card model_id)
        field_refs (into #{} (map :field_ref) (:result_metadata model))]
    (when-let [missing (seq (set/difference (into #{} (map model-index/normalize-field-ref) [pk_ref value_ref])
                                            field_refs))]
      (throw (ex-info (tru "Unrecognized fields to index")
                      {:missing missing
                       :present field_refs})))
    ;; todo: do we care if there's already an index on that model?
    ;; todo: `t2/insert-returning-instances!` returns a timestamp :(
    (t2/insert-returning-instances! ModelIndex
                                    [{:model_id   model_id
                                      ;; todo: sanitize these?
                                      :pk_ref     pk_ref
                                      :value_ref  value_ref
                                      :generation 0
                                      :schedule   (default-schedule)
                                      :state      "initial"
                                      :creator_id api/*current-user-id*}])
    ;; hack: get the model index with the highest id with the model_id. don't know why can't get it from the
    ;; `insert-returning-instances!` above.
    (let [model-index (t2/select-one ModelIndex
                                     :model_id model_id
                                     {:order-by [[:id :desc]]})]
      (model-index/add-values model-index)
      (t2/select-one ModelIndex :id (:id model-index)))))

(api/defendpoint GET "/"
  [model_id]
  {model_id ms/PositiveInt}
  (let [model (api/read-check Card model_id)]
    (when-not (:dataset model)
      (throw (ex-info (tru "Question {0} is not a model" model_id)
                      {:model_id model_id
                       :status-code 400})))
    (t2/select ModelIndex :model_id model_id)))

(api/defendpoint DELETE "/:id"
  [id]
  (let [model-index (api/read-check ModelIndex id)]
    (api/read-check Card (:model_id model-index))
    (t2/delete! ModelIndex id)))

(api/define-routes)
