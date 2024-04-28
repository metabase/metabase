(ns metabase.api.model-index
  (:require
   [compojure.core :refer [POST]]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.models.card :refer [Card]]
   [metabase.models.model-index :as model-index :refer [ModelIndex]]
   [metabase.task.index-values :as task.index-values]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- ensure-type
  "Ensure that the ref exists and is of type required for indexing."
  [t ref metadata]
  (if-let [field (some (fn [f] (when ((comp #{(mbql.normalize/normalize-field-ref ref)} :field_ref) f)
                                 f))
                       metadata)]
    (let [type-slot (case t
                      :type/PK                   :semantic_type
                      (:type/Integer :type/Text) :effective_type)]
      (when-not (isa? (type-slot field) t)
        (throw (ex-info (tru "Field is not of {0} `{1}`" type-slot t)
                        {:status-code   400
                         :expected-type t
                         :type          (:effective_type field)
                         :field         (:name field)}))))
    (throw (ex-info (tru "Could not identify field by ref {0}" ref)
                    {:status-code 400
                     :ref         ref
                     :fields      metadata}))))

(api/defendpoint POST "/"
  "Create ModelIndex."
  [:as {{:keys [model_id pk_ref value_ref] :as _model-index} :body}]
  {model_id  ms/PositiveInt
   pk_ref    any?
   value_ref any?}
  (let [model    (api/write-check Card model_id)
        metadata (:result_metadata model)]
    (when-not (seq metadata)
      (throw (ex-info (tru "Model has no metadata. Cannot index")
                      {:model-id model_id})))
    (ensure-type :type/PK pk_ref metadata)
    (ensure-type :type/Integer pk_ref metadata)
    (ensure-type :type/Text value_ref metadata)
    ;; todo: do we care if there's already an index on that model?
    (let [model-index (model-index/create {:model-id   model_id
                                           :pk-ref     pk_ref
                                           :value-ref  value_ref
                                           :creator-id api/*current-user-id*})]
      (snowplow/track-event! ::snowplow/index-model-entities-enabled api/*current-user-id* {:model-id model_id})
      (task.index-values/add-indexing-job model-index)
      (model-index/add-values! model-index)
      (t2/select-one ModelIndex :id (:id model-index)))))

(api/defendpoint GET "/"
  "Retrieve list of ModelIndex."
  [model_id]
  {model_id ms/PositiveInt}
  (let [model (api/read-check Card model_id)]
    (when-not (= (:type model) :model)
      (throw (ex-info (tru "Question {0} is not a model" model_id)
                      {:model_id model_id
                       :status-code 400})))
    (t2/select ModelIndex :model_id model_id)))

(api/defendpoint GET "/:id"
  "Retrieve ModelIndex."
  [id]
  {id ms/PositiveInt}
  (let [model-index (api/check-404 (t2/select-one ModelIndex :id id))
        model       (api/read-check Card (:model_id model-index))]
    (when-not (= (:type model) :model)
      (throw (ex-info (tru "Question {0} is not a model" id)
                      {:model_id id
                       :status-code 400})))
    model-index))

(api/defendpoint DELETE "/:id"
  "Delete ModelIndex."
  [id]
  {id ms/PositiveInt}
  (api/let-404 [model-index (t2/select-one ModelIndex :id id)]
    (api/write-check Card (:model_id model-index))
    (t2/delete! ModelIndex id)))

(api/define-routes)
