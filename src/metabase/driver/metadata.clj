(ns metabase.driver.metadata
  "Metadata multi-methods. Implemented by the various drivers, e.g. `metabase.driver.postgres.metadata`.")

(defn- field-info-dispatch
  "Dispatch fn for the various field info multi-methods. (Dispatches on kw like `:postgres`)"
  [{:keys [db] :as field}]
  (let [{:keys [engine]} @db]
    (require (symbol (str "metabase.driver." engine ".metadata")))  ; dynamically load the correct driver implementation
    (keyword engine)))                                              ; there's probably some better way to do this

(defmulti field-count
  "Return number of rows for FIELD."
  field-info-dispatch)

(defmulti field-distinct-count
  "Return number of distinct rows for FIELD."
  field-info-dispatch)
