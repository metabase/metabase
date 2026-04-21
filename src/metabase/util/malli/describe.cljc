(ns metabase.util.malli.describe
  "This is exactly the same as [[malli.experimental.describe]], but handles our deferred i18n forms, and uses our
  registry."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.experimental.describe :as med]
   [metabase.util.malli.registry :as mr]))

(defn- description [schema]
  (or (:description (mc/type-properties schema))
      (:description (mc/properties schema))))

(declare describe)

;;; for HUGE schemas like `:metabase.lib.schema/query`, don't expand refs once we get past a certain depth, otherwise
;;; we can take literal minutes to generate the description. Three levels of depth is probably about all that would
;;; really be useful anyway for an error message.

(def ^:private max-depth 3)

(defn- accept-ref [schema [k :as _children] options]
  (or (description schema)
      (cond
        (> (::depth options 0) max-depth)
        (pr-str k)

        (contains? (::parent-refs options) k)
        (str "recursive " k)

        :else
        (describe (mr/resolve-schema schema)
                  (-> options
                      (update ::parent-refs #(conj (set %) k))
                      (update ::depth (fnil inc 0)))))))

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
