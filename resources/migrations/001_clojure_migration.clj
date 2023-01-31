(ns migrations.001-clojure-migration)

(defmacro defmigration
  ([name execute-thunk]
   `(defmigration ~name ~execute-thunk nil))
  ([name execute-thunk rollback-thunk]
   `(do
      (defn ~(symbol (str name "-execute")) [~'database] (~execute-thunk ~'database))
      ~(when (seq rollback-thunk)
         `(defn ~(symbol (str name "-rollback")) [~'database] (~rollback-thunk ~'database))))))

(defmigration append-name-to-all-questions
  (fn execute [database]
    (let [conn  (.getConnection database)
           stmt (.createStatement conn)]
      (try
        (let [rs    (.executeQuery stmt "select * from report_card")
              names (loop [acc []]
                      (if (.next rs)
                        (recur (conj acc (.getString rs "name")))
                        acc))]
          ;; update all card's name with a postfix "liquibase migration 2.0"
          (doseq [name names]
            (let [update-stmt (.createStatement conn)]
              (.execute update-stmt (format "update report_card set name = '%s - liquibase migration 2.0' where name = '%s'" name name)))))
        (catch Exception e
          (println "Error creating table: " (.getMessage e))
          (throw e)))))

  (fn rollback [_database]
    (println "DO NOTHING")))
