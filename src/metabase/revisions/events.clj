(ns metabase.revisions.events
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(events/derive! ::event :metabase/event)

(defn- push-revision!
  [model
   {:keys [user-id] object :object :as event}
   {:keys [is-creation?]
    :or   {is-creation? false}
    :as   _options}]
  (when event
    (try
      (when-not (t2/instance-of? model object)
        (throw (ex-info "object must be a model instance" {:object object :model model})))
      (let [user-id (or user-id api/*current-user-id*)]
        (revision/push-revision! {:entity       model
                                  :id           (:id object)
                                  :object       object
                                  :user-id      user-id
                                  :is-creation? is-creation?
                                  :message      (:revision-message event)}))
      (catch Throwable e
        (log/warnf "Failed to process revision event for model %s: %s" model (ex-message e))))))

(defn- model-dispatch-value
  "The [[events/publish-event!]] dispatch value of the revisions listener for `model`, e.g. `::card-event`."
  [model]
  (keyword (namespace ::event) (str (u/lower-case-en (name model)) "-event")))

(doseq [[model {create-topic :create :as topics}] revision/revisioned-models
        :let [dispatch-value (model-dispatch-value model)]]
  (events/derive! dispatch-value ::event)
  (doseq [topic (vals (select-keys topics [:create :update :delete]))]
    (events/derive! topic dispatch-value))
  (methodical/add-primary-method! #'events/publish-event! dispatch-value
                                  (fn [topic event]
                                    (push-revision! model event {:is-creation? (= topic create-topic)}))))
