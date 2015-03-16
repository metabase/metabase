(ns leiningen.migration-summary
  (:require [leiningen.core.eval :as lein]))

(defn migration-summary [project & args]
  (lein/eval-in-project
   project
   `(do
      (require '[metabase.config :as ~'config]
               '[metabase.db :as ~'db]
               '[metabase.driver.generic-sql.sync :as ~'sync])
      (let [db# {:engine (name (config/config-kw :mb-db-type))
                 :details {:conn_str (db/metabase-db-conn-str)}}]
        (->> (sync/table-names db#)
             (map (fn [table-name#]
                    (println (format "\n* %s" table-name#))
                    (->> (sync/jdbc-columns db# table-name#)
                         (sort-by :column_name)
                         (map (fn [{:keys [~'type_name ~'column_name]}]
                                (println (format "  * %s %s" ~'column_name ~'type_name))))
                         dorun)))
             dorun)))))
