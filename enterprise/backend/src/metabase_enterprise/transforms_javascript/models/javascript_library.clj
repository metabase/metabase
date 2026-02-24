(ns metabase-enterprise.transforms-javascript.models.javascript-library
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/JavaScriptLibrary [_model] :javascript_library)

(defn- normalize-path
  "Ensure the path ends with .js extension."
  [path]
  (if (.endsWith ^String path ".js")
    path
    (str path ".js")))

(t2/define-before-insert :model/JavaScriptLibrary
  [library]
  (update library :path normalize-path))

(t2/define-before-update :model/JavaScriptLibrary
  [library]
  (if (:path library)
    (update library :path normalize-path)
    library))

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id]]
  (derive :model/JavaScriptLibrary trait))

(defmethod mi/can-read? :model/JavaScriptLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(defmethod mi/can-write? :model/JavaScriptLibrary
  ([_instance]
   (perms/has-any-transforms-permission? api/*current-user-id*))
  ([_model _pk]
   (perms/has-any-transforms-permission? api/*current-user-id*)))

(def ^:private allowed-paths
  "Set of allowed library paths. Currently only 'common' is supported."
  #{"common.js"})

(def builtin-entity-id
  "The entity_id of the built-in common.js JavaScriptLibrary created by migration.
   Used to protect it from deletion during remote-sync import."
  "aHWo_0yPLwKqpQPlFNzCg")

(defn- validate-path!
  "Validates that the given path is allowed. Throws an exception if not."
  [path]
  (let [normalized-path (normalize-path path)]
    (when-not (contains? allowed-paths normalized-path)
      (throw (ex-info (tru "Invalid library path. Only ''common'' is currently supported.")
                      {:status-code 400
                       :path normalized-path
                       :allowed-paths allowed-paths})))))

(defn get-javascript-library-by-path
  "Get the JavaScript library by path."
  [path]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (t2/select-one :model/JavaScriptLibrary :path normalized-path)))

(defn update-javascript-library-source!
  "Update the JavaScript library source code. Creates a new record if none exists. Returns the updated library."
  [path source]
  (let [normalized-path (normalize-path path)]
    (validate-path! normalized-path)
    (let [id (app-db/update-or-insert! :model/JavaScriptLibrary
                                       {:path normalized-path}
                                       (constantly {:path normalized-path :source source}))]
      (t2/select-one :model/JavaScriptLibrary id))))

;;; ------------------------------------------------ Event Hooks -----------------------------------------------------

;; Event type hierarchy for remote-sync tracking
(derive ::event :metabase/event)
(doseq [e [:event/javascript-library-create :event/javascript-library-update :event/javascript-library-delete]]
  (derive e ::event))

(t2/define-after-insert :model/JavaScriptLibrary
  [library]
  (events/publish-event! :event/javascript-library-create {:object library})
  library)

(t2/define-after-update :model/JavaScriptLibrary
  [library]
  (events/publish-event! :event/javascript-library-update {:object library})
  library)
