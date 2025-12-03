(ns metabase.util.malli
  (:refer-clojure :exclude [fn defn defn- defmethod])
  (:require
   #?@(:clj
       ([metabase.util.malli.fn :as mu.fn]
        [metabase.util.malli.defn :as mu.defn]
        [net.cgrand.macrovich :as macros]
        [potemkin :as p]))
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure]
   [malli.error :as me]
   [malli.util :as mut]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr])
  #?(:cljs (:require-macros [metabase.util.malli])))

#?(:clj
   (p/import-vars
    [mu.fn fn instrument-ns?]
    [mu.defn defn defn-]))

(core/defn humanize-include-value
  "Pass into mu/humanize to include the value received in the error message."
  [{:keys [value message]}]
  ;; TODO Should this be translated with more complete context? (tru "{0}, received: {1}" message (pr-str value))
  (str message ", " (i18n/tru "received") ": " (pr-str value)))

(core/defn explain
  "Explains a schema failure, and returns the offending value."
  [schema value]
  (-> (mr/explain schema value)
      (me/humanize {:wrap humanize-include-value})))

(def ^:private Schema
  [:and any?
   [:fn {:description "a malli schema"} mc/schema]])

(def localized-string-schema
  "Schema for localized string."
  #?(:clj  [:fn {:error/message "must be a localized string"}
            i18n/localized-string?]
     ;; TODO Is there a way to check if a string is being localized in CLJS, by the `ttag`?
     ;; The compiler seems to just inline the translated strings with no annotation or wrapping.
     :cljs :string))

(metabase.util.malli/defn with
  "Update a malli schema with an arbitrary map of properties"
  {:style/indent [:form]}
  [mschema props]
  (mut/update-properties (mc/schema mschema) merge props))

;; Kondo gets confused by :refer [defn] on this, so it's referenced fully qualified.
(metabase.util.malli/defn with-api-error-message
  "Update a malli schema to have a :description (used by umd/describe, which is used by api docs),
  and a :error/fn (used by me/humanize, which is used by defendpoint).
  They don't have to be the same, but usually are.

  (with-api-error-message
    [:string {:min 1}]
    (deferred-tru \"Must be a string with at least 1 character representing a User ID.\"))"
  {:style/indent [:form]}
  ([mschema :- Schema error-message :- localized-string-schema]
   (with-api-error-message mschema error-message error-message))
  ([mschema                :- :any
    description-message    :- localized-string-schema
    specific-error-message :- localized-string-schema]
   (mut/update-properties (mc/schema mschema) assoc
                          ;; override generic description in api docs and :errors key in API's response
                          :description description-message
                          ;; override generic description in :specific-errors key in API's response
                          :error/fn    (constantly specific-error-message))))

#?(:clj
   (defmacro disable-enforcement
     "Convenience for disabling [[defn]] and [[metabase.util.malli.fn/fn]] input/output schema validation. Since
  input/output validation is currently disabled for ClojureScript, this is a no-op."
     {:style/indent 0}
     [& body]
     (macros/case
      :clj
       `(binding [mu.fn/*enforce* false]
          ~@body)

       :cljs
       `(do ~@body))))

#?(:clj
   (defmacro -defmethod-clj
     "Impl for [[defmethod]] for regular Clojure."
     [multifn dispatch-value & fn-tail]
     (let [dispatch-value-symb (gensym "dispatch-value-")
           error-context-symb  (gensym "error-context-")
           instrument? (mu.fn/instrument-ns? *ns*)]
       `(let [~dispatch-value-symb ~dispatch-value
              ~error-context-symb  {:fn-name        '~(or (some-> (resolve multifn) symbol)
                                                          (symbol multifn))
                                    :dispatch-value ~dispatch-value-symb}
              f#                   ~(if instrument?
                                      (mu.fn/instrumented-fn-form error-context-symb (mu.fn/parse-fn-tail fn-tail))
                                      (mu.fn/deparameterized-fn-form (mu.fn/parse-fn-tail fn-tail)))]
          (.addMethod ~(vary-meta multifn assoc :tag 'clojure.lang.MultiFn)
                      ~dispatch-value-symb
                      f#)))))
#?(:clj
   (defmacro -defmethod-cljs
     "Impl for [[defmethod]] for ClojureScript."
     [multifn dispatch-value & fn-tail]
     `(core/defmethod ~multifn ~dispatch-value
        ~@(mu.fn/deparameterized-fn-tail (mu.fn/parse-fn-tail fn-tail)))))

#?(:clj
   (defmacro defmethod
     "Like [[schema.core/defmethod]], but for Malli."
     [multifn dispatch-value & fn-tail]
     (macros/case
      :clj  `(-defmethod-clj ~multifn ~dispatch-value ~@fn-tail)
      :cljs `(-defmethod-cljs ~multifn ~dispatch-value ~@fn-tail))))

#?(:clj
   (defn validate-throw
     "Returns the value if it matches the schema, else throw an exception."
     [schema-or-validator value]
     (let [is-validator? (fn? schema-or-validator)]
       (if-not ((if is-validator?
                  schema-or-validator
                  (mr/validator schema-or-validator))
                value)
         (throw (ex-info "Value does not match schema" (when-not is-validator?
                                                         {:error (explain schema-or-validator value)})))
         value))))

(core/defn map-schema-keys
  "Return a set of keys specified in a map `schema`. Resolves refs in the registry and handles maps wrapped in `:and`
  or combined with `:merge`.

    (map-schema-keys :metabase.lib.metadata.calculation/visible-columns.options)
    ;; => #{:include-joined?
            :include-expressions?
            :include-implicitly-joinable-for-source-card?
            :include-implicitly-joinable?
            :include-remaps?}"
  [schema]
  ;;   TODO (Cam 8/7/25) -- there's probably a better way to do this but I don't know what it is.
  (let [schema (mr/resolve-schema schema)]
    (case (mc/type schema)
      :map (into
            #{}
            (map first)
            (mc/children schema))
      :and (some map-schema-keys (mc/children schema))
      nil)))
