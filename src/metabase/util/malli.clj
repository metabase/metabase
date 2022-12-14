(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.instrument :as minst]
   [malli.experimental :as mx]))

(core/defn- explain-fn-fail!
  [type data]
  (let [{:keys [input args output value]} data]
    (throw (ex-info
            (str type " " (pr-str data))
            (merge {:type type :data data}
                   (when data
                     {:humanized
                      (cond input (me/humanize (mc/explain input args))
                            output (me/humanize (mc/explain output value)))}))))))

(core/defn- -defn [schema args]
  (let [{:keys [name return doc meta arities] :as parsed} (mc/parse schema args)
        _ (when (= ::mc/invalid parsed) (mc/-fail! ::parse-error {:schema schema, :args args}))
        parse (fn [{:keys [args] :as parsed}] (merge (md/parse args) parsed))
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
  "Like s/defn, but for malli. Will validate all input and output without the need for calls to instrumentation (they are built in).
  calls to minst/unstrument! can remove this, so beware of calling that."
  [& args]
  (-defn mx/SchematizedParams args))

(do
  (defn bar [x :- [:map [:x int?] [:y int?]]] "42")
  (= [{:x ["missing required key"], :y ["missing required key"]}]
     (:humanized (try (bar {})
                      (catch Exception e (ex-data e))))))

(do
  (defn baz :- [:map [:x int?] [:y int?]] [] {:x "3"})
  (= {:x ["should be an int"], :y ["missing required key"]}
     (:humanized (try (baz)
                      (catch Exception e (ex-data e))))))
