(ns metabase.util.events
  "Pure functions over the map of a lifecycle event, which holds the row after a write as `:object` and the row before
  it as `:previous-object`."
  (:require
   [toucan2.core :as t2]))

(defn model-of
  "The model of the row that the lifecycle `event` is about, nil for a row of no model."
  [{:keys [model object previous-object]}]
  (or model (let [row (or object previous-object)]
              (when (t2/instance? row)
                (t2/model row)))))

(defn changed-keys
  "The columns whose value differs between `:previous-object` and `:object`, a missing row having no value."
  [{:keys [object previous-object]}]
  (into #{}
        (filter #(not= (get object %) (get previous-object %)))
        (into (set (keys object)) (keys previous-object))))

(defn changed?
  "Whether the value of `column` differs between `:previous-object` and `:object`, a missing row having no value."
  [{:keys [object previous-object]} column]
  (not= (get object column) (get previous-object column)))

(defn changed-any?
  "Whether the value of any of `columns` differs between `:previous-object` and `:object`."
  [event columns]
  (boolean (some #(changed? event %) columns)))
