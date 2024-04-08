(ns metabase.analyze.classifiers.core
  "Analysis sub-step that takes a fingerprint for a Field and infers and saves appropriate information like special
  type. Each 'classifier' takes the information available to it and decides whether or not to run. We currently have
  the following classifiers:

  1.  `name`: Looks at the name of a Field and infers a semantic type if possible
  2.  `no-preview-display`: Looks at average length of text Field recorded in fingerprint and decides whether or not we
      should hide this Field
  3.  `category`: Looks at the number of distinct values of Field and determines whether it can be a Category
  4.  `text-fingerprint`: Looks at percentages recorded in a text Fields' TextFingerprint and infers a semantic type if
      possible

  All classifier functions take two arguments, a `Field` and a possibly `nil` `Fingerprint`, and should return
  the Field with any appropriate changes (such as a new semantic type). If no changes are appropriate, a classifier may
  return nil. Error handling is handled by `run-classifiers` below, so individual classiers do not need to handle
  errors themselves.

  In the future, we plan to add more classifiers, including ML ones that run offline."
  (:require
   [metabase.analyze.classifiers.category :as classifiers.category]
   [metabase.analyze.classifiers.name :as classifiers.name]
   [metabase.analyze.classifiers.no-preview-display :as classifiers.no-preview-display]
   [metabase.analyze.classifiers.text-fingerprint :as classifiers.text-fingerprint]
   [metabase.analyze.fingerprint.schema :as fingerprint.schema]
   [metabase.analyze.schema :as analyze.schema]
   [metabase.sync.util :as sync-util]
   [metabase.util.malli :as mu]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         CLASSIFYING INDIVIDUAL FIELDS                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private classifiers
  "Various classifier functions available. These should all take two args, a `Field` and a possibly `nil`
  `Fingerprint`, and return `Field` with any inferred property changes, or `nil` if none could be inferred.
  Order is important!

  A classifier may see the original field (before any classifiers were run) in the metadata of the field at
  `:sync.classify/original`."
  [#'classifiers.name/infer-and-assoc-semantic-type
   #'classifiers.category/infer-is-category-or-list
   #'classifiers.no-preview-display/infer-no-preview-display
   #'classifiers.text-fingerprint/infer-semantic-type])

(mu/defn run-classifiers :- analyze.schema/Field
  "Run all the available `classifiers` against `field` and `fingerprint`, and return the resulting `field` with
  changes decided upon by the classifiers. The original field can be accessed in the metadata at
  `:sync.classify/original`."
  [field       :- analyze.schema/Field
   fingerprint :- [:maybe fingerprint.schema/Fingerprint]]
  (reduce (fn [field classifier]
            (or (sync-util/with-error-handling (format "Error running classifier on %s"
                                                       (sync-util/name-for-logging field))
                  (classifier field fingerprint))
                field))
          (vary-meta field assoc :sync.classify/original field)
          classifiers))
