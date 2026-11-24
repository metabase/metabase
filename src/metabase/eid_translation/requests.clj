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

;;; ------------------------------------------ Bodies in entity id form ------------------------------------------

;; A dynamic var because the body schema's decoders, which read it, see only the value they decode, not the request.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *entity-ids?*
  "Whether the request being served is in entity id form: it comes with the `X-Metabase-Ids: entity` header, from a
  caller allowed to use it (see [[metabase.server.middleware.entity-ids]]). Its body may then name the rows of the
  columns that [[ref-schema]] and [[structure-schema]] mark by refs, as a response with the header does."
  false)

(defn do-with-entity-ids
  "Calls `thunk` with the request being served in entity id form (see [[*entity-ids?*]])."
  [thunk]
  (binding [*entity-ids?* true]
    (thunk)))

(defn- decode-ref
  "`v`, the value of a column naming a `model` row, with a ref translated to the row's id in a request in entity id
  form. Ints, such as the negative ids of rows to create, stay as they are."
  [model v]
  (if (and *entity-ids?* (some? v) (not (int? v)))
    (ref->id model v)
    v))

(defn- import-structure
  "`v`, the value of `column` of a `model` row, imported from the form serialization exports it in, as a response in
  entity id form gives it. The import sees the row as `row` with `v` in `column`. Numeric ids inside it stay as they
  are. A ref that names no row is a 404; a value that fails to import otherwise is left for the body's schema to
  refuse."
  [model column row v]
  (if-let [import (and (some? v) (get-in (serialization/spec model) [:transform column :import]))]
    (try
      (first (import serialization/app-db-store [(assoc row column v)] [v] {:numeric-ids-allowed? true}))
      (catch clojure.lang.ExceptionInfo e
        (if (serialization.resolve/target-not-found? e)
          (throw (ex-info (tru "Not found.") {:status-code 404} e))
          v)))
    v))

(defn- decode-structure
  "`v`, the value of `column` of a `model` row, imported (see [[import-structure]]) when the request is in entity id
  form. The import sees the row as `row`, the columns it reads that the body does not give."
  [model column row v]
  (cond->> v
    *entity-ids?* (import-structure model column row)))

(defn- decode-structures
  "`body`, a request body for a `model` row, with each of its `columns` imported (see [[import-structure]]) when the
  request is in entity id form. Each import sees the row as the body as it was given, so that a column whose import
  reads others, such as a snippet's `:content`, which reads its `:template_tags`, sees them as exported."
  [model columns body]
  (if (and *entity-ids?* (map? body))
    (reduce (fn [body' column]
              (cond-> body'
                (contains? body column) (assoc column (import-structure model column body (get body column)))))
            body
            columns)
    body))

(defn ref-schema
  "`schema`, the schema of a request body column naming a `model` row by id, that in a request in entity id form also
  takes a ref, which it decodes to the row's id."
  [model schema]
  [:schema {:decode/api #(decode-ref model %)} schema])

(defn structure-schema
  "`schema`, the schema of the request body `column` of a `model` row holding a structure, such as a query, that in a
  request in entity id form also takes the structure as serialization exports it, which it decodes by importing it.
  `row`, when given, holds the columns of the row that the import reads and the body does not give, such as the
  `:content_type` of a Document."
  ([model column schema]
   (structure-schema model column {} schema))
  ([model column row schema]
   [:schema {:decode/api #(decode-structure model column row %)} schema]))

(defn structures-schema
  "`schema`, the schema of a request body for a `model` row, that in a request in entity id form also takes each of its
  `columns` as serialization exports it, which it decodes by importing it. Use it in place of [[structure-schema]] for
  columns whose import reads other columns of the body."
  [model columns schema]
  [:schema {:decode/api #(decode-structures model columns %)} schema])
