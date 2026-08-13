(ns metabase.collections.test-utils
  "Test utilities and macros for collection-related tests."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defmacro without-library
  "Macro that clears existing library collections, executes body, then cleans up any created library collections.

   This is useful for tests that need to work with library collections in isolation without
   interference from any existing library collections in the test database.

   Example:
   ```clojure
   (without-library
     (let [lib (collection/create-library-collection!)]
       ...))
   ```"
  [& body]
  `(do
     (mt/initialize-if-needed! :db)
     ;; Clear existing library collections
     (t2/update! (t2/table-name :model/Collection)
                 :type collection/library-collection-type
                 {:type nil})
     (t2/update! (t2/table-name :model/Collection)
                 :type collection/library-data-collection-type
                 {:type nil})
     (t2/update! (t2/table-name :model/Collection)
                 :type collection/library-metrics-collection-type
                 {:type nil})
     (try
       ~@body
       (finally
         ;; Clean up any created library collections
         (t2/delete! :model/Collection
                     :type [:in [collection/library-collection-type
                                 collection/library-data-collection-type
                                 collection/library-metrics-collection-type]])))))

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
