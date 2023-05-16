(ns metabase.driver.sql.query-processor.util
  (:require [metabase.util.honeysql-extensions :as hx]))

(defn nfc-field->parent-identifier
  "Take a nested field column field corresponding to something like an inner key within a JSON column,
  and then get the parent column's identifier from its own identifier and the nfc path stored in the field.

  Suppose you have the child with corresponding identifier

  (metabase.util.honeysql-extensions/identifier :field \"blah -> boop\")

  Ultimately, this is just a way to get the parent identifier

  (metabase.util.honeysql-extensions/identifier :field \"blah\")"
  [field-identifier field]
  {:pre [(hx/identifier? field-identifier)]}
  (let [nfc-path          (:nfc_path field)
        parent-components (-> (case hx/*honey-sql-version*
                                1 (:components field-identifier)
                                2 (last field-identifier))
                              (vec)
                              (pop)
                              (conj (first nfc-path)))]
    (apply hx/identifier (cons :field parent-components))))
