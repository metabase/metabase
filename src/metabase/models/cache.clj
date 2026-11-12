(ns metabase.models.cache
  "The ids of the rows of each model that a request loaded, so that a per-request check asked about one row can answer
  for the loaded rows of the same model in one query."
  (:require
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *loaded*
  "An atom `{model #{id}}` of the rows loaded in this request, or nil outside one."
  nil)

(defn do-with-loaded-rows
  "Calls `thunk` with [[*loaded*]] bound, keeping a binding already in place."
  [thunk]
  (binding [*loaded* (or *loaded* (atom {}))]
    (thunk)))

(defmacro with-loaded-rows
  "Runs `body` with the loaded rows remembered, keeping a binding already in place."
  [& body]
  `(do-with-loaded-rows (fn [] ~@body)))

(defn register-loaded!
  "Remembers the row of `model` with primary key `id` as loaded in this request, when there is an `id`."
  [model id]
  (when-let [loaded (and (some? id) *loaded*)]
    (when-not (contains? (get @loaded model) id)
      (swap! loaded update model (fnil conj #{}) id))))

(defn loaded-ids
  "The primary keys of the rows of `model` loaded in this request, as a set."
  [model]
  (if-let [loaded *loaded*]
    (get @loaded model #{})
    #{}))

(defn check-loaded!
  "Throws in dev when a per-row check asks about the row of `model` with primary key `id` inside a request that didn't
  load it, since such a check can't be batched with the other loaded rows."
  [model id]
  (when (and config/is-dev? *loaded* (not (contains? (get @*loaded* model) id)))
    (throw (ex-info (str "A per-row check asked about a row the request did not load: " model " " id)
                    {:model model :id id}))))
