(ns metabase.util.malli.describe
  "This is exactly the same as [[malli.experimental.describe]], but handles our deferred i18n forms."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.experimental.describe :as med]
   [metabase.util.malli.registry :as mr]))

(defn- description [schema]
  (or (:description (mc/type-properties schema))
      (:description (mc/properties schema))))

(declare describe)

(defn- accept-ref [schema [k :as _children] options]
  (or (description schema)
      (if (contains? (::parent-refs options) k)
        (str "recursive " k)
        (describe (mr/resolve-schema schema)
                  (update options ::parent-refs #(conj (set %) k))))))

;;; these implementations replace the normal ones which do not recursively resolve refs and schemas. We track
;;; `::parent-refs` to prevent infinite loops with self-referencing schemas

(defmethod med/accept :ref
  [_name schema children options]
  (accept-ref schema children options))

(defmethod med/accept :schema
  [_name schema children options]
  (accept-ref schema children options))

(defn describe
  "Given a schema, returns a string explaining the required shape in English"
  ([?schema]
   (describe ?schema nil))
  ([?schema options]
   (let [options (merge
                  (when (keyword? ?schema)
                    {::parent-refs #{?schema}})
                  options
                  {::mc/walk-entry-vals true
                   ::med/definitions    (atom {})
                   ::med/describe       med/-describe})]
     (-> ?schema
         mr/resolve-schema
         (med/-describe options)
         str
         str/trim))))
