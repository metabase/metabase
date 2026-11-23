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
   [metabase.util.events :as u.events]
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
    ;; The changes, not the row, hold the default flag, so that every row gets it whatever it held.
    (if (seq (dissoc changes :updated_at :is_default))
      (cond-> (assoc changes :is_default false)
        (:path changes) (update :path normalize-path))
      library)))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-python-libraries! :- [:sequential ::transforms-python.schema/python-library]
  "Insert the PythonLibrary `rows`, publishing their create event, and return the inserted libraries."
  [rows :- [:sequential ::transforms-python.schema/python-library.create]]
  (if (seq rows)
    (t2/with-transaction [_conn]
      (let [libraries (transforms-python.db/insert-python-libraries! rows)]
        (events/publish-event! :event/python-library-create (events/create-event libraries))
        libraries))
    []))

(defn- updated-library
  "The PythonLibrary `stored` as the update `changes` leaves it, with what the update hook sets."
  [stored changes]
  (let [differing (into {} (filter (fn [[k v]] (not= v (get stored k)))) changes)]
    (cond-> (merge stored changes)
      (seq (dissoc differing :updated_at :is_default)) (assoc :is_default false)
      (:path changes)                                 (update :path normalize-path))))

(mu/defn update-python-libraries! :- :nil
  "Apply the `changes` to the PythonLibraries with `ids` in one transaction, publishing their update event."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::transforms-python.schema/python-library.update]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (let [stored (into {} (map (juxt :id identity)) (transforms-python.db/python-libraries-by-ids (vec ids)))]
        (when (seq stored)
          (transforms-python.db/update-python-libraries! stored changes)
          (events/publish-event! :event/python-library-update
                                 (events/update-event stored
                                                      (mapv #(assoc changes :id %) (filter stored ids))
                                                      {:objects (update-vals stored #(updated-library % changes))}))))))
  nil)

(mu/defn update-python-libraries-for-import! :- :nil
  "Apply each of `rows`, the id of a PythonLibrary and the columns to change, as an import writes it, one row at a time.
  An import runs rows with different values, which one change for all cannot express."
  [rows :- [:sequential ::transforms-python.schema/python-library.import-row]]
  (doseq [[changes rows] (group-by #(dissoc % :id) rows)]
    (update-python-libraries! (mapv :id rows) changes))
  nil)

(mu/defn delete-python-libraries!
  "Delete the PythonLibraries with `ids`, publishing their delete event."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/python-library-delete
                             {:changes (u.events/delete-changes (transforms-python.db/python-libraries-by-ids (vec ids))) :user-id (mi/current-user-id)})
      (transforms-python.db/delete-python-libraries! (vec ids))))
  nil)

(mu/defn update-python-library-source!
  "Update the Python library source code. Creates a new record if none exists. Returns the updated library."
  [path   :- :string
   source :- :string]
  (let [normalized-path (normalize-path path)]
    (mdb/with-conflict-retry
      (t2/with-transaction [_conn]
        (if-let [existing (transforms-python.db/python-library-by-path normalized-path)]
          (do (update-python-libraries! [(:id existing)] {:path normalized-path :source source})
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
   :update!       update-python-libraries-for-import!
   :delete!       delete-python-libraries!
   :storage-paths storage-paths})

(defmethod remote-sync/spec :model/PythonLibrary
  [_model]
  {:name                 :path
   :synced-items         transforms-python.db/synced-python-library-items
   :synced-filter-clause transforms-python.db/synced-python-libraries-clause})
