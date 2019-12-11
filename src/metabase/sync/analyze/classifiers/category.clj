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


(defn- cannot-be-category-or-list?
  [{:keys [base_type special_type]}]
  (or (isa? base_type :type/Temporal)
      (isa? base_type :type/Collection)
      (isa? base_type :type/Float)
      ;; Don't let IDs become list Fields (they already can't become categories, because they already have a special
      ;; type). It just doesn't make sense to cache a sequence of numbers since they aren't inherently meaningful
      (isa? special_type :type/PK)
      (isa? special_type :type/FK)))

(s/defn ^:private field-should-be-category? :- (s/maybe s/Bool)
  [fingerprint :- (s/maybe i/Fingerprint), field :- su/Map]
  (let [distinct-count (get-in fingerprint [:global :distinct-count])
        nil%           (get-in fingerprint [:global :nil%])]
    ;; Only mark a Field as a Category if it doesn't already have a special type.
    (when (and (nil? (:special_type field))
               (or (some-> nil% (< 1))
                   (isa? (:base_type field) :type/Boolean))
               (some-> distinct-count (<= field-values/category-cardinality-threshold)))
      (log/debug (format "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                         (sync-util/name-for-logging field)
                         distinct-count
                         field-values/category-cardinality-threshold))
      true)))

(s/defn ^:private field-should-be-auto-list? :- (s/maybe s/Bool)
  "Based on `distinct-count`, should we mark this `field` as `has_field_values` = `auto-list`?"
  [fingerprint :- (s/maybe i/Fingerprint),
   field :- {(s/optional-key :has_field_values) (s/maybe (apply s/enum field/has-field-values-options))
             s/Keyword         s/Any}]
  ;; only update has_field_values if it hasn't been set yet. If it's already been set then it was probably done so
  ;; manually by an admin, and we don't want to stomp over their choices.
  (let [distinct-count (get-in fingerprint [:global :distinct-count])]
    (when (and (nil? (:has_field_values field))
               (some-> distinct-count (<= field-values/auto-list-cardinality-threshold)))
      (log/debug (format "%s has %d distinct values. Since that is less than %d, it should have cached FieldValues."
                         (sync-util/name-for-logging field)
                         distinct-count
                         field-values/auto-list-cardinality-threshold))
      true)))

(s/defn infer-is-category-or-list :- (s/maybe i/FieldInstance)
  "Classifier that attempts to determine whether FIELD ought to be marked as a Category based on its distinct count."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (when (and fingerprint
             (not (cannot-be-category-or-list? field)))
    (cond-> field
      (field-should-be-category? fingerprint field)  (assoc :special_type :type/Category)
      (field-should-be-auto-list? fingerprint field) (assoc :has_field_values :auto-list))))
