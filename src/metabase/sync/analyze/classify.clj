(ns metabase.sync.analyze.classify
  "Analysis sub-step that takes a fingerprint for a Field and infers and saves appropriate information like special type.
   Each 'classifier' takes the information available to it and decides whether or not to run.
   We currently have the following classifiers:

   1.  `name`: Looks at the name of a Field and infers a special type if possible
   2.  `no-preview-display`: Looks at average length of text Field recorded in fingerprint and decides whether or not we should hide this Field
   3.  `category`: Looks at the number of distinct values of Field and determines whether it can be a Category
   4.  `text-fingerprint`: Looks at percentages recorded in a text Fields' TextFingerprint and infers a special type if possible

   All classifier functions take two arguments, a `FieldInstance` and a possibly `nil` `Fingerprint`, and should return the Field
   with any appropriate changes (such as a new special type). If no changes are appropriate, a classifier may return nil.
   Error handling is handled by `run-classifiers` below, so individual classiers do not need to handle errors themselves.

   In the future, we plan to add more classifiers, including ML ones that run offline."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze.classifiers
             [category :as category]
             [name :as name]
             [no-preview-display :as no-preview-display]
             [text-fingerprint :as text-fingerprint]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                             CLASSIFYING INDIVIDUAL FIELDS                                              |
;;; +------------------------------------------------------------------------------------------------------------------------+

(def ^:private values-that-can-be-set
  "Columns of Field that classifiers are allowed to set."
  #{:special_type :preview_display})

(s/defn ^:private ^:always-validate save-field-updates!
  "Save the updates in UPDATED-FIELD."
  [original-field :- i/FieldInstance, updated-field :- i/FieldInstance]
  (let [[_ values-to-set] (data/diff original-field updated-field)]
    (log/debug (format "Based on classification, updating these values of %s: %s" (sync-util/name-for-logging original-field) values-to-set))
    ;; Check that we're not trying to set anything that we're not allowed to
    (doseq [k (keys values-to-set)]
      (when-not (contains? values-that-can-be-set k)
        (throw (Exception. (format "Classifiers are not allowed to set the value of %s." k)))))
    ;; cool, now we should be ok to update the Field
    (db/update! Field (u/get-id original-field)
      values-to-set)))


(def ^:private classifiers
  "Various classifier functions available. These should all take two args, a `FieldInstance` and a possibly `nil` `Fingerprint`,
   and return `FieldInstance` with any inferred property changes, or `nil` if none could be inferred.
   Order is important!"
  [name/infer-special-type
   category/infer-is-category
   no-preview-display/infer-no-preview-display
   text-fingerprint/infer-special-type])

(s/defn ^:private ^:always-validate run-classifiers :- i/FieldInstance
  "Run all the available `classifiers` against FIELD and FINGERPRINT, and return the resulting FIELD with changes
   decided upon by the classifiers."
  [field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
  (loop [field field, [classifier & more] classifiers]
    (if-not classifier
      field
      (recur (or (sync-util/with-error-handling (format "Error running classifier on %s" (sync-util/name-for-logging field))
                   (classifier field fingerprint))
                 field)
             more))))


(s/defn ^:private ^:always-validate classify!
  "Run various classifiers on FIELD and its FINGERPRINT, and save any detected changes."
  ([field :- i/FieldInstance]
   (classify! field (or (:fingerprint field)
                        (db/select-one-field :fingerprint Field :id (u/get-id field)))))
  ([field :- i/FieldInstance, fingerprint :- (s/maybe i/Fingerprint)]
   (sync-util/with-error-handling (format "Error classifying %s" (sync-util/name-for-logging field))
     (let [updated-field (run-classifiers field fingerprint)]
       (when-not (= field updated-field)
         (save-field-updates! field updated-field))))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                           CLASSIFYING ALL FIELDS IN A TABLE                                            |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate fields-to-classify :- (s/maybe [i/FieldInstance])
  "Return a sequences of Fields belonging to TABLE for which we should attempt to determine special type.
   This should include NEW fields that are active, visibile, and without an existing special type."
  [table :- i/TableInstance]
  (seq (db/select Field
         :table_id        (u/get-id table)
         :special_type    nil
         :active          true
         :visibility_type [:not= "retired"]
         :preview_display true
         :last_analyzed   nil)))

(s/defn ^:always-validate classify-fields!
  "Run various classifiers on the appropriate FIELDS in a TABLE that have not been previously analyzed.
   These do things like inferring (and setting) the special types and preview display status for Fields
   belonging to TABLE."
  [table :- i/TableInstance]
  (when-let [fields (fields-to-classify table)]
    (doseq [field fields]
      (classify! field))))
