(ns macros.metabase-enterprise.advanced-permissions.api.util-test)

(defmacro with-impersonations! [impersonations-and-attributes-map & body]
  `(let [~'&group ~impersonations-and-attributes-map]
     ~'&group
     ~@body))
