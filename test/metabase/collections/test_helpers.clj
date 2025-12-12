(ns metabase.collections.test-helpers
  "Test utilities and macros for collection-related tests."
  (:require
   [metabase.collections.models.collection :as collection]
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
