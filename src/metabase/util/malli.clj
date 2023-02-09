(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.destructure]
   [malli.error :as me]
   [malli.experimental :as mx]
   [malli.generator :as mg]
   [malli.instrument :as minst]
   [malli.util :as mut]
   [metabase.util :as u]
   [ring.util.codec :as codec]))

(core/defn- ->malli-io-link
  ([schema]
   (->malli-io-link schema (try
                             ;; try to make a sample value
                             (mg/generate schema {:seed 1 :size 1})
                             ;; not all schemas can generate values
                             (catch Exception _ ::none))))
  ([schema value]
   (let [url-schema (codec/url-encode (u/pprint-to-str (mc/form schema)))
         url-value (if (= ::none value)
                     ""
                     (codec/url-encode (u/pprint-to-str value)))
         url (str "https://malli.io?schema=" url-schema "&value=" url-value)]
     (cond
       ;; functions are not going to work
       (re-find #"#function" url) nil
       ;; cant be too long
       (<= 2000 (count url)) nil
       :else url))))

(core/defn- humanize-include-value
  "Pass into mu/humanize to include the value received in the error message."
  [{:keys [value message]}] (str message ", received: " (pr-str value)))

(core/defn- explain-fn-fail!
  "Used as reporting function to minst/instrument!"
  [type data]
  (let [{:keys [input args output value]} data
        humanized (cond input (me/humanize (mc/explain input args) {:wrap humanize-include-value})
                        output (me/humanize (mc/explain output value) {:wrap humanize-include-value}))]
    (throw (ex-info
            (pr-str humanized)
            (merge {:type type :data data}
                   (when data
                     {:link (cond input (->malli-io-link input args)
                                  output (->malli-io-link output value))
                      :humanized humanized}))))))

;; since a reference to the private var is used in the macro, this will trip the eastwood :unused-private-vars linter,
;; so just harmlessly "use" the var here.
explain-fn-fail!

(core/defn- -defn [schema args]
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
        id (str (gensym "id"))]
    `(let [defn# (core/defn
                   ~name
                   ~@(some-> annotated-doc vector)
                   ~(assoc meta
                           :raw-arglists (list 'quote raw-arglists)
                           :schema schema
                           :validate! id)
                   ~@(map (fn [{:keys [arglist prepost body]}] `(~arglist ~prepost ~@body)) parglists)
                   ~@(when-not single (some->> arities val :meta vector)))]
       (mc/=> ~name ~schema)
       (minst/instrument! {;; instrument the defn we just registered, via ~id
                           :filters [(minst/-filter-var #(-> % meta :validate! (= ~id)))]
                           :report #'explain-fn-fail!})
       defn#)))

(defmacro defn
  "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
   Calls to minst/unstrument! can remove this, so use a filter that avoids :validate! if you use that."
  [& args]
  (-defn mx/SchematizedParams args))

(def ^:private Schema
  [:and any?
   [:fn {:description "a malli schema"} mc/schema]])

(defn with-api-error-message :- Schema
  "Update a malli schema to have a :description (picked up by api docs),
  and a :error/message (used by defendpoint). They don't have to be the same, but usually are."
  ([mschema :- Schema message :- string?]
   (with-api-error-message mschema message message))
  ([mschema :- Schema
    docs-message :- string?
    error-message :- string?]
   (mut/update-properties mschema assoc
                          ;; override generic description in api docs
                          :description docs-message
                          ;; override generic description in defendpoint api errors
                          :error/message error-message)))
