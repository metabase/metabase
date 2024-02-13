(ns metabase.driver.sql.query-processor.util
  (:require
   [metabase.util.honey-sql-2 :as h2x]))

(defn nfc-field->parent-identifier
  "Take a nested field column field corresponding to something like an inner key within a JSON column,
  and then get the parent column's identifier from its own identifier and the nfc path stored in the field.

  Suppose you have the child with corresponding identifier

    (metabase.util.honey-sql-2/identifier :field \"blah -> boop\")

  Ultimately, this is just a way to get the parent identifier

    (metabase.util.honey-sql-2/identifier :field \"blah\")"
  [field-identifier {:keys [nfc-path], :as _field}]
  {:pre [(h2x/identifier? field-identifier)]}
  (let [parent-components (-> (last field-identifier)
                              (vec)
                              (pop)
                              (conj (first nfc-path)))]
    (apply h2x/identifier (cons :field parent-components))))
