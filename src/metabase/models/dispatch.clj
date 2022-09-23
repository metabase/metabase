(ns metabase.models.dispatch
  "Helpers to assist in the transition to Toucan 2. Once we switch to Toucan 2 this stuff shouldn't be needed, but we
  can update this namespace instead of having to update code all over the place."
  (:require
   [potemkin :as p]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan.models :as models]))

(defn toucan-instance?
  "True if `x` is a Toucan instance, but not a Toucan model."
  [x]
  (and (record? x)
       (extends? models/IModel (class x))
       (not (models/model? x))))

(defn instance-of?
  "Is `x` an instance of a some Toucan `model`? Use this instead of of using the `<Model>Instance` or calling [[type]]
  or [[class]] on a model yourself, since that won't work once we switch to Toucan 2."
  [model x]
  (let [model (db/resolve-model model)]
    (instance? (class model) x)))

(defn InstanceOf
  "Helper for creating a schema to check whether something is an instance of `model`. Use this instead of of using the
  `<Model>Instance` or calling [[type]] or [[class]] on a model yourself, since that won't work once we switch to
  Toucan 2.

    (s/defn my-fn :- (mi/InstanceOf User)
      []
      ...)"
  [model]
  (s/pred (fn [x]
            (instance-of? model x))
          (format "instance of a %s" (name model))))

(p/defprotocol+ Model
  (model [this]
    "Given either a Toucan model or a Toucan instance, return the Toucan model. Otherwise return `nil`."))

(extend-protocol Model
  Object
  (model [this]
    (cond
      (models/model? this)
      this

      (toucan-instance? this)
      (let [model-symb (symbol (name this))]
        (db/resolve-model model-symb))

      :else
      nil))

  nil
  (model [_this] nil))

(defn instance
  "Create a new instance of Toucan `model` with a map `m`.

    (instance User {:first_name \"Cam\"})"
  ([model]
   (let [model (db/resolve-model model)]
     (empty model)))
  ([model m]
   (into (instance model) m)))
