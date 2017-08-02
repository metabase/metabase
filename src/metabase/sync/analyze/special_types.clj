(ns metabase.sync.analyze.special-types
  "Logic for scanning values of a given field and updating special types as appropriate.
   Also known as 'fingerprinting', 'analysis', or 'classification'.

   (Note: this namespace is sort of a misnomer, since special type isn't the only thing that can get set by
    the functions here. `:preview_display` can also get set to `false` if a Field has on average very
    large (long) values.)"
  (:require [metabase.models.field :refer [Field]]
            [metabase.sync
             [interface :as i]
             [util :as sync-util]]
            [metabase.sync.analyze.special-types
             [name :as name]
             [values :as values]]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(s/defn ^:private ^:always-validate fields-to-infer-special-types-for :- (s/maybe [i/FieldInstance])
  "Return a sequences of Fields belonging to TABLE for which we should attempt to determine special type.
   This should include NEW fields that are active, visibile, and without an existing special type."
  [table :- i/TableInstance]
  (seq (db/select Field
         :table_id        (u/get-id table)
         :special_type    nil
         :active          true
         :visibility_type [:not= "retired"]
         :preview_display true
         :last_analyzed   nil))) ; only analyze NEW fields


(s/defn ^:always-validate infer-special-types!
  "Infer (and set) the special types and preview display status for Fields
   belonging to TABLE, and mark the fields as recently analyzed."
  [table :- i/TableInstance]
  (sync-util/with-error-handling (format "Error inferring special types for %s" (sync-util/name-for-logging table))
    ;; fetch any fields with no special type. See if we can infer a type from their name.
    (when-let [fields (fields-to-infer-special-types-for table)]
      (name/infer-special-types-by-name! table fields))
    ;; Ok, now fetch fields that *still* don't have a special type. Try to infer a type from a sequence of their values.
    (when-let [fields (fields-to-infer-special-types-for table)]
      (values/infer-special-types-by-value! table fields))))
