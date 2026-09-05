(ns metabase.eid-translation.db
  "Application database queries for the entity id translation module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn- ids-by-entity-ids
  [model entity-ids]
  (t2/select-fn->fn :entity_id :id [model :id :entity_id] :entity_id [:in entity-ids]))

(defn action-ids-by-entity-ids
  "A map of entity id to id for the Actions whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Action entity-ids))

(defn card-ids-by-entity-ids
  "A map of entity id to id for the Cards whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Card entity-ids))

(defn collection-ids-by-entity-ids
  "A map of entity id to id for the Collections whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Collection entity-ids))

(defn dashboard-ids-by-entity-ids
  "A map of entity id to id for the Dashboards whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Dashboard entity-ids))

(defn dashboard-card-ids-by-entity-ids
  "A map of entity id to id for the DashboardCards whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/DashboardCard entity-ids))

(defn dashboard-tab-ids-by-entity-ids
  "A map of entity id to id for the DashboardTabs whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/DashboardTab entity-ids))

(defn dimension-ids-by-entity-ids
  "A map of entity id to id for the Dimensions whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Dimension entity-ids))

(defn document-ids-by-entity-ids
  "A map of entity id to id for the Documents whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Document entity-ids))

(defn exploration-ids-by-entity-ids
  "A map of entity id to id for the Explorations whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Exploration entity-ids))

(defn measure-ids-by-entity-ids
  "A map of entity id to id for the Measures whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Measure entity-ids))

(defn permissions-group-ids-by-entity-ids
  "A map of entity id to id for the PermissionsGroups whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/PermissionsGroup entity-ids))

(defn pulse-ids-by-entity-ids
  "A map of entity id to id for the Pulses whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Pulse entity-ids))

(defn pulse-card-ids-by-entity-ids
  "A map of entity id to id for the PulseCards whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/PulseCard entity-ids))

(defn pulse-channel-ids-by-entity-ids
  "A map of entity id to id for the PulseChannels whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/PulseChannel entity-ids))

(defn segment-ids-by-entity-ids
  "A map of entity id to id for the Segments whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Segment entity-ids))

(defn native-query-snippet-ids-by-entity-ids
  "A map of entity id to id for the NativeQuerySnippets whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/NativeQuerySnippet entity-ids))

(defn timeline-ids-by-entity-ids
  "A map of entity id to id for the Timelines whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Timeline entity-ids))

(defn transform-ids-by-entity-ids
  "A map of entity id to id for the Transforms whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/Transform entity-ids))

(defn user-ids-by-entity-ids
  "A map of entity id to id for the Users whose entity id is in `entity-ids`."
  [entity-ids]
  (ids-by-entity-ids :model/User entity-ids))
