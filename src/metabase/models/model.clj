(ns metabase.models.model
  "A Model is a subtype of 'Card', representing a saved query that acts sort of like a custom Table or view."
  (:require
   [metabase.models.card]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2]))

(comment metabase.models.card/keep-me)

(derive :model/Model :model/Card)

;;; When selecting :model/Model, always include `WHERE type = 'model'`.
(t2/define-before-select :model/Model
  [kv-args]
  (assoc kv-args :type :model))

(defn- assert-query-is-valid-for-model
  "Check that the card is a valid model if being saved as one. Throw an exception if not."
  [query]
  (let [template-tag-types (->> (get-in query [:native :template-tags])
                                vals
                                (map (comp keyword :type)))]
    (when (some (complement #{:card :snippet}) template-tag-types)
      (throw (ex-info (i18n/tru "A model made from a native SQL question cannot have a variable or field filter.")
                      {:status-code 400})))))

(t2/define-before-insert :model/Model
  [model]
  ;; make sure `:type` will be set to `:model`
  (let [model (assoc model :type :model)]
    ;; validate the query when creating a new Model.
    (assert-query-is-valid-for-model (:dataset_query model))
    model))

(t2/define-before-update :model/Model
  [model]
  ;; if type is changing to `:model`, we need to validate the query.
  (let [changes (t2/changes model)]
    (when (contains? changes :type)
      (assert (= (:type changes) :model) "Error: trying to use :model/Model to update a non-Model Card")
      (let [query (or (:query changes)
                      (t2/select-one-fn :dataset_query [:model/Card :dataset_query], :id (u/the-id model)))]
        (assert-query-is-valid-for-model query))))
  model)
