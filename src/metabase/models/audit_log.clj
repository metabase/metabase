(ns metabase.models.audit-log
  "Model defenition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is
  distinct from the Activity and View Log models, which predate this namespace, and which power specific API endpoints
  used for in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models.activity :as activity]
   [metabase.models.interface :as mi]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doto :model/AuditLog
  (derive :metabase/model))

(m/defmethod t2/table-name :model/AuditLog
  [_model]
  :audit_log)

(t2/deftransforms :model/AuditLog
  {:topic   mi/transform-keyword
   :details mi/transform-json})

(defmulti model-details
  "Returns a map with data about an entity that should be included in the `details` column of the Audit Log."
  {:arglists '([entity event-type])}
  mi/dispatch-on-model)

(defmethod model-details :default
  [_entity _event-type]
  {})

(def ^:private model-name->audit-logged-name
  {"RootCollection" "Collection"})

(defn model-name
  "Given an instance of a model or a keyword model identifier, returns the name to store in the database as a string, or `nil` if it cannot be computed."
  [instance-or-model]
  (let [model (or (t2/model instance-or-model) instance-or-model)
        raw-model-name (cond
                         (= model :model/LegacyMetric) "Metric"
                         (keyword? model) (name model)
                         (class? model) (.getSimpleName ^java.lang.Class model))]
    (model-name->audit-logged-name raw-model-name raw-model-name)))

(defn- prepare-update-event-data
  "Returns a map with previous and new versions of the objects, _keeping only fields that are present in both
  but have changed values_."
  [object previous-object]
  (let [[previous-only new-only _both] (data/diff previous-object object)
        shared-updated-keys (set/intersection (set (keys previous-only)) (set (keys new-only)))]
    {:previous (select-keys previous-object shared-updated-keys)
     :new (select-keys object shared-updated-keys)}))

(mr/def ::event-params [:map {:closed true
                              :doc "Used when inserting a value to the Audit Log."}
                        [:object          {:optional true} [:maybe :map]]
                        [:previous-object {:optional true} [:maybe :map]]
                        [:user-id         {:optional true} [:maybe pos-int?]]
                        [:model           {:optional true} [:maybe [:or :keyword :string]]]
                        [:model-id        {:optional true} [:maybe pos-int?]]
                        [:details         {:optional true} [:maybe :map]]])

(mu/defn construct-event
  :- [:map
      [:unqualified-topic simple-keyword?]
      [:user-id [:maybe ms/PositiveInt]]
      [:model-name [:maybe :string]]
      [:model-id [:maybe ms/PositiveInt]]
      [:details :map]]
  "Generates the data to be recorded in the Audit Log."
  ([topic :- :keyword
    params :- ::event-params
    current-user-id :- [:maybe pos-int?]]
   (let [unqualified-topic (keyword (name topic))
         object            (:object params)
         previous-object   (:previous-object params)
         object-details    (model-details object unqualified-topic)
         previous-details  (model-details previous-object unqualified-topic)]
     {:unqualified-topic unqualified-topic
      :user-id           (or (:user-id params) current-user-id)
      :model-name        (model-name (or (:model params) object))
      :model-id          (or (:model-id params) (u/id object))
      :details           (merge {}
                                (:details params)
                                (if (not-empty previous-object)
                                  (prepare-update-event-data object-details previous-details)
                                  object-details))})))

(defn- log-enabled?
  "Returns true when we should record audit data into the audit log."
  []
  (or (premium-features/is-hosted?)
      (premium-features/has-feature? :audit-app)))

(mu/defn record-event!
  "Records an event in the Audit Log.

  `topic` is a keyword representing the type of event being recorded, e.g. `:dashboard-create`. If the keyword is
  namespaced (e.g. `:event/dashboard-create`) the namespace is stripped before the event is recorded.

  `params` is a map that can optionally include the following fields:
  - `:object`: the object the event is acting on, e.g. a `Card` instance
  - `:previous-object`: the previous version of the object, for update events
  - `:user-id`: the user ID that initiated the event (defaults: `api/*current-user-id*`)
  - `:model`: the name of the model the event is acting on, e.g. `:model/Card` or \"Card\" (default: model of `:object`)
  - `:model-id`: the ID of the model the event is acting on (default: ID of `:object`)
  - `:details`: a map of arbitrary details relavent to the event, which is recorded as-is (default: {})

  `:object` and `:previous-object` both have `model-details` called on them to determine which fields should be audited,
  then they are added to `:details` before the event is recorded. `:previous-object` is only included if any audited fields
  were updated.

  Under certain conditions this function does _not_ insert anything into the audit log.
  - If nothing is logged, returns nil
  - Otherwise, returns the audit logged row."
  [topic :- :keyword
   params :- ::event-params]
  (when (log-enabled?)
    (span/with-span!
      {:name       "record-event!"
       :attributes (cond-> {}
                     (:model-id params) (assoc :model/id (:model-id params))
                     (:user-id params) (assoc :user/id (:user-id params))
                     (:model params) (assoc :model/name (u/lower-case-en (:model params))))}
      (let [{:keys [user-id model-name model-id details unqualified-topic object]}
            (construct-event topic params api/*current-user-id*)]
        (t2/insert! :model/AuditLog
                    :topic    unqualified-topic
                    :details  details
                    :model    model-name
                    :model_id model-id
                    :user_id  user-id)
        ;; TODO: temporarily double-writing to the `activity` table, delete this in Metabase v48
        ;; TODO figure out set of events to actually continue recording in activity
        (when-not (#{:card-read :dashboard-read :table-read :card-query :setting-update} unqualified-topic)
          (activity/record-activity!
            {:topic    topic
             :object   object
             :details  details
             :model    model-name
             :model-id model-id
             :user-id  user-id}))))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))
