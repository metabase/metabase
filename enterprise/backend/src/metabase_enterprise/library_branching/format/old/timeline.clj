(ns metabase-enterprise.library-branching.format.old.timeline
  "The old format of the kind `:timeline`: a file of the serdes model Timeline, with its events under `events`. An
  event in the trash is not content."
  (:require
   [metabase-enterprise.library-branching.format.old.common :as common]))

(set! *warn-on-reflection* true)

(def ^:private event-keys
  "The keys of an event of the old format that are keys of an event of the new format, by the same names."
  [:name :description :timestamp :timezone :time_matters :icon])

(defn- event
  [e]
  (assoc (select-keys e event-keys) :id (:entity_id e)))

(defn decode
  "`{:doc d}` of timeline document `doc`, or `{:skip :archived :id id}` for a timeline in the trash."
  [doc _opts]
  (let [id (:entity_id doc)]
    (if (common/archived? doc)
      {:skip :archived :id id}
      {:doc (common/item-doc :timeline id
                             {:name        (:name doc)
                              :collection  (:collection_id doc)
                              :description (:description doc)
                              :icon        (:icon doc)
                              :default     (:default doc)
                              :events      (into [] (comp (remove common/archived?) (map event)) (:events doc))})})))
