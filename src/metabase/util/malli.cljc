(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure]
   [malli.error :as me]
   [malli.generator :as mg]
   [malli.util :as mut]
   [metabase.shared.util.i18n :refer [tru]]
   [metabase.util :as u]
   #?@(:clj  ([clojure.string :as str]
              [malli.experimental :as mx]
              [malli.instrument :as minst]
              [metabase.util.i18n :as i18n]
              [net.cgrand.macrovich :as macros]
              [ring.util.codec :as codec])))
  #?(:cljs (:require-macros [metabase.util.malli])))

(core/defn- encode-uri [fragment]
  (#?(:clj codec/url-encode :cljs js/encodeURI) fragment))

(core/defn- ->malli-io-link
  ([schema]
   (->malli-io-link schema (try
                             ;; try to make a sample value
                             (mg/generate schema {:seed 1 :size 1})
                             ;; not all schemas can generate values
                             (catch #?(:clj Exception :cljs js/Error) _ ::none))))
  ([schema value]
   (when schema
     (let [url-schema (encode-uri (u/pprint-to-str (mc/form schema)))
           url-value (if (= ::none value)
                       ""
                       (encode-uri (u/pprint-to-str value)))
           url (str "https://malli.io?schema=" url-schema "&value=" url-value)]
       (cond
         ;; functions are not going to work
         (re-find #"#function" url) nil
         ;; cant be too long
         (<= 2000 (count url)) nil
         :else url)))))

(core/defn humanize-include-value
  "Pass into mu/humanize to include the value received in the error message."
  [{:keys [value message]}]
  ;; TODO Should this be translated with more complete context? (tru "{0}, received: {1}" message (pr-str value))
  (str message ", " (tru "received") ": " (pr-str value)))

(core/defn explain-fn-fail!
  "Used as reporting function to minst/instrument!"
  [type data]
  (let [{:keys [input args output value]} data
        humanized (cond input  (me/humanize (mc/explain input args) {:wrap humanize-include-value})
                        output (me/humanize (mc/explain output value) {:wrap humanize-include-value}))
        link (cond input (->malli-io-link input args)
                   output (->malli-io-link output value))]
    (throw (ex-info
            (pr-str humanized)
            (cond-> {:type type :data data}
              data (assoc :humanized humanized)
              (and data link) (assoc :link link))))))

#?(:clj
   (clojure.core/defn instrument!
     "Instrument a [[metabase.util.malli/defn]]."
     [id]
     (with-out-str (minst/instrument! {:filters [(minst/-filter-var #(-> % meta :validate! (= id)))]
                                       :report  explain-fn-fail!})))
   :cljs
   (clojure.core/defn instrument!
     "Instrument a [[metabase.util.malli/defn]]. No-op for ClojureScript. Instrumentation currently only works in
     Clojure AFAIK. [[malli.instrument]] is a Clj-only namespace."
     [_id]))

#?(:clj
   (core/defn- -defn [target schema args]
     (let [{:keys [name return doc meta arities] :as parsed} (mc/parse schema args)
           _ (when (= ::mc/invalid parsed) (mc/-fail! ::parse-error {:schema schema, :args args}))
           parse (fn [{:keys [args] :as parsed}] (merge (malli.destructure/parse args) parsed))
           ->schema (fn [{:keys [schema]}] [:=> schema (:schema return :any)])
           single (= :single (key arities))
           parglists (if single
                       (->> arities val parse vector)
                       (->> arities val :arities (map parse)))
           raw-arglists (map :raw-arglist parglists)
           schema (as-> (map ->schema parglists) $ (if single (first $) (into [:function] $)))
           annotated-doc (str/trim
                           (str "Inputs: " (if single
                                             (pr-str (first (mapv :raw-arglist parglists)))
                                             (str "(" (str/join "\n           " (map (comp pr-str :raw-arglist) parglists)) ")"))
                                "\n  Return: " (str/replace (u/pprint-to-str (:schema return :any))
                                                            "\n"
                                                            (str "\n          "))
                                (when (not-empty doc) (str "\n\n  " doc))))
           id (str (gensym "id"))
           inner-defn `(core/defn
                         ~name
                         ~@(some-> annotated-doc vector)
                         ~(assoc meta
                                 :raw-arglists (list 'quote raw-arglists)
                                 :schema schema
                                 :validate! id)
                         ~@(map (fn [{:keys [arglist prepost body]}] `(~arglist ~prepost ~@body)) parglists)
                         ~@(when-not single (some->> arities val :meta vector)))]
       (case target
         :clj  `(let [defn# ~inner-defn]
                  (mc/=> ~name ~schema)
                  ;; instrument the defn we just registered, via ~id
                  (instrument! ~id)
                  defn#)
         ;; Vars aren't real in CLJS, so wrapping the inner `defn` in a `let` doesn't work like in does in CLJ.
         ;; In CLJS `mu/defn` is just `cljs.core/defn` with some extra metadata and augmented docstring;
         ;; [[mc/=>]] is not called, nor is [[instrument!]].
         :cljs inner-defn))))

#?(:clj
   (defmacro defn
     "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
     Calls to minst/unstrument! can remove this, so use a filter that avoids :validate! if you use that."
     [& args]
     ;; [[macros/case]] only works properly in a `defmacro`, not in a helper function called by a `defmacro`.
     ;; So we use it here and pass :clj or :cljs to [[-defn]].
     (-defn (macros/case :clj :clj :cljs :cljs)
            mx/SchematizedParams args)))

(def ^:private Schema
  [:and any?
   [:fn {:description "a malli schema"} mc/schema]])

(def ^:private localized-string-schema
  #?(:clj  [:fn {:error/message "must be a localized string"}
            i18n/localized-string?]
     ;; TODO Is there a way to check if a string is being localized in CLJS, by the `ttag`?
     ;; The compiler seems to just inline the translated strings with no annotation or wrapping.
     :cljs string?))

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
