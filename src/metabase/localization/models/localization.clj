(ns metabase.localization.models.localization
  "Infrastructure for automatic localization of sample content using Toucan2 after-select hooks.

  Models that want to support automatic localization should:
  1. Derive from `:hook/auto-localize`
  2. Implement the `localizable-fields` multimethod to specify which fields should be localized
  3. Add a `t2/define-after-select` hook that calls `maybe-localize-row`

  Content is marked for localization by setting the `should_localize` database column to true."
  (:require
   [metabase.util.i18n :refer [unsafe-tru]]
   [toucan2.core :as t2]))

(defmulti localizable-fields
  "Returns a vector of field keywords that should be automatically localized for the given model.

  Models should implement this multimethod to specify which fields should be translated when
  `should_localize` is true.

  Example:
  ```
  (defmethod localization/localizable-fields :model/Collection
    [_model]
    [:name :description])
  ```"
  {:arglists '([model])}
  (fn [model] model))

(defmethod localizable-fields :default
  [_model]
  [])

(defn maybe-localize-row
  "If `row` has `should_localize = true`, translates the fields specified by `localizable-fields` for this model
  using `tru` (user locale translation).

  Returns the (potentially modified) row.

  This function should be called from a model's `after-select` hook:
  ```
  (t2/define-after-select :model/YourModel [row]
    (localization/maybe-localize-row :model/YourModel row))
  ```"
  [model row]
  (if (and (isa? model :hook/auto-localize) (:should_localize row))
    (let [fields-to-localize (localizable-fields model)]
      (reduce
       (fn [acc field]
         (if-let [value (get acc field)]
           (assoc acc field (unsafe-tru value))
           acc))
       row
       fields-to-localize))
    row))

(defn maybe-localize
  [row]
  (maybe-localize-row (t2/model row) row))

(t2/define-after-select :hook/auto-localize
  [m]
  (maybe-localize-row (t2/model m) m))
