(ns macros.metabase.query-analysis.task.test-setup)

(defmacro with-test-setup!
  "Set up the data required to test the Query Analysis related tasks"
  [& body]
  `(let [~'c1 1
         ~'c2 2
         ~'c3 3
         ~'c4 4
         ~'archived 5
         ~'invalid 6]
     ~'c1
     ~'c2
     ~'c3
     ~'c4
     ~'archived
     ~'invalid
     ~@body))
