(ns metabase.audit-app.models.audit-log
  "Model definition for the Metabase Audit Log, which tracks actions taken by users across the Metabase app. This is
  distinct from the View Log model, which predates this namespace, and which powers specific API endpoints used for
  in-app functionality, such as the recently-viewed items displayed on the homepage."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.db :as audit-app.db]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.match :as match]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(doto :model/AuditLog
  (derive :metabase/model))

(m/defmethod t2/table-name :model/AuditLog
  [_model]
  :audit_log)

(defmethod app-db-copy/spec :model/AuditLog [_model]
  {:skip? false})

(t2/deftransforms :model/AuditLog
  {:topic   mi/transform-keyword
   :details mi/transform-json})

(def ^:private model-name->audit-logged-name
  {"RootCollection" "Collection"})

(defn model-name
  "Given an instance of a model or a keyword model identifier, returns the name to store in the database as a string, or `nil` if it cannot be computed."
  [instance-or-model]
  (let [model (or (t2/model instance-or-model) instance-or-model)
        raw-model-name (cond
                         (keyword? model) (name model)
                         (class? model) (.getSimpleName ^java.lang.Class model))]
    (model-name->audit-logged-name raw-model-name raw-model-name)))

(defn update-details
  "Returns a map with previous and new versions of the objects, _keeping only fields that are present in both
  but have changed values_."
  [object previous-object]
  (let [[previous-only new-only _both] (data/diff previous-object object)
        shared-updated-keys (set/intersection (set (keys previous-only)) (set (keys new-only)))]
    {:previous (select-keys previous-object shared-updated-keys)
     :new (select-keys object shared-updated-keys)}))

(defn- stringify-keys
  "Recursively turns the keyword keys of maps nested inside `x` into strings, keeping their namespaces."
  [x]
  (match/replace-all x
    #'map? (update-keys &match #(cond-> % (keyword? %) u/qualified-name))))

(def ^:private AuditedInstance
  "An audited object of any model, which names the model and the id of the row that its event is about."
  [:map {:closed false, :description "an audited entity"}])

(mr/def ::event-params [:map {:closed true
                              :doc "Used when inserting a value to the Audit Log."}
                        [:object           {:optional true} [:maybe AuditedInstance]]
                        [:user-id          {:optional true} [:maybe pos-int?]]
                        [:model            {:optional true} [:maybe [:or :keyword :string]]]
                        [:model-id         {:optional true} [:maybe pos-int?]]
                        [:details          {:optional true} [:maybe ms/AuditLogDetails]]])

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
   (let [object (:object params)]
     {:unqualified-topic (keyword (name topic))
      :user-id           (or (:user-id params) current-user-id)
      :model-name        (model-name (or (:model params) object))
      :model-id          (or (:model-id params) (u/id object))
      :details           (stringify-keys (merge {} (:details params)))})))

(mu/defn audit-row :- [:maybe :map]
  "The Audit Log row that [[record-rows!]] inserts for `topic` and `params`, or nil when it would insert none."
  [topic :- :keyword
   params :- ::event-params]
  (when (premium-features/log-enabled?)
    (let [{:keys [user-id model-name model-id details unqualified-topic]}
          (construct-event topic params api/*current-user-id*)]
      {:topic    unqualified-topic
       :details  details
       :model    model-name
       :model_id model-id
       :user_id  user-id})))

(defn record-rows!
  "Insert the Audit Log `rows`, which [[audit-row]] gives, in one statement and in their order."
  [rows]
  (when (seq rows)
    (span/with-span! {:name "record-rows!" :attributes {:audit/rows (count rows)}}
      (audit-app.db/insert-audit-logs! rows))))

(t2/define-before-insert :model/AuditLog
  [activity]
  (let [defaults {:timestamp :%now
                  :details   {}}]
    (merge defaults activity)))
