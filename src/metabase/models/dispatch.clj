(ns metabase.models.dispatch
  "Helpers to assist in the transition to Toucan 2. Once we switch to Toucan 2 this stuff shouldn't be needed, but we
  can update this namespace instead of having to update code all over the place."
  (:require
   [potemkin :as p]
   [toucan2.core :as t2]))

(p/import-vars
 [t2
  instance
  instance-of?
  model])

(defn toucan-instance?
  "True if `x` is a Toucan instance, but not a Toucan model."
  [x]
  (t2/instance? x))

(defn InstanceOf
  "Helper for creating a Malli schema to check whether something is an instance of `model`. Use this instead of of using
  the `<Model>Instance` or calling [[type]] or [[class]] on a model yourself, since that won't work once we switch to
  Toucan 2.

    (mu/defn my-fn :- (mi/InstanceOf User)
      []
      ...)"
  [model]
  [:fn
   {:error/message (format "instance of a %s" (name model))}
   (partial instance-of? model)])
