(ns metabase-enterprise.transforms-python.models.python-library
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/PythonLibrary [_model] :python_library)

(doseq [trait [:metabase/model :hook/timestamped? :hook/entity-id]]
  (derive :model/PythonLibrary trait))

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
  (let [changes (t2/changes library)]
    (if (seq (dissoc changes :updated_at :is_default))
      (cond-> (assoc changes :is_default false)
        (:path changes) (update :path normalize-path))
      library)))

;; Event type hierarchy for remote-sync tracking
(events/derive! ::event :metabase/event)
(doseq [e [:event/python-library-create :event/python-library-update :event/python-library-delete]]
  (events/derive! e ::event))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- can-access?
  "Whether the current user may read and write PythonLibrary rows: they have the transforms permission on some
  Database."
  []
  (boolean (perms/user-has-transforms-permission-anywhere? (perms/user-info api/*current-user-id*))))

(methodical/defmethod t2/batched-hydrate [:model/PythonLibrary :can_read]
  "Whether the current user can read each of `libraries`, answered once for all of them."
  [_model k libraries]
  (mi/vary-meta-each libraries k (can-access?)))

(methodical/defmethod t2/batched-hydrate [:model/PythonLibrary :can_write]
  "Whether the current user can write each of `libraries`, answered once for all of them."
  [_model k libraries]
  (mi/assoc-each libraries k (can-access?)))

;;; ---------------------------------------------------- Library -----------------------------------------------------

(def builtin-entity-id
  "The entity_id of the built-in common.py PythonLibrary created by migration.
   Used to protect it from deletion during remote-sync import."
  "cWWH9qJPvHNB3rP2vLZrK")

(defn get-python-library-by-path
  "Get the Python library by path."
  [path]
  (transforms-python.db/python-library-by-path (normalize-path path)))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(defn- publish-python-library-creates
  "Publish the create event of the PythonLibraries `created`."
  [created]
  (events/publish-event! :event/python-library-create (events/create-event created)))

(mu/defn create-python-libraries! :- [:sequential ::transforms-python.schema/python-library]
  "Insert the PythonLibrary `rows` in one transaction, publishing their create event, and return the inserted
  libraries."
  [rows :- [:sequential ::transforms-python.schema/python-library.create]]
  (mdb/create-batched! :model/PythonLibrary rows {:after-create publish-python-library-creates}))

(defn- updated-library
  "The PythonLibrary `stored` as the update `changes` leaves it, with what the update hook sets."
  [stored changes]
  (let [differing (into {} (filter (fn [[k v]] (not= v (get stored k)))) changes)]
    (cond-> (merge stored changes)
      (seq (dissoc differing :updated_at :is_default)) (assoc :is_default false)
      (:path changes)                                 (update :path normalize-path))))

(defn- existing-python-library-updates
  "The `updates` of the PythonLibraries that exist among `id->stored`."
  [updates id->stored]
  (filterv (comp id->stored :id) updates))

(defn- publish-python-library-updates
  "Publish the update event of the PythonLibraries that `updates` changes, as stored before in `id->stored`."
  [updates id->stored _id->updated]
  (events/publish-event! :event/python-library-update
                         (events/update-event id->stored
                                              updates
                                              {:objects (into {}
                                                              (map (fn [{:keys [id] :as row}]
                                                                     [id (updated-library (id->stored id) (dissoc row :id))]))
                                                              updates)})))

(mu/defn update-python-libraries! :- :nil
  "Apply `updates`, each the id of a PythonLibrary and the columns to change, in one transaction, publishing their
  update event."
  [updates :- [:sequential ::transforms-python.schema/python-library.update]]
  (mdb/update-batched! :model/PythonLibrary updates {:before-update existing-python-library-updates
                                                     :after-update  publish-python-library-updates}))

(defn- publish-python-library-deletes
  "Publish the delete event of the PythonLibraries `libraries`."
  [libraries]
  (events/publish-event! :event/python-library-delete (events/delete-event libraries)))

(mu/defn delete-python-libraries! :- :nil
  "Delete the PythonLibraries with `ids` in one transaction, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (mdb/delete-batched! :model/PythonLibrary ids {:before-delete publish-python-library-deletes}))

(defn ensure-default-python-library!
  "Create the default `common.py` PythonLibrary of the remote sync worktree this thread works in, as the migrations
  that added it created the main app's, unless it has the library by entity id, wherever it moved, retrying once
  after a concurrent call created it."
  []
  (mdb/with-conflict-retry
    (t2/with-transaction [_conn]
      (when-not (transforms-python.db/python-library-exists? builtin-entity-id)
        (create-python-libraries! [{:path "common.py" :source "" :entity_id builtin-entity-id :is_default true}]))))
  nil)

(mu/defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path   :- :string
   source :- :string]
  (let [normalized-path (normalize-path path)]
    (mdb/with-conflict-retry
      (t2/with-transaction [_conn]
        (if-let [existing (transforms-python.db/python-library-by-path normalized-path)]
          (do (update-python-libraries! [{:id (:id existing) :path normalized-path :source source}])
              (transforms-python.db/python-library (:id existing)))
          (first (create-python-libraries!
                  [{:path normalized-path :source source :entity_id builtin-entity-id :is_default (str/blank? source)}])))))))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- storage-paths
  "The storage path of each of the PythonLibrary `entities`, under `python-libraries/` by path."
  [entities _ctx]
  (mapv (fn [entity]
          [{:label "python-libraries"} {:label (:path entity) :key (:entity_id entity)}])
        entities))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/PythonLibrary [_model]
  {:skip? true})

(defmethod serialization/spec :model/PythonLibrary [_]
  {:schema        ::transforms-python.schema/external-python-library
   :copy          [:path :source :entity_id]
   :skip          [:is_default]
   :insert!       create-python-libraries!
   :update!       update-python-libraries!
   :delete!       delete-python-libraries!
   :storage-paths storage-paths})

(defmethod remote-sync/spec :model/PythonLibrary
  [_model]
  {:name                 :path
   :synced-items         transforms-python.db/synced-python-library-items
   :synced-filter-clause transforms-python.db/synced-python-libraries-clause
   :ensure-built-ins     ensure-default-python-library!})
