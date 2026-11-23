(ns metabase.serialization.writes
  "The writes of an import to the app DB, in bulk: by the `:insert!`, `:update!` and `:delete!` of the spec of a model
  (see [[metabase.serialization.spec]]), which are the write functions of the model, or by plain statements for a
  model whose spec has none."
  (:require
   [metabase.serialization.db :as serialization.db]
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.util :as serialization.util]))

(set! *warn-on-reflection* true)

(defn- comparable
  "`x`, a value of an identity column, as rows and instances both hold it: a keyword as its name."
  [x]
  (if (keyword? x) (name x) x))

(defn- identity-of
  "The fn from a row or instance of `model` to the values of its identity columns."
  [model]
  (let [ks (serialization.spec/identity-columns model)]
    (fn [row] (mapv #(comparable (get row %)) ks))))

(defn insert!
  "Inserts `rows` of `model` and returns the inserted instances, in any order, without the rows the model leaves out."
  [model rows]
  (if-let [f (:insert! (serialization.spec/spec model))]
    (vec (f (vec rows)))
    (into []
          (mapcat #(serialization.db/insert-rows! model (vec %)))
          (partition-all serialization.util/batch-size rows))))

(defmulti insert-stub-users!
  "Inserts `rows`, the inactive Users an import creates for the emails it does not know, and returns the instances.
  User is not serialized, so it has no spec to name its write function, and serialization cannot require the User
  model, which requires serialization: the User model, loaded by the init of its module, implements this for
  `:model/User`. By default it inserts nothing."
  {:arglists '([rows])}
  (fn [_rows] :model/User))

(defmethod insert-stub-users! :default
  [_rows]
  [])

(defn insert-matched!
  "Insert `rows` of `model` (see [[insert!]]) with `insert-fn`, by default [[insert!]] of `model`, and return, for
  each of `rows` in order, its inserted instance matched by `key-fn`, by default the identity columns of the model, or
  nil for a row the model left out, never matched by the order of the returned instances."
  ([model rows]
   (insert-matched! model rows (identity-of model)))
  ([model rows key-fn]
   (insert-matched! model rows key-fn #(insert! model %)))
  ([model rows key-fn insert-fn]
   (let [rows      (vec rows)
         instances (vec (insert-fn rows))
         row-keys  (mapv key-fn rows)
         by-key    (into {} (map (juxt key-fn identity)) instances)]
     (when-not (and (apply distinct? nil row-keys) (= (count by-key) (count instances)))
       (throw (ex-info (format "Cannot match the inserted rows of %s by identity" model)
                       {:model model :keys row-keys})))
     (mapv by-key row-keys))))

(defn update!
  "Updates rows of `model` with `rows`, each the primary key of a row and the columns to change, and returns the rows
  that were updated, in any order, without those the model leaves out."
  [model rows]
  (if-let [f (:update! (serialization.spec/spec model))]
    (vec (f (vec rows)))
    (let [pk (serialization.spec/primary-key model)]
      (doseq [row rows]
        (serialization.db/update-row! model pk (get row pk) (dissoc row pk)))
      (vec rows))))

(defn delete!
  "Deletes the rows of `model` whose primary key is in `pks`."
  [model pks]
  (when (seq pks)
    (if-let [f (:delete! (serialization.spec/spec model))]
      (f (vec pks))
      (let [pk (serialization.spec/primary-key model)]
        (run! #(serialization.db/delete-rows! model pk (vec %))
              (partition-all serialization.util/batch-size pks)))))
  nil)
