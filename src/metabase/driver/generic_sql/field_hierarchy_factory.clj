(ns metabase.driver.generic-sql.field-hierarchy-factory)

(defn- create-complex-field [field fields]
  (let [parent (first (filter #(= (:parent-id field) (:field-id %)) fields))]
    (if (nil? parent)
      (assoc field :parent nil)
      (assoc field :parent (create-complex-field parent fields)))))

(defn create-from-list [fields]
  (map #(create-complex-field % fields) fields))
