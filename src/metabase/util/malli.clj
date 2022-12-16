(ns metabase.util.malli
  (:refer-clojure :exclude [defn])
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.experimental :as mx]
   [malli.instrument :as minst]))

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
  (str "nullable " (describe* child ctx)))

(defmethod describe* :or [{:keys [children]} ctx]
  (str "( "
       (str/join ", or " (mapv (comp str/trim #(describe* % (indent+ ctx))) children))
       " )"))

(defmethod describe* :and [{:keys [children]} ctx]
  (str "( "
       (str/join ", " (mapv (comp str/trim #(describe* % ctx)) children))
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
  (str "map of ["
       (str/join (str "\n" (spaces ctx))
                 [""
                  (describe* key (indent+ ctx))
                  "=>"
                  (str (describe* value (indent+ ctx)) "]")])))

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
      min-len               (str "at least " min-len " long ")
      max-len               (str "at most " max-len " long ")
      :else                 "")))

(core/defn generic-props [properties description]
  (cond-> description
    (:title properties)
    (str " (title: " (:title properties) ")")))

(defmethod describe* :string [{:keys [properties]} _ctx]
  ;; todo handle min/max/other properties.
  (str "string " (take-measure "length" properties)))
(defmethod describe* 'string? [ast ctx] (describe* (assoc ast :type :string) ctx))

(defmethod describe* :keyword [ast _ctx] (generic-props (:properties ast) "keyword "))
(defmethod describe* 'keyword? [ast ctx] (describe* (assoc ast :type :keyword) ctx))

(defmethod describe* :int [ast _ctx] (generic-props (:properties ast) "integer "))
(defmethod describe* 'int? [ast ctx] (describe* (assoc ast :type :int) ctx))

(defmethod describe* :pos-int [ast _ctx] (generic-props (:properties ast) "positive integer "))
(defmethod describe* 'pos-int? [ast ctx] (describe* (assoc ast :type :pos-int) ctx))

(defmethod describe* :nat-int [ast _ctx] (generic-props (:properties ast) "natural integer "))
(defmethod describe* 'nat-int? [ast ctx] (describe* (assoc ast :type :nat-int) ctx))

(defmethod describe* := [{:keys [value] :as ast} ctx]
  (str "value that equals " (pr-str value)))

(defmethod describe* :default [x ctx]
  ;; TODO put custom descriptions _inside_ the malli schemas, and pick it up in here
  (reset! (:*missing? ctx) true)
  (str "Indescribable_Malli_Schema [ " (pr-str (or (:type x) x)) " ]"))

(defmacro sanitize [schema]
  (walk/postwalk-replace {'int? :int 'pos-int? :pos-int 'keyword? :keyword} schema))

;; n.b. this is not clojure.core/defn
(defn describe :- [:map [:missing? :boolean] [:description :string]]
  "Given a malli schema, should return a string with a description of the shape it expects."
  [schema]
  (let [*missing? (atom false)
        ast (mc/ast schema)
        raw-output (describe* ast {:indent 0 :*missing? *missing?})]
    {:missing? @*missing?
     :description (str/trim (str "A " raw-output))}))
