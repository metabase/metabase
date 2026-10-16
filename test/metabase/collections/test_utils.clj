(ns metabase.collections.test-utils
  "Test utilities and macros for collection-related tests."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn personal-collection
  "A User's Personal Collection. It is created along with the User row itself, so a test that wants one should look it
  up with this rather than creating its own — `personal_owner_id` is unique, so a second insert fails, and on Postgres
  that failure poisons the surrounding transaction."
  [user-or-id]
  (t2/select-one :model/Collection :personal_owner_id (u/the-id user-or-id)))

(defn personal-collection-id
  "The ID of a User's Personal Collection. See [[personal-collection]]."
  [user-or-id]
  (u/the-id (personal-collection user-or-id)))

(defn do-without-library
  "Calls `f` with the existing Library collections set aside, then deletes the ones `f` created and restores them."
  [f]
  (mt/initialize-if-needed! :db)
  (let [library-types (vec collection/library-collection-types)
        existing      (t2/select [(t2/table-name :model/Collection) :id :type :entity_id] :type [:in library-types])]
    (doseq [{:keys [id]} existing]
      (t2/update! (t2/table-name :model/Collection) id {:type nil :entity_id (u/generate-nano-id)}))
    (try
      (f)
      (finally
        (t2/delete! :model/Collection :type [:in library-types])
        (doseq [{:keys [id] :as row} existing]
          (t2/update! (t2/table-name :model/Collection) id (select-keys row [:type :entity_id])))))))

(defmacro without-library
  "Runs `body` with the existing Library collections set aside, then deletes the ones `body` created and restores them.

   Example:
   ```clojure
   (without-library
     (let [lib (collection/ensure-library-collection!)]
       ...))
   ```"
  [& body]
  `(do-without-library (fn [] ~@body)))

(defn do-with-library-synced
  "Implementation for with-library-synced macro.
   If a Library collection exists, temporarily sets is_remote_synced to true.
   If no Library collection exists, creates a temporary one with is_remote_synced true."
  [f]
  (if-let [library (collection/library-collection)]
    (let [original-synced (:is_remote_synced library)]
      (try
        (t2/update! :model/Collection (:id library) {:is_remote_synced true})
        (f)
        (finally
          (t2/update! :model/Collection (:id library) {:is_remote_synced (boolean original-synced)}))))
    ;; No library collection exists, create one for the test
    (mt/with-temp [:model/Collection _ {:name "Library" :type collection/library-collection-type :is_remote_synced true :location "/"}]
      (f))))

(defmacro with-library-synced
  "Sets up Library collection as remote-synced for the duration of body."
  [& body]
  `(do-with-library-synced (fn [] ~@body)))

(defn do-with-library-not-synced
  "Implementation for with-library-not-synced macro.
   If a Library collection exists, temporarily sets is_remote_synced to false."
  [f]
  (if-let [library (collection/library-collection)]
    (let [original-synced (:is_remote_synced library)]
      (try
        (t2/update! :model/Collection (:id library) {:is_remote_synced false})
        (f)
        (finally
          (t2/update! :model/Collection (:id library) {:is_remote_synced (boolean original-synced)}))))
    (f)))

(defmacro with-library-not-synced
  "Ensures Library collection is not remote-synced for the duration of body."
  [& body]
  `(do-with-library-not-synced (fn [] ~@body)))

(defn do-with-library
  "Implementation for [[with-library]]."
  [f]
  (if-let [library (collection/library-collection)]
    ;; A library already exists — reuse it and its sub-collections, scoped to its location so a same-typed
    ;; collection elsewhere can't be picked up (the library sub-collection types aren't unique).
    (let [loc (str "/" (:id library) "/")]
      (f {:library library
          :data    (t2/select-one :model/Collection
                                  :type collection/library-data-collection-type :location loc)
          :metrics (t2/select-one :model/Collection
                                  :type collection/library-metrics-collection-type :location loc)}))
    ;; None exists — create a temporary tree (root + Data + Metrics) that with-temp cleans up afterward.
    (mt/with-temp [:model/Collection library {:name     "Library"
                                              :type     collection/library-collection-type
                                              :location "/"}
                   :model/Collection data    {:name     "Data"
                                              :type     collection/library-data-collection-type
                                              :location (str "/" (:id library) "/")}
                   :model/Collection metrics {:name     "Metrics"
                                              :type     collection/library-metrics-collection-type
                                              :location (str "/" (:id library) "/")}]
      (f {:library library :data data :metrics metrics}))))

(defmacro with-library
  "Ensure the singleton Library collection and its Data/Metrics sub-collections exist for the duration of
  `body`, binding `binding` to a `{:library _ :data _ :metrics _}` map of those collections.
  Reuses an existing library if one is present; otherwise creates a temporary tree that's cleaned up
  afterward."
  {:style/indent 1}
  [[binding] & body]
  `(do-with-library (fn [~binding] ~@body)))
