(ns metabase.models.saved-question
  "A Saved Question is a subtype of a 'Card' -- just a normal saved query."
  (:require
   [metabase.models.card]
   [toucan2.core :as t2]))

(comment metabase.models.card/keep-me)

(derive :model/SavedQuestion :model/Card)

;;; When selecting :model/SavedQuestion, always include `WHERE type = 'question'`.
(t2/define-before-select :model/SavedQuestion
  [kv-args]
  (assoc kv-args :type :question))

(t2/define-before-insert :model/SavedQuestion
  [model]
  ;; make sure `:type` will be set to `:question`
  (assoc model :type :question))

(t2/define-before-update :model/SavedQuestion
  [model]
  ;; sanity-check: make sure we're not using `:model/SavedQuestion` to save a non-SavedQuestion
  (let [changes (t2/changes model)]
    (when (contains? changes :type)
      (assert (= (:type changes) :model) "Error: trying to use :model/SavedQuestion to update a non-SavedQuestion Card")))
  model)
