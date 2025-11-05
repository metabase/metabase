(ns macros.metabase-enterprise.impersonation.util-test)

(defmacro with-impersonations! [impersonations-and-attributes-map & body]
  `(let [~'&group ~impersonations-and-attributes-map]
     ~'&group
     ~@body))
