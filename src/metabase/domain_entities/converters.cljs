(ns metabase.domain-entities.converters
  (:require
    [camel-snake-kebab.core :as csk]
    [cljs-bean.core :as bean]
    ))

(defn- ->entity
  "Conversion of incoming vanilla JS objects and arrays to CLJS maps and vectors.

  You should not need to call this directly; it's an implementation detail of [[defn]]."
  [x]
  (bean/->clj x
              :prop->key csk/->kebab-case-keyword
              :key->prop csk/->camelCaseString))

(defn- entity->
  "Conversion of cljs-bean wrapped CLJS maps and vectors back into vanilla JS objects and arrays.

  You should not need to call this directly; it's an implementation detail of [[defn]]."
  [x]
  (bean/->js x :key->prop csk/->camelCaseString))

(defn- opaque? [schema]
  (-> schema :properties :bean/opaque boolean))

(defmulti incoming
  "Note that this works on the map syntax, the Malli AST, not the raw vectors.
  It's easier to process that way."
  (fn [schema]
    (if (opaque? schema)
      :bean/opaque
      (:type schema))))

(defmethod incoming :default [_]
  identity)

(defmethod incoming :bean/opaque [_]
  identity)

(defmethod incoming :vector [schema]
  (let [kf (incoming (:child schema))]
    #(mapv kf %)))

(defmethod incoming :tuple [schema]
  (let [inner (map incoming (:children schema))]
    (fn [value]
      (mapv #(%1 %2) inner value))))

(def ^:private conversion-needed? #{:tuple :vector :map :map-of})

(defmethod incoming :map-of [schema]
  (let [vf          (incoming (:value schema))
        keywordize? (-> schema :key :type (#{:keyword 'keyword?}))
        recursive?  (-> schema :value :type conversion-needed?)
        transform   (when (and (not (opaque? (:value schema)))
                               (not= identity vf))
                      vf)
        opts        (cond-> {:recursive       (boolean recursive?)
                             :keywordize-keys (boolean keywordize?)}
                      keywordize? (assoc :prop->key csk/->kebab-case-keyword
                                         :key->prop csk/->camelCaseString)
                      transform   (assoc :transform transform))]
    #(bean/bean % opts)))

(defmethod incoming :map [_schema]
  ->entity)

;; TODO Does this handle cases where we didn't convert string keys to keywords? Does it need to be schema-smart too?
#_{:clj-kondo/ignore [:clojure-lsp/unused-public-var]} ;; This is used by macro-generated code.
(defn outgoing
  "Converts back to pure JS form."
  [x]
  (entity-> x))
