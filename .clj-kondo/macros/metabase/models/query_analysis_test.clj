(ns macros.metabase.models.query-analysis-test)

(defmacro with-test-setup [& body]
  `(let [~'card-id  1
         ~'table-id 2
         ~'tax-id   3
         ~'total-id 4]
     ~'card-id
     ~'table-id
     ~'tax-id
     ~'total-id
     ~@body))
