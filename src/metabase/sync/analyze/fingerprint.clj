(ns metabase.sync.analyze.fingerprint
  "Analysis sub-step that takes a sample of values for a Field and saving a non-identifying fingerprint
   used for classification. This fingerprint is saved as a column on the Field it belongs to."
  (:require [clojure.tools.logging :as log]
            [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze.fingerprint
             [global :as global]
             [number :as number]
             [sample :as sample]
             [text :as text]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private ^:always-validate type-specific-fingerprint :- (s/maybe i/TypeSpecificFingerprint)
  "Return type-specific fingerprint info for FIELD and a sample of VALUES if it has an elligible base type
   such as a derivative of `:type/Text` or of `:type/Number`."
  [field :- i/FieldInstance, values :- i/ValuesSample]
  (condp #(isa? %2 %1) (:base_type field)
    :type/Text   {:type/Text (text/text-fingerprint values)}
    :type/Number {:type/Number (number/number-fingerprint values)}
    nil))

(s/defn ^:private ^:always-validate fingerprint :- (s/maybe i/Fingerprint)
  "Generate a 'fingerprint' from a SAMPLE of values."
  ([field :- i/FieldInstance]
   (when-let [values (sample/basic-sample field)]
     (fingerprint field values)))
  ([field :- i/FieldInstance, values :- i/ValuesSample]
   (merge
    (when-let [global-fingerprint (global/global-fingerprint values)]
      {:global global-fingerprint})
    (when-let [type-specific-fingerprint (type-specific-fingerprint field values)]
      {:type type-specific-fingerprint}))))


(s/defn ^:private ^:always-validate fingerprint!
  "Generate and save a fingerprint for a FIELD."
  [field :- i/FieldInstance]
  (sync-util/with-error-handling (format "Error generating fingerprint for %s" (sync-util/name-for-logging field))
    (when-let [fingerprint (fingerprint field)]
      (log/debug (format "Saving fingerprint for %s" (sync-util/name-for-logging field)))
      (db/update! Field (u/get-id field)
        :fingerprint fingerprint))))


;;; +------------------------------------------------------------------------------------------------------------------------+
;;; |                                          FINGERPRINTING ALL FIELDS IN A TABLE                                          |
;;; +------------------------------------------------------------------------------------------------------------------------+

(s/defn ^:private ^:always-validate fields-to-fingerprint :- (s/maybe [i/FieldInstance])
  "Return a sequences of Fields belonging to TABLE for which we should generate (and save) fingerprints.
   This should include NEW fields that are active and visibile."
  [table :- i/TableInstance]
  (seq (db/select Field
         :table_id        (u/get-id table)
         :active          true
         :visibility_type [:not= "retired"]
         :preview_display true
         :last_analyzed   nil)))

(s/defn ^:always-validate fingerprint-fields!
  "Generate and save fingerprints for all the Fields in TABLE that have not been previously analyzed."
  [table :- i/TableInstance]
  (when-let [fields (fields-to-fingerprint table)]
    (doseq [field fields]
      (fingerprint! field))))
