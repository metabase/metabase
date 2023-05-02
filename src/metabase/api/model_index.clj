(ns metabase.api.model-index
  (:require
   [clojure.set :as set]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.models.card :refer [Card]]
   [metabase.models.model-index :as model-index :refer [ModelIndex]]
   [metabase.task.index-values :as task.index-values]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
    (let [model-index (model-index/create {:model-id   model_id
                                           :pk-ref     pk_ref
                                           :value-ref  value_ref
                                           :creator-id api/*current-user-id*})]
      (task.index-values/add-indexing-job model-index)
      (model-index/add-values! model-index)
      (t2/select-one ModelIndex :id (:id model-index)))))

(api/defendpoint DELETE "/:id"
  [id]
  {id ms/PositiveInt}
  (api/let-404 [model-index (t2/select-one ModelIndex :id id)]
    (api/read-check Card (:model_id model-index))
    (t2/delete! ModelIndex id)))

(api/define-routes)
