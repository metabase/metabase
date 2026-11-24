(ns metabase.eid-translation.requests
  "API request bodies that name rows the way serialization does, by refs, translated to the numeric ids the handlers
  take. A ref is a row's entity id, a Database's name, a Table's `[db-name schema table-name]`, a Field's
  `[db-name schema table-name & field-names]`, or a User's email."
  (:require
   [metabase.eid-translation.util :as eid-translation.util]
   [metabase.serialization.core :as serialization]
   [metabase.serialization.resolve :as serialization.resolve]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private natural-key-models
  "The models whose rows serialization names by natural keys instead of entity ids."
  #{:model/Database :model/Table :model/Field :model/User})

(defn- ref->id
  "The id of the `model` row that `ref` names, throwing a 404 when no row has it."
  [model ref]
  (if (contains? natural-key-models model)
    (let [ref (cond-> ref (sequential? ref) vec)]
      (or (get (serialization.resolve/row-ids serialization/app-db-store model #{ref} {}) ref)
          (throw (ex-info (tru "Not found.") {:status-code 404}))))
    (eid-translation.util/->id-or-404 model ref)))

(defn refs->ids
  "`body`, a request body, with the ref in each of its `columns`, a map from a column to the model of the rows it names,
  replaced by the id of the row it names. Numeric ids and nils stay as they are. A ref that names no row is a 404."
  [body columns]
  (reduce-kv (fn [body column model]
               (let [v (get body column)]
                 (if (or (nil? v) (int? v))
                   body
                   (assoc body column (ref->id model v)))))
             body
             columns))
