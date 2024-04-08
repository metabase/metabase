(ns metabase.analyze.classifiers.category
  "Classifier that determines whether a Field should be marked as a `:type/Category` and/or as a `list` Field based on
  the number of distinct values it has.

  As of Metabase v0.29, the Category now longer has any use inside of the Metabase backend; it is used
  only for frontend purposes (e.g. deciding which widget to show). Previously, makring something as a Category meant
  that its values should be cached and saved in a FieldValues object. With the changes in v0.29, this is instead
  managed by a column called `has-field-values`.

  A value of `list` now means the values should be cached. Deciding whether a Field should be a `list` Field is still
  determined by the cardinality of the Field, like Category status. Thus it is entirely possibly for a Field to be
  both a Category and a `list` Field."
  (:require
   [metabase.analyze.fingerprint.schema :as fingerprint.schema]
   [metabase.analyze.schema :as analyze.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.models.field-values :as field-values]
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- cannot-be-category-or-list?
  [{base-type :base_type, semantic-type :semantic_type}]
  (or (isa? base-type :type/Temporal)
      (isa? base-type :type/Collection)
      (isa? base-type :type/Float)
      ;; Don't let IDs become list Fields (they already can't become categories, because they already have a semantic
      ;; type). It just doesn't make sense to cache a sequence of numbers since they aren't inherently meaningful
      (isa? semantic-type :type/PK)
      (isa? semantic-type :type/FK)))

(mu/defn ^:private field-should-be-category? :- [:maybe :boolean]
  [fingerprint :- [:maybe fingerprint.schema/Fingerprint]
   field       :- analyze.schema/Field]
  (let [distinct-count (get-in fingerprint [:global :distinct-count])
        nil%           (get-in fingerprint [:global :nil%])]
    ;; Only mark a Field as a Category if it doesn't already have a semantic type.
    (when (and (nil? (:semantic_type field))
               (or (some-> nil% (< 1))
                   (isa? (:base_type field) :type/Boolean))
               (some-> distinct-count (<= field-values/category-cardinality-threshold)))
      (log/debugf "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                  (sync-util/name-for-logging field)
                  distinct-count
                  field-values/category-cardinality-threshold)
      true)))

(mu/defn ^:private field-should-be-auto-list? :- [:maybe :boolean]
  "Based on `distinct-count`, should we mark this `field` as `has-field-values` = `auto-list`?"
  [fingerprint :- [:maybe fingerprint.schema/Fingerprint]
   field       :- [:map [:has-field-values {:optional true} [:maybe ::lib.schema.metadata/column.has-field-values]]]]
  ;; only update has-field-values if it hasn't been set yet. If it's already been set then it was probably done so
  ;; manually by an admin, and we don't want to stomp over their choices.
  (let [distinct-count (get-in fingerprint [:global :distinct-count])]
    (when (and (nil? (:has-field-values field))
               (some-> distinct-count (<= field-values/auto-list-cardinality-threshold)))
      (log/debugf "%s has %d distinct values. Since that is less than %d, it should have cached FieldValues."
                  (sync-util/name-for-logging field)
                  distinct-count
                  field-values/auto-list-cardinality-threshold)
      true)))

(mu/defn infer-is-category-or-list :- [:maybe analyze.schema/Field]
  "Classifier that attempts to determine whether `field` ought to be marked as a Category based on its distinct count."
  [field       :- analyze.schema/Field
   fingerprint :- [:maybe fingerprint.schema/Fingerprint]]
  (when (and fingerprint
             (not (cannot-be-category-or-list? field)))
    (cond-> field
      (field-should-be-category? fingerprint field)  (assoc :semantic_type :type/Category)
      (field-should-be-auto-list? fingerprint field) (assoc :has_field_values :auto-list))))
