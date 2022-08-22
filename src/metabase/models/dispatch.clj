(ns metabase.models.dispatch
  "Helpers to assist in the transition to Toucan 2. Once we switch to Toucan 2 this stuff shouldn't be needed, but we
  can update this namespace instead of having to update code all over the place."
  (:require
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

(defn model
  "Given either a Toucan model or a Toucan instance, return the Toucan model. Otherwise return `nil`."
  [x]
  (cond
    (models/model? x)
    x

    (toucan-instance? x)
    (let [model-symb (symbol (name x))]
      (db/resolve-model model-symb))

    :else
    nil))
