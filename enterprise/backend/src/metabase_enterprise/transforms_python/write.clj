(ns metabase-enterprise.transforms-python.write
  "The write functions of PythonLibraries, through which every writer creates, updates and deletes them."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.db :as transforms-python.db]
   [metabase-enterprise.transforms-python.schema :as transforms-python.schema]
   [metabase.app-db.core :as app-db]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def builtin-entity-id
  "The entity_id of the built-in common.py PythonLibrary created by migration.
   Used to protect it from deletion during remote-sync import."
  "cWWH9qJPvHNB3rP2vLZrK")

(defn normalize-path
  "Ensure the path ends with .py extension."
  [path]
  (if (.endsWith ^String path ".py")
    path
    (str path ".py")))

(defn- changed
  "The columns of `changes` whose values differ from those of `library`."
  [library changes]
  (into {} (remove (fn [[k v]] (= v (get library k)))) changes))

(mu/defn create-python-library! :- ::transforms-python.schema/python-library
  "Create the PythonLibrary `library`, whose path ends in `.py`."
  [library :- ::transforms-python.schema/python-library.update]
  (transforms-python.db/insert-python-library! library))

(mu/defn update-python-library! :- :int
  "Apply `changes` to `library-or-id`, a PythonLibrary the caller already loaded or the id of one, and publish its
  update event, returning the number of libraries updated; a library whose source or path changes is no longer the
  default, for the SerDes import, remote sync and `update-python-library-source!`."
  [library-or-id :- [:or ms/PositiveInt :map]
   changes       :- ::transforms-python.schema/python-library.changes
   _opts         :- ::transforms-python.schema/write-opts]
  (let [library (if (map? library-or-id) library-or-id (transforms-python.db/python-library library-or-id))
        changes (when library (changed library changes))]
    (if (empty? changes)
      0
      (let [new     (merge library changes)
            row     (cond-> new
                      (seq (dissoc changes :updated_at :is_default)) (assoc :is_default false)
                      (:path new)                                    (update :path normalize-path))
            written (cond-> (changed library row)
                      (not (contains? changes :updated_at)) (assoc :updated_at (mi/now)))]
        (events/with-batched-events
          (u/prog1 (transforms-python.db/update-python-library! (:id library) written)
            (events/updated! :model/PythonLibrary (merge library written) library)))))))

(mu/defn delete-python-libraries! :- :int
  "Delete the PythonLibraries with `ids` and publish their delete events, returning the number deleted; for remote
  sync and the SerDes import."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::transforms-python.schema/write-opts]
  (let [libraries (when (seq ids) (transforms-python.db/python-libraries ids))]
    (if (empty? libraries)
      0
      (events/with-batched-events
        (events/deleting! :model/PythonLibrary libraries
                          #(transforms-python.db/delete-python-libraries! (mapv :id libraries)))))))

(mu/defn update-python-library-source! :- ::transforms-python.schema/python-library
  "Set the source of the PythonLibrary at `path` to `source`, creating the built-in library when there is none and
  retrying once when a concurrent request inserted it first, for the REST API; returns the library."
  [path   :- :string
   source :- :string]
  (let [path (normalize-path path)]
    (app-db/with-conflict-retry
      (if-let [existing (transforms-python.db/python-library-by-path path)]
        (do (update-python-library! existing {:source source} {})
            (transforms-python.db/python-library (:id existing)))
        (events/with-batched-events
          (create-python-library! {:path       path
                                   :source     source
                                   :entity_id  builtin-entity-id
                                   :is_default (str/blank? source)}))))))

(defmethod mi/write-fns :model/PythonLibrary
  [_model]
  {:update! update-python-library!
   :delete! delete-python-libraries!})
