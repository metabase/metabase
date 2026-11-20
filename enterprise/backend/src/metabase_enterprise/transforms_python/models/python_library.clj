(ns metabase-enterprise.transforms-python.models.python-library
  (:require
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase-enterprise.transforms-python.write :as transforms-python.write]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

(doseq [trait [:metabase/model :hook/timestamped-on-insert? :hook/entity-id]]
  (derive :model/PythonLibrary trait))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/PythonLibrary
  [library]
  (update library :path transforms-python.write/normalize-path))

(t2/define-after-insert :model/PythonLibrary
  [library]
  (events/created! :model/PythonLibrary library)
  library)

;; Event type hierarchy for remote-sync tracking
(events/derive! ::event :metabase/event)
(doseq [e [:event/python-library-create :event/python-library-update :event/python-library-delete]]
  (events/derive! e ::event))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/simple-hydrate [:model/PythonLibrary :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (perms/user-has-transforms-permission-anywhere? (perms/user-info api/*current-user-id*)))))

(methodical/defmethod t2/simple-hydrate [:model/PythonLibrary :can_write]
  [_model k instance]
  (assoc instance k (boolean (perms/user-has-transforms-permission-anywhere? (perms/user-info api/*current-user-id*)))))

;;; ---------------------------------------------------- Library -----------------------------------------------------

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (transforms-python.db/python-library-by-path (transforms-python.write/normalize-path path)))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- storage-paths
  "The storage path of each of the PythonLibrary `entities`, under `python-libraries/` by path."
  [entities _ctx]
  (mapv (fn [entity]
          [{:label "python-libraries"} {:label (:path entity) :key (:entity_id entity)}])
        entities))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/PythonLibrary
  [_model]
  {:create :event/python-library-create
   :update :event/python-library-update
   :delete :event/python-library-delete})

(defmethod app-db-copy/spec :model/PythonLibrary [_model]
  {:skip? true})

(defmethod serialization/spec :model/PythonLibrary [_]
  {:schema        ::transforms-python.schema/external-python-library
   :copy          [:path :source :entity_id]
   :skip          [:is_default]
   :storage-paths storage-paths})

(defmethod remote-sync/spec :model/PythonLibrary
  [_model]
  {:name                 :path
   :synced-items         transforms-python.db/synced-python-library-items
   :synced-filter-clause transforms-python.db/synced-python-libraries-clause})
