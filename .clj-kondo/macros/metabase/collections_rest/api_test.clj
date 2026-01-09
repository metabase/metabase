(ns macros.metabase.collections-rest.api-test)

(defmacro with-collection-hierarchy! [bindings & body]
  `(let [~'a nil
         ~'b nil
         ~'c nil
         ~'d nil
         ~'e nil
         ~'f nil
         ~'g nil]
     ~'a
     ~'b
     ~'c
     ~'d
     ~'e
     ~'f
     ~'g
     ~bindings
     ~@body))

(defmacro with-some-children-of-collection! [collection-or-id-or-nil & body]
  `(let [~'&ids ~collection-or-id-or-nil]
     ~'&ids
     ~@body))
