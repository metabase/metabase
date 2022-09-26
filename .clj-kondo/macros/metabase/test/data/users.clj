(ns macros.metabase.test.data.users)

(defmacro with-group-for-user
  [[group-binding test-user-name-or-user-id group] & body]
  `(let [~group-binding [~test-user-name-or-user-id ~group]]
     ~@body))
