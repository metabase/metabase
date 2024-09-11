(ns metabase.util.malli.describe
  "This is exactly the same as [[malli.experimental.describe]], but handles our deferred i18n forms."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.experimental.describe :as med]))

(defn- description [schema]
  (or (:description (mc/type-properties schema))
      (:description (mc/properties schema))))

(declare describe)

(defn- accept-ref [schema [k :as _children] options]
  (or (description schema)
      (if (contains? (::parent-refs options) k)
        (str "recursive " (str k))
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
   (let [options (merge options
                        {::mc/walk-entry-vals true
                         ::med/definitions    (atom {})
                         ::med/describe       med/-describe})]
     (-> ?schema
         mr/resolve-schema
         (med/-describe options)
         str
         str/trim))))

;;; This is a fix for upstream issue https://github.com/metosin/malli/issues/924 (the generated descriptions for
;;; `:min` and `:max` were backwards). We can remove this when that issue is fixed upstream.

#?(:clj
   (defn- -length-suffix [schema]
     (let [{:keys [min max]} (-> schema mc/properties)]
       (cond
         (and min max) (str " with length between " min " and " max " inclusive")
         min           (str " with length >= " min)
         max           (str " with length <= " max)
         :else         ""))))

#?(:clj
   (alter-var-root #'med/-length-suffix (constantly -length-suffix)))
