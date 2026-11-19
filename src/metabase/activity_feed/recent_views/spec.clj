(ns metabase.activity-feed.recent-views.spec
  "The recent views spec of a model, and what it says about the model.

  A model that has a spec can be shown in the recent views of a user. The spec is a map from the name of each type of
  recent view the model has, the `model` of the item, to the spec of that type, a map of:

  - `:load`, a fn of the ids viewed (never empty) returning the rows of the model the display needs, loaded in bulk. A
    fn shared by the types of a model is called once for all of them.
  - `:render`, a fn of a loaded row and the recent view (a map with at least `:model_id` and `:timestamp`) returning
    the `:metabase.activity-feed.models.recent-views/Item` to show, or nil when the row must not be shown.
  - `:type`, the value of the `type` of the rows of the model that the type of recent view stands for, set on each
    type of a model that has several."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of the recent views spec of one type of recent view."
  [:map {:closed true}
   [:load   ifn?]
   [:render ifn?]
   [:type   {:optional true} :string]])

(def ModelSpec
  "The schema of the recent views spec of a model."
  [:map-of :string Spec])

(defmulti spec
  "The recent views spec of `model`, a map from the name of each type of recent view the model has to its spec, or nil
  when the model is not shown in the recent views."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
