(ns macros.metabase-enterprise.query-reference-validation.api-test)

(defmacro with-test-setup! [& body]
  `(let [~'card-1 1
         ~'card-2 2
         ~'card-3 3
         ~'card-4 4
         ~'card-5 5
         ~'coll-2 100
         ~'coll-3 200]
     ~'card-1
     ~'card-2
     ~'card-3
     ~'card-4
     ~'card-5
     ~'coll-2
     ~'coll-3
     ~@body))
