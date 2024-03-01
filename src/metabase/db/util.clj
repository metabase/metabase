(ns metabase.db.util
  "Utility functions for querying the application database."
  (:require
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)))

(defn toucan-model?
  "Check if `model` is a toucan model."
  [model]
  (isa? model :metabase/model))



(defmacro with-conflict-retry
  "Retry a database mutation a single time if it fails due to concurrent insertions.
   May retry for other reasons."
  [& body]
  `(try
     ~@body
     (catch ExceptionInfo e#
       ;; The underlying exception thrown by the driver is database specific and opaque, so we treat any exception as a
       ;; possible database conflict due to a concurrent insert. If we want to be more conservative, we would need
       ;; a per-driver or driver agnostic way to test the exception.
       ~@body)))

(defn select-or-insert!
  "Return a database record if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found it is immediately returned.
   If no value is found, `insert-fn` is called to generate the entity to be inserted.

   Note that this generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `insert-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map insert-fn]
  (let [select-kvs (mapcat identity select-map)
        insert-fn  #(let [instance (insert-fn)]
                      ;; the inserted values must be consistent with the select query
                      (assert (not (u/conflicting-keys? select-map instance))
                              "this should not be used to change any of the identifying values")
                      ;; for convenience, we allow insert-fn's result to omit fields in the search-map
                      (merge instance select-map))]
    (with-conflict-retry
      (or (apply t2/select-one model select-kvs)
          (t2/insert-returning-instance! model (insert-fn))))))

(defn update-or-insert!
  "Update a database record, if it exists, otherwise create it.

   The `select-map` is used to query the `model`, and if a result is found then we will update that entity, otherwise
   a new entity will be created. We use `update-fn` to calculate both updates and initial values - in the first case
   it will be called with the existing value, and in the second case it will be called with nil, analogous to the way
   that [[clojure.core/update]] calls its function.

   Note that the generated entity must be consistent with `select-map`, if it disagrees on any keys then an exception
   will be thrown. It is OK for the entity to omit fields from `select-map`, they will implicitly be added on.

   This is more general than using `UPSERT`, `MERGE` or `INSERT .. ON CONFLICT`, and it also allows one to avoid
   calculating initial values that may be expensive, or require side effects.

   In the case where there is an underlying db constraint to prevent duplicates, this method takes care of handling
   rejection from the database due to a concurrent insert, and will retry a single time to pick up the existing row.
   This may result in `update-fn` being called a second time.

   In the case where there is no underlying db constraint, concurrent calls may still result in duplicates.
   To prevent this in a database agnostic way, during an existing non-serializable transaction, would be non-trivial."
  [model select-map update-fn]
  (let [select-kvs (mapcat identity select-map)
        pks        (t2/primary-keys model)
        _          (assert (= 1 (count pks)) "This helper does not currently support compound keys")
        pk-key     (keyword (first pks))
        update-fn  (fn [existing]
                     (let [updated (update-fn existing)]
                       ;; the inserted / updated values must be consistent with the select query
                       (assert (not (u/conflicting-keys? select-map updated))
                               "This should not be used to change any of the identifying values")
                       ;; For convenience, we allow the update-fn to omit fields in the search-map
                       (merge updated select-map)))]
    (with-conflict-retry
      (if-let [existing (apply t2/select-one model select-kvs)]
        (let [pk      (pk-key existing)
              updated (update-fn existing)]
          (t2/update! model pk updated)
          ;; the private key may have been changed by the update, and this is OK.
          (pk-key updated pk))
        (t2/insert-returning-pk! model (update-fn nil))))))
