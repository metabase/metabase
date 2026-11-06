(ns metabase.serialization.extract
  "Extraction: rows of a store as entities, a batch at a time."
  (:require
   [metabase.serialization.entity :as serialization.entity]))

(set! *warn-on-reflection* true)

(defn- extraction-error [model row e]
  (ex-info (format "Error extracting %s %s" (name model) (:id row))
           (assoc (ex-data e) :model model :id (:id row))
           e))

(defn- isolated
  "What `f`, a fn of a batch of `rows` returning one result for each, returns for `rows`, retrying a failed batch one
  row at a time so that a row that fails comes back as its error and the rest still succeed."
  [f model rows]
  (try
    (f rows)
    (catch Exception e
      (if (<= (count rows) 1)
        (mapv #(extraction-error model % e) rows)
        (into [] (mapcat #(isolated f model [%])) rows)))))

(defn extract-batch
  "The `rows` of `model` exported as entities with their database ids resolved in `store` at once. A row that fails to
  export comes back as its error."
  [model store rows]
  (mapv (fn [row entity]
          (if (instance? Exception entity)
            entity
            (try
              (serialization.entity/validate-export model entity)
              entity
              (catch Exception e
                (extraction-error model row e)))))
        rows
        (isolated #(serialization.entity/serialize-rows model store %) model rows)))
