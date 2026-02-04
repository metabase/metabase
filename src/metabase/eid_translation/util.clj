(ns metabase.eid-translation.util
  (:require
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.eid-translation.impl :as eid-translation]
   [metabase.eid-translation.settings :as eid-translation.settings]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- api-model?
  [model]
  (isa? (t2/resolve-model model) :hook/entity-id))

;;; This is no longer calculated dynamically so we don't have to load ~20 model namespaces just to figure out which ones
;;; derive from `:hook/entity-id` just to generate Malli schemas. -- Cam
(def ^:private api-name->model
  "Map of model names used on the API to their corresponding model. A test makes sure this map stays in sync."
  {:action            :model/Action
   :card              :model/Card
   :collection        :model/Collection
   :dashboard         :model/Dashboard
   :dashboard-card    :model/DashboardCard
   :dashboard-tab     :model/DashboardTab
   :dataset           :model/Card
   :dimension         :model/Dimension
   :document          :model/Document
   :measure           :model/Measure
   :metric            :model/Card
   :permissions-group :model/PermissionsGroup
   :pulse             :model/Pulse
   :pulse-card        :model/PulseCard
   :pulse-channel     :model/PulseChannel
   :segment           :model/Segment
   :snippet           :model/NativeQuerySnippet
   :timeline          :model/Timeline
   :user              :model/User})

(defn- ->model
  "Takes a model keyword or an api-name and returns the corresponding model keyword."
  [model-or-api-name]
  (if (api-model? model-or-api-name)
    model-or-api-name
    (api-name->model model-or-api-name)))

(def ^:private eid-api-names
  "Sorted vec of api models that have an entity_id column"
  (vec (sort (keys api-name->model))))

(def ^:private eid-api-models
  (vec (sort (vals api-name->model))))

(def ^:private ApiName (into [:enum] eid-api-names))
(def ^:private ApiModel (into [:enum] eid-api-models))

(def ^:private EntityId
  "A Malli schema for an entity id, this is a little more loose because it needs to be fast."
  [:and {:description "entity_id"}
   :string
   [:fn {:error/fn (fn [{:keys [value]} _]
                     (str "\"" value "\" should be 21 characters long, but it is " (count value)))}
    (fn eid-length-good? [eid] (= 21 (count eid)))]])

(def ^:private ModelToEntityIds
  "A Malli schema for a map of model names to a sequence of entity ids."
  (mc/schema [:map-of ApiName [:sequential :string]]))

;; -------------------- Entity Id Translation Analytics --------------------

(mu/defn- update-translation-count!
  "Update the entity-id translation counter with the results of a batch of entity-id translations."
  [results :- [:sequential eid-translation/Status]]
  (let [processed-result (frequencies results)]
    (eid-translation.settings/entity-id-translation-counter!
     (merge-with + processed-result (eid-translation.settings/entity-id-translation-counter)))))

(mu/defn- entity-ids->id-for-model :- [:sequential [:tuple
                                                    ;; We want to pass incorrectly formatted entity-ids through here,
                                                    ;; but this is assumed to be an entity-id:
                                                    :string
                                                    [:map [:status eid-translation/Status]]]]
  "Given a model and a sequence of entity ids on that model, return a pairs of entity-id, id."
  [api-name eids]
  (let [model (->model api-name) ;; This lookup is safe because we've already validated the api-names
        eid->id (into {} (t2/select-fn->fn :entity_id :id [model :id :entity_id] :entity_id [:in eids]))]
    (mapv (fn entity-id-info [entity-id]
            [entity-id (if-let [id (get eid->id entity-id)]
                         {:id id :type api-name :status :ok}
                         ;; handle errors
                         (if (mr/validate EntityId entity-id)
                           {:type api-name
                            :status :not-found}
                           {:type api-name
                            :status :invalid-format
                            :reason (me/humanize (mr/explain EntityId entity-id))}))])
          eids)))

(defn model->entity-ids->ids
  "Given a map of model names to a sequence of entity-ids for each, return a map from entity-id -> id."
  [model-key->entity-ids]
  (when-not (mr/validate ModelToEntityIds model-key->entity-ids)
    (throw (ex-info "Invalid format." {:explanation (me/humanize
                                                     (me/with-spell-checking
                                                       (mr/explain ModelToEntityIds model-key->entity-ids)))
                                       :allowed-models (sort (keys api-name->model))
                                       :status-code 400})))
  (u/prog1 (into {}
                 (mapcat
                  (fn [[model eids]] (entity-ids->id-for-model model eids))
                  model-key->entity-ids))
    (update-translation-count! (map :status (vals <>)))))

(mu/defn ->id :- :int
  "Translates a single entity_id -> id. This reuses the batched version: [[model->entity-ids->ids]].
   Please use that if you have to do man lookups at once."
  [api-name-or-model :- [:or ApiName ApiModel] id :- [:or #_id :int #_entity-id :string]]
  (if (string? id)
    (let [model (->model api-name-or-model)
          [[_ {:keys [status] :as info}]] (entity-ids->id-for-model api-name-or-model [id])]
      (update-translation-count! [status])
      (if-not (= :ok status)
        (throw (ex-info "problem looking up id from entity_id"
                        {:api-name-or-model api-name-or-model
                         :model model
                         :id id
                         :status status}))
        (:id info)))
    id))

(mu/defn ->id-or-404 :- :int
  "Translates a single entity_id -> id, throwing a 404 error if not found.
   This is intended for use in API endpoints where a 404 should be returned
   for non-existent entity IDs."
  [api-name-or-model :- [:or ApiName ApiModel] id :- [:or #_id :int #_entity-id :string]]
  (try
    (->id api-name-or-model id)
    (catch Exception e
      (if (and (= (:status (ex-data e)) :not-found)
               (= (.getMessage e) "problem looking up id from entity_id"))
        (throw (ex-info "Not found." {:status-code 404}))
        (throw e)))))
