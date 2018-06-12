(ns metabase.sync.analyze.classifiers.category
  "Classifier that determines whether a Field should be marked as a `:type/Category` and/or as a `list` Field based on
  the number of distinct values it has.

  As of Metabase v0.29, the Category now longer has any use inside of the Metabase backend; it is used
  only for frontend purposes (e.g. deciding which widget to show). Previously, makring something as a Category meant
  that its values should be cached and saved in a FieldValues object. With the changes in v0.29, this is instead
  managed by a column called `has_field_values`.

  A value of `list` now means the values should be cached. Deciding whether a Field should be a `list` Field is still
  determined by the cardinality of the Field, like Category status. Thus it is entirely possibly for a Field to be
  both a Category and a `list` Field."
  (:require [clojure.tools.logging :as log]
            [metabase.models
             [field :as field]
             [field-values :as field-values]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.util.schema :as su]
            [schema.core :as s]))


(s/defn ^:private cannot-be-category-or-list? :- s/Bool
  [base-type :- su/FieldType, special-type :- (s/maybe su/FieldType)]
  (or (isa? base-type    :type/DateTime)
      (isa? base-type    :type/Collection)
      ;; Don't let IDs become list Fields (they already can't become categories, because they already have a special
      ;; type). It just doesn't make sense to cache a sequence of numbers since they aren't inherently meaningful
      (isa? special-type :type/PK)
      (isa? special-type :type/FK)))

(s/defn ^:private field-should-be-category? :- (s/maybe s/Bool)
  [distinct-count :- s/Int, field :- su/Map]
  ;; only mark a Field as a Category if it doesn't already have a special type
  (when-not (:special_type field)
    (when (<= distinct-count field-values/category-cardinality-threshold)
      (log/debug (format "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                         (sync-util/name-for-logging field)
                         distinct-count
                         field-values/category-cardinality-threshold))
      true)))

(s/defn ^:private field-should-be-auto-list? :- (s/maybe s/Bool)
  "Based on `distinct-count`, should we mark this `field` as `has_field_values` = `auto-list`?"
  [distinct-count :- s/Int, field :- {:has_field_values (s/maybe (apply s/enum field/has-field-values-options))
                                      s/Keyword         s/Any}]
  ;; only update has_field_values if it hasn't been set yet. If it's already been set then it was probably done so
  ;; manually by an admin, and we don't want to stomp over their choices.
  (when (nil? (:has_field_values field))
    (when (<= distinct-count field-values/auto-list-cardinality-threshold)
      (log/debug (format "%s has %d distinct values. Since that is less than %d, it should have cached FieldValues."
                         (sync-util/name-for-logging field)
                         distinct-count
                         field-values/auto-list-cardinality-threshold))
      true)))

(s/defn infer-is-category-or-list :- (s/maybe i/FieldInstance)
  "Classifier that attempts to determine whether FIELD ought to be marked as a Category based on its distinct count."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (when fingerprint
    (when-not (cannot-be-category-or-list? (:base_type field) (:special_type field))
      (when-let [distinct-count (get-in fingerprint [:global :distinct-count])]
        (cond-> field
          (field-should-be-category?  distinct-count field) (assoc :special_type :type/Category)
          (field-should-be-auto-list? distinct-count field) (assoc :has_field_values :auto-list))))))
