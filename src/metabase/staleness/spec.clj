(ns metabase.staleness.spec
  "The staleness spec of a model, and what it says about the model.

  A model that has a spec can have stale content found. A spec is a map of:

  - `:candidates`, a fn of the options (`{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`) returning the
    HoneySQL query of the model's stale candidates, selecting `id`, `model`, `name`, `last_used_at` and `collection_id`
    from a single table, which the caller unions with those of the other models.
  - `:load`, optional, a fn of a set of ids returning the rows the stale content page shows, loaded in bulk.
  - `:render`, optional, a fn of a loaded row returning its API item.

  A model with `:load` and `:render`, which come together, is listed by the stale content page."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of a staleness spec."
  [:and
   [:map {:closed true}
    [:candidates ifn?]
    [:load       {:optional true} ifn?]
    [:render     {:optional true} ifn?]]
   [:fn {:error/message "`:load` and `:render` come together"}
    (fn [spec] (= (contains? spec :load) (contains? spec :render)))]])

(defmulti spec
  "The staleness spec of `model`, or nil when no stale content is found for the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(defn candidates-fn
  "The `:candidates` fn of the spec of `model`, or nil when it has none."
  [model]
  (:candidates (spec model)))

(defn load-fn
  "The `:load` fn of the spec of `model`, or nil when it has none."
  [model]
  (:load (spec model)))

(defn render-fn
  "The `:render` fn of the spec of `model`, or nil when it has none."
  [model]
  (:render (spec model)))

(defn models
  "The models that have a spec and have loaded."
  []
  (disj (set (keys (methods spec))) :default))

(defn rendered-models
  "The models with `:load` and `:render` fns that have loaded."
  []
  (into #{} (filter render-fn) (models)))
