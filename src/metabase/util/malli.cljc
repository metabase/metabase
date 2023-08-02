(ns metabase.util.malli
  (:refer-clojure :exclude [defn defmethod])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure]
   [malli.util :as mut]
   [metabase.shared.util.i18n :as i18n]
   #?@(:clj
       ([metabase.util.i18n]
        [metabase.util.malli.defn :as mu.defn]
        [metabase.util.malli.fn :as mu.fn])))
  #?(:cljs (:require-macros [metabase.util.malli])))

(core/defn humanize-include-value
  "Pass into mu/humanize to include the value received in the error message."
  [{:keys [value message]}]
  ;; TODO Should this be translated with more complete context? (tru "{0}, received: {1}" message (pr-str value))
  (str message ", " (i18n/tru "received") ": " (pr-str value)))

#?(:clj
   (defmacro defn
     "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
     Calls to minst/unstrument! can remove this, so use a filter that avoids :validate! if you use that."
     [& args]
     `(mu.defn/defn ~@args)))

(def ^:private Schema
  [:and any?
   [:fn {:description "a malli schema"} mc/schema]])

(def ^:private localized-string-schema
  #?(:clj  [:fn {:error/message "must be a localized string"}
            metabase.util.i18n/localized-string?]
     ;; TODO Is there a way to check if a string is being localized in CLJS, by the `ttag`?
     ;; The compiler seems to just inline the translated strings with no annotation or wrapping.
     :cljs :string))

;; Kondo gets confused by :refer [defn] on this, so it's referenced fully qualified.
(metabase.util.malli/defn with-api-error-message
  "Update a malli schema to have a :description (used by umd/describe, which is used by api docs),
  and a :error/fn (used by me/humanize, which is used by defendpoint).
  They don't have to be the same, but usually are.

  (with-api-error-message
    [:string {:min 1}]
    (deferred-tru \"Must be a string with at least 1 character representing a User ID.\"))"
  ([mschema :- Schema error-message :- localized-string-schema]
   (with-api-error-message mschema error-message error-message))
  ([mschema                :- :any
    description-message    :- localized-string-schema
    specific-error-message :- localized-string-schema]
   (mut/update-properties (mc/schema mschema) assoc
                          ;; override generic description in api docs and :errors key in API's response
                          :description description-message
                          ;; override generic description in :specific-errors key in API's response
                          :error/fn    (fn [_ _] specific-error-message))))

#?(:clj
   (defmacro defmethod
     "Like [[schema.core/defmethod]], but for Malli."
     [multifn dispatch-value & fn-tail]
     `(.addMethod ~(vary-meta multifn assoc :tag 'clojure.lang.MultiFn)
                  ~dispatch-value
                  ~(mu.fn/instrumented-fn-form fn-tail))))
