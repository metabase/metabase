(ns metabase.indexed-entities.api
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.indexed-entities.models.model-index :as model-index]
   [metabase.indexed-entities.task.index-values :as task.index-values]
   ;; legacy usage, do not use this in new code
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- ensure-type
  "Ensure that the ref exists and is of type required for indexing."
  [t ref metadata]
  (if-let [field (some (fn [f] (when ((comp #{#_{:clj-kondo/ignore [:deprecated-var]} (mbql.normalize/normalize-field-ref ref)}
                                            :field_ref)
                                      f)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create ModelIndex."
  [_route-params
   _query-params
   {:keys [model_id pk_ref value_ref] :as _model-index} :- [:map
                                                            [:model_id  ms/PositiveInt]
                                                            [:pk_ref    any?]
                                                            [:value_ref any?]]]
  (let [model    (api/write-check :model/Card model_id)
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
      (analytics/track-event! :snowplow/model
                              {:event    :index-model-entities-enabled
                               :model-id model_id})
      (task.index-values/add-indexing-job model-index)
      (model-index/add-values! model-index)
      (t2/select-one :model/ModelIndex :id (:id model-index)))))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Retrieve list of ModelIndex."
  [_route-params
   {:keys [model_id]} :- [:map
                          [:model_id ms/PositiveInt]]]
  (let [model (api/read-check :model/Card model_id)]
    (when-not (= (:type model) :model)
      (throw (ex-info (tru "Question {0} is not a model" model_id)
                      {:model_id model_id
                       :status-code 400})))
    (t2/select :model/ModelIndex :model_id model_id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Retrieve ModelIndex."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [model-index (api/check-404 (t2/select-one :model/ModelIndex :id id))
        model       (api/read-check :model/Card (:model_id model-index))]
    (when-not (= (:type model) :model)
      (throw (ex-info (tru "Question {0} is not a model" id)
                      {:model_id id
                       :status-code 400})))
    model-index))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete ModelIndex."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/let-404 [model-index (t2/select-one :model/ModelIndex :id id)]
    (api/write-check :model/Card (:model_id model-index))
    (t2/delete! :model/ModelIndex id)))
