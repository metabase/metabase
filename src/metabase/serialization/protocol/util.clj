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
  "The columns whose values identify a row of `model`: the email of a User, the name of a Database, and otherwise its
  identity columns, which for a Table or Field hold ids rather than the names of its ref."
  [model]
  (case model
    :model/User     [:email]
    :model/Database [:name]
    (serialization.spec/identity-columns model)))

(defn row-ref
  "The ref of `row`, a row of `model`, by [[ref-columns]]: the value of its one ref column, or the vector of the values
  of several."
  [model row]
  (let [[column & more :as columns] (ref-columns model)]
    (if more
      (mapv #(get row %) columns)
      (get row column))))

(defn in-order-of
  "`instances`, the rows an insert of `rows` of `model` returned in any order, in the order of `rows`, each matched to
  its row by [[row-ref]]; throws when a row has no match."
  [model rows instances]
  (let [by-ref (into {} (map (juxt #(row-ref model %) identity)) instances)]
    (mapv (fn [row]
            (let [k (row-ref model row)]
              (or (get by-ref k)
                  (throw (ex-info (format "No inserted %s row has the ref %s" model (pr-str k))
                                  {:model model :ref k})))))
          rows)))

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
