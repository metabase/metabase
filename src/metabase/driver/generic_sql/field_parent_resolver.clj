(ns metabase.driver.generic-sql.field-parent-resolver)

(defn get-qualified-name [field-info]
  (flatten (loop [field-name (:field-name field-info) parent (:parent field-info)]
    (cond
      (not (some? parent)) [field-name]
      :else (recur (into [(:field-name parent)] [field-name]) (:parent parent))))))
