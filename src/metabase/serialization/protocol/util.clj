(ns metabase.serialization.protocol.util
  "Helpers that implementations of [[metabase.serialization.protocol/Store]] share."
  (:require
   [metabase.serialization.spec :as serialization.spec]
   [metabase.serialization.util :as serialization.util]))

(set! *warn-on-reflection* true)

(defn select-columns
  "The columns a query selects: `ks` then `columns`, or nil for every column when `columns` is nil."
  [columns ks]
  (when columns
    (into [] (distinct) (concat ks columns))))

(defn in-batches
  "The rows `f` returns for each batch of `xs`."
  [xs f]
  (into [] (comp (partition-all serialization.util/batch-size) (mapcat #(f (vec %)))) xs))

(defn ref-columns
  "The columns whose values make the ref of a row of `model`, a model other than Table and Field: the email of a User,
  the name of a Database, and otherwise its identity columns."
  [model]
  (case model
    :model/User     [:email]
    :model/Database [:name]
    (serialization.spec/identity-columns model)))

(defn row-ref
  "The ref of `row`, a row of `model` other than a Table or Field: the value of its one ref column, or the vector of the
  values of several."
  [model row]
  (let [[column & more :as columns] (ref-columns model)]
    (if more
      (mapv #(get row %) columns)
      (get row column))))

(defn rows-by-ref
  "The map from each of the set `refs` to the oldest of `rows`, rows of `model`, whose ref by `ref-of` it is."
  [model refs ref-of rows]
  (let [pk (serialization.spec/primary-key model)]
    (reduce (fn [found row]
              (let [ref (ref-of row)]
                (cond-> found
                  (and (contains? refs ref) (not (contains? found ref))) (assoc ref row))))
            {}
            (sort-by #(get % pk) rows))))
