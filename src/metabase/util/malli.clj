(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [clojure.set :as set]
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

(core/defn- explain-fn-fail!
  "Used as reporting function to minst/instrument!"
  [type data]
  (let [wrap-fn (fn wrap-fn [{:keys [value message]}] (str message " got: " (pr-str value)))
        {:keys [input args output value]} data
        humanized (cond input (me/humanize (mc/explain input args) {:wrap wrap-fn})
                        output (me/humanize (mc/explain output value) {:wrap wrap-fn}))]
    (throw (ex-info
            (pr-str humanized)
            (merge {:type type
                    :data data}
                   (when data
                     (merge
                      {:humanized humanized}
                      (when-let [link (cond input (->malli-io-link input args)
                                            output (->malli-io-link output value))]
                        {:link link}))))))))

;; since a reference to the private var is used in the macro, this will trip the eastwood :unused-private-vars linter,
;; so just harmlessly "use" the var here.
explain-fn-fail!

(core/defn- merge-metadata [on-var md-pos]
  (let [collision (set/intersection (set (keys on-var))
                                    (set (keys md-pos)))]
    (if (and (set? on-var) (set? md-pos) (not= #{} collision))
      (throw (ex-info (str "Keys in metadata on the var, and in the metadata position must be unique. these arent: " collision)
                      {:colliison collision
                       :on-var-keys (keys on-var)
                       :positional-keys (keys md-pos)}))
      (merge on-var md-pos))))

(core/defn- -defn [schema args]
  (let [{parsed-name :name
         parsed-meta :meta
         :keys       [return doc arities]
         :as         parsed}  (mc/parse schema args)
        {gen :mu/gen
         seed :mu/seed
         size :mu/size
         no-throw :mu/no-throw
         :or {gen false
              seed false
              no-throw false
              size false}
         :as all-md}  (merge-metadata (meta parsed-name) parsed-meta)
        _             (when (= ::mc/invalid parsed) (mc/-fail! ::parse-error {:schema schema, :args args}))
        parse         (fn [{:keys [args] :as parsed}] (merge (malli.destructure/parse args) parsed))
        ->schema      (fn [{:keys [schema]}] [:=> schema (:schema return :any)])
        single        (= :single (key arities))
        parglists     (if single
                        (->> arities val parse vector)
                        (->> arities val :arities (map parse)))
        raw-arglists  (map :raw-arglist parglists)
        schema        (as-> (map ->schema parglists) $ (if single (first $) (into [:function] $)))
        return-schema (:schema return :any)
        seed+size  (merge (when seed {:seed seed})
                          (when size {:size size}))
        ->body        (fn [{:keys [arglist prepost body]}]
                        (if gen
                          `(~arglist ~prepost (#(mg/generate ~return-schema ~seed+size)))
                          `(~arglist ~prepost ~@body)))
        id            (str (gensym "id"))
        inst-clause (if no-throw
                      `nil
                      `(minst/instrument! {;; instrument the defn we just registered, via ~id
                                           :filters [(minst/-filter-var #(-> % meta ::validate! (= ~id)))]
                                           :report  #'explain-fn-fail!}))]
    `(let [defn# (core/defn
                   ~parsed-name
                   ~@(some-> doc vector)
                   ~(assoc all-md
                           :raw-arglists (list 'quote raw-arglists)
                           :schema schema
                           ::validate! id)
                   ~@(map ->body parglists)
                   ~@(when-not single (some->> arities val :meta vector)))]
       (mc/=> ~parsed-name ~schema)
       ~inst-clause
       defn#)))

(defmacro defn
  "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
   Calls to minst/unstrument! can remove this, so use a filter that avoids ::validate! if you use that.


  Options are passed in as metadata on either the var, or in the defn's metadata position. Those are merged, and thus may not reuse keys.

  ^:mu/no-throw - prints an error message instead of throwing when an input/output does't fit the schema
  ^:mu/gen      - turns on autogeneration, ignores function bodies
  ^{:mu/seed N} - a number passed to generate, does nothing without mu/gen
  ^{:mu/size N} - a number passed to generate, does nothing without mu/gen"
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
