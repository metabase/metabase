(ns ^{:deprecated "0.46.0"}
 metabase.util.schema
  "Various schemas that are useful throughout the app.

  Schemas defined are deprecated and should be replaced with Malli schema defined in [[metabase.util.malli.schema]].
  If you update schemas in this ns, please make sure you update the malli schema too. It'll help us makes the transition easier."
  (:require
   [clojure.string :as str]
   [metabase.types :as types]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [schema.core :as s]
   [schema.macros :as s.macros]
   [schema.utils :as s.utils]))

(set! *warn-on-reflection* true)

;; So the `:type/` hierarchy is loaded.
(comment types/keep-me)

;; always validate all schemas in s/defn function declarations. See
;; https://github.com/plumatic/schema#schemas-in-practice for details.
(s/set-fn-validation! true)

;; swap out the default impl of `schema.core/validator` with one that does not barf out the entire schema, since it's
;; way too huge with things like our MBQL query schema
(defn- schema-core-validator [schema]
  (let [c (s/checker schema)]
    (fn [value]
      (when-let [error (c value)]
        (s.macros/error! (s.utils/format* "Value does not match schema: %s" (pr-str error))
                         {:value value, :error error}))
      value)))

(alter-var-root #'s/validator (constantly schema-core-validator))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                            Plumatic API Schema Validation & Error Messages                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn with-api-error-message
  "Return `schema` with an additional `api-error-message` that will be used to explain the error if a parameter fails
  validation."
  {:style/indent [:form]}
  [schema api-error-message]
  (if-not (record? schema)
    ;; since this only works for record types, if `schema` isn't already one just wrap it in `s/named` to make it one
    (recur (s/named schema api-error-message) api-error-message)
    (assoc schema :api-error-message api-error-message)))

(defn non-empty
  "Add an addditonal constraint to `schema` (presumably an array) that requires it to be non-empty
   (i.e., it must satisfy `seq`)."
  [schema]
  (with-api-error-message (s/constrained schema seq "Non-empty")
    (deferred-tru "The array cannot be empty.")))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 USEFUL SCHEMAS                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(def NonBlankString
  "Schema for a string that cannot be blank."
  (with-api-error-message (s/constrained s/Str (complement str/blank?) "Non-blank string")
    (deferred-tru "value must be a non-blank string.")))

;; TODO - rename this to `PositiveInt`?
(def IntGreaterThanZero
  "Schema representing an integer than must also be greater than zero."
  (with-api-error-message
    (s/constrained s/Int (partial < 0) (deferred-tru "Integer greater than zero"))
    (deferred-tru "value must be an integer greater than zero.")))

(def Map
  "Schema for a valid map."
  (with-api-error-message (s/named clojure.lang.IPersistentMap (deferred-tru "Valid map"))
    (deferred-tru "value must be a map.")))
