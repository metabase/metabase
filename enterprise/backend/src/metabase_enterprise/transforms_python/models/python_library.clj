(ns metabase-enterprise.transforms-python.models.python-library
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
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

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id :hook/events]]
  (derive :model/PythonLibrary trait))

(defmethod events/spec :model/PythonLibrary
  [_model]
  {:create :event/python-library-create
   :update :event/python-library-update
   :delete :event/python-library-delete})

(defmethod app-db-copy/spec :model/PythonLibrary [_model]
  {:skip? true})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- normalize-path
  "Ensure the path ends with .py extension."
  [path]
  (if (.endsWith ^String path ".py")
    path
    (str path ".py")))

(t2/define-before-insert :model/PythonLibrary
  [library]
  (update library :path normalize-path))

(t2/define-before-update :model/PythonLibrary
  [library]
  (cond-> library
    (seq (dissoc (t2/changes library) :updated_at :is_default)) (assoc :is_default false)
    (:path library)                          (update :path normalize-path)))

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

(def builtin-entity-id
  "The entity_id of the built-in common.py PythonLibrary created by migration.
   Used to protect it from deletion during remote-sync import."
  "cWWH9qJPvHNB3rP2vLZrK")

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (transforms-python.db/python-library-by-path (normalize-path path)))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (let [normalized-path (normalize-path path)
        id              (transforms-python.db/upsert-python-library-source!
                         normalized-path source {:entity_id builtin-entity-id :is_default (str/blank? source)})
        library         (transforms-python.db/python-library id)]
    library))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- storage-paths
  "The storage path of each of the PythonLibrary `entities`, under `python-libraries/` by path."
  [entities _ctx]
  (mapv (fn [entity]
          [{:label "python-libraries"} {:label (:path entity) :key (:entity_id entity)}])
        entities))

(defmethod serialization/spec :model/PythonLibrary [_]
  {:schema        ::transforms-python.schema/external-python-library
   :copy          [:path :source :entity_id]
   :skip          [:is_default]
   :storage-paths storage-paths})

;;; -------------------------------------------------- Remote sync ---------------------------------------------------

(defmethod remote-sync/spec :model/PythonLibrary
  [_model]
  {:name                 :path
   :synced-items         transforms-python.db/synced-python-library-items
   :synced-filter-clause transforms-python.db/synced-python-libraries-clause})
