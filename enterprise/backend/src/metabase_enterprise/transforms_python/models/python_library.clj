(ns metabase-enterprise.transforms-python.models.python-library
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

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
  (if (:path library)
    (update library :path normalize-path)
    library))

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id]]
  (derive :model/PythonLibrary trait))

(defmethod mi/can-read? :model/PythonLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(defmethod mi/can-write? :model/PythonLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(def ^:private allowed-paths
  "Set of allowed library paths. Currently only 'common' is supported."
  #{"common.py"})

(defn- validate-path!
  "Validates that the given path is allowed. Throws an exception if not."
  [path]
  (let [normalized-path (normalize-path path)]
    (when-not (contains? allowed-paths normalized-path)
      (throw (ex-info (tru "Invalid library path. Only ''common'' is currently supported.")
                      {:status-code 400
                       :path normalized-path
                       :allowed-paths allowed-paths})))))

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (t2/select-one :model/PythonLibrary :path normalized-path)))

(defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (let [id (app-db/update-or-insert! :model/PythonLibrary
                                       {:path normalized-path}
                                       (constantly {:path normalized-path :source source}))]
      (t2/select-one :model/PythonLibrary id))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/make-spec "PythonLibrary"
  [_model-name _opts]
  {:copy      [:path :source :entity_id]
   :transform {:created_at (serdes/date)}})

(defmethod serdes/hash-fields :model/PythonLibrary
  [_model]
  [:path])

(defmethod serdes/storage-path "PythonLibrary" [entity _ctx]
  (let [{:keys [id label]} (-> entity serdes/path last)]
    ["python-libraries" (serdes/storage-leaf-file-name id label)]))

;;; ------------------------------------------------ Event Hooks -----------------------------------------------------

;; Event type hierarchy for remote-sync tracking
(derive ::event :metabase/event)
(doseq [e [:event/python-library-create :event/python-library-update :event/python-library-delete]]
  (derive e ::event))

(t2/define-after-insert :model/PythonLibrary
  [library]
  (events/publish-event! :event/python-library-create {:object library})
  library)

(t2/define-after-update :model/PythonLibrary
  [library]
  (events/publish-event! :event/python-library-update {:object library})
  library)
