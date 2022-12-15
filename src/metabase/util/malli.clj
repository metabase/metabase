(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.instrument :as minst]
   [malli.experimental :as mx]
   [clojure.string :as str]))

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
  "Like s/defn, but for malli. Will always validate input and output without the need for calls to instrumentation (they are emitted automatically).
   Calls to minst/unstrument! can remove this, so use a filter that avoids :validate! if you use that."
  [& args]
  (-defn mx/SchematizedParams args))

;;; -------------------------------------- Describing Schemas --------------------------------------

(defn- indent+ [context] (update context :indent inc))

(defn- spaces [context] (str/join (repeat (* 4 (inc (:indent context))) " ")))

(defmulti ^:private describe*
  (fn describe*-dispatch [ast _ctx] (:type ast)))

(defmethod describe* :maybe [{:keys [child]} ctx]
  (str "A nullable " (describe* child ctx)))

(defmethod describe* :or [{:keys [children]} ctx]
  (str "( "
       (str/join ", or " (mapv (comp str/trim #(describe* % (indent+ ctx))) children))
       " )"))

(defmethod describe* :map [{:keys [keys]} ctx]
  (str/join
   ["map with keys: ["
    (str/join (for [[k v] keys]
                (str "\n" (spaces ctx)
                     (pr-str k) " "
                     (when (get-in v [:properties :optional]) "(optional) ")
                     "=> " (describe* (:value v) (indent+ ctx)))))
    "\n" (spaces ctx) "]"]))

(defmethod describe* :map-of [{:keys [key value] :as ast} ctx]
  (str "map of " (describe* value ctx) "to " (describe* value ctx)))

(defmethod describe* :tuple [{:keys [children] :as ast} ctx]
  (str "tuple of size " (count children) " like: [ " (str/join (map #(describe* % ctx) children)) "]"))

(defn- insert-or [xs]
  (if (> (count xs) 1)
    (concat (drop-last xs) ["or"] [(last xs)])
    xs))

(defmethod describe* :enum [{:keys [values] :as _ast} ctx]
  (str "value that is one of: "
       (str/join " " (insert-or (map pr-str values)))))

(core/defn take-measure [title properties]
  (let [min-len (:min properties)
        max-len (:max properties)]
    (cond
      (and min-len max-len) (str "with " title " between " min-len " and " max-len " ")
      min-len (str "at least " min-len " long ")
      max-len (str "at most " max-len " long ")
      :else "")))

(defmethod describe* :string [{:keys [properties]} _ctx]
  ;; todo handle min/max/other properties.
  (str "string " (take-measure "length" properties)))
(defmethod describe* 'string? [ast ctx] (describe* (assoc ast :type :string) ctx))

(defmethod describe* :keyword [{:keys []} ctx] "keyword ")
(defmethod describe* 'keyword? [ast ctx] (describe* (assoc ast :type :keyword) ctx))

(defmethod describe* :int [{:keys []} ctx] "integer ")
(defmethod describe* 'int? [ast ctx] (describe* (assoc ast :type :int) ctx))

(defmethod describe* :pos-int [{:keys []} ctx] "positive integer ")
(defmethod describe* 'pos-int? [ast ctx] (describe* (assoc ast :type :pos-int) ctx))

(defmethod describe* :default [x ctx]
  (str/join "\n" ["*********"
                  "Unknown Malli Schema!"
                  (str "type: " (pr-str (:type x)))
                  (str "value: " (pr-str x))
                  "*********"]))

(core/defn describe
  "Given a malli schema, should return a string with a description of the shape it expects."
  [schema]
  (let [ast (mc/ast schema)]
    (str/trim
     (str "A " (describe* ast {:indent 0})))))
