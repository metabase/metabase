(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure]
   [malli.error :as me]
   [malli.experimental :as mx]
   [malli.generator :as mg]
   [malli.instrument :as minst]
   [metabase.util :as u]
   [ring.util.codec :as codec]))

(core/defn- ->malli-io-link
  ([schema]
   (->malli-io-link schema (try (mg/generate schema {:seed 1 :size 1})
                                ;; can't generate every sort of schema
                                (catch Exception e ::none))))
  ([schema value]
   (let [url-schema (codec/url-encode (u/pprint-to-str (mc/form schema)))
         url-value (if (= ::none value)
                     ""
                     (codec/url-encode (u/pprint-to-str value)))]
     (str "https://malli.io?schema=" url-schema "&value=" url-value))))

(core/defn- explain-fn-fail!
  [type data]
  (let [{:keys [input args output value]} data]
    (throw (ex-info
            (str type " " (pr-str data))
            (merge {:type type :data data}
                   (when data
                     {:link (cond input (->malli-io-link input args)
                                  output (->malli-io-link output value))
                      :humanized
                      (cond input (me/humanize (mc/explain input args))
                            output (me/humanize (mc/explain output value)))}))))))

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
        id (str (gensym "id"))]
    `(let [defn# (core/defn
                   ~name
                   ~@(some-> doc vector)
                   ~(assoc meta
                           :raw-arglists (list 'quote raw-arglists)
                           :schema schema
                           :validate! id)
                   ~@(map (fn [{:keys [arglist prepost body]}] `(~arglist ~prepost ~@body)) parglists)
                   ~@(when-not single (some->> arities val :meta vector)))]
       (mc/=> ~name ~schema)
       (minst/instrument! {:filters [(minst/-filter-var #(-> % meta :validate! (= ~id)))]
                           :report #'explain-fn-fail!})
       defn#)))

(defmacro defn
  "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
   Calls to minst/unstrument! can remove this, so use a filter that avoids :validate! if you use that."
  [& args]
  (-defn mx/SchematizedParams args))
