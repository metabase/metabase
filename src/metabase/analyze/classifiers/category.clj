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
   [metabase.sync.util :as sync-util]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(def ^Long category-cardinality-threshold
  "Fields with less than this many distinct values should automatically be given a semantic type of `:type/Category`.
  This no longer has any meaning whatsoever as far as the backend code is concerned; it is used purely to inform
  frontend behavior such as widget choices."
  30)

(def ^Long auto-list-cardinality-threshold
  "Fields with less than this many distincy values should be given a `has_field_values` value of `list`, which means
  the Field should have FieldValues."
  1000)

(mu/defn- field-should-be-category? :- [:maybe :boolean]
  [fingerprint :- [:maybe fingerprint.schema/Fingerprint]
   field       :- analyze.schema/Field]
  (let [distinct-count (get-in fingerprint [:global :distinct-count])
        nil%           (get-in fingerprint [:global :nil%])]
    ;; Only mark a Field as a Category if it doesn't already have a semantic type.
    (when (and (nil? (:semantic_type field))
               (or (some-> nil% (< 1))
                   (isa? (:base_type field) :type/Boolean))
               (some-> distinct-count (<= category-cardinality-threshold)))
      (log/debugf "%s has %d distinct values. Since that is less than %d, we're marking it as a category."
                  (sync-util/name-for-logging field)
                  distinct-count
                  category-cardinality-threshold)
      true)))

(mu/defn infer-is-category :- [:maybe analyze.schema/Field]
  "Classifier that attempts to determine whether `field` ought to be marked as a Category based on its distinct count."
  [field       :- analyze.schema/Field
   fingerprint :- [:maybe fingerprint.schema/Fingerprint]]
  (when (and (sync-util/can-be-category-or-list? (:base_type field) (:semantic_type field))
             (field-should-be-category? fingerprint field))
    (assoc field :semantic_type :type/Category)))
