(ns metabase.collections.test-utils
  "Test utilities and macros for collection-related tests."
  (:require
   [clojure.test :refer [is testing]]
   [metabase.collections.models.collection :as collection]
   [metabase.events.test-util :as events.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn personal-collection
  "The Personal Collection of a User, created with `user->personal-collection` when the User has none yet."
  [user-or-id]
  (collection/user->personal-collection (u/the-id user-or-id)))

(defn personal-collection-id
  "The ID of a User's Personal Collection. See [[personal-collection]]."
  [user-or-id]
  (u/the-id (personal-collection user-or-id)))

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

(defn do-with-library-synced!
  "Implementation for with-library-synced macro: temporarily sets is_remote_synced to true on the Library collection,
  creating a temporary one with is_remote_synced true when none exists."
  [f]
  (if-let [library (collection/library-collection)]
    (let [original-synced (:is_remote_synced library)]
      (try
        (collection/update-collections! [{:id (:id library) :is_remote_synced true}] nil)
        (f)
        (finally
          (collection/update-collections! [{:id (:id library) :is_remote_synced (boolean original-synced)}] nil))))
    ;; No library collection exists, create one for the test
    (mt/with-temp [:model/Collection _ {:name             "Library"
                                        :type             collection/library-collection-type
                                        :entity_id        collection/library-entity-id
                                        :is_remote_synced true
                                        :location         "/"}]
      (f))))

(defmacro with-library-synced
  "Sets up Library collection as remote-synced for the duration of body."
  [& body]
  `(do-with-library-synced! (fn [] ~@body)))

(defn do-with-library-not-synced!
  "Implementation for with-library-not-synced macro: temporarily sets is_remote_synced to false on the Library
  collection when one exists."
  [f]
  (if-let [library (collection/library-collection)]
    (let [original-synced (:is_remote_synced library)]
      (try
        (collection/update-collections! [{:id (:id library) :is_remote_synced false}] nil)
        (f)
        (finally
          (collection/update-collections! [{:id (:id library) :is_remote_synced (boolean original-synced)}] nil))))
    (f)))

(defmacro with-library-not-synced
  "Ensures Library collection is not remote-synced for the duration of body."
  [& body]
  `(do-with-library-not-synced! (fn [] ~@body)))

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

(defn- new-collection!
  "The id of a new top level Collection that the All Users group writes when `writable?` and only reads otherwise."
  [writable?]
  (let [id (t2/insert-returning-pk! :model/Collection
                                    (merge (mt/with-temp-defaults :model/Collection) {:name (str "bulk " (random-uuid))}))]
    (if writable?
      (perms/grant-collection-readwrite-permissions! (perms/all-users-group) id)
      (perms/grant-collection-read-permissions! (perms/all-users-group) id))
    id))

(defn check-bulk-can-update-collection-move!
  "Checks that [[mi/can-update-each?]] of the rows of `model` that `make-row!`, a function of a Collection id, makes
  answers a move into another Collection as [[mi/can-update?]] answers row by row, for a batch of rows of Collections
  the user writes, of one the user only reads, and into a Collection the user only reads, and that it takes as many
  statements for many rows as for few, for a superuser and for a user."
  [model make-row!]
  (mt/with-model-cleanup [model :model/Collection]
    (let [writable-target (new-collection! true)
          read-only-target (new-collection! false)
          rows-in          (fn [collection-ids]
                             (t2/select model :id [:in (mapv make-row! collection-ids)]))
          writable         (rows-in [(new-collection! true) (new-collection! true)])
          read-only        (rows-in [(new-collection! false)])
          per-row          (fn [rows changes]
                             (every? #(mi/can-update? % changes) (t2/hydrate (vec rows) :can_write)))]
      (mt/with-current-user (mt/user->id :rasta)
        (doseq [[label rows changes expected] [["rows the user writes into a Collection the user writes" writable {:collection_id writable-target} true]
                                               ["a row the user only reads among rows the user writes" (concat writable read-only) {:collection_id writable-target} false]
                                               ["rows the user writes into a Collection the user only reads" writable {:collection_id read-only-target} false]]]
          (testing label
            (is (= expected (mi/can-update-each? model rows changes)))
            (is (= (per-row rows changes) (mi/can-update-each? model rows changes))))))
      (testing "a move to a Collection that does not exist is a 404, as for one row"
        (mt/with-current-user (mt/user->id :rasta)
          (is (= 404 (try (mi/can-update? (first (t2/hydrate (vec writable) :can_write)) {:collection_id Integer/MAX_VALUE})
                          nil
                          (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))
          (is (= 404 (try (mi/can-update-each? model writable {:collection_id Integer/MAX_VALUE})
                          nil
                          (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))))
      (doseq [user [:crowberto :rasta]]
        (testing (str "statement count as " user)
          (mt/with-current-user (mt/user->id user)
            (let [counted (fn [n]
                            (let [rows (rows-in (repeatedly n #(new-collection! true)))]
                              (events.tu/real-statement-count! #(mi/can-update-each? model rows {:collection_id writable-target}))))]
              (counted 2)
              (let [few  (counted 10)
                    many (counted 40)]
                (is (= few many))))))))))
