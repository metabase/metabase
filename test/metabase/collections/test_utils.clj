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
